# VliegVuil.nl

**[English version below ↓](#english-version)**

## Nederlandse versie

Visualisatie van vliegvervuiling in Nederland — live vliegtuigposities boven Nederland met context rondom vliegtuiglawaai, in een privacy-eerst, FOSS webapp.

### Wat is het

VliegVuil.nl toont live ADS-B vliegtuigposities op een fullscreen kaart, met officiële geluidscontouren van de luchtvaart (jaargemiddelde Lden) als overlay. Klik op een vliegtuig voor zijn telemetrie; een badge vertelt je of het binnen een geluidscontour ligt — met de eerlijke kanttekening dat contouren jaargemiddelden zijn, geen live geluid.

- **Live kaart**: MapLibre GL met vliegtuigen geroteerd naar hun koers, vloeiende dead-reckoning-beweging tussen 5-secondsupdates
- **Geluidsoverlay**: 48 / 56 / 70 dB Lden contourbanden (Schiphol via RIVM/Atlas Leefomgeving; regionale vliegvelden via CLO/NLR), kleurenblind-vriendelijk met patroonfallback
- **Telemetriepaneel**: callsign, registratie, type, operator, hoogte, snelheid, koers, verticale snelheid, squawk, data-leeftijd, en de contour-lidmaatschapsbadge
- **Zoeken & lijstweergave**: zoeken op callsign/registratie/ICAO24; sorteerbare tabel als het toetsenbord-/schermlezer-alternatief voor de kaart
- **Instellingen**: NL (standaard) / EN, eenheden ft/m en kt/km/h — uitsluitend opgeslagen in localStorage
- **Attributiepagina**: elke databron met zijn licentie, gegenereerd uit `sources.json`
- **Toegankelijkheid**: semantische landmarks, beheerde focus, ARIA-live-aankondigingen, reduced-motion-ondersteuning, kleuronafhankelijke legenda's
- **Privacy**: minimale zelf-gehoste analytics (alleen paginaweergaven + land, geen IP opgeslagen of gelogd — zie `docs/privacy.md`), geen third-party scripts/fonts, geen toegangslogs, geen client-IP's doorgestuurd naar bovenstrooms; de site doet geen enkele third-party-request (PDOK BRT-A, CC-BY 4.0, is uitsluitend attributie)

### Repository-indeling

| Pad | Inhoud |
|---|---|
| `/core` | Pure TypeScript: positie-providers, interpolatie, geometrie, geluidsopzoeking — geen DOM/React |
| `/web` | React + TypeScript + Vite UI (MapLibre, i18next, PWA app-shell) |
| `/data-build` | Scripts die snapshots produceren (vliegvelden, vliegtuig-DB, geluidscontouren → GeoJSON/PMTiles) |
| `/locales` | NL/EN UI-strings |
| `/docs` | `SPEC.md`, `BUILD.md`, `deploy.md`, `architecture.md`, `privacy.md` |

### Ontwikkeling

```bash
pnpm install
pnpm lint        # ESLint over alle workspaces
pnpm typecheck   # bouwt core, daarna tsc over alle workspaces
pnpm test        # Vitest over alle workspaces
pnpm dev         # Vite dev-server (gebruik VITE_MOCK=1 voor mock-vliegtuigdata;
                 # geen lokale /api-proxy — zie docs/deploy.md "Local preview")
```

### Deployment

Zie [docs/deploy.md](docs/deploy.md) voor de VPS-setup (statische bestandsservering via Caddy + ADS-B reverse proxy met micro-cache, strenge CSP, per-IP rate limiting).

### Licentie

Code valt onder de [MPL-2.0](LICENSE). Databronnen en hun licenties staan in `sources.json`, gevalideerd in CI (`pnpm validate:sources`), en getoond op de attributiepagina van de app.

---

## English version

Visualization of aviation pollution in the Netherlands — live aircraft over the Netherlands with aviation noise context, in a privacy-first, FOSS web app.

### What it is

VliegVuil.nl shows live ADS-B aircraft positions on a full-screen map, with official aviation noise contours (annual-average Lden) as an overlay. Click an aircraft for its telemetry; a badge tells you whether it's inside a noise contour — with the honest caveat that contours are annual averages, not live noise.

- **Live map**: MapLibre GL with aircraft rotated by heading, smooth dead-reckoned movement between 5 s updates
- **Noise overlay**: 48 / 56 / 70 dB Lden contour bands (Schiphol via RIVM/Atlas Leefomgeving; regional airports via CLO/NLR), colour-blind-safe with pattern fallback
- **Telemetry panel**: callsign, registration, type, operator, altitude, speed, heading, vertical rate, squawk, data age, and the contour-membership badge
- **Search & list view**: search by callsign/registration/ICAO24; sortable table as the keyboard/screen-reader alternative to the map
- **Settings**: NL (default) / EN, units ft/m and kt/km/h — stored in localStorage only
- **Attribution page**: every data source with its licence, generated from `sources.json`
- **Accessibility**: semantic landmarks, managed focus, ARIA live announcements, reduced-motion support, colour-independent legends
- **Privacy**: minimal self-hosted analytics (page views + country only, no IP stored or logged — see `docs/privacy.md`), no third-party scripts/fonts, no access logs, no client IPs forwarded upstream; the site makes no third-party requests (PDOK BRT-A, CC-BY 4.0, is attribution only)

### Repository layout

| Path | Contents |
|---|---|
| `/core` | Pure TypeScript: position providers, interpolation, geometry, noise lookup — no DOM/React |
| `/web` | React + TypeScript + Vite UI (MapLibre, i18next, PWA app shell) |
| `/data-build` | Scripts producing snapshots (airports, aircraft DB, noise contours → GeoJSON/PMTiles) |
| `/locales` | NL/EN UI strings |
| `/docs` | `SPEC.md`, `BUILD.md`, `deploy.md`, `architecture.md`, `privacy.md` |

### Development

```bash
pnpm install
pnpm lint        # ESLint across all workspaces
pnpm typecheck   # builds core, then tsc across workspaces
pnpm test        # Vitest across all workspaces
pnpm dev         # Vite dev server (use VITE_MOCK=1 for mock aircraft data;
                 # no local /api proxy — see docs/deploy.md "Local preview")
```

### Deployment

See [docs/deploy.md](docs/deploy.md) for the VPS setup (Caddy static serving + ADS-B reverse proxy with micro-cache, strict CSP, per-IP rate limiting).

### Licence

Code is licensed under the [MPL-2.0](LICENSE). Data sources and their licences are listed in `sources.json`, validated in CI (`pnpm validate:sources`), and shown in the app's attribution page.
