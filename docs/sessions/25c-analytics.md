# Session 25c: Privacy-first analytics (GoatCounter, self-hosted)

Row is in `docs/BUILD.md` section 4. This session depends on sessions 25 and 25b (path routes exist). **This file is the plan; the implementation session reads it first.** The GoatCounter facts below were **verified in the GoatCounter source on the `main` branch (unreleased)** — they must be **re-verified against the release we actually install** before anything is implemented or written into privacy text. Anything not covered by those findings stays an explicit TODO.

**Why:** the site needs simple aggregate numbers — unique visitors, date/time of visits, country of origin — to know whether it is used and by whom, without giving up the privacy-first promise. Decision: self-hosted GoatCounter, a single FOSS binary (EUPL-1.2) with a SQLite database on our own VPS. No hosted service and no sign-up with goatcounter.com; the admin login lives in our own SQLite database and nothing is sent to goatcounter.com.

**Decisions already made:**

- Self-hosted FOSS only. No hosted service, no account with goatcounter.com.
- Wanted: unique visitors, date/time, country of origin. **No IP storage** as the goal — see decision A for the session-key shutdown caveat that makes the privacy wording more specific.
- Bots are **not a goal**. GoatCounter (per pages reviewed, unverified here) ignores self-identified bots in its dashboard — they are still stored, marked as bots, and visible only in export; disguised bots may be counted; crawlers that run no JavaScript are never seen. Treat all bot figures as **best-effort** and say so in the docs.
- **Visitor IP handling (decision A):** Caddy passes the visitor IP only to the GoatCounter route, over localhost, so GoatCounter can derive a country and the session key for unique visits. The session key is the raw string `user-agent + IP + site id` (verified in source on main; re-verify on the installed release). It is kept in memory up to 8 hours and written as JSON into the SQLite `store` table on shutdown, then deleted at next start — so it is **not true that the IP is never written to disk**. Mitigation (decision): the systemd unit sets `KillSignal=SIGKILL` (to be verified — confirm that SIGKILL prevents the shutdown flush) so the service never gets the chance to persist the store; the fallback wording if that cannot be guaranteed is that the session key is "briefly written to the local database on restart". Either way the IP is never logged. The ADS-B upstream proxy still strips IP and headers (unchanged). Caddy access logs stay off.
- Not chosen: passing no IP (breaks country and unique visits); deriving the country elsewhere and sending only that (complex, unverified).
- Alternatives considered, not chosen: Umami and Plausible CE (Postgres; ClickHouse plus 2 GB RAM for Plausible); GoAccess on access logs (needs logs).

---

## Scope

**GoatCounter service:**

- Runs as a systemd service on the VPS, bound to `127.0.0.1` (never on a public interface), with its SQLite database on the server.
- Install steps and the systemd unit are documented in `docs/deploy.md` in this session's PR.
- Retention decision (see human checkpoints) recorded in `deploy.md`.

**Caddy route:**

- A route on the main site origin proxies to the local GoatCounter listener, so the count script and the count endpoint are served from our own origin and the CSP stays `'self'`; no third-party request is added by the page.
- The site is chosen by the **Host header**; unknown hosts get a 400 (verified in source on main, re-verify). So Caddy must set the Host header GoatCounter expects.
- **Proxy only `/count` and the count script** from the main origin — not the whole GoatCounter instance. The dashboard is not reachable through the main site.
- The count endpoint is `GET/POST /count`; it is excluded from request logs and can be rate-limited with `-ratelimit count` (verified in source on main, re-verify).
- Only this route receives the visitor IP (over localhost). The ADS-B upstream proxy keeps stripping IP and headers; Caddy access logs stay off.
- The dashboard runs on a **separate, protected host name** (see human checkpoints), not on the main site origin. Protection options: SSH tunnel, Caddy `basic_auth`, and **TOTP 2FA** (GoatCounter supports TOTP 2FA per user; no recovery codes seen — verify on the installed release). The admin recovery path must be documented: if 2FA locks the admin out, recovery is via direct access to the SQLite database on the VPS (as root/vliegvuil user) — document the exact steps in `deploy.md`.
- Service worker: the count request must be excluded from the service worker's cache and navigation fallback, like `/api/` (add a check to the session 24 service-worker tests).

**Counting in the SPA:**

- On every route change (`/{lang}/`, `/{lang}/about`, `/{lang}/attribution`, …) the SPA sends a count to the first-party endpoint.
- First-party script only, served from our own origin. **No external script host, no third-party script.**

**Privacy wording:** the privacy text (NL and EN, in `privacy.md` and the About page) must carry exactly this: the visitor's address is processed in memory on our own server to derive a country and the session key for unique visits, and is not stored or logged — with the caveat below: if the service is stopped gracefully, the session key (user-agent + IP + site id) is briefly written to the local database on restart and deleted at the next start (unless `KillSignal=SIGKILL` is verified to prevent that flush, in which case the wording may stay "not stored"). No cookies; bots are best-effort. **Do not say "one-way hash" or "never stored" — the session key is a raw (hash-like but reversible-input) string and it hits disk on shutdown.**

## Findings — verified in source on main, re-verify on the installed release

Facts verified in the GoatCounter source (`main` branch, unreleased). Re-check each against the release actually installed before relying on it, and record the checked version/URLs in the PR:

- **Visitor IP behind a proxy:** read from `X-Forwarded-For` / `X-Real-Ip`, with **no trusted-proxy setting**. Because there is no trust boundary, GoatCounter must be bound to `127.0.0.1` only and **Caddy must set the header** on the localhost route; nothing else may reach the listener.
- **Site selection:** by the **Host header**; unknown hosts return a 400. Caddy must set the Host header the site is configured with.
- **Count endpoint:** `GET/POST /count`; excluded from request logs; rate-limitable via `-ratelimit count`.
- **GeoIP:** built-in **GeoLite2 country database** (no MaxMind key, no City DB). **TODO:** check the MaxMind GeoLite2 terms and attribution requirements before adding it to `sources.json`. Do not use the City DB or any MaxMind key.
- **Debug flag:** never enable `-debug` in production — session debug logs print the **session key**.
- **Mail:** default SMTP is `stdout`; leave `-errors` unset.
- **Default collected fields:** referrer, user agent, screen size, location, region, session. List in the PR **which of these we switch off** in the site settings and which stay on.
- **Session key lifecycle:** raw string `user-agent + IP + site id`, kept in memory up to 8 hours, written as JSON to the SQLite `store` table on shutdown, deleted at next start (see decision A and the `KillSignal=SIGKILL` mitigation).
- **Admin 2FA:** TOTP per user is supported; **no recovery codes were seen — verify** on the installed release; document the admin recovery path (direct SQLite access on the VPS).

## Docs to update in 25c

The implementation PR updates all of these in the **same PR** (list found by searching the docs for "no analytics", "no access logs", "no IP logging", "no client IP forwarded" and similar statements):

- `README.md` — "Privacy" bullet: "no analytics, no third-party scripts/fonts, no access logs, no client IPs forwarded upstream; the only third-party request is PDOK basemap tiles".
- `AGENTS.md` — privacy rule: "Privacy: no analytics, no third-party scripts/fonts, no IP logging, strict CSP. Only third-party request: PDOK tiles."
- `docs/SPEC.md` — §4 "No access logs. No client IP or headers forwarded upstream."; §5 "No analytics, no third-party scripts…".
- `docs/privacy.md` — "**No analytics** — no page-view tracking…", "**No access logs** — the Caddy web server has access logging disabled", "**No client IP forwarded upstream** — requests proxied to the ADS-B data provider…", the "Third-party requests" section (the site makes no third-party requests since the basemap tiles were self-hosted — analytics stays same-origin, verify), and the "Local storage" section if any storage is added.
- `docs/deploy.md` — §5 "Privacy properties" ("No access logs", "No client IP upstream", "Same-origin API", "Third-party requests"), the overview diagram ("no client IP sent"), and the troubleshooting note "Error logs (no access logs exist)"; plus §8/§9 if maintenance steps change.
- `docs/BUILD.md` — session 27 row ("Docs contain no statement the code does not do") is satisfied by this same PR; no earlier row text changes.
- `docs/architecture.md` — line 28: "strips client IP/headers upstream" stays true for the ADS-B proxy; add the GoatCounter component to the diagram/description.
- `locales/nl.json`, `locales/en.json` — the About-page privacy summary (added in session 25) if it repeats any of these statements.

Each updated statement must keep the distinction: the ADS-B upstream proxy still strips the IP; only the localhost GoatCounter route sees it; GoatCounter derives country and session key from it in memory, never logs it, and — with the `KillSignal=SIGKILL` mitigation — never persists it (fallback wording: briefly written to the local database on restart, deleted at next start).

## Human checkpoints (for me)

- Approve the final privacy wording, in Dutch and in English, before merge.
- Choose the dashboard host name and its protection (SSH tunnel, Caddy `basic_auth`, and/or TOTP 2FA — 2FA is now an option next to the others).
- Choose the retention period for the GoatCounter database.
- Confirm the decision to pass the visitor IP to the GoatCounter route (decision A above), and the `KillSignal=SIGKILL` mitigation with its fallback wording.
- Confirm which default fields (referrer, user agent, screen size, location, region, session) are switched off in site settings.

## Verification

- `systemctl status` shows the GoatCounter service active and bound to 127.0.0.1 only (`ss -tlnp` shows no public listener).
- The count script and endpoint are served from our own origin; the browser network trace (session 11 test) shows no new third-party request.
- SPA route changes are counted: navigate between pages, see each in the dashboard.
- Caddy access logs are still off.
- Make a test visit from a known address; it shows up in the dashboard with a country; then inspect the GoatCounter database schema and grep the database and all logs for that address — no hit.
- **Store-table check:** run a full stop/start cycle of the GoatCounter service, then inspect the `store` table and grep the database file and the logs for the test IP — with `KillSignal=SIGKILL` the shutdown flush must not have written it (if it did, fall back to the honest wording and tell me before merging).
- `scripts/verify-caddy-headers.sh` still passes (the ADS-B route still strips client IP and headers).
- The session 11 network-trace test still passes with the new route.
- Service worker: the count endpoint is excluded from caching and the navigation fallback (test).
- `caddy validate` output in the PR (custom binary from `docs/deploy.md` §1).
- `pnpm lint && pnpm typecheck && pnpm test` results in the PR.

## Out of scope

- Bot reporting (bot figures stay best-effort, unreported beyond a docs note).
- Event tracking.
- A/B tests.
- Any other analytics tool (hosted or self-hosted).
