# Session 25c: Privacy-first analytics (GoatCounter, self-hosted)

Row is in `docs/BUILD.md` section 4. This session depends on sessions 25 and 25b (path routes exist). **This file is the plan; the implementation session reads it first.** All GoatCounter behaviour described here is **unverified until this session runs** — every claim must be checked against the official GoatCounter docs (or left as a TODO) before it is implemented or written into privacy text.

**Why:** the site needs simple aggregate numbers — unique visitors, date/time of visits, country of origin — to know whether it is used and by whom, without giving up the privacy-first promise. Decision: self-hosted GoatCounter, a single FOSS binary (EUPL-1.2) with a SQLite database on our own VPS. No hosted service and no sign-up with goatcounter.com; the admin login lives in our own SQLite database and nothing is sent to goatcounter.com.

**Decisions already made:**

- Self-hosted FOSS only. No hosted service, no account with goatcounter.com.
- Wanted: unique visitors, date/time, country of origin. **No IP storage.**
- Bots are **not a goal**. GoatCounter (per pages reviewed, unverified here) ignores self-identified bots in its dashboard — they are still stored, marked as bots, and visible only in export; disguised bots may be counted; crawlers that run no JavaScript are never seen. Treat all bot figures as **best-effort** and say so in the docs.
- **Visitor IP handling (decision A):** Caddy passes the visitor IP only to the GoatCounter route, over localhost, so GoatCounter can derive a country and a one-way visit hash. The IP is processed in memory and not stored or logged. The ADS-B upstream proxy still strips IP and headers (unchanged). Caddy access logs stay off.
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
- The proxy must set the **Host header GoatCounter expects** — verify the exact requirement in the GoatCounter docs before writing the route.
- Only this route receives the visitor IP (over localhost). The ADS-B upstream proxy keeps stripping IP and headers; Caddy access logs stay off.
- The dashboard runs on a **separate, protected host name** (see human checkpoints), not on the main site origin.

**Counting in the SPA:**

- On every route change (`/{lang}/`, `/{lang}/about`, `/{lang}/attribution`, …) the SPA sends a count to the first-party endpoint.
- First-party script only, served from our own origin. **No external script host, no third-party script.**

**Privacy wording:** the privacy text (NL and EN, in `privacy.md` and the About page) must carry exactly this: the visitor's address is processed in memory on our own server to derive a country and a one-way hash, and is not stored or logged; no cookies; bots are best-effort.

## TODO — verify in the GoatCounter docs before implementing

Fetch the official GoatCounter docs (goatcounter.com/docs or the codeberg repository's docs) and record the URLs in the PR. Do not guess:

- [ ] How GoatCounter reads the visitor IP **behind a proxy**: which header it expects (e.g. `X-Forwarded-For`, `X-Real-IP`) and which settings control trusting it.
- [ ] Which **GeoIP database** is used or required when self-hosting, and its **licence** — if one is needed, add it to `sources.json` in this session's PR.
- [ ] What the process **logs** by default (verify no visitor IPs can end up in the journal).
- [ ] Which **fields are collected by default** and how to switch off any we do not need.
- [ ] Whether it sends **any mail without SMTP configured** (e.g. errors, reports).
- [ ] The Host header the proxy must pass (also feeds the Caddy route above).

## Docs to update in 25c

The implementation PR updates all of these in the **same PR** (list found by searching the docs for "no analytics", "no access logs", "no IP logging", "no client IP forwarded" and similar statements):

- `README.md` — "Privacy" bullet: "no analytics, no third-party scripts/fonts, no access logs, no client IPs forwarded upstream; the only third-party request is PDOK basemap tiles".
- `AGENTS.md` — privacy rule: "Privacy: no analytics, no third-party scripts/fonts, no IP logging, strict CSP. Only third-party request: PDOK tiles."
- `docs/SPEC.md` — §4 "No access logs. No client IP or headers forwarded upstream."; §5 "No analytics, no third-party scripts…".
- `docs/privacy.md` — "**No analytics** — no page-view tracking…", "**No access logs** — the Caddy web server has access logging disabled", "**No client IP forwarded upstream** — requests proxied to the ADS-B data provider…", the "Third-party requests" section (PDOK remains the only third-party request — analytics stays same-origin, verify), and the "Local storage" section if any storage is added.
- `docs/deploy.md` — §5 "Privacy properties" ("No access logs", "No client IP upstream", "Same-origin API", "Third-party requests"), the overview diagram ("no client IP sent"), and the troubleshooting note "Error logs (no access logs exist)"; plus §8/§9 if maintenance steps change.
- `docs/BUILD.md` — session 27 row ("Docs contain no statement the code does not do") is satisfied by this same PR; no earlier row text changes.
- `docs/architecture.md` — line 28: "strips client IP/headers upstream" stays true for the ADS-B proxy; add the GoatCounter component to the diagram/description.
- `locales/nl.json`, `locales/en.json` — the About-page privacy summary (added in session 25) if it repeats any of these statements.

Each updated statement must keep the distinction: the ADS-B upstream proxy still strips the IP; only the localhost GoatCounter route sees it, and GoatCounter does not store it.

## Human checkpoints (for me)

- Approve the final privacy wording, in Dutch and in English, before merge.
- Choose the dashboard host name (and how it is protected).
- Choose the retention period for the GoatCounter database.
- Confirm the decision to pass the visitor IP to the GoatCounter route (decision A above).

## Verification

- `systemctl status` shows the GoatCounter service active and bound to 127.0.0.1 only (`ss -tlnp` shows no public listener).
- The count script and endpoint are served from our own origin; the browser network trace (session 11 test) shows no new third-party request.
- SPA route changes are counted: navigate between pages, see each in the dashboard.
- Caddy access logs are still off.
- Make a test visit from a known address; it shows up in the dashboard with a country; then inspect the GoatCounter database schema and grep the database and all logs for that address — no hit.
- `scripts/verify-caddy-headers.sh` still passes (the ADS-B route still strips client IP and headers).
- The session 11 network-trace test still passes with the new route.
- `caddy validate` output in the PR (custom binary from `docs/deploy.md` §1).
- `pnpm lint && pnpm typecheck && pnpm test` results in the PR.

## Out of scope

- Bot reporting (bot figures stay best-effort, unreported beyond a docs note).
- Event tracking.
- A/B tests.
- Any other analytics tool (hosted or self-hosted).
