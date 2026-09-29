# VliegVuil.nl: Build Instructions for Vibe Code Web

Replaces the CLI-based version. Spec source of truth: `OpenFlightRadar_v0_Build.txt`, saved in the repo as `docs/SPEC.md`.

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
2. Commit to `main`: `docs/SPEC.md` (your spec, with the rename below), `AGENTS.md` (section 3), and this file as `docs/BUILD.md`.
3. In Vibe (Code tab): install the **Mistral GitHub App**, grant it only this repo, create a project.
4. In GitHub: enable branch protection on `main` (PRs required). You merge; the agent never does.
5. Never put real credentials in the repo. The sandbox is like a CI job.

Rename deltas for `docs/SPEC.md`: OpenFlightRadar/OpenFlightTrack → **VliegVuil.nl**; slug `vliegvuil`; packages `@vliegvuil/{core,web,data-build}`. The name is cheeky, so the spec's tone rule stands: whimsy in UI chrome only, data layers factual.

## 3. AGENTS.md (commit to repo root)

```markdown
# AGENTS.md: VliegVuil.nl

Read docs/SPEC.md and docs/BUILD.md before every task. If code and spec disagree, or the task is ambiguous, ask instead of guessing.

## Rules
- TypeScript strict (`strict`, `noUncheckedIndexedAccess`). No `any`, no `@ts-ignore`.
- /core is pure TS: no DOM, no React. Providers sit behind interfaces.
- Every module ships with Vitest tests. Before finishing run `pnpm lint && pnpm typecheck && pnpm test`, and report the results in the PR description.
- All UI strings via i18next (`/locales/nl.json`, `/locales/en.json`). No hard-coded text.
- Privacy: no analytics, no third-party scripts/fonts, no IP logging, strict CSP. Only third-party request: PDOK tiles.
- Every data layer shows source, date, licence (from `sources.json`). No medical claims; no causal claims about airports unless an official study is cited.
- New dependency: state name, licence, reason in the PR. Prefer MIT/Apache/BSD/MPL.
- Do not invent URLs, licences or API fields. If you cannot verify one by fetching the official page, leave a TODO with the link to check.
- One task per session, one branch/PR per task, PR description lists: what changed, what was verified, what was not.
- Do not merge, deploy, or touch anything outside this repo. Commit only small generated files (< ~2 MB); larger outputs are built by the maintainer.
- Accessibility: semantic landmarks, managed focus (not a trap) on the telemetry panel, prefers-reduced-motion, colour-independent legends.

## Layout
/core  /web  /data-build  /locales  /docs  AGENTS.md
```

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

Free plan is 2 sessions/day, so expect this to take ~a week; paid allows far more.

## 5. Session prompt template

Paste into a new session, filling in the bracketed parts:

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md. Task: session [N], "[title]" from
docs/BUILD.md section 4. Scope is only that row; do not start other sessions.
If anything in the spec is ambiguous, ask me before coding. Implement, run
lint, typecheck and tests, then open a pull request against main with the
results and anything you could not verify.
```

For data sessions add: "Fetch and read each official source page and licence text before writing code. Do not guess endpoints or licences."

## 6. Human checkpoints

- **Before session 8/9:** verify each source URL and licence yourself (adsb.lol terms, OurAirports, tar1090-db, RIVM/CLO/PDOK noise data). Decide Eindhoven civil Lden vs military Ke, and check whether Schiphol has finer bands than 48/56/70 dB.
- Open decisions in spec §11: licence (MPL-2.0 / EUPL-1.2 / dual), PDOK style vs MapLibre.
- Review each PR: new dependencies, CSP, anything that adds a network request.
- Large data outputs (PMTiles) and all deployment happen on your Hetzner VPS, not in the sandbox.
- Re-read noise badge and legend wording for factual tone.

## 7. Sources checked

Mistral Docs: Vibe Code Web get started, sandbox environment, limits and lifecycle; Mistral announcement of remote agents/Medium 3.5. Not verified: whether the web agent auto-loads `AGENTS.md`, and whether the "not yet available" controls have since shipped.
