# Spec conflicts archive

Moved verbatim from `docs/SPEC.md` §10 "Conflicts found and resolved (cumulative)". The text is byte-identical to the original section.

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

