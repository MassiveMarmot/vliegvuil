VliegVuil.nl: v0 Build Spec (Netherlands MVP)
0. Goals and constraints
Scope: live aircraft over the Netherlands, with aviation noise/environmental context. Web first, native apps later.
Principles: FOSS, privacy-first, non-commercial, low maintenance, rebuildable from the repo.
Funding: donations and/or subsidies are possible, so keep licenses clean and the project easy to describe and audit.
Build method: built entirely by an LLM, so use strict typing, tests, lint and a written AGENTS.md of conventions.
1. Data sources
Need	Source	Handling
Live positions	adsb.lol (primary), behind a PositionProvider interface. Fallbacks: adsb.fi, airplanes.live, OpenSky	Polled by the proxy only. Check each provider's terms on caching/redistribution and non-commercial use
Aircraft type/registration	tar1090-db or the OpenSky aircraft CSV	Build-time snapshot, refreshed monthly
Country of registration	Static ICAO24 address-block table	Build-time
Airports	OurAirports, trimmed to NL and nearby, plus a hand-maintained status overlay (commercial / military-shared / planned)	Build-time snapshot
Aviation noise	Schiphol: EU END 2021 contours (RIVM/CVGG via data.overheid.nl, CC-0), 5 dB Lden bands 55–75, "actual traffic 2021 (EU END)". Regional airports (incl. Eindhoven civil Lden): CLO/NLR 2018 & 2024 contours exist as maps only; vector data pending a maintainer request to RIVM/NLR	Build-time: simplify to small GeoJSON for point-in-polygon; PMTiles on the VPS
Basemap	PDOK BRT Achtergrondkaart (default)	Behind a config URL. PMTiles on the VPS is the drop-in replacement later

All snapshots are versioned in the repo or release artifacts, with source, license and date recorded in a machine-readable sources.json.

2. v0 features
Full-screen map with aircraft drawn as a MapLibre symbol layer (not DOM markers), rotated by heading.
Smooth movement by dead reckoning (velocity and heading) between 5s updates.
Noise overlay (toggle): per-airport band sets expressed as band lower bounds (dB) with year, metric and kind ("actual" = calculated from real traffic in a reference year; "permitted" = planning contour under an airport decree, maximum permitted use). Schiphol currently ships the EU END 2021 set: 55/60/65/70/75 dB Lden, labelled "actual traffic 2021 (EU END)". Regional decree contours, once available as vectors, use 48/56/70 dB Lden labelled "permitted use". Warm coral-to-red gradient (colour-blind-safe, pattern-fill fallback), legend shows data year, metric and kind per airport.
Telemetry panel: callsign, registration, type, operator, altitude, speed, heading, vertical rate, squawk, data age. Noise badge reads "Inside the ≥[bandLowerDb] dB [metric] contour of [airport], [year]" plus the contour kind (actual traffic / permitted use), with the annual-average caveat.
Search: callsign, registration or ICAO24.
Airport labels from OurAirports, with a status flag (commercial / military-shared / planned) shown in the popup.
Aircraft list view (sortable table) as the keyboard/screen-reader alternative to the map.
Status banner when data is stale or upstream is down.
Settings: language (NL default, EN), units (ft/m, kt/km/h), stored in localStorage only.
Attribution/licenses page, generated from sources.json.
3. Visual design: "playful minimalism"
Type: rounded, friendly sans (e.g. Space Grotesk or Inter) for UI; a soft serif (e.g. Fraunces) optional for headings on the about/landing page only.
Palette: warm, muted — cream/sand basemap, soft blue-grey water, coral-to-red gradient for noise instead of clinical red/yellow.
Aircraft markers: small rounded plane glyphs in a white circle with a thin border, not sharp radar chevrons; colour-coded (e.g. by altitude band).
Telemetry panel: reads like a friendly info card (rounded corners, soft shadows) rather than a radar HUD.
Motion: subtle — marker "pop" on select, panel slides in with soft easing. No motion that could distract from live tracking or trigger vestibular issues; respect prefers-reduced-motion.
Tone boundary: whimsy stays in chrome/UI, not in the data itself — noise and pollution layers stay factual and clearly labelled, since the subject matter (nuisance, pollution) shouldn't feel trivialised.
4. Architecture

Frontend: React + TypeScript + Vite, MapLibre GL JS, Zustand, i18next, Intl for formatting, and vite-plugin-pwa for an offline app shell only (live data needs a connection).

Repo layout:

/core: providers, interpolation, geometry, noise lookup. Pure TypeScript, no DOM or React, so it's reusable in a future Capacitor build.
/web: UI.
/data-build: scripts producing snapshots and tiles.
/locales, /docs, AGENTS.md.

Hosting (one OVHcloud VPS, EU; 2 vCPU, 4 GB RAM, 40 GB storage):

Caddy serves the static app and reverse-proxies the ADS-B API with a ~5s micro-cache for the NL bounding box (roughly lat 50.5–54, lon 2.5–7.5, with a North Sea buffer for approaches).
No access logs. No client IP or headers forwarded upstream. In-memory per-IP rate limiting.
CORS configured for the web origin and future Capacitor origins.
Data builds: scheduled GitHub Actions workflows run the /data-build check (weekly, opens or updates one issue) and refresh (monthly, plus manual dispatch; opens a pull request with the changed snapshots and sources.json). Validation gates and an atomic swap apply inside the workflow. Noise sources refresh only on manual dispatch after human review. The VPS runs no data jobs.
Deploy: the server clones over HTTPS while the repo is public (read-only deploy key only if the repo is private), then build, run by hand on the VPS after merging. Nothing deploys from GitHub.
GitHub Actions: CI (lint, typecheck, tests, build, validators) on pushes and pull requests, plus the scheduled data check and refresh workflows, which only open issues and pull requests. No deploy jobs, no secrets other than GITHUB_TOKEN, no third-party actions beyond pnpm/action-setup, actions pinned to commit SHAs, minimal per-job permissions.
Ubuntu 26.04 LTS, unattended-upgrades, SSH keys only.

Future native apps: Capacitor wraps the same web build.

API base URL is configurable; no critical feature depends on a service worker.
Native MapLibre is a later option, since /core is UI-independent.
5. Privacy
No analytics, no third-party scripts, self-hosted fonts and assets.
Strict CSP. Only third-party request is PDOK tiles (Dutch government infra); self-hosted PMTiles removes even that later.
The proxy hides the user's IP from the ADS-B provider.
No accounts, no geolocation prompt in v0.
Noise lookup runs client-side against local GeoJSON.
Donation link is a plain outbound link (Liberapay / Open Collective), no embedded widgets.
6. Accessibility and i18n
Semantic landmarks (main, aside, section).
Telemetry panel: managed focus (moves in on select, returns on close, Esc to close) — not a focus trap.
ARIA live announcements for selection and layer toggles, accessible list view, visible focus states, colour-independent legends, prefers-reduced-motion respected.
i18n via /locales/{nl,en}.json, all strings externalised from day one.
7. Licensing and funding
License: MPL-2.0 for all code (decided). AGPL/GPL-style licenses are awkward for App Store distribution; as sole copyright holder (under a pseudonym) the project can still relicense or dual-license later. Not legal advice. AI-generated code can have unclear copyright status, so keep contributor terms simple (DCO sign-off, no contributor agreement).
Data licenses (ODbL, CC-BY, CC0, CC BY-SA, etc.) listed on the attribution page.
Funding: NLnet/NGI Zero (EU, FOSS/privacy-focused) is a natural fit — verify the current call. Donations via Liberapay or Open Collective Europe. Confirm the ADS-B provider's terms accept a donation-funded, non-commercial project.
8. Deferred to v1+
Atlas air-quality grids (NO₂, PM₂.₅)
CBS Wijk- en buurtkaart socio-economic layer
Water/soil PFAS (Waterkwaliteitsportaal, RIVM/Atlas soil PFAS points, Schiphol's own PFAS study for documented airport attribution)
Ultrafine particles (RIVM 2017–18 dataset, TNO 2021 — dated, label clearly)
Leefbaarometer, as context only (its inputs already include noise/air quality — not evidence of an aviation effect)
External safety contours
Natura 2000
PMTiles basemap on the VPS
CO₂/emissions layer — Climate TRACE API (satellite/ML-derived, per-facility and per-flight aviation sector, free, no auth) as primary; Google Travel Impact Model API (per-passenger, CC BY-SA 4.0, future commercial flights only) as a complementary passenger-footprint feature
Native apps
Live noise sensors
Schiphol flight API (free with registration)
Accounts, playback, schedules

Explicitly excluded (reviewed, not integrated):

Worker health/mortality data — none exists publicly (GDPR, incomplete employer records); link to RIVM/TNO exposure studies instead, no map layer.
Crowdsourced noise-complaint platforms (vliegherrie.nl, vliegoverlast.nl, schipholherrie.nl) and commercial sensor networks (Sensornet/NINA, donderdorp.nl) — no open API, complaint data is opinion not measurement, or commercial licensing. Link out as "further reading," don't integrate.
9. "Measurements, not causes" principle
Every layer shows source, date, license.
Airport attribution stated only where an official study supports it (e.g., Schiphol's PFAS study).
No medical claims.
No commercial data aggregators as sources.
10. Conflicts found and resolved (cumulative)
Browser talking directly to upstream APIs → routed through the proxy.
Focus-trap language on a non-modal panel → managed focus (consistent across all sections).
Red/yellow legend → colour-blind-safe warm gradient.
"Noise Zone Indicator" implying live noise → contour-membership badge with caveat.
Tauri/Capacitor planning dropped, then reinstated once native apps were confirmed in scope; /core stays UI-free either way.
AGPL/EUPL suggestion flagged against future App Store distribution.
OpenSky as sole source (rate limits, non-commercial terms) → demoted to fallback.
CAMS, CORINE, NUTS, "Open CORSIA," bird-strike/GBIF and contrail claims → replaced or removed.
Offline PWA claim → limited to app shell only.
Single noise legend (55–75 dB in 5-unit bands) didn't match the regional 48/56/70 dB data → unified legend as per-airport band sets with kind labels (actual / permitted).
Eindhoven's military Ke-based contours vs. civil Lden data → labelled "civil traffic only," source TBD; regional vector data pending maintainer request to RIVM/NLR (session 22: CLO 0588 publishes maps only).
Rotterdam/Groningen/Maastricht lack an airport decree → noted in layer info text. TO VERIFY: CLO indicator 0588 says every regional airport must have an airport decree (luchthavenbesluit) or a transitional conversion decree; check each airport's current status before repeating this in the layer text.
Lelystad has no commercial contour yet → status: planned flag, no noise layer until operational.
CO₂-estimate layer duplicated between v0-adjacent and v1 lists in an earlier draft → confirmed single entry in §8 only.
Whimsical design risk (trivialising noise/pollution data) → boundary set: whimsy in chrome only, data stays factual (§3).
GitHub Actions scope widened from "lint, tests and typecheck only" to include scheduled data check/refresh that only opens issues and pull requests (option C): the repository is public, the VPS (4 GB) builds comfortably, and there was no other notification or data-history path. Nothing deploys from GitHub.

11. Open decisions
License — RESOLVED: MPL-2.0.
Final provider terms check: adsb.lol data licence is ODbL 1.0 (per adsb.lol docs); still to confirm caching/proxying and donation-funded use, and that an API key (obtainable by feeding) is not required later; Climate TRACE aviation-sector granularity for NL
PDOK style compatibility with MapLibre (verify) vs. going straight to PMTiles
Which Eindhoven contour set to use — RESOLVED: civil Lden, labelled "civil traffic only"; the vector source is still pending (CLO 0588 maps only; see §10).
Whether Schiphol's Atlas layer offers finer noise bands than the regional 48/56/70 dB set — RESOLVED (session 22): the open vector source is the EU END 2021 set with 5 dB bands (55–75); Schiphol's Atlas WMS raster offers no download, and CLO/NLR regional contours are published as maps only.
