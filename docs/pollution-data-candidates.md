# New open pollution-data candidates for VliegVuil

Survey compiled 1 November 2026; verification updates 2–3 November 2026. Candidate list and sources only — nothing here is a decision or a scheduled session; SPEC.md §8 is unchanged until a candidate is picked.

## Question

Which map layers could VliegVuil probably add from open Dutch or international pollution data that are **not yet listed** in `docs/SPEC.md` §8 ("Deferred to v1+") or the "Explicitly excluded" list — and how solid is each source (availability, licence, fit with the "measurements, not causes" principle)?

## Executive summary

1. **The strongest unlisted candidate is measured, not modelled, air quality.** SPEC §8 only lists the *modelled* Atlas NO₂/PM₂.₅ grids. The Landelijk Meetnet Luchtkwaliteit (Luchtmeetnet, RIVM + GGD Amsterdam) publishes **hourly measured values**, with stations around Schiphol (codes and coordinates in Findings). Licence: CC-BY 4.0 on data.overheid.nl, verified for RIVM's LML dataset; the Schiphol-area stations are source PNH — not stated as covered: not verified. A "measured stations" point layer is new, §9-compliant; licence-verified for LML only.
2. **Satellite-measured NO₂ (Sentinel-5P TROPOMI) is the second strong find.** Daily tropospheric NO₂ columns at ~5.5 × 3.5 km, free, full and open under the Copernicus Sentinel Data Legal Notice (verified 2 Nov). A distinctly different data type from the Atlas grids; airport-related NO₂ enhancements are resolvable in such data (peer-reviewed US studies only).
3. **No near-Schiphol UFP data yet.** SPEC records UFP as blocked because the TNO 2026 inventory has no spatial distribution — and Luchtmeetnet's hourly UFP, though published as data for 11 stations (list in Findings), has none near Schiphol (nearest ~16 km N; the Schiphol-area stations and Ookmeer report no UFP as data). A "near Schiphol" UFP layer is unsupported until the Ookmeer request (or another source) delivers a series.
4. **Facility-level industrial releases (E-PRTR / European Industrial Emissions Portal)** are downloadable as geodata (2007–2024, ver 16.0, Feb 2026) and could give a point-source layer. Verified 2 November 2026: EEA reuse terms (CC-BY/ODC-By); no airport activity in the official sector list; Schiphol facility presence still unverified (interactive portals).
5. **Nitrogen data is open and verified but mostly agricultural**: AERIUS total nitrogen deposition hexagons (100 m, "geen beperkingen") and the MAN ammonia measurement network (~350 locations). Natural companion to the already-listed Natura 2000 candidate, needs careful "mostly not aviation" labelling.
6. **Several more open datasets exist but fit weakly** (water quality beyond PFAS, pesticides in surface water, citizen sensors, night lights, former landfills) — usable as context only.
7. **Licence status varies**: RWS water data is public domain, RIVM's LML is CC-BY 4.0 (data.overheid.nl), Copernicus (Sentinel Data Legal Notice), EEA (CC-BY/ODC-By) and EOG are attribution/open licences — verified on official pages (1–2 November 2026). Bestrijdingsmiddelenatlas and MAN licences, PNH/GGDA station data, and an LML licence statement on an RIVM-run page (rivm.nl blocks reading), remain **to verify** (per AGENTS.md, no licence claim without reading the official page).

## Methodology

- Started from the current SPEC §8/§9/§11 on `main` (only genuinely new candidates proposed); ~13 web searches across Dutch and international sources, reading official pages for load-bearing claims (licence, availability, coverage).
- Verification round (2 November 2026), official pages read: Sentinel Data Legal Notice; Luchtmeetnet API docs and endpoints; RIVM metadata CSVs; EEA legal notice, data policy, About; EC E-PRTR/IEPR pages.
- Limitations: luchtmeetnet.nl's open-data page, the CDS licence page and rivm.nl block reading (LML licence rests on data.overheid.nl); Bestrijdingsmiddelenatlas is a JavaScript app; the EEA facility search and emissieregistratie bedrijfsrapporten tools are interactive.
- **Not verified**: Schiphol as an E-PRTR facility; Ookmeer UFP series as data (PDFs only); full Annex I text (EUR-Lex blocked); Bestrijdingsmiddelenatlas licence; per-product EOG licences. **Verified**: S5P licence, API terms, EEA reuse terms, per-station UFP.

## Findings

### Tier 1 — measured, aviation-relevant, strongest case

**1. Measured real-time air quality — Luchtmeetnet / Landelijk Meetnet Luchtkwaliteit (RIVM)**
- Hourly *measured* concentrations (NO₂, PM₁₀, PM₂.₅, O₃, …) at fixed stations, including stations around Schiphol (Oude Meer-Aalsmeerderdijk, Badhoevedorp-Sloterweg) and the GGD Amsterdam network.
- Access verified: open dataset directory (yearly files, metadata CSVs, R scripts) and a data.overheid.nl entry — **CC-BY 4.0, verified for RIVM's LML dataset**; PNH/GGDA licence is not stated there (PNH = "Meetnet provincie Noord Holland", GGD Amsterdam-run — [brongegegens.csv](https://data.rivm.nl/data/luchtmeetnet/Metadata/luchtmeetnet_brongegegens.csv)): not verified.
- Stations near Schiphol (source PNH; coordinates per [meetlocaties.csv](https://data.rivm.nl/data/luchtmeetnet/Metadata/luchtmeetnet_meetlocaties.csv) — the API differs by tens of metres): NL49565 Oude Meer-Aalsmeerderdijk (52.279949, 4.770670; NO, NO₂, PM₁₀); NL49561 Badhoevedorp-Sloterweg (52.333617, 4.773469; NO, NO₂, CO, PM₁₀, PM₂.₅); NL49564 Hoofddorp-Hoofdweg (52.327464, 4.715008; NO, NO₂, PM₁₀).
- API terms ([api-docs.luchtmeetnet.nl](https://api-docs.luchtmeetnet.nl/)): no authentication, fair use, max 100 requests/5 min, hourly updates.
- Fit: the spec's only air-quality candidate is the *modelled* Atlas grids; a **measured** stations layer (points with latest value, colour-coded) is new, satisfies §9 "measurements, not causes", and strengthens the attribution story ("measured, official network").
- Caveats: spatially sparse (points, no surface); "real-time" would in practice be a build-time snapshot under the existing refresh workflows (privacy rule: no third-party requests); legend must carry substance, unit and timestamp, no health claims.

**2. Satellite-measured NO₂ — Sentinel-5P TROPOMI (Copernicus)**
- Daily tropospheric NO₂ column, ~5.5 × 3.5 km since August 2019 (Data Space collection page confirms availability). Licence corrected 2 Nov 2026: S5P data is governed by the [Legal Notice on the use of Copernicus Sentinel Data](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice) — free, full and open; attribution "Copernicus Sentinel data [Year]" ("Contains modified Copernicus Sentinel data [Year]" for adaptations). The ECMWF licence cited earlier governs CAMS, not S5P.
- Fit: measured, aviation-relevant — airport-related NO₂ enhancements are resolvable in TROPOMI data ([Goldberg et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8047911/), peer-reviewed US study; no Schiphol-specific study found) — and a different data type from the Atlas grids; could ship as an annual-average composite raster around Schiphol.
- Caveats: column ≠ ground concentration; cloud gaps over the NL; L2→grid processing needed; keep the "dated, label clearly" principle; must not share a legend with concentration grids (mirrors the existing §8 design note).

**4. Measured UFP — published as data, but not near Schiphol**
- Verified 3 November 2026: UFP (n/cm³; API formula "PS") is published hourly as data ([2025_UFP.csv](https://data.rivm.nl/data/luchtmeetnet/Vastgesteld-jaar/2025/2025_UFP.csv)); 11 stations return it via the [API](https://api.luchtmeetnet.nl/open_api/measurements?formula=PS), none near Schiphol — GGD: NL49701 Zaandam-Wagenschotpad (~16 km N), NL49680 Almere-Boomgaardweg (~33 km E); RIVM: NL10644 Cabauw, NL10722 Eibergen, NL10934 Kollumerwaard (39–152 km); DCMR: NL01494 Schiedam, NL01913 Sluiskil (50–131 km); ODZL: NL50003 Geleen, NL50010 Maastricht-A2, NL50013 Meerssen, NL50014 Gulpen (164–190 km SE). Schiphol-area stations and Ookmeer: no UFP as data (Ookmeer 2018: annual PDFs).
- Fit: SPEC's UFP blocker is the lack of *spatially distributed* national data, and every published UFP station is far away — a "near Schiphol" layer is unsupported until another source (e.g. the Ookmeer request) delivers a series.
- Caveats: no near-Schiphol UFP as data (nearest ~16 km N; Ookmeer request drafted); single point, wind-direction dependent; the TNO caveat style must be kept.

### Tier 2 — open and verified, context value

**3. Point-source industrial releases — E-PRTR / European Industrial Emissions Portal (EEA)** *(moved from Tier 1, 2 Nov)*
- Facility-level annual pollutant releases to air, geolocated; dataset ver 16.0 (Feb 2026), 2007–2024, downloadable as Geopackage/WMS/CSV (verified on the EEA datahub). EEA reuse terms verified: EEA content is CC-BY (free re-use, commercial or non-commercial, with acknowledgement); datasets ODC-By or similar ([legal notice](https://www.eea.europa.eu/en/legal-notice), [data policy](https://www.eea.europa.eu/en/datahub/eea-data-policy)).
- Fit: point layer of industrial emitters near airports. Verified 2 Nov 2026: the portal's 65 activities fall in 9 sectors, none airport/aviation ([About](https://industry.eea.europa.eu/industrial-emissions/about)); whether Schiphol reports is unverified (interactive searches). IEPR replaces the E-PRTR regulation.
- Caveats: annual reported totals, not measurements.

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
| [Copernicus — Sentinel Data Legal Notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice) | 5/5 | - |
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

Caveats: see Methodology; remaining checks are under Open questions; everything else verified on official pages (2–3 Nov 2026).

## Open questions

1. Does Schiphol report as an E-PRTR/IEPR facility? Needs a manual facility search (portals are interactive) and a full Annex I read (EUR-Lex blocked) to confirm no airport activity.
2. Is GGD's Ookmeer UFP series available as data? Not via the API (Ookmeer reports NO/NO₂ only; the 11 UFP stations are all far away); request drafted.
3. What licence governs the Bestrijdingsmiddelenatlas downloads, and MAN's station data?
4. Do the ER 1 × 1 km spatial files have embargo conditions for aviation sources specifically (SPEC §11 already wants this checked)?
5. What licence covers the PNH/GGDA station data (the readme's licence terms are not readable — the PDF truncates after ~13 of 79 pages)?

## Recommendations

1. **Record two new §8 candidates**, both §9-friendly (LML licence verified; PNH/GGDA pending): (a) *Measured air quality stations (Luchtmeetnet/LML, CC-BY 4.0 for RIVM's LML data)* — points with latest measured values, designed alongside the existing Atlas grids entry; (b) *Satellite NO₂ (Sentinel-5P TROPOMI, Copernicus Sentinel Data Legal Notice)* — annual composite around Schiphol, never sharing a legend with concentration grids.
2. **Amend the UFP §8 entry** with the verified findings: hourly UFP is published as data for 11 Luchtmeetnet stations, none near Schiphol; a "near Schiphol" UFP layer is unsupported until the Ookmeer request (or another source) delivers a series.
3. **Run the two remaining checks** (manual E-PRTR facility search for Schiphol; send the GGD Ookmeer data request) before adding those as candidates — invent nothing until then.
4. **Skip for now**: CAMS (overlaps Atlas), pesticides, water quality beyond PFAS, Samen Meten, night lights, landfills. Note them in this survey only; they don't earn a SPEC entry without a concrete layer design.
5. Any accepted candidate still goes through the existing gates: official licence page read and cited in `sources.json`, attribution-page entry, i18n, legend caveats, build-time snapshot (no third-party requests), and the hide-aircraft-view option designed with the first layer that actually ships.
