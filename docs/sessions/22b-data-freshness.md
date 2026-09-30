# Session 22b: Data freshness (check, refresh, show data age)

Row in `docs/BUILD.md` section 4. Needs sessions 21 and 22 merged, so `sources.json` lists the real sources.

**Goal:** the site's datasets stay current without anyone remembering to check. Three parts: (1) detect that upstream has changed, (2) refresh safely, (3) tell visitors how old each dataset is.

**What "the site checks" means:** the browser never contacts upstream (spec §5). Checks and refreshes run only in `/data-build`: on your machine, on the VPS timer, or in CI. Live aircraft positions are out of scope (they are live, and already covered by the stale-data banner).

## Scope

### 1. Extend `sources.json` (and its schema)

Per source add:
- `upstream`: how to check it. One of `ckan-metadata` (data.overheid.nl dataset page or API), `http` (ETag / Last-Modified / Content-Length), `github` (latest commit or release tag of a repo), `wfs` (capabilities or feature count and hash), `manual` (no machine-readable signal, e.g. CLO indicator pages). Include the URL to query.
- `cadence`: how often it is expected to change (`monthly`, `yearly`, `multi-year`) and `reviewDueBy` for `manual` sources.
- `refresh`: `auto` or `manual`.
- Recorded state: `retrievedAt`, `upstreamVersion` (ETag, Last-Modified, commit or tag, or a dataset "updated" date), `contentSha256`, `referenceYear` for noise data, and `checkedAt`.

The agent fills `upstream`, `cadence` and `refresh` by **reading each official source page**, not from memory. Where no reliable metadata signal exists, fall back to downloading and comparing a SHA-256 (only for small files), otherwise mark `manual`.

Suggested defaults (agent must confirm each against the source): aircraft DB and airports `auto`, monthly; noise contours `manual` (they change rarely and the band structure may change with each release, so a human must review).

### 2. `check` command

`pnpm --filter @vliegvuil/data-build run check`
- For each source, query upstream metadata only (no bulk downloads) and compare to the recorded state.
- Status per source: `up-to-date`, `update-available`, `review-due` (manual and past `reviewDueBy`), `check-failed` (with reason).
- Write `data-build/status/data-status.json` and print a readable table. Exit 0 even when updates exist; exit non-zero only if the check itself is broken for **every** source.
- Polite client: identifies itself with a `User-Agent` containing the project name and the GitHub repo URL (no email), timeouts, one retry, no parallel hammering of the same host.
- One failing source never stops the others.

### 3. `refresh` command

`pnpm --filter @vliegvuil/data-build run refresh -- <source-id|all-auto>`
- Download to a temp directory, transform, **validate**, then atomically swap into `web/public/data/` and update `sources.json`. Keep the previous version for rollback (`data-build/previous/`).
- Validation gates per dataset, all must pass or the old data stays and the command exits non-zero with a clear message:
  - schema and required fields present;
  - feature or row count within a tolerance of the previous version (agent proposes the tolerance per source; a sudden 50 % drop is a failure, not an update);
  - geometries valid, inside the Netherlands bounding box (noise, airports);
  - file size under the cap;
  - for noise data: the band lower bounds are ones the app knows. An unknown band set fails and asks for a human.
- `refresh` never touches `manual` sources unless named explicitly.

### 4. Notification and scheduling

- **VPS:** a monthly systemd timer runs `check`, then `refresh all-auto`, per spec §4. Document the unit files in `docs/deploy.md`. Failures write to the journal.
- **Notification, recommended:** a scheduled GitHub Actions workflow (weekly) that runs **only `check`**, and opens or updates a single issue titled "Data updates available" with the report. It reads public URLs, has no secrets and does no build or deploy. **This deviates from spec §4 ("GitHub Actions: lint, tests and typecheck only"), so update the spec in the same PR if you approve it.** Note: GitHub may disable scheduled workflows in public repos after a long period without repo activity; document that and how to re-enable it (agent to verify against GitHub docs).
- Alternative if you reject the workflow: `check` writes `data-status.json` on the VPS and you look at it yourself.

### 5. Show data age to visitors

On the Attribution page, for each dataset: source, licence, reference year (noise) or version, retrieval date. Formatting via `Intl`, all text from `locales/<lang>.json`.
- If a dataset is older than its `cadence` allows, show a plain-language note: "Newer data may be available; this dataset was last updated on [date]." Communicate with text and an icon with a text alternative, never colour alone.
- The noise layer legend already shows year and metric; make sure it reads its year from the same recorded state so the two cannot disagree.
- Set `sources.json` `checkedAt` to when the build was last verified so the About page can say "data last checked [date]" (optional).

### 6. Docs

`docs/data-updates.md`: table of sources with cadence, how to check, how to refresh, how to roll back, and what to do when validation fails. Note that the Schiphol END data and the CLO regional indicator are multi-year datasets whose next release the agent must confirm from the official pages, not guess.

## Accessibility and i18n requirements

- Data-age notes are real text in the page, keyboard reachable, in both languages, with dates formatted per language.
- The key-parity test covers the new keys; no user-visible string literals in `.tsx`.

## Tests required

- `check` against recorded **real** upstream responses (fetch once per source type, save trimmed as fixtures): up-to-date, update-available, check-failed (timeout, 404, malformed), review-due.
- One failing source does not stop the rest; whole-run failure exits non-zero.
- `refresh`: a good update swaps atomically and updates `sources.json`; each validation gate (row-count drop, invalid geometry, outside bbox, unknown noise band, oversize) leaves old data untouched and exits non-zero.
- Rollback restores the previous version.
- Attribution page: age note shows when older than cadence and not when fresh, in NL and EN; axe clean.

## Prompt

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md, then docs/sessions/22b-data-freshness.md.
Task: session 22b, "Data freshness". Scope is only that session. Add no new dependencies without stating name, licence and
reason. For every source, read the official page and choose the upstream check method
from what it actually offers; paste the URL and the relevant excerpt in the PR.
Do not guess cadences, version fields or release dates. Fixtures must come from real
responses. Do not claim the systemd or GitHub workflow files work unless you validated
them (`systemd-analyze verify`, and for the workflow a syntax check with the tool you
used); show the command and output. If the spec needs updating, do so and list the change.
Run lint, typecheck, tests and build, and open a pull request with the results.
```

## Human decisions and checkpoints

- **Approve or reject the weekly GitHub Actions check** (spec deviation). If rejected, use the VPS-only status file.
- Confirm `auto` versus `manual` per source. I'd keep noise data manual.
- Review the `User-Agent` string: it should identify the project by its repo URL, not your real name or email.
- Set up the systemd timer on the VPS yourself and verify one full run by hand (`check`, then `refresh`, then look at the site).
- When a `manual` source shows `update-available`, review the new release's licence, band structure and year before running `refresh` on it.
