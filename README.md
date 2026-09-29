# VliegVuil.nl

Visualisatie van vliegvervuiling in Nederland — live aircraft over the Netherlands with aviation noise context, in a privacy-first, FOSS web app.

## What it is

VliegVuil.nl shows live ADS-B aircraft positions on a full-screen map, with official aviation noise contours (annual-average Lden) as an overlay. Click an aircraft for its telemetry; a badge tells you whether it's inside a noise contour — with the honest caveat that contours are annual averages, not live noise.

- **Live map**: MapLibre GL with aircraft rotated by heading, smooth dead-reckoned movement between 5 s updates
- **Noise overlay**: 48 / 56 / 70 dB Lden contour bands (Schiphol via RIVM/Atlas Leefomgeving; regional airports via CLO/NLR), colour-blind-safe with pattern fallback
- **Telemetry panel**: callsign, registration, type, operator, altitude, speed, heading, vertical rate, squawk, data age, and the contour-membership badge
- **Search & list view**: search by callsign/registration/ICAO24; sortable table as the keyboard/screen-reader alternative to the map
- **Settings**: NL (default) / EN, units ft/m and kt/km/h — stored in localStorage only
- **Attribution page**: every data source with its licence, generated from `sources.json`
- **Accessibility**: semantic landmarks, managed focus, ARIA live announcements, reduced-motion support, colour-independent legends
- **Privacy**: no analytics, no third-party scripts/fonts, no access logs, no client IPs forwarded upstream; the only third-party request is PDOK basemap tiles (Dutch government infra)

## Repository layout

| Path | Contents |
|---|---|
| `/core` | Pure TypeScript: position providers, interpolation, geometry, noise lookup — no DOM/React |
| `/web` | React + TypeScript + Vite UI (MapLibre, i18next, PWA app shell) |
| `/data-build` | Scripts producing snapshots (airports, aircraft DB, noise contours → GeoJSON/PMTiles) |
| `/locales` | NL/EN UI strings |
| `/docs` | `SPEC.md`, `BUILD.md`, `deploy.md`, `architecture.md`, `privacy.md` |

## Development

```bash
pnpm install
pnpm lint        # ESLint across all workspaces
pnpm typecheck   # builds core, then tsc across workspaces
pnpm test        # Vitest across all workspaces
pnpm dev         # Vite dev server
```

## Deployment

See [docs/deploy.md](docs/deploy.md) for the VPS setup (Caddy static serving + ADS-B reverse proxy with micro-cache, strict CSP, per-IP rate limiting).

## Licence

Code is licensed under the [MPL-2.0](LICENSE). Data sources and their licences are listed in `sources.json`, validated in CI (`pnpm validate:sources`), and shown in the app's attribution page.
