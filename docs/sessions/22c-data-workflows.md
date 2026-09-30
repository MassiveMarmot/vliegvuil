# Session 22c: Data workflows (GitHub Actions)

Row in `docs/BUILD.md` section 4. Needs session 22b merged. Implements **option C**: GitHub Actions checks and refreshes the datasets and opens issues and pull requests; the VPS only pulls, builds and serves and runs no data jobs. Nothing deploys from GitHub. `docs/SPEC.md` §4 and §10 already describe this; keep them in sync with what you build.

## Goal

1. A weekly **check** that tells the maintainer when upstream datasets changed (one issue, updated in place).
2. A monthly and manually dispatchable **refresh** that opens a reviewable pull request with the changed snapshots.
3. Retire the VPS timers and harden CI so the new workflows do not widen the attack surface.

## Scope

### 1. Workflow `data-check.yml`

- Triggers: `schedule` weekly (pick a minute that is not on the hour) and `workflow_dispatch`.
- Permissions: `contents: read` and `issues: write` for this job only.
- Steps: checkout, Node, `pnpm install --frozen-lockfile`, `check`, then build an issue body from `data-build/status/data-status.json` and create or update **one** open issue titled "Data updates available" (label `data-updates`, created if missing) using `gh` with `--body-file`. If every source is `up-to-date`, close the issue with a comment. Never create a second issue.
- The check itself failing for every source fails the workflow.
- `check` sends an `Authorization` header with `GITHUB_TOKEN` **only** to `api.github.com` (avoids shared-IP rate limits), never to other hosts, never logged. Unit-test that.

### 2. Workflow `data-refresh.yml`

- Triggers: `schedule` monthly (not on the hour), and `workflow_dispatch` with inputs `source` (default `all-auto`; must match a known source id or `all-auto`) and `dry_run` (boolean; refresh and report, open no PR).
- `concurrency` group so two runs never overlap; `timeout-minutes` on every job.
- Skip PR creation if an open PR with label `data` already exists; say so in the job summary.
- **Two jobs, so the job that runs project code never holds a write token:**
  1. `refresh` (`contents: read`): checkout, install, run `check` and `refresh -- <source>`, write `data-build/status/refresh-report.json`. Upload **only** the allowed output paths (`web/public/data/**`, the noise file, `sources.json`, the report) as an artifact.
  2. `open-pr` (`contents: write`, `pull-requests: write`; needs job 1; **runs no code from `node_modules`**): download the artifact, verify it contains only the allowed paths and respects the size cap, create branch `data/refresh-<date>[-<source>]`, commit as `github-actions[bot]`, push, and open a PR with `gh pr create --body-file`, label `data`. No diff means no PR.
- Manual sources run only when named in a manual dispatch and get the extra label `needs-human-review` and a checklist in the PR body: licence reviewed, band structure known to the app, reference year, legend and label text.

### 3. Issue and PR body builders (in `/data-build`, pure TypeScript, tested)

- Input: `data-status.json` and `refresh-report.json`. Output: Markdown.
- PR body: per dataset the old and new upstream version, row counts before and after, validation gate results, licence and reference year, source URL, plus the note "CI on this PR needs 'Approve and run workflows'".
- **All upstream strings are untrusted.** Escape Markdown, strip control characters, limit length. Test with hostile input (backticks, `${{ }}`, `@mentions`, HTML, very long strings).

### 4. CI hardening (same PR, `ci.yml` and new workflows)

- Top-level `permissions: contents: read` everywhere; grant more per job only where needed.
- Pin every action to a full commit SHA with the version in a comment. Look the SHAs up from the official repositories' tags and paste the source in the PR.
- Only GitHub-owned actions (`actions/*`) plus the already used `pnpm/action-setup`. No other third-party action without approval.
- No `pull_request_target`. No `${{ }}` of inputs or upstream data inside `run:` scripts; use `env:` and files.
- Run `actionlint` over all workflow files in your sandbox and paste the output. Add it to CI only if that is simple and you can state the tool's licence and how it is pinned.

### 5. Retire the VPS timers

- Delete `deploy/vliegvuil-data-check.service`, `deploy/vliegvuil-data-refresh.service`, `deploy/vliegvuil-data-refresh.timer` (and the `deploy/` folder if empty).
- Add `data-build/previous/` to `.gitignore` (git history is now the rollback; `previous/` remains only for local runs).
- Update `docs/deploy.md` §8, `docs/data-updates.md`, `docs/architecture.md` and `docs/privacy.md` to match what exists. `privacy.md` gets one line: data updates run on GitHub's runners, contact only public open-data hosts, and involve no visitor data.

## Requirements

- **No secrets** beyond `GITHUB_TOKEN`; no deploy keys in GitHub; no VPS access from Actions.
- **Reproducible locally:** the workflows only call the same `pnpm` commands a human can run. No Actions-specific logic in `/data-build`.
- **Privacy invariants unchanged:** the browser never contacts upstream; the site still makes no third-party calls except PDOK tiles.
- **Fail closed:** any validation gate failing means no PR and a failed job with a clear message.

## Tests and verification required

- Unit tests: token only sent to `api.github.com`; issue and PR body builders with normal and hostile input; artifact path allowlist check (reject a path outside the allowlist or an oversize file); source id validation.
- `actionlint` output clean, pasted in the PR.
- A local dry run of `check` and `refresh` showing the report and both Markdown bodies, pasted in the PR.
- State plainly what could not be verified in the sandbox (the real workflow run on GitHub). The first real run happens after merge via `workflow_dispatch` with `dry_run`.

## Prompt

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md, then docs/sessions/22c-data-workflows.md.
Task: session 22c, "Data workflows". Scope is only that session. Add no new
dependencies without stating name, licence and reason. Do not claim the workflows
work unless you ran actionlint and a local dry run; show the commands and output.
Look up every action SHA from the official repository and cite it. Treat all
upstream strings as untrusted. Do not add deploy jobs, deploy keys or secrets.
Run lint, typecheck, tests and build, and open a pull request with the results and
anything you could not verify.
```

## Human checkpoints

**Before the session** (GitHub settings, see `docs/BUILD.md` §6): ruleset or branch protection on `main` with required CI checks and PRs required for everyone including admins; default workflow permissions read-only; enable "Allow GitHub Actions to create and approve pull requests" (confirm the setting's current name); restrict allowed actions; require approval for workflows from outside contributors.

**After merge:**
1. Run `data-check` via `workflow_dispatch`, then `data-refresh` with `dry_run` on, and read both outputs.
2. Run `data-refresh` for real and review the resulting PR: the diff in `web/public/data/` and `sources.json`, row counts, gate results. Click "Approve and run workflows" so CI runs, merge, then deploy by hand (`docs/deploy.md` §7).
3. Remove the old systemd timer from the server if you ever installed it (`docs/deploy.md` §8).
4. Put a calendar reminder to check the Actions tab: GitHub disables scheduled workflows after 60 days without repository activity.
