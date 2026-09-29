# Privacy

VliegVuil.nl is privacy-first by design. This page documents what the site does and does not do with visitor data.

## What we collect

**Nothing about you.** Specifically:

- **No analytics** — no page-view tracking, no session recording, no heatmaps
- **No third-party scripts, fonts, or pixels** — everything is served from our own origin
- **No cookies** — settings (language, units) are stored in your browser's localStorage and never sent to us
- **No access logs** — the Caddy web server has access logging disabled
- **No client IP forwarded upstream** — requests proxied to the ADS-B data provider (adsb.lol) are stripped of your IP address and identifying headers
- **No accounts or profiling** — there is nothing to log into and no behavioural tracking of any kind

## Third-party requests

The app makes exactly one kind of third-party request: **PDOK basemap tiles** (`geodata.nationaalgeoregister.nl`), operated by the Dutch government. Map tile requests inherently reveal roughly where on the map you are looking to that server; this is standard for any slippy map. Self-hosted PMTiles basemaps are a planned drop-in replacement that would remove even this.

The aircraft position requests go to our own origin (the Caddy proxy), not directly to any third party.

## Strict CSP

The Content-Security-Policy only allows resources from our own origin and PDOK tiles. See `Caddyfile` and `docs/deploy.md` for the exact policy.

## Local storage

| Key | Purpose |
|---|---|
| `vliegvuil.language` | UI language (nl/en) |
| `vliegvuil.units` | Altitude/speed units (ft/m, kt/km/h) |

Both stay on your device, are never transmitted, and can be cleared at any time through your browser.

## Contact

Questions about privacy? Open an issue in this repository.
