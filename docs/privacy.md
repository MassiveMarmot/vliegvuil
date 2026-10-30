# Privacy

VliegVuil.nl is privacy-first by design. This page documents what the site does and does not do with visitor data.

## What we collect

**Aggregate page-view counts only, and nothing that identifies you.** Specifically:

- **Minimal, self-hosted analytics** — we count page views, unique visits, date/time and country of origin with a self-hosted GoatCounter on our own server. There is no analytics account with any third party and no data leaves our server.
  - Your IP address is processed **in memory** on our own server, only on the internal route to the analytics service, to derive your country and a session key (browser + address + site) so visits can be counted as unique. It is **never stored in the database and never logged**. Because the analytics service is stopped non-gracefully (`KillSignal=SIGKILL`), the in-memory session key is never written to disk; if that ever changes, this page will say so honestly.
  - Referrers (which site a visit came from) are counted **per hour in aggregate** when present; our own app never sends a referrer, so pages you navigate to inside the site are never recorded as "referred by vliegvuil.nl". We do **not** collect screen sizes, regions or languages, and there is no event tracking.
  - Bot filtering is best-effort: self-identified bots are marked as such in the aggregate numbers; disguised bots may be counted, crawlers without JavaScript are never seen.
  - The aggregated statistics (per-hour counts of pages, referrers, countries and browsers — no individual visitors) are kept without a set expiry for now. If a retention period is ever introduced, this page will say so.
- **No third-party scripts, fonts, or pixels** — everything, including the analytics count, is served from our own origin
- **No cookies** — settings (language, units) are stored in your browser's localStorage and never sent to us; the analytics uses no cookies or localStorage
- **No access logs, and no visitor IP in any server log** — the Caddy web server has access logging disabled, and its error log is scrubbed: failed-request entries record only the status and timing, never your address, headers or the page you were on
- **No client IP forwarded upstream** — requests proxied to the ADS-B data provider (adsb.fi) are stripped of your IP address and identifying headers; the only place your address is used at all is the internal analytics route described above
- **No accounts or profiling** — there is nothing to log into and no behavioural tracking of any kind

## Third-party requests

**None.** The basemap tiles (PDOK BRT Achtergrondkaart) are self-hosted on
our own server: the browser loads them from vliegvul.nl itself and never
contacts service.pdok.nl. The analytics count is same-origin as well (see
above), so the site does not depend on, or contact, any third-party server
at request time.
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
