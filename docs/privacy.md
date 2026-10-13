# Privacy

VliegVuil.nl is privacy-first by design. This page documents what the site does and does not do with visitor data.

## What we collect

**Nothing about you.** Specifically:

- **No analytics** — no page-view tracking, no session recording, no heatmaps
- **No third-party scripts, fonts, or pixels** — everything is served from our own origin
- **No cookies** — settings (language, units) are stored in your browser's localStorage and never sent to us
- **No access logs** — the Caddy web server has access logging disabled
- **No client IP forwarded upstream** — requests proxied to the ADS-B data provider (adsb.fi) are stripped of your IP address and identifying headers
- **No accounts or profiling** — there is nothing to log into and no behavioural tracking of any kind

## Third-party requests

**None.** The basemap tiles (PDOK BRT Achtergrondkaart) are self-hosted on
our own server: the browser loads them from vliegvul.nl itself and never
contacts service.pdok.nl. The site therefore does not depend on any
third-party server being reachable at request time.
## Strict CSP

The Content-Security-Policy only allows resources from our own origin — `service.pdok.nl` is no longer listed anywhere in the policy. See `Caddyfile` and `docs/deploy.md` for the exact policy.

## Local storage

| Key | Purpose |
|---|---|
| `vliegvuil.language` | UI language (nl/en) |
| `vliegvuil.units` | Altitude/speed units (ft/m, kt/km/h) |

Both stay on your device, are never transmitted, and can be cleared at any time through your browser.

## Contact

Data updates for the site's snapshots run on GitHub's runners (GitHub
Actions); they contact only public open-data hosts (OurAirports,
raw.githubusercontent.com, data.overheid.nl) and involve no visitor data.

Questions about privacy? Open an issue in this repository.
