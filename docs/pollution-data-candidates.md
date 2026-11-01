# New open pollution-data candidates for VliegVuil

Survey compiled 1 November 2026. Candidate list and sources only — nothing here is a decision or a scheduled session; SPEC.md §8 is unchanged until a candidate is picked.

## Question

Which map layers could VliegVuil probably add from open Dutch or international pollution data that are **not yet listed** in `docs/SPEC.md` §8 ("Deferred to v1+") or the "Explicitly excluded" list — and how solid is each source (availability, licence, fit with the "measurements, not causes" principle)?

## Executive summary

1. **The strongest unlisted candidate is measured, not modelled, air quality.** SPEC §8 only lists the *modelled* Atlas NO₂/PM₂.₅ grids. The Landelijk Meetnet Luchtkwaliteit (Luchtmeetnet, RIVM + GGD Amsterdam) publishes **hourly measured values** (CC-BY 4.0, verified), with stations around Schiphol (Oude Meer-Aalsmeerderdijk, Badhoevedorp-Sloterweg). A "measured stations" point layer is new, §9-compliant, and licence-verified.
2. **Satellite-measured NO₂ (Sentinel-5P TROPOMI) is the second strong find.** Daily tropospheric NO₂ columns at ~5.5 × 3.5 km under the free Copernicus licence (attribution required, verified). A distinctly different data type from the Atlas grids; plumes around Schiphol are visible in such data.
3. **A partial unblock for ultrafine particles exists.** SPEC records UFP as blocked because the TNO 2026 inventory has no spatial distribution — but *point measurements* near Schiphol exist: GGD Amsterdam measures UFP at station Ookmeer (Osdorp), reported in the annual Haarlemmermeer air-quality reports. A point layer would not need spatially distributed national data.
4. **Facility-level industrial releases (E-PRTR / European Industrial Emissions Portal)** are downloadable as geodata (2007–2024, ver 16.0, Feb 2026) and could give a point-source layer — possibly including Schiphol itself, if it is a reporting facility (unverified).
5. **Nitrogen data is open and verified but mostly agricultural**: AERIUS total nitrogen deposition hexagons (100 m, "geen beperkingen") and the MAN ammonia measurement network (~350 locations). Natural companion to the already-listed Natura 2000 candidate, needs careful "mostly not aviation" labelling.
6. **Several more open datasets exist but fit weakly** (water quality beyond PFAS, pesticides in surface water, citizen sensors, night lights, former landfills) — usable as context only.
7. **Licence status varies**: RWS water data is public domain, LML is CC-BY 4.0, Copernicus/EOG are attribution licences — all verified on official pages (1 November 2026). E-PRTR, Bestrijdingsmiddelenatlas, MAN, GGD-UFP licences remain **to verify** before any are recorded in SPEC (per AGENTS.md, no licence claim without reading the official page).

## Methodology

- Started from the current SPEC §8/§9/§11 on `main` (already-listed and excluded items, so only genuinely new candidates are proposed).
- Ran ~13 web searches across Dutch official sources (RIVM, data.overheid.nl, emissieregistratie.nl, Rijkswaterstaat, GGD/provinces) and international ones (EEA, Copernicus, OpenAQ, EOG).
- Opened and read the official pages for load-bearing claims (licence, availability, coverage): data.rivm.nl, data.overheid.nl, ECMWF Copernicus licence, EEA datahub, RIVM, Samen Meten, EOG, emissieregistratie.nl.
- Limitations: luchtmeetnet.nl's own open-data page and the Copernicus CDS licence page blocked automated reading, so licence claims for LML rest on the data.overheid.nl dataset entry instead; the Bestrijdingsmiddelenatlas site is a JavaScript app and could not be read directly.
- **Not verified**: presence of Schiphol as an E-PRTR facility; GGD UFP data availability/licence; EEA reuse terms; Bestrijdingsmiddelenatlas licence; Luchtmeetnet API terms; exact per-product EOG licences beyond the general CC-BY-4.0 statement.

## Findings

### Tier 1 — measured, aviation-relevant, strongest case

**1. Measured real-time air quality — Luchtmeetnet / Landelijk Meetnet Luchtkwaliteit (RIVM)**
- Hourly *measured* concentrations (NO₂, PM₁₀, PM₂.₅, O₃, …) at fixed stations, including stations around Schiphol (Oude Meer-Aalsmeerderdijk, Badhoevedorp-Sloterweg) and the GGD Amsterdam network.
- Access verified: open dataset directory (yearly + current-year files, R scripts) and a data.overheid.nl entry — **licence CC-BY 4.0**, public, RIVM.
- Fit: the spec's only air-quality candidate is the *modelled* Atlas grids; a **measured** stations layer (points with latest value, colour-coded) is new, satisfies §9 "measurements, not causes", and strengthens the attribution story ("measured, official network").
- Caveats: spatially sparse (points, no surface); "real-time" would in practice be a build-time snapshot under the existing refresh workflows (privacy rule: no third-party requests); legend must carry substance, unit and timestamp, no health claims.

**2. Satellite-measured NO₂ — Sentinel-5P TROPOMI (Copernicus)**
- Daily tropospheric NO₂ column, ~5.5 × 3.5 km since August 2019; the Copernicus Data Space Ecosystem collection page confirms availability; the Licence to Use Copernicus Products (ECMWF, explicitly covering CAMS air-quality products) grants free-of-charge worldwide use with attribution.
- Fit: measured, aviation-relevant (plumes around Schiphol visible), and a different data type from the Atlas grids — could ship as an annual-average composite raster around Schiphol.
- Caveats: column ≠ ground concentration; cloud gaps over the NL; L2→grid processing needed; keep the "dated, label clearly" principle; must not share a legend with concentration grids (mirrors the existing §8 design note).

**3. Point-source industrial releases — E-PRTR / European Industrial Emissions Portal (EEA)**
- Facility-level annual pollutant releases to air, geolocated; dataset ver 16.0 (Feb 2026), 2007–2024, downloadable as Geopackage/WMS/CSV (verified on the EEA datahub).
- Fit: potential point layer of industrial emitters near airports; airports can fall under Annex I capacity thresholds — **whether Schiphol itself reports is unverified** (one CSV grep would settle it).
- Caveats: annual reported totals, not measurements; EEA reuse terms not yet read.

**4. Measured UFP near Schiphol — GGD Amsterdam (partial unblock of the UFP item)**
- GGD measures ultrafine particles at station Ookmeer (Osdorp), near Schiphol; documented in the province of Noord-Holland's annual Haarlemmermeer air-quality reports (2023/2024 reports verified to exist).
- Fit: SPEC's UFP blocker is the lack of *spatially distributed* national data; a *point-measurement* layer near Schiphol does not need that. Even one labelled station is a meaningful "measured UFP near Schiphol" marker.
- Caveats: data availability/licence from GGD unverified (reports are PDFs); single point, wind-direction dependent; the TNO caveat style must be kept.

### Tier 2 — open and verified, context value

**5. Nitrogen: AERIUS deposition hexagons + MAN ammonia measurements (RIVM)**
- AERIUS total nitrogen deposition per hexagon (100 m, 2023 data / AERIUS 2026 products) on data.rivm.nl — metadata states "geen beperkingen" (no use restrictions). MAN measures monthly-average NH₃ at ~350 locations (RIVM page verified; man.rivm.nl).
- Fit: natural companion to the already-listed Natura 2000 candidate; mostly agricultural sources — legend must not imply an aviation effect.

**6. CAMS European air quality (Copernicus Atmosphere Monitoring Service)**
- Near-real-time European air-quality forecasts/reanalyses under the same Copernicus licence; coarse (~10 km) but current, with PM speciation.
- Caveat: overlaps the purpose of the already-listed Atlas grids; likely "either/or", with Atlas preferred for NL resolution.

**7. Surface-water quality beyond PFAS (Rijkswaterstaat)**
- "Waterkwaliteit Oppervlaktewater — fysisch-chemische en chemische componenten" on data.overheid.nl — **public domain** (verified), updated 2026. Extends the already-listed PFAS water item to nutrients, metals, PAHs.
- Aviation link weak (general context); consider only if the PFAS layer ships and wants siblings.

**8. Pesticides in surface water — Atlas Bestrijdingsmiddelen in oppervlaktewater (RIVM/CML)**
- National picture from waterboard measurements; all data directly downloadable (Leiden University announcement of the 2020 relaunch); Nationaal Georegister record exists. Licence unread (JS-only site). Aviation relevance weak.

### Tier 3 — possible, but weak fit or framing work needed

**9. Citizen sensor data — Samen Meten (RIVM "Measure Together")**
- Officially open database (data, calibration methods and software open; locations privacy-shifted up to 50 m) — verified on the Samen Meten open-data page. The spec excluded *commercial* sensor networks; this is a public/citizen network, a different category, but quality is "indicative" and would need that framing everywhere.

**10. Light pollution — VIIRS Nighttime Lights (EOG)**
- EOG states many VIIRS nighttime-lights products are under CC-BY 4.0 (verified); annual/monthly composites. Aviation tie is weak (airports as bright points); context-only, and per-product licences need checking.

**11. Former landfills (provincial open data)**
- Per-province datasets exist (Noord-Brabant polygons and points, Noord-Holland "Navos" locations, Utrecht), each with its own licence. Fragmented, aviation link weak; only worth it as generic soil-pollution context.

### Related, but already inside the spec's open questions

- **Emissieregistratie spatial distribution (1 × 1 km)** — SPEC §11 already flags this as unresolved; the survey confirms spatial distributions exist (they feed the GCN concentration maps) with restrictions/embargo caveats at the highest detail level. Confirming this resolves an existing open question rather than adding a new candidate.
- **OpenAQ** — an aggregation route to the same LML data (licence per source, CC-BY-flavoured); unnecessary since RIVM publishes directly, and the spec prefers official sources.
- Luchtmeetnet/GGD data also feeds the existing GCN/Atlas candidate; the *new* part is the measured-stations layer, not the grids.

## Source notes

| Source | Credibility | Last updated |
|---|---|---|
| [data.overheid.nl — Meetwaarden Landelijk Meetnet Luchtkwaliteit (RIVM); uur (CC-BY 4.0)](https://data.overheid.nl/dataset/27136-meetwaarden-landelijk-meetnet-luchtkwaliteit--rivm---uur) | 5/5 | 2025-10-12 |
| [data.rivm.nl — Luchtmeetnet dataset (open file directory)](https://data.rivm.nl/data/luchtmeetnet/) | 5/5 | 2026 |
| [ECMWF — Licence to Use Copernicus Products (CAMS)](https://apps.ecmwf.int/datasets/licences/copernicus/) | 5/5 | - |
| [Copernicus Data Space Ecosystem — Sentinel-5P collection](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-5p) | 4/5 | - |
| [EEA datahub — Industrial Reporting under IED and E-PRTR (ver 16.0)](https://www.eea.europa.eu/en/datahub/datahubitem-view/9405f714-8015-4b5b-a63c-280b82861b3d) | 5/5 | 2026-02-20 |
| [data.overheid.nl — Waterkwaliteit Oppervlaktewater, fysisch-chemische en chemische componenten (publiek domein)](https://data.overheid.nl/en/dataset/22200-waterkwaliteit-oppervlaktewater--fysisch-chemische-en-chemische-componenten) | 5/5 | 2026-08-05 |
| [data.rivm.nl — AERIUS totale stikstofdepositie metadata ("geen beperkingen")](https://data.rivm.nl/meta/srv/metadata/b5e7a6f3-aa6d-483b-bebc-c5f7ddd9a233) | 5/5 | 2026-10-06 |
| [RIVM — Stikstof: Open data (LML, MAN, depositiekaarten)](https://www.rivm.nl/stikstof/open-data) | 5/5 | - |
| [RIVM — Meetnet Ammoniak Nederland (MAN) meetresultaten](https://man.rivm.nl/) | 4/5 | 2026 |
| [Universiteit Leiden — Vernieuwde Bestrijdingsmiddelenatlas (data direct downloadable)](https://www.universiteitleiden.nl/nieuws/2020/09/vernieuwde-online-atlas-brengt-bestrijdingsmiddelen-in-het-oppervlaktewater-nog-beter-in-kaart) | 4/5 | 2020-09-24 |
| [Samen Meten (RIVM) — Open data](https://www.samenmeten.nl/international/OpenData) | 5/5 | - |
| [EOG (Colorado School of Mines) — VIIRS Nighttime Lights](https://eogdata.mines.edu/products/vnl/) | 4/5 | - |
| [Provincie Noord-Holland / GGD — Jaarrapportage luchtkwaliteit Haarlemmermeer 2024 (UFP at Ookmeer)](https://www.noord-holland.nl/bestanden/pdf/Gezonde_leefomgeving/Milieu/GGD%20jaarrapport%20luchtkwaliteit%20Haarlemmermeer%202024.pdf) | 5/5 | 2025 |
| [Pointer (KRO-NCRV) — Ultrafijnstof rondom Schiphol (Luchtmeetnet stations named)](https://pointer.kro-ncrv.nl/ultrafijnstof-rondom-schiphol-het-kan-ook-van-een-barbeque-of-een-bootje-komen) | 3/5 | - |
| [data.overheid.nl — Stortplaatsen voormalig (provincial datasets)](https://data.overheid.nl/en/dataset/70287-stortplaatsen-voormalig) | 4/5 | - |
| [OpenAQ docs — Licenses resource](https://docs.openaq.org/resources/licenses) | 4/5 | - |
| [Emissieregistratie — Ruimtelijke verdeling](https://www.emissieregistratie.nl/documentatie/ruimtelijke-verdeling) | 5/5 | 2024-06-24 |

Caveats: luchtmeetnet.nl's own open-data page and the CDS licence page blocked automated reading, so the LML licence claim rests on data.overheid.nl. E-PRTR facility presence of Schiphol, GGD UFP data terms, EEA reuse terms and the Bestrijdingsmiddelenatlas licence were not verified — each needs an official-page check before being recorded in SPEC.

## Open questions

1. Does Schiphol report as an E-PRTR facility (Annex I capacity threshold for airports)? One download + grep answers this.
2. Is GGD's Ookmeer UFP measurement series available as data (not just annual PDF reports), and under what terms?
3. What are the EEA reuse conditions for the Industrial Emissions Portal dataset?
4. What licence governs the Bestrijdingsmiddelenatlas downloads, and MAN's station data?
5. Luchtmeetnet API terms for automated fetching (api-docs.luchtmeetnet.nl exists, unread) — relevant if hourly data were ever more than a build-time snapshot.
6. Do the ER 1 × 1 km spatial files have embargo conditions for aviation sources specifically (SPEC §11 already wants this checked)?

## Recommendations

1. **Record two new §8 candidates**, both §9-friendly and licence-verified: (a) *Measured air quality stations (Luchtmeetnet/LML, CC-BY 4.0)* — points with latest measured values, designed alongside the existing Atlas grids entry; (b) *Satellite NO₂ (Sentinel-5P TROPOMI, Copernicus licence)* — annual composite around Schiphol, never sharing a legend with concentration grids.
2. **Amend the UFP §8 entry** with the Ookmeer finding: a measured near-Schiphol point layer is possible without the national spatial data, pending a GGD data/terms check.
3. **Run the two cheap verification checks** (E-PRTR grep for Schiphol; GGD data request) before adding those as candidates — invent nothing until then.
4. **Skip for now**: CAMS (overlaps Atlas), pesticides, water quality beyond PFAS, Samen Meten, night lights, landfills. Note them in this survey only; they don't earn a SPEC entry without a concrete layer design.
5. Any accepted candidate still goes through the existing gates: official licence page read and cited in `sources.json`, attribution-page entry, i18n, legend caveats, build-time snapshot (no third-party requests), and the hide-aircraft-view option designed with the first layer that actually ships.
