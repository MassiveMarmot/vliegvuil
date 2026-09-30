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
| `adsb-lol` | — | n/a (live API, not a snapshot) | n/a | n/a |
| `pdok-brt` | — | n/a (basemap tiles) | n/a | n/a |

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
`all-auto` refreshes only sources marked `refresh: "auto"`. Manual
sources are never touched unless named explicitly — and only after a
human reviewed the new release's licence, band structure and year.

Validation gates (all must pass or the old data stays, exit non-zero):

1. Schema/required fields — the existing builders throw on malformed input.
2. Row count within tolerance: a drop of more than 50 % versus the
   previous file fails (`refresh.ts` `ROW_DROP_TOLERANCE`).
3. Noise geometries inside the Netherlands bounding box.
4. File size under the ~2 MB cap (AGENTS.md).
5. Noise band lower bounds within the set the app knows
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
  (noise) sources only run when named in a manual dispatch.
- The workflows only open issues and pull requests. Nothing deploys from
  GitHub; you merge and then deploy on the VPS (`docs/deploy.md` §7).

Until session 22c is merged, run the commands above on your own machine and
open the PR by hand. GitHub disables scheduled workflows in a public
repository after 60 days without repository activity (GitHub docs); merging
the monthly data PRs counts as activity, but if you stop, re-enable the
workflows in the Actions tab.

## When a manual source shows `update-available`

1. Read the new release's official page: licence, band structure,
   reference year (session 22 precedent).
2. If they fit the app's model, run
   `pnpm --filter @vliegvuil/data-build run refresh -- <source-id>`.
3. If the band structure changed, adjust legend/label code first, then
   refresh.
