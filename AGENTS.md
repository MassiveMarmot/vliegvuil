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
