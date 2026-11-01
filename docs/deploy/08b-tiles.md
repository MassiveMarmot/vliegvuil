## 8b. Self-hosted basemap tiles (BRT-A)

The map background is served from our own origin (`/tiles/{z}/{x}/{y}.png`);
the browser never contacts `service.pdok.nl`. The tiles are a one-time copy
of the PDOK BRT Achtergrondkaart WMTS (CC-BY 4.0, Kadaster; attribution
stays in the app). Expected size: ~769 MB for the app's NL bbox, zoom 6-14
(~80,000 tiles, dry-run sampled 2026-10-12).

First run / refresh (manual, no timers):

```bash
# Estimate first (no full download):
sudo -u vliegvuil node /srv/vliegvuil/scripts/vps-tiles-update.js --dry-run

# Real run: survives an SSH disconnect via systemd-run; ~24 hours at the
# default spread. Log and progress are written inside the tile dir.
sudo systemd-run --unit=vliegvuil-tiles --working-directory=/srv/vliegvuil \
  node /srv/vliegvuil/scripts/vps-tiles-update.js --spread-hours 24
```

Monitor and stop:

```bash
journalctl -u vliegvuil-tiles -f          # progress (also: tiles.new.download.log in /srv/vliegvuil)
systemctl stop vliegvuil-tiles             # clean stop; rerun the same command to resume
```

The download is strictly sequential (one request at a time), spread with
jitter, honours `Retry-After` on 429/503 and slows the rest of the run,
retries with backoff, and aborts after 5 consecutive failures instead of
hammering the server (PDOK Fair Use publishes no numeric rate limit). It is
resumable: existing valid tiles are skipped, safe to Ctrl-C and rerun.

When it finishes it swaps `tiles.new` into `/srv/vliegvuil/tiles`
(keeping `tiles.old` for rollback), then reload Caddy. The swap is
guarded: a partial run — a custom `--min-zoom`/`--max-zoom` range, a
custom `--out`, or any non-404 failure — is NOT swapped in (the live set
stays untouched; the partial set remains in `tiles.new` for a rerun;
the script exits 1). 404s are genuine upstream holes and do not block
the swap: the map falls back to parent tiles for those. State and the
download log are written next to the tile tree (`tiles.new.state.json`,
`tiles.new.download.log` in `/srv/vliegvuil/`), never inside it, so
they are never published under `/tiles/`. The rename pair (live → old,
new → live) is two separate `rename()` calls — POSIX cannot atomically
exchange directories — so there is a sub-millisecond gap where no live
directory exists; Caddy answers 404 for those instants and MapLibre
falls back to parent tiles, so visitors never see a broken map.

```bash
sudo systemctl reload caddy
curl -sSI https://vliegvuil.nl/tiles/8/132/84.png   # 200 + image/png + Cache-Control
```

Rollback: `sudo rm -rf /srv/vliegvuil/tiles && sudo mv /srv/vliegvuil/tiles.old /srv/vliegvuil/tiles && sudo systemctl reload caddy`.

Caddy serves `/tiles/*` with `Cache-Control: public, max-age=604800`, no
directory listing; missing tiles return a quick 404 (no SPA fallback).

Note on the in-app notice ("Kaartachtergrond kon niet geladen worden"):
it appears only for real tile failures (network errors, 5xx), NOT for
404s — MapLibre 4.7 deliberately fires no error event for a 404 tile and
silently falls back to parent tiles (verified in the MapLibre source,
`source_cache.ts`). So during the first download the map quietly shows
the background colour and the planes layer keeps working; no banner
appears until tiles actually fail to load for a non-404 reason.

