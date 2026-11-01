# Changelog

All notable changes to VliegVuil.nl are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
before a first tagged release everything ships under "Unreleased". Sessions
refer to the session plan in `docs/BUILD.md` §4 and
`docs/history/session-plan.md`.

## [Unreleased]

### Added
- Live map: MapLibre GL, PDOK BRT-A basemap self-hosted as PNG tiles from our
  own origin, aircraft as symbol layers rotated by heading, altitude-band
  icons, dead-reckoned smooth movement between 5 s polls (reduced-motion
  safe), compass control portaled out of the map container (Firefox canvas
  stacking fix).
- Telemetry panel: callsign, registration, type, operator, altitude, speed,
  heading, vertical rate, squawk, data age, with snapshot fallback
  (tar1090-db) for registration/type/operator when the live feed lacks them.
- Noise overlay: Schiphol EU END 2021 Lden contours (RIVM/CVGG, CC0),
  55–75 dB in 5 dB bands, colour-blind-safe gradient with pattern fallback,
  legend with year/metric/kind, contour-membership badge with the
  annual-average caveat.
- Airports layer: OurAirports markers for large/medium airports with a
  status popup (commercial / military-shared / planned; status null when the
  hand-maintained overlay has no entry — session 23b), self-hosted Space
  Grotesk glyph PBFs for labels.
- Aircraft list view: sortable table as the keyboard/screen-reader
  alternative, a pop-out above the flight counter (session 26).
- Search by callsign, registration or ICAO24.
- App shell (session 25): header, menu, routed pages with the language as
  the first URL path segment (NL default, EN), About and 404 pages.
- SEO foundations (session 25b): static per-language pages, hreflang,
  canonical URLs, sitemap, robots, social previews, root redirect,
  `VITE_SITE_ORIGIN`/`VITE_SITE_NAME` build-time configuration.
- Privacy-first analytics (session 25c): self-hosted GoatCounter behind a
  same-origin `/count` route; country and session key derived in memory on
  the loopback Caddy-to-GoatCounter route only, never stored or logged;
  KillSignal=SIGKILL prevents the shutdown flush of session keys.
- PWA app shell: offline caching of the shell only, self-hosted Space
  Grotesk fonts (woff2, OFL), manifest with maskable icons.
- Data pipeline (sessions 8–9, 21–22, 22b, 22c): OurAirports airports
  snapshot, tar1090-db aircraft snapshot, noise-contour GeoJSON build;
  GitHub Actions workflows run a weekly upstream check (opens/updates one
  issue) and a monthly/manual refresh (opens a PR); the VPS runs no data jobs.
- Self-hosted basemap tile download (`scripts/vps-tiles-update.js`):
  one-time PDOK BRT-A copy (~769 MB) with atomic swap and rollback.
- Custom Caddy build with rate-limit, cache-handler and otter modules,
  pinned in `scripts/caddy-versions.env` and validated in CI.

### Changed
- Primary ADS-B provider switched from adsb.lol to the adsb.fi open-data
  API (rate limits, real-shape parser, heading-0 fix); adsb.lol kept as a
  fallback behind the `PositionProvider` interface.
- API served same-origin via Caddy reverse proxy (`/api/*` → adsb.fi) with
  a ~5 s micro-cache; CORS removed entirely; strict CSP; client IPs and
  identifying headers stripped upstream and scrubbed from Caddy's error log.
- HSTS enabled at the first ramp-up step: `max-age=86400` (one day), no
  includeSubDomains, no preload.
- Airport status semantics (session 23b): status comes only from the
  hand-maintained overlay; airports without an overlay entry (all 93
  heliports and 11 small airfields) have status null instead of a default
  "commercial".
- `index.css` split into ordered partials (tokens-base, map, panels, search,
  responsive-print, overlays, shell, map-chrome) with the cascade unchanged;
  deploy guide split into per-section files under `docs/deploy/`.

### Fixed
- Dead reckoning for heading 0 (north) and ground-state aircraft.
- Polling/retry timer cleanup and the stale-check interval leak; hidden-tab
  pause with a single refresh on return; server-anchored clock so a skewed
  client clock cannot drop every aircraft.
- Firefox nightly + radeonsi: compass and attribution controls portaled out
  of the WebGL canvas stacking context.
- Map markers halving on pixel-ratio changes (icon-size derived from baked
  2x icons, PRs #94–#95 follow-up tracked).

[Unreleased]: https://github.com/MassiveMarmot/vliegvuil/compare
