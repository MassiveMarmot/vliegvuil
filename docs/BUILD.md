# VliegVuil.nl: Build Instructions for Vibe Code Web

Replaces the CLI-based version. Spec source of truth: `docs/SPEC.md`. Longer session details live in `docs/sessions/`.

## 1. How Vibe Code Web works (what shapes this plan)

Per Mistral's docs (docs.mistral.ai/vibe/code/vibe-code-web):

- You create a **project** from GitHub repos (same owner), start a **session** with a prompt, and the agent works in a cloud sandbox and produces a **branch or pull request**. You review in GitHub.
- The sandbox is deleted when the session ends; only what is committed survives. Inactive sessions can't be resumed, so start a new session per task.
- Sessions use Mistral Medium 3.5. Limits: 24 h max, 3 h inactivity while waiting for your reply; free users get 2 sessions/day, paid 100/day.
- The sandbox has outbound internet (no allowlist controls yet), no project secrets, and a Mistral-maintained image; the agent installs missing tools at session time.
- The agent can ask clarifying questions. Cancel/interrupt/steer controls and approval gates were listed as "not yet available" at launch, so **keep every session small and tightly scoped**. The docs may have changed since; check the Sessions page.
- Unlike the CLI, there is no `~/.vibe/config.toml`, no `--agent plan` mode. Control comes from `AGENTS.md`, the prompt, and PR review. I could not confirm that the web agent auto-loads `AGENTS.md`, so every prompt tells it to read the file.

## 2. One-time setup (you)

1. Create a GitHub repo `vliegvuil` (private until you're ready to publish).
2. Commit to `main`: `docs/SPEC.md` (your spec), `AGENTS.md` (repo root, authoritative), this file as `docs/BUILD.md`, and the per-session detail files in `docs/sessions/`.
3. In Vibe (Code tab): install the **Mistral GitHub App**, grant it only this repo, create a project.
4. In GitHub: enable branch protection on `main` (PRs required). You merge; the agent never does.
5. Never put real credentials in the repo. The sandbox is like a CI job.

Naming: **VliegVuil.nl**; slug `vliegvuil`; packages `@vliegvuil/{core,web,data-build}`. The name is cheeky, so the spec's tone rule stands: whimsy in UI chrome only, data layers factual.

## 3. AGENTS.md

`AGENTS.md` in the repo root is authoritative. It is no longer duplicated here, so it cannot go stale.

## 4. Session plan

One session = one PR = one merge. Start each new session from updated `main`. If CI fails, send the failure as a follow-up prompt in the same session (docs say follow-ups are supported).

| # | Session | Done when |
|---|---|---|
| 1 | **Scaffold**: pnpm workspace (`core`, `web`, `data-build`), Vite+React+TS, Vitest, ESLint, Prettier, GitHub Actions (lint/typecheck/test only), `sources.json` schema + validator, licence placeholder | CI green on empty app |
| 2 | **Core: providers + interpolation**: `PositionProvider`, adsb.lol implementation, NL bbox, dead reckoning, fixtures | Tests cover missing velocity, stale data, provider failure |
| 3 | **Core: geometry**: ICAO24 country table, point-in-polygon noise lookup with small fixture polygons | Known points inside/outside return expected band |
| 4 | **Proxy config**: Caddyfile (static app, reverse proxy, ~5 s micro-cache, no access logs, no client IP/headers upstream, per-IP rate limit, CORS) + `docs/deploy.md` | Config validates (`caddy validate`); test/doc shows headers stripped |
| 5 | **Map + aircraft**: MapLibre, PDOK BRT basemap via config URL, symbol layer rotated by heading, 5 s polling, smooth movement, stale/down banner | 500 mocked aircraft render; banner on stale mock |
| 6 | **Telemetry panel + search**: all §2 fields, managed focus, Esc, search by callsign/registration/ICAO24 | Keyboard-only flow works; component tests |
| 7 | **List view + a11y**: sortable table alternative, ARIA live announcements, axe checks | No serious axe violations |
| 8 | **Data build A**: airports (OurAirports trimmed to NL + status overlay) and aircraft DB snapshot; writes `sources.json` | Reproducible script; outputs small enough to commit |
| 9 | **Data build B**: noise contours → GeoJSON + PMTiles script (see human step below) | Script runs; large tiles gitignored, release artifact documented |
| 10 | **Noise overlay UI**: toggle, 48/56/70 dB Lden bands, colour-blind-safe gradient + pattern fallback, legend with year/metric, badge text with annual-average caveat | Snapshot/unit tests for badge and legend |
| 11 | **Settings, i18n, attribution, PWA, CSP**: NL/EN, units in localStorage, attribution page from `sources.json`, app-shell-only PWA | Only own-origin + PDOK requests in a browser trace |
| 12 | **Polish + docs**: playful-minimal styling per spec §3, reduced motion, README, architecture/privacy docs | You review visually |
| 13 | **Licence + sources.** Replace `LICENSE` with MPL-2.0 (holder name/year from me, ask if missing). Add `"license": "MPL-2.0"` to every `package.json`, SPDX header comment in source files, update README. Fix the adsb.lol row in `sources.json`: licence `ODbL-1.0`, licenceUrl `https://opendatacommons.org/licenses/odbl/1.0/`, move "API code is BSD-3-Clause" to notes. Split the JSON Schema out of `sources.json` into `sources.schema.json`; add the missing validator script and run it in CI. Add the ODbL attribution line to the attribution page. | Validator fails on a bad entry (test), CI green |
| 14 | **Core: fix the adsb.lol provider.** Fetch one real response from `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}` (radius in nautical miles, max 250), save a trimmed copy as fixture. Rewrite types and parsing to the real shape (`ac[]`, `hex`, `flight`, `r`, `t`, `alt_baro` incl. the string `"ground"`, `gs`, `track`, `baro_rate`, `squawk`, `lat`, `lon`, `seen_pos`). Compute the radius from the NL bbox instead of hard-coding 200. Stop turning 0 into `null` for heading, and fix dead reckoning so heading 0 (north) works. Base URL configurable. | Tests use the real fixture; heading 0 and ground-state tests exist |
| 15 | **Web: real data.** Remove the mock generator from `useAircraftData`; use the core provider through a configurable API base URL (`VITE_API_BASE`, default `/api`). Drop aircraft not seen for more than 60 s. Fix the polling/retry timers (the stale-check interval is stored in the retry ref and never cleaned up). Show the real last-update time. Keep a dev-only mock behind `VITE_MOCK=1`. | Component test with a mocked provider; no `Math.random` in `src/` outside the mock module |
| 16 | **Smooth movement.** Use `deadReckoning` between 5 s polls, updating the map source at a capped frame rate (≤ 10 fps). Respect `prefers-reduced-motion` (positions jump on each update instead). Cap extrapolation at ~15 s. | Unit test of the animation loop with fake timers; reduced-motion test |
| 17 | **Map: basemap, icons, labels.** Basemap URL from config, default to the current PDOK BRT Achtergrondkaart WMTS on `service.pdok.nl` in EPSG:3857 (fetch the capabilities page and pick the URL from it; do not use the legacy `geodata.nationaalgeoregister.nl/tiles/...` host). Fix altitude colours: pre-render one icon image per altitude band (or use an SDF icon) instead of `icon-color` on a non-SDF image. Callsign labels need a `glyphs` URL: either self-host glyph PBFs generated from an OFL font (no third-party request), or drop map labels for v0 and rely on the panel. Ask me which before starting. Add attribution text for PDOK. | Screenshot in the PR; no request to a host other than own origin + PDOK in the network list |
| 18 | **i18n cleanup.** Move every hard-coded string in `App.tsx`, banners, list, telemetry formatting and the info overlay into `locales/{nl,en}.json`. Add a test that fails if `.tsx` files contain user-visible string literals. Switching language updates everything and `<html lang>`. | Switching to EN leaves no Dutch text on screen (test) |
| 19 | **Proxy, Caddyfile, CSP, deploy docs.** Rewrite the Caddyfile for the real deployment: Hetzner VPS directly, no Cloudflare. Serve the app and proxy `/api/*` on the **same origin** (removes CORS entirely). Drop invalid directives (`access_log off`, `import cloudflare`). Caddy has no access log unless configured; verify in the docs. Rate limiting and micro-caching need Caddy modules (e.g. `caddy-ratelimit`, `cache-handler`); document an `xcaddy build` line, verify the module names, and validate the config with that binary. Strip client IP headers upstream and prove it with a test that runs a local echo upstream and asserts no client IP header arrives. CSP: `connect-src 'self'`, add `worker-src blob:` and `img-src` for PDOK and `data: blob:`, remove `X-XSS-Protection`. Fix the root path (`/srv/vliegvuil/web/dist`) and the leaked `/workspace/...` path in `deploy.md`. | `caddy validate` output in PR; header-stripping test passes |
| 20 | **Tooling cleanup.** Delete `web/Dockerfile` (deployment is git pull + build, per spec). CI: pin pnpm via `packageManager` (pnpm/action-setup or corepack), add `pnpm build`, sources validator and Caddyfile validation. Fix the core `build` script to use the tsconfig (`tsc -p`). Align ESLint to one major version across the repo, enable `eslint-plugin-react-hooks`. Set `engines.node` to what the toolchain needs. | CI green, lint has no version warnings |
| 21 | **Data build: runner + airports + aircraft DB.** Add a CLI entry (`pnpm --filter @vliegvuil/data-build run build`) that downloads (from URLs in `sources.json`), transforms and writes `web/public/data/airports.json` and an aircraft snapshot, updates `lastUpdated` in `sources.json`, swaps output atomically. Cache downloads in `data-build/cache/`. Add the hand-maintained airport status overlay (commercial / military-shared / planned; Lelystad = planned). | Runs end-to-end from a clean checkout; outputs < 2 MB |
| 22 | **Data build: noise contours.** *Only after my human checkpoint below.* Build `web/public/noise-contours.geojson` from the verified sources with Eindhoven as civil Lden labelled "civil traffic only". PMTiles generation stays a documented VPS step. | Known coordinates inside/outside contours return the expected band in a test against the built file |
| 22b | **Data freshness**: upstream check, safe refresh, data-age display. Details: `docs/sessions/22b-data-freshness.md` | `check` reports correct status from recorded real responses; a bad refresh leaves old data untouched (test); attribution page shows dataset age in NL and EN |
| 23 | **Airports layer + snapshot enrichment.** Airport markers with name and status flag popup (needs the glyph decision from session 17 for labels). Use the aircraft snapshot as fallback for registration/type/operator when the live feed lacks them. | Popup and fallback covered by tests |
| 24 | **PWA, fonts, bundle.** Self-host Space Grotesk (woff2, OFL). Manifest with 192/512 px PNG and maskable icons. Service worker: app shell only; exclude `/api` and tile requests from caching and from the navigation fallback. Lazy-load MapLibre to cut the 1 MB main chunk. | Lighthouse-style check of the manifest; no `/api` in SW precache |
| 25 | **UI shell**: header, menu, About page, path routes with language prefix. Details: `docs/sessions/25-ui-shell-and-seo.md` | Keyboard-only and screen-reader checklist passes; axe clean; all locale files have identical key sets |
| 25b | **SEO foundations**: static per-language pages, hreflang, canonical, sitemap, robots, social previews, root redirect. Details: `docs/sessions/25-ui-shell-and-seo.md` | Built `dist/` has correct head tags per page (test); `caddy validate` output in PR |
| 26 | **Styling and a11y pass.** Move remaining inline styles into CSS (header and menu come from session 25); semantic landmarks (`main`, `aside`, `section`); playful-minimal look per spec §3 in the chrome only; panel slide/pop motion with `prefers-reduced-motion` off-switch; add axe-core checks (jest-axe) for the main views if not already present. | No serious axe violations |
| 27 | **Docs and release prep.** Update README, `architecture.md`, `privacy.md`, `deploy.md` to match reality; refresh screenshots from the real app; add CHANGELOG and a release checklist. | Docs contain no statement the code does not do |

Free plan is 2 sessions/day, so expect this to take ~a week; paid allows far more.

## 5. Session prompt template

Paste into a new session, filling in the bracketed parts:

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md. Task: session [N], "[title]" from
docs/BUILD.md section 4[, details in docs/sessions/[file].md]. Scope is only that
row; do not start other sessions. If anything in the spec is ambiguous, ask me
before coding. Implement, run lint, typecheck and tests, then open a pull request
against main with the results and anything you could not verify.
```

For data sessions add: "Fetch and read each official source page and licence text before writing code. Do not guess endpoints or licences."

## 6. Human checkpoints

**Every session**
- Review each PR: new dependencies, CSP, anything that adds a network request.
- Large data outputs (PMTiles) and all deployment happen on your Hetzner VPS, not in the sandbox.
- Re-read noise badge and legend wording for factual tone.

**Before specific sessions**
- **Before 13:** give the agent the copyright holder handle (pseudonym) and year for the MPL-2.0 header. Set a pseudonymous git author name and no-reply email before branches are merged.
- **Before 17:** decide self-hosted glyphs vs. no map labels.
- **Before 19:** accept that the proxy needs a custom Caddy build (two modules), or say if you'd rather use a different approach.
- **Before 21/22:** verify on the official pages each source's current URL and licence: tar1090-db (`sources.json` says ODC-By-1.0 via Mictronics; re-check), OurAirports, the Schiphol dataset and year, and the regional airport noise data. Ask RIVM/CLO for vector data behind CLO indicator 0588 (2018 and 2024), which is the only source found for Eindhoven civil Lden.
- **Before 22b:** approve or reject the weekly GitHub Actions data check (deviates from spec §4); confirm `auto` vs `manual` per source; review the `User-Agent` string (project repo URL, no personal contact).
- **Around 25:** confirm the GitHub repo and issues URLs the agent derives from the git remote; review the Dutch About text and privacy statements; set `blueskyUrl` in `site.ts` once the account exists; test with keyboard only and a screen reader (VoiceOver or NVDA).
- **After 27:** deploy on the VPS yourself, open the site with browser dev tools, and confirm the only requests are your own origin and PDOK; compare against `privacy.md`; check the live feed with real aircraft.

**Decided**: licence MPL-2.0; Eindhoven civil Lden; light/dark theme deferred to a later version.

## 7. Sources checked

Mistral Docs: Vibe Code Web get started, sandbox environment, limits and lifecycle; Mistral announcement of remote agents/Medium 3.5. Not verified: whether the web agent auto-loads `AGENTS.md`, and whether the "not yet available" controls have since shipped.
