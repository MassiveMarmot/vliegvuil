# Human checkpoints and human setup notes

Moved verbatim from `docs/BUILD.md` (§1, §2 and §6). The text is byte-identical to the original sections.

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

## 6. Human checkpoints

**Every session**
- Review each PR: new dependencies, CSP, anything that adds a network request.
- Large data outputs (PMTiles) and all deployment happen on your OVHcloud VPS, not in the sandbox.
- Re-read noise badge and legend wording for factual tone.

**Before specific sessions**
- **Before 13:** give the agent the copyright holder handle (pseudonym) and year for the MPL-2.0 header. Set a pseudonymous git author name and no-reply email before branches are merged.
- **Before 17:** decide self-hosted glyphs vs. no map labels.
- **Before 19:** accept that the proxy needs a custom Caddy build (two modules), or say if you'd rather use a different approach.
- **Before 21/22:** verify on the official pages each source's current URL and licence: tar1090-db (`sources.json` says ODC-By-1.0 via Mictronics; re-check), OurAirports, the Schiphol dataset and year, and the regional airport noise data. Ask RIVM/CLO/PBL/NLR for vector data behind CLO indicator 0588 (2018 and 2024), which is the only source found for Eindhoven civil Lden (PBL made the maps; see the Eindhoven data requests checkpoint below).
- **Before 22b:** confirm `auto` vs `manual` per source; review the `User-Agent` string (project repo URL, no personal contact).
- **Before 22c:** set up GitHub: a ruleset or branch protection on `main` (PRs required, required CI checks, applies to admins); default workflow permissions read-only; enable "Allow GitHub Actions to create and approve pull requests" (check the exact setting name in GitHub's docs); restrict allowed actions; require approval for workflows from outside contributors. Expect to click "Approve and run workflows" on bot PRs. After you merge a data PR, deploy by hand (`docs/deploy.md` §7). If GitHub disables the scheduled workflows after 60 days without repository activity, re-enable them in the Actions tab.
- **Before 25b: decide whether to enable HSTS.** 25b already edits the Caddyfile (root redirect, try_files). Plan: start with `Strict-Transport-Security: max-age=86400` (one day), no includeSubDomains, no preload. Rationale: HSTS is sticky; a broken certificate or reload locks browsers out until max-age ends. If yes, it is a separate small PR (one `header` directive in the main site block) with a verification curl in the PR; it is NOT bundled into 25b.
- **Data requests for Eindhoven (DEFERRED — replies not expected soon):** (a) email the CLO/PBL data team (and NLR) for the vector or grid data behind CLO indicator 0588 for Eindhoven, 2018 and 2024 (PBL made those maps; older indicator versions were delivered as contours and 100x100 m grids), asking also for licence/reuse terms; (b) and/or email the Ministry of Defence and/or the Ministry of Infrastructure and Water Management (I&W) for the official Ke contours of the Luchthavenbesluit Eindhoven (35 Ke zone) as vector data, with licence terms. The result decides the session 22b/22 follow-up (see the open Eindhoven question in SPEC §11); do not start a build session before the answers.
- **Around 25:** confirm the GitHub repo and issues URLs the agent derives from the git remote; review the Dutch About text and privacy statements; set `blueskyUrl` in `site.ts` once the account exists; test with keyboard only and a screen reader (VoiceOver or NVDA).
- **After 25c: re-decide includeSubDomains.** Only consider it once every subdomain in use (www, the GoatCounter dashboard host) is HTTPS-only. Preload stays out of scope until the maintainer explicitly decides.
- **After 27:** deploy on the VPS yourself, open the site with browser dev tools, and confirm the only requests are your own origin (basemap tiles included; since PR #67 nothing contacts PDOK); compare against `privacy.md`; check the live feed with real aircraft.

**Decided**: licence MPL-2.0; Eindhoven civil Lden; light/dark theme deferred to a later version; data pipeline = option C (GitHub Actions checks and refreshes and opens PRs, the VPS only pulls, builds and serves, nothing deploys from GitHub); VPS = OVHcloud, 2 vCPU, 4 GB RAM, 40 GB.
