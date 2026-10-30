VliegVuil.nl: v0 Build Spec (Netherlands MVP)
0. Goals and constraints
Scope: live aircraft over the Netherlands, with aviation noise/environmental context. Web first, native apps later.
Principles: FOSS, privacy-first, non-commercial, low maintenance, rebuildable from the repo.
Funding: donations and/or subsidies are possible, so keep licenses clean and the project easy to describe and audit.
Build method: built entirely by an LLM, so use strict typing, tests, lint and a written AGENTS.md of conventions.
1. Data sources
Need	Source	Handling
Live positions	adsb.fi open-data API (primary; public, 1 req/s limit, ADSBx-v2-compatible), behind a PositionProvider interface. Fallbacks: airplanes.live (requires prior email contact), adsb.lol (throttles datacenter IPs to ~2/min; plans feeder-gated API keys), OpenSky (400 req/day anonymous)	Polled by the proxy only. Check each provider's terms on caching/redistribution and non-commercial use
Aircraft type/registration	tar1090-db or the OpenSky aircraft CSV	Build-time snapshot, refreshed monthly
Country of registration	Static ICAO24 address-block table	Build-time
Airports	OurAirports, trimmed to NL and nearby, plus a hand-maintained status overlay (commercial / military-shared / planned)	Build-time snapshot
Aviation noise	Schiphol: EU END 2021 contours (RIVM/CVGG via data.overheid.nl, CC-0), 5 dB Lden bands 55–75, "actual traffic 2021 (EU END)". Regional airports (incl. Eindhoven civil Lden): CLO/NLR 2018 & 2024 contours exist as maps only; vector data pending a maintainer request to RIVM/NLR	Build-time: simplify to small GeoJSON for point-in-polygon; PMTiles on the VPS
Basemap	PDOK BRT Achtergrondkaart, self-hosted as PNG tiles on our own origin at /tiles/{z}/{x}/{y}.png (one-time copy, CC-BY 4.0, attribution only — no live PDOK dependency). A config URL can point elsewhere; PMTiles on the VPS is the drop-in replacement later

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
Settings: units (ft/m, kt/km/h), stored in localStorage only. Language (NL default, EN) is the first URL path segment (/{lang}/...), set by the menu language switcher, not stored (session 25).
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
Strict CSP; the site makes no third-party requests (the PDOK BRT basemap is self-hosted; PDOK is attribution only, CC-BY 4.0).
HSTS is enabled with `max-age=86400` (one day, no includeSubDomains, no preload); the decision plan and ramp-up are tracked in docs/BUILD.md §6 (human checkpoints).
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
Atlas air-quality grids (NO₂, PM₂.₅) — design note: a PM₂.₅ or NO₂ layer may understate aviation, because per TNO R10578 aviation is about 0.2% of Dutch PM₂.₅ mass emissions (2024) but 41% of particle-number emissions; any such layer must carry a legend note saying so, and concentration grids (Atlas) and emission inventories (Emissieregistratie) must not share a legend
CBS Wijk- en buurtkaart socio-economic layer
Water/soil PFAS (Waterkwaliteitsportaal, RIVM/Atlas soil PFAS points, Schiphol's own PFAS study for documented airport attribution)
Ultrafine particles — current national inventory: TNO 2026 R10578, "Particle number emissions of 2022-24 for the Dutch emission inventory" (1 April 2026, for RIVM/Emissieregistratie; ER 1990–2024), replacing the earlier TNO 2021 work. It gives national totals only, with no spatial distribution (the report names spatially distributing the emissions as a next step), so no map layer is possible from it alone. These are emissions, not concentrations or exposure, and TNO says the uncertainties are larger than for NOx or PM₂.₅. Regional emissions study: TNO "Ultrafijnstof in Noord-Brabant" (8 October 2026) — emission map published as an image only; the underlying report TNO-2026-17706 has not been read, so data availability and licence are unknown. Status: deferred to v1+; unblock condition: spatially distributed emissions or modelled concentrations under a verified open licence. Any future UFP layer keeps the "dated, label clearly" principle.
Leefbaarometer, as context only (its inputs already include noise/air quality — not evidence of an aviation effect)
External safety contours
Natura 2000
PMTiles basemap on the VPS — full international basemap under the NL-only self-hosted PDOK BRT layer. Options compared 2026-10-10 (borders-context layer shipped first: bundled Natural Earth clip, public domain, same origin, no third-party request): (a) self-hosted Protomaps extract via `pmtiles extract` from the daily planet build, served as one static PMTiles file by Caddy — fits the "no third-party requests" rule, OSM attribution required, estimated tens of MB at z<=10 for NL+neighbours (measure with `--dry-run`); build artifact on the VPS, not committed (2 MB cap); (b) OpenFreeMap (tiles.openfreemap.org) — free, unlimited, no key/registration/cookies, OSM data under ODbL, Positron style; donation-funded two-server project, so keep the inline style (never make their style JSON the root style), use their TileJSON URL, and tolerate source errors quietly; adds a second third-party origin to CSP connect-src; (c) CARTO basemaps — requires an API key (public in the client, quota-metered 5M/month non-commercial), fallback only. Ruled out: tile.openstreetmap.org (usage policy forbids production sites), CARTO raster without key (watermarked since 2026-09).
CO₂/emissions layer — Climate TRACE API (satellite/ML-derived, per-facility and per-flight aviation sector, free, no auth) as primary; Google Travel Impact Model API (per-passenger, CC BY-SA 4.0, future commercial flights only) as a complementary passenger-footprint feature
Airspace structure layer (NL) — LVNL Geoportaal official airspace polygons (CTR, TMA, CTA, TSA/TRA, danger/restricted areas; free GeoJSON download for the Dutch FIR EHAA); openAIP (CC BY-NC) and open flightmaps as alternatives. Same build-time pipeline as the noise contours: simplify → GeoJSON → maplibre fill layer
ATS route network (Europe) — published airways; EUROCONTROL DDR/NM B2B data is registration-restricted to ATM stakeholders, so this depends on openAIP's airway coverage or an access request; revisit availability
Actual flown corridors (NL/Europe) — derived, not official: density heatmap or per-airport departure/arrival track bundles computed from historical ADS-B (adsb.lol ODbL bulk dumps, or OpenSky historical with research registration). Measured traffic, not modelled — fits §9; heavier build (needs a history pipeline), but no official open equivalent exists
Native apps
Live noise sensors
Schiphol flight API (free with registration)
Self-hosted privacy-first analytics (GoatCounter, EUPL-1.2, single binary, SQLite on the VPS): unique visitors, date/time and country of origin only; the visitor IP is processed in memory on the localhost Caddy→GoatCounter route to derive a country and the session key (user-agent + IP + site id, held in memory up to 8 h and, on graceful shutdown, briefly written to the local database and deleted at next start — mitigated with `KillSignal=SIGKILL` in the systemd unit, to be verified); never logged; no hosted service, no goatcounter.com account. Planned in session 25c — see docs/sessions/25c-analytics.md and the 25c row in BUILD.md §4. Until 25c ships, the "no analytics" statements in §5 remain true and are updated in that session.
Accounts, playback, schedules

Explicitly excluded (reviewed, not integrated):

Worker health/mortality data — none exists publicly (GDPR, incomplete employer records); link to RIVM/TNO exposure studies instead, no map layer.
Nederlandse Kankeratlas (IKNL, kankeratlas.iknl.nl) — reviewed 2026-10-22: not open data. IKNL's disclaimer lets figures/infographics/NKR cijfers and texts be quoted with attribution, but reuse in another product (printed/written material) requires IKNL's prior written permission; there is no downloadable dataset or API (the atlas is interactive only), and detailed data is released solely via a purpose-restricted gegevensaanvraag (scientific research/statistics, no redistribution). Also a health-outcome layer — same category as worker health/mortality above — clashing with §9 (measurements, not causes; no medical claims): the atlas shows regional incidence relative to expectation, driven largely by population composition and screening participation, not environmental risk. Treatment: link out as "further reading" context with that caveat; no map layer unless IKNL grants written permission, and if it ever ships it needs its own health-outcome framing, not a shared legend with exposure layers.
Crowdsourced noise-complaint platforms (vliegherrie.nl, vliegoverlast.nl, schipholherrie.nl) and commercial sensor networks (Sensornet/NINA, donderdorp.nl) — no open API, complaint data is opinion not measurement, or commercial licensing. Link out as "further reading," don't integrate.
9. "Measurements, not causes" principle
Every layer links to its entry on the Attribution page, which shows source, date, licence and caveats; the legend or badge shows a one-line essential (what, year, annual average).
Airport attribution stated only where an official study supports it (e.g., Schiphol's PFAS study). UFP: According to TNO (2026, R10578), aviation was the largest source of ultrafine particle-number emissions in the Netherlands in 2024 (41% of particles up to 325 nm). Caveats: only emissions below 914 m are counted; particles below 10 nm are excluded (for aviation these are more than half of the particles); it is an emissions estimate, not exposure. No health effects stated or implied.
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
Final provider terms check — RESOLVED 2026-10-02: primary switched to adsb.fi open-data API (terms at the API root, "by accessing the API, you agree to the terms"; 1 req/s public limit). adsb.lol kept as fallback: ODbL 1.0 data licence, but datacenter IPs throttled to ~2/min and a feeder-gated API key is planned. Still open: Climate TRACE aviation-sector granularity for NL
PDOK style compatibility with MapLibre (verify) vs. going straight to PMTiles
Which Eindhoven contour set to use — RESOLVED: civil Lden, labelled "civil traffic only"; the vector source is still pending (CLO 0588 maps only; see §10).
Eindhoven noise contours — the official measure is Ke (35 Ke etc.), not Lden: the Luchthavenbesluit Eindhoven fixes the legal 35 Ke zone (BML, Ke instead of Lden; CLO 216206: 35 Ke ≈ 56–58 Lden), while the current decision (civil Lden, labelled "civil traffic only", see the RESOLVED line above) rests on CLO indicator 0588 maps, which are images only (CLO 0588/058801: contours calculated by NLR, maps made by PBL, older versions delivered as contours and 100x100 m grids). TO VERIFY: sources disagree on the Luchthavenbesluit date (in force 1 November 2014 per CLO 216206 / NLR "LHB 2014", vs 20 December 2019 per other sources). Options once vector data exists: (a) indicative civil Lden from PBL/NLR calculation, labelled as such, or (b) the legal 35 Ke zone, labelled as Ke. Revisit the decision then (see BUILD.md §6, data requests for Eindhoven — deferred; replies not expected soon, so no build session is scheduled for this).
Whether Schiphol's Atlas layer offers finer noise bands than the regional 48/56/70 dB set — RESOLVED (session 22): the open vector source is the EU END 2021 set with 5 dB bands (55–75); Schiphol's Atlas WMS raster offers no download, and CLO/NLR regional contours are published as maps only.
Does the Emissieregistratie data export or maps include particle-number (TPN) data, and under what licence? UNRESOLVED — pages to check: the data export, "Vliegvelden", and "Ruimtelijke verdeling" on emissieregistratie.nl.
Could the Emissieregistratie "Vliegvelden" page supply airport-level emissions for the session 23 airport popup? UNRESOLVED, not scoped — do not change session 23.
Airport status in airports.json reads "commercial" for every EH* airport not in the hand-maintained overlay (data-build default), which is misleading for heliports and small airfields — fix planned in session 23b (BUILD.md §4).
