# VliegVuil.nl: Build Instructions for Vibe Code Web

Replaces the CLI-based version. Spec source of truth: `docs/SPEC.md`. Longer session details live in `docs/sessions/`.

Human setup notes (§1 How Vibe Code Web works, §2 One-time setup, §3 AGENTS.md) and §6 Human checkpoints moved to `docs/human-checkpoints.md`.

## 4. Session plan

One session = one PR = one merge. Start each new session from updated `main`. If CI fails, send the failure as a follow-up prompt in the same session (docs say follow-ups are supported).

| # | Session | Done when |
|---|---|---|

Finished sessions (rows 1–22, 22b, 22c, 23, 23b, 24, 25, 25b, 25c, 25d, 26, 27) moved to [docs/history/session-plan.md](history/session-plan.md):

- [1 — Scaffold](history/session-plan.md)
- [2 — Core: providers + interpolation](history/session-plan.md)
- [3 — Core: geometry](history/session-plan.md)
- [4 — Proxy config](history/session-plan.md)
- [5 — Map + aircraft](history/session-plan.md)
- [6 — Telemetry panel + search](history/session-plan.md)
- [7 — List view + a11y](history/session-plan.md)
- [8 — Data build A](history/session-plan.md)
- [9 — Data build B](history/session-plan.md)
- [10 — Noise overlay UI](history/session-plan.md)
- [11 — Settings, i18n, attribution, PWA, CSP](history/session-plan.md)
- [12 — Polish + docs](history/session-plan.md)
- [13 — Licence + sources.](history/session-plan.md)
- [14 — Core: fix the adsb.lol provider.](history/session-plan.md)
- [15 — Web: real data.](history/session-plan.md)
- [16 — Smooth movement.](history/session-plan.md)
- [17 — Map: basemap, icons, labels.](history/session-plan.md)
- [18 — i18n cleanup.](history/session-plan.md)
- [19 — Proxy, Caddyfile, CSP, deploy docs.](history/session-plan.md)
- [20 — Tooling cleanup.](history/session-plan.md)
- [21 — Data build: runner + airports + aircraft DB.](history/session-plan.md)
- [22 — Data build: noise contours.](history/session-plan.md)
- [22b — Data freshness](history/session-plan.md)
- [22c — Data workflows (GitHub Actions)](history/session-plan.md)
- [23 — Airports layer + snapshot enrichment.](history/session-plan.md)
- [23b — Airport status data fix](history/session-plan.md)
- [24 — PWA, fonts, bundle.](history/session-plan.md)
- [25 — UI shell](history/session-plan.md)
- [25d — Unit defaults by language](history/session-plan.md)
- [25b — SEO foundations](history/session-plan.md)
- [25c — Privacy-first analytics (GoatCounter, self-hosted)](history/session-plan.md)
- [26 — Styling and a11y pass](history/session-plan.md)
- [27 — Docs and release prep.](history/session-plan.md)


Free plan is 2 sessions/day, so expect this to take ~a week; paid allows far more.

Parked follow-ups (small PRs, not scheduled sessions):

- **Derive the map layers' `icon-size` from `MAP_ICON_PX`** (session 17 / PRs #94–#95 follow-up): the `icon-size` 1.0 / 1.1 constants in `web/src/components/Map.tsx` are tuned to the 2x baked icons (48px images for a 24px badge, pixelRatio 2). Deriving them from `MAP_ICON_PX` would make the producer/consumer unit coupling structural instead of comment-only, so a future format change (e.g. different pixel ratio) cannot silently halve the markers again.
- **Hide the live aircraft view**: let users turn the live planes off, planned for when more pollution layers make the live planes a distraction.
- **Pull-based deployment**: replace the current push-to-deploy with the server pulling releases; deploys stay manual for now.
- **Staging site on a subdomain**: wanted, not yet set up (see also deploy.md's staging notes).

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

## Troubleshooting

- `web/__tests__/serviceWorker.test.ts` reads `web/dist/sw.js`. A failure there (especially a denylist complaint) usually means a stale `dist/` built from another branch — re-run `pnpm --filter @vliegvuil/web build` before diagnosing a real bug.
- `pnpm build` regenerates `sources.json` (lastUpdated) and `web/public/data/*.json`. Revert those build-generated diffs instead of committing them — except in a data-refresh PR (see AGENTS.md).

## 6. Human checkpoints

Moved to [docs/human-checkpoints.md](human-checkpoints.md) (together with the human setup notes from §1 and §2).

## 7. Sources checked

Mistral Docs: Vibe Code Web get started, sandbox environment, limits and lifecycle; Mistral announcement of remote agents/Medium 3.5. Not verified: whether the web agent auto-loads `AGENTS.md`, and whether the "not yet available" controls have since shipped.
