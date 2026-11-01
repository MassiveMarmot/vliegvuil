# VliegVuil.nl — Deployment Guide

Split index. Each top-level section lives in its own file under `docs/deploy/`; the original section numbers are kept in the filenames. References of the form "docs/deploy.md §N" resolve via this index and the matching `NN-*.md` file.

- 00-overview.md — VPS overview, same-origin architecture, deployment model — docs/deploy/00-overview.md
- 00-prerequisites.md — VPS, DNS, SSH, firewall and server baseline prerequisites — docs/deploy/00-prerequisites.md
- 01-install-caddy.md — Install Caddy with the rate-limit, cache and otter modules (§1) — docs/deploy/01-install-caddy.md
- 02-install-app.md — Clone the repository to /srv/vliegvuil (§2) — docs/deploy/02-install-app.md
- 03-build-web.md — Build the web app; build-time site configuration / VITE_SITE_ORIGIN (§3) — docs/deploy/03-build-web.md
- 04-install-caddyfile.md — Install and validate the Caddyfile; staging plan; local preview (§4) — docs/deploy/04-install-caddyfile.md
- 05-privacy-properties.md — Privacy properties: what to expect, header verification (§5) — docs/deploy/05-privacy-properties.md
- 06-rate-limiting.md — Rate limiting and micro-cache (§6) — docs/deploy/06-rate-limiting.md
- 06b-analytics.md — Self-hosted GoatCounter analytics, session 25c (§6b) — docs/deploy/06b-analytics.md
- 07-updates.md — Updates and rollbacks (§7) — docs/deploy/07-updates.md
- 08-data-updates.md — Data updates, option C via GitHub Actions (§8) — docs/deploy/08-data-updates.md
- 08b-tiles.md — Self-hosted basemap tiles BRT-A (§8b) — docs/deploy/08b-tiles.md
- 09-maintenance.md — Caddy security updates, version-lag check, system maintenance (§9) — docs/deploy/09-maintenance.md
- 99-troubleshooting.md — Troubleshooting: validation, logs, live checks — docs/deploy/99-troubleshooting.md
