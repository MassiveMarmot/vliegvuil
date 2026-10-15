# Data updates (sessions 22b and 22c)

How the site's snapshot datasets stay current: `check` detects upstream
changes, `refresh` applies them safely, the attribution page shows each
dataset's age. Live aircraft positions are out of scope (live, covered by
the stale-data banner); the browser never contacts upstream (spec §5).

## Sources table

| Source | Cadence | Check method | Refresh | Rollback |
|---|---|---|---|---|
| `tar1090-db` | monthly | `github`: latest commit sha of the `csv` branch — `https://api.github.com/repos/wiedehopf/tar1090-db/commits/csv` | `auto` | `data-build/previous/aircraft.json` |
| `ourairports` | monthly | `github`: latest commit sha of `main` — `https://api.github.com/repos/davidmegginson/ourairports-data/commits/main` | `auto` | `data-build/previous/airports.json` |
| `rivm-end-2021-noise` | multi-year | `ckan-metadata`: dataset `metadata_modified` — `https://data.overheid.nl/data/api/3/action/package_show?id=bc7703a1-9323-4e4f-9ce7-246ace877b59` | `manual` | `data-build/previous/noise-contours.geojson` |
| `clo-nlr-regional` | multi-year | `manual` (no machine-readable signal; CLO publishes map images) | `manual` | n/a (not in build yet) |
| `adsb-fi` | — | n/a (live API, not a snapshot) | n/a | n/a |
| `pdok-brt` | — | n/a (superseded by the self-hosted copy) | n/a | n/a |
| `pdok-brt-tiles` | yearly | `manual` (no machine-readable signal; the tiles are a static copy) | `manual` | `tiles.old` on the VPS (re-run the script to re-download) |

Cadence and method were read from the official pages/APIs, not guessed:

- GitHub API responses verified 2026-10-08: `wiedehopf/tar1090-db`
  branch `csv` head `655afe27950658a4124d15d75766538b1ae9ea3b` (committer
  date 2026-09-28); `davidmegginson/ourairports-data` branch `main` head
  `f31ef57d6e9b67764b3c2ec2336a10bcaa4e28b6` (2026-09-30).
- data.overheid.nl CKAN API (`/data/api/3/action/package_show`) verified
  2026-10-08: dataset `bc7703a1-9323-4e4f-9ce7-246ace877b59` has
  `metadata_modified` `2025-07-17T05:36:19.387730`.
- raw.githubusercontent.com returns strong `ETag` headers on `HEAD`
  (verified 2026-10-08) — available as an `http` fallback signal.
- CLO indicator 0588 pages publish map images only (verified in session
  22); no machine-readable signal exists, hence `manual` with
  `reviewDueBy`.

The Schiphol END data and the CLO regional indicator are **multi-year**
datasets. Their next release must be confirmed from the official pages,
never guessed.

## Checking

```bash
pnpm --filter @vliegvuil/data-build run check
```

Queries upstream metadata only (no bulk downloads). Writes
`data-build/status/data-status.json` and prints a table. Statuses:

- `up-to-date` — recorded `upstreamVersion` still matches upstream.
- `update-available` — upstream signal differs from the recorded one.
- `review-due` — manual source past its `reviewDueBy` date.
- `check-failed` — HTTP error, timeout, or malformed response.

Exit code is 0 even when updates exist; it is 1 only when **every**
source failed to check. The client identifies itself as
`VliegVuil-data-check/0.1 (+https://github.com/MassiveMarmot/vliegvuil)`,
uses a 15 s timeout with one retry, and queries hosts sequentially.

## Refreshing

```bash
pnpm --filter @vliegvuil/data-build run refresh -- all-auto
pnpm --filter @vliegvuil/data-build run refresh -- ourairports
```

Downloads to `data-build/tmp/`, transforms, validates, then atomically
swaps into `web/public/data/` and updates `sources.json`
(`retrievedAt`, `upstreamVersion`, `contentSha256`, `checkedAt`).
`upstreamVersion` holds the SAME kind of signal `check` compares against
(GitHub commit SHA / CKAN `metadata_modified`), fetched with check's own
code path **before** the download — so a commit landing mid-refresh is
flagged by the next check instead of being recorded. The download's HTTP
ETag is kept separately as `downloadEtag` (diagnostics only). If the
version signal cannot be fetched, the refresh fails closed for that
source: no `sources.json` write, and the report says why.

Refresh downloads from each source's `downloadUrl` in `sources.json`
(the raw data file), never from `upstream.url` — that field is the
**check** signal only (commits API / CKAN metadata). A missing
`downloadUrl` fails with a clear message, and every download must pass a
magic-byte gate first: gzip files must start with `1f 8b`, and non-gzip
downloads that look like JSON (an error page or a commits-API response)
are rejected. Sources with `refresh: "auto"` must carry a `downloadUrl`
(enforced by `sources.schema.json`).
`all-auto` refreshes only sources marked `refresh: "auto"`. Manual
sources are never touched unless named explicitly — and only after a
human reviewed the new release's licence, band structure and year.

Validation gates (all must pass or the old data stays, exit non-zero):

1. Schema/required fields — the existing builders throw on malformed input.
2. Download magic bytes: gzip must start with `1f 8b`; a JSON payload
   where CSV/GeoJSON is expected is rejected (wrong-URL protection).
3. A refresh that produces 0 entries is refused (broken download).
4. Row count within tolerance: a drop of more than 50 % versus the
   previous file fails (`refresh.ts` `ROW_DROP_TOLERANCE`).
5. Noise geometries inside the Netherlands bounding box.
6. File size under the ~2 MB cap (AGENTS.md).
7. Noise band lower bounds within the set the app knows
   (48/55/56/60/65/70/75); an unknown band set fails and asks for a human.

## Rolling back

Rolling back a merged refresh: revert the data pull request on GitHub, then
pull and build on the VPS (`docs/deploy.md` §7). For local runs, before
every swap the current file is copied to `data-build/previous/`
(`airports.json`, `aircraft.json`, `noise-contours.geojson`). To roll back,
copy the file from `data-build/previous/` back into
`web/public/data/` (or `web/public/` for the noise file), rebuild
(`pnpm --filter @vliegvuil/web run build`) and reload Caddy's file root.

## Scheduling (GitHub Actions, session 22c)

Checks and refreshes run on GitHub's runners, not on the VPS (SPEC §4):

- **Check** (weekly): runs `check` and opens or updates a single
  "Data updates available" issue; closes it when everything is up to date.
- **Refresh** (monthly, plus manual dispatch with a source id): runs
  `refresh`, then opens a pull request with the changed files in
  `web/public/data/` and `sources.json`. No change means no PR. Manual
  (noise) sources only run when named in a manual dispatch. The workflow
  creates the `data` and `needs-human-review` labels itself when they
  are missing, so no one-time label setup is needed.
- Basemap tiles are **not** part of the workflow: they are refreshed by hand on the
  VPS with `scripts/vps-tiles-update.js` (docs/deploy.md §8b) — a ~24-hour,
  strictly sequential download from the PDOK WMTS, kept outside the repo.
- The workflows only open issues and pull requests. Nothing deploys from
  GitHub; you merge and then deploy on the VPS (`docs/deploy.md` §7).

Session 22c shipped the workflows (`.github/workflows/data-check.yml` and
`data-refresh.yml`); the commands above still work locally for a manual run.
The refresh workflow runs in two jobs: the job that runs project code
(downloading untrusted upstream data) holds a read-only token; only the
separate `open-pr` job — which runs no project code (git, gh and bash
only; no pnpm, no node_modules) — can write, after re-validating the
artifact against a path allowlist. The PR body is built by tested
TypeScript in the read-only `refresh` job and travels in the artifact.
GitHub disables scheduled workflows in a public repository after 60 days
without repository activity (GitHub docs); merging the monthly data PRs
counts as activity, but if you stop, re-enable the workflows in the
Actions tab.

**Data PRs do not automatically run CI.** A pull request opened with the
workflow's own `GITHUB_TOKEN` does not trigger the `ci.yml` `pull_request`
event — that is deliberate GitHub behaviour (events created by
`GITHUB_TOKEN` do not trigger new workflow runs, to prevent recursive
runs), not a bug in the workflow. The PR therefore shows no CI checks
until a human acts. Options, in the order we use them:

- **Close and reopen the PR.** The reopened PR's event is created by the
  user, so `ci.yml` runs normally. This is the routine path: nothing to
  configure, no secrets.
- A maintainer can also run the workflow manually on the PR branch via
  the `workflow_dispatch` trigger of `ci.yml` (or re-run a failed check
  from the PR's Checks tab).

We deliberately do NOT work around this with a PAT or any other secret:
that would make an automation token with write access a permanent part
of the repo's secret store for a convenience gain only. The data PR's
own gates (schema, magic bytes, size caps, row-count tolerance, the
artifact allowlist) already ran in the `refresh` job before the PR was
opened; CI on the data PR is a second opinion, not the only line of
defence.

## When a manual source shows `update-available`

1. Read the new release's official page: licence, band structure,
   reference year (session 22 precedent).
2. If they fit the app's model, run
   `pnpm --filter @vliegvuil/data-build run refresh -- <source-id>`.
3. If the band structure changed, adjust legend/label code first, then
   refresh.
