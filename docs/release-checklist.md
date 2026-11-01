# Release checklist

Steps for cutting a release of VliegVul.nl. One release = one merge of
feature work into `main` plus this checklist, run on the VPS by the
maintainer (the agent never deploys).

## 1. Before merging

- [ ] CI green on the PR: lint, typecheck, tests, build, sources validator,
      actionlint, Caddyfile validation (`.github/workflows/ci.yml`).
- [ ] No build-generated diffs in the PR that are not part of a reviewed
      data-refresh PR (`sources.json` `lastUpdated`,
      `web/public/data/*.json`, `web/public/noise-contours.geojson`).
- [ ] PR description lists what changed, what was verified, what was not.
- [ ] If data changed: it arrived via the `data-refresh` workflow PR
      (option C), never a manual run on the VPS.

## 2. Build

On the VPS, from a neutral directory (`cd /tmp`):

- [ ] `sudo -u vliegvuil bash -c 'cd /srv/vliegvuil && git pull --ff-only && pnpm install --frozen-lockfile && VITE_ANALYTICS=1 pnpm --filter web build'`
- [ ] `git status` in `/srv/vliegvuil` is clean (a dirty tree means
      `git pull --ff-only` would have failed — investigate before serving).
- [ ] If the Caddyfile changed: `sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

## 3. Data freshness

- [ ] `web/public/data/airports.json`, `aircraft.json` and
      `web/public/noise-contours.geojson` dates: the attribution page shows
      dataset age; nothing older than the last reviewed data PR.
- [ ] The tile set is healthy: `curl -sSI https://vliegvuil.nl/tiles/8/132/84.png`
      returns 200 (see docs/deploy/08b-tiles.md for a refresh).

## 4. Lint / typecheck / tests

- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @vliegvuil/web build && pnpm test`
      green on `main` (CI already proves this per PR; re-run locally only if
      the deploy pulled something CI has not seen).

## 5. Deploy

- [ ] Merge or pull: the server only ever `git pull --ff-only` (docs/deploy/07-updates.md).
- [ ] `sudo systemctl reload caddy` (reload, not restart — keeps the
      rate-limit state and connections).
- [ ] If Caddy or its modules were bumped: `sudo scripts/vps-caddy-update.sh`
      instead (validates, restarts, rolls back — docs/deploy/09-maintenance.md).

## 6. Post-deploy smoke checks

- [ ] `curl -sSI https://vliegvuil.nl | head -20` — 200, the security
      headers (CSP, HSTS `max-age=86400`, Referrer-Policy) are present.
- [ ] `curl -sS https://vliegvuil.nl/api/point/52.37/4.9/5 | head -c 200` —
      live ADS-B JSON, not an error page.
- [ ] `scripts/verify-caddy-headers.sh` still passes (client IP and
      headers stripped upstream).
- [ ] Open the site in a browser: the only requests are to
      vliegvuil.nl itself (basemap tiles included); compare against
      `docs/privacy.md`; the network trace shows no third party.
- [ ] The map shows live aircraft with smooth movement; select one and
      check the telemetry panel; open the list pop-out; switch language.
- [ ] A test visit shows up in the GoatCounter dashboard (SSH tunnel)
      with a country, and no IP appears in any log or the database
      (docs/deploy/06b-analytics.md verification checklist).
- [ ] `journalctl -u caddy --since "10 min ago" | grep -iE 'error'` shows
      nothing unexpected (error log is IP-scrubbed).
- [ ] Rollback path if any check fails: revert the PR on GitHub, pull,
      rebuild (docs/deploy/07-updates.md).

## 7. Bookkeeping

- [ ] `CHANGELOG.md` updated for the release (move Unreleased items to a
      dated section, or tag the release if the maintainer decides to tag).
- [ ] Screenshots in `docs/screenshots/` refreshed if the UI changed.
