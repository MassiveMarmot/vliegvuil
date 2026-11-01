## 6b. Privacy-first analytics (self-hosted GoatCounter, session 25c)

VliegVuil counts page views with a self-hosted GoatCounter (EUPL-1.2) -
unique visitors, date/time and country of origin only. The verified
release is **v2.7.0** (2025-12-15); every claim below was re-verified
against its source (see the 25c PR for the file/line evidence).

### What it collects and what it does not

- **Counted:** page path, date/time, and - derived **in memory** from the
  visitor IP on the Caddy-to-GoatCounter localhost route - a country
  (embedded GeoLite2-Country DB, no MaxMind key) and the session key
  `user-agent + IP + site id` for unique-visit counting (8 h in memory).
- **Not stored, not logged:** the IP is never written to a column or a
  log. One caveat by design: on a **graceful** shutdown (TERM/INT) the
  session keys are flushed as JSON into the `store` table and deleted at
  the next start. The systemd unit below sets `KillSignal=SIGKILL`
  (verified in the v2.7.0 source: the flush hooks only SIGHUP/SIGTERM/
  SIGINT, so SIGKILL prevents it) - with that in place the service never
  persists the store. If you change the unit, keep this guarantee or
  change the privacy wording everywhere.
- **Dashboard:** NOT reachable through the main origin. Default access
  (pending maintainer approval): SSH tunnel only:
  tunnel local port 8091 to 127.0.0.1:8091 on the VPS, then open
  http://127.0.0.1:8091 locally. Alternatives: a Caddy basic_auth host
  or a separate protected host name, both documented here once chosen.
- **Staging:** staging traffic is never counted (staging has no
  GoatCounter route; the site entry below uses the production vhost).

### Install

```bash
sudo useradd --system --home /var/lib/goatcounter --shell /usr/sbin/nologin goatcounter
# useradd --system does NOT create the home directory on several distros,
# and the fresh goatcounter user cannot mkdir inside a root-owned /var/lib
# (that fails with "Permission denied") — create the tree as root and
# hand over ownership:
sudo mkdir -p /var/lib/goatcounter/db
sudo chown -R goatcounter:goatcounter /var/lib/goatcounter
# sanity: the user can now write its database directory
sudo -u goatcounter test -w /var/lib/goatcounter/db && echo writable

# Download the v2.7.0 linux-amd64 binary from the GitHub release and
# install it as ROOT (/usr/local/bin is root-owned; the goatcounter user
# cannot write it — it only needs to execute the binary):
#   https://github.com/zgoat/goatcounter/releases/tag/v2.7.0
#   (asset: goatcounter-v2.7.0-linux-amd64.gz)
wget -O /tmp/goatcounter.gz https://github.com/zgoat/goatcounter/releases/download/v2.7.0/goatcounter-v2.7.0-linux-amd64.gz
# NOTE: 'sudo gunzip ... > file' does NOT work — bash opens the redirect
# as YOUR user, not root. Use tee so sudo does the writing:
gunzip -c /tmp/goatcounter.gz | sudo tee /usr/local/bin/goatcounter > /dev/null
sudo chmod +x /usr/local/bin/goatcounter
/usr/local/bin/goatcounter version   # must print v2.7.0

# Create the site (the vhost MUST match the Caddy Host header). Replace
# the example address with the real admin e-mail — do NOT keep angle
# brackets, bash treats < and > as redirections:
# NOTE (verified in v2.7.0): the connection string scheme is
# "sqlite+<file>" (not sqlite://), and the -db flag MUST be written in
# -db=value form here — the "db" subcommand's parser treats a separate
# "sqlite+..." token as the command name ("unknown command for db").
# -createdb makes the database file on first run.
sudo -u goatcounter /usr/local/bin/goatcounter db \
  -db=sqlite+/var/lib/goatcounter/db/goatcounter.sqlite -createdb \
  create site -vhost vliegvuil.nl -user.email=admin@example.com
```

### systemd unit

`/etc/systemd/system/goatcounter.service`:

```ini
[Unit]
Description=GoatCounter analytics (vliegvuil.nl)
After=network.target

[Service]
# Type=simple: GoatCounter v2.7.0 has NO sd_notify support (verified in
# the source: no go-systemd dependency, no NOTIFY_SOCKET handling), so
# Type=notify makes systemd wait 90s for READY=1, time out and SIGKILL
# the process. simple = the process is the service.
Type=simple
User=goatcounter
Group=goatcounter
WorkingDirectory=/var/lib/goatcounter
# -listen: loopback ONLY. GoatCounter's RealIP middleware trusts
# X-Forwarded-For/X-Real-Ip with no trusted-proxy setting (verified in
# v2.7.0), so the listener must never be reachable except via Caddy.
# -smtp stdout, no -errors: no mail is sent.
# NO -ratelimit flag: the default count rate limit (count:4/1, 4/s) is
# exactly what we want — and the flag's syntax is name:requests/seconds
# (e.g. count:4/1), NOT a bare name; 'goatcounter serve -ratelimit count'
# fails to start ("-ratelimit.requests: must be set").
# NEVER add -debug: the session debug log prints the session key.
# NO -geodb: the country DB is embedded; this flag is only for the
# optional City DB, which we do not use.
KillSignal=SIGKILL
ExecStart=/usr/local/bin/goatcounter serve \
  -listen 127.0.0.1:8091 \
  -db=sqlite+/var/lib/goatcounter/db/goatcounter.sqlite
Restart=on-failure

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/goatcounter

[Install]
WantedBy=multi-user.target
```

`KillSignal=SIGKILL` is deliberate (see above): it prevents the shutdown
flush of session keys to the `store` table. Verified against the v2.7.0
source: `signal.Notify(sig, SIGHUP, SIGTERM, os.Interrupt)` - SIGKILL is
not catchable, so `Memstore.StoreSessions` never runs.

Accepted side effect of the same choice: pageviews buffered in memory
(v2.7.0 persists them at most every 10 s) are lost when the service is
stopped or crashes. By design and tolerable: analytics is best-effort,
and the alternative (a graceful flush) would write session keys to
disk. Expect slightly lower counts around service restarts.

### Site settings (apply once, in the dashboard)

- **Data collection** (Settings, Data collection; maintainer decision
  2026-10-30): switch OFF **Screen size** and **Region**. Keep ON
  **Referrer**, **User agent**, **Location** (country) and **Session**.
  What each setting does in v2.7.0 (settings.collect bitflags):
  - **Referrer (2)** - when ON, the count request's referrer is stored
    and aggregated per referrer per path **per hour** (the `ref_counts`
    table; dashboard shows hourly/total referral numbers). The
    individual page-view log does not show referrers unless you open a
    page's "show refs" view. Our SPA module never sends a referrer, so
    this only matters for direct external traffic counted by the browser
    navigation (document.referrer on the initial load is NOT sent by our
    module either) - in practice the referrer list stays empty unless a
    count.js-style client is ever introduced; the setting stays ON so
    that day needs no config change.
  - **User agent (4)** - the browser's user-agent string is parsed and
    stored (browser/system for the dashboard's breakdowns); the session
    key is built from it, so it stays ON.
  - **Screen size (8)** - the count.js client sends the screen
    resolution; we never send it, and the setting is OFF so nothing can
    arrive by accident.
  - **Location (16)** - the country from the embedded GeoLite2 DB; the
    privacy-promise core of the analytics, stays ON.
  - **Region (32)** - a region below country; requires the City DB
    (MaxMind key) which we do not use: OFF.
  - **Session (128)** - enables unique-visitor counting via the session
    key; stays ON.
  - (Language (64) is off by default and stays off.)
  Default = Referrer|UserAgent|ScreenSize|Location|LocationRegion|Session;
  we use Referrer|UserAgent|Location|Session.
- **Data retention** (Settings, in days; native since 2.x via
  settings.data_retention, range 31-1825, applied by a daily cron
  vacuum): maintainer decision 2026-10-30 - **indefinite for now**.
  Leave the field empty/0 in the dashboard: 0 is the default and means
  "never delete" (verified in the v2.7.0 source: the daily cron skips
  any site with `DataRetention <= 0` - `cron/tasks.go:64` `if
  s.Settings.DataRetention <= 0 { continue }`; the 31-1825 range check
  only applies when a positive value is set - `settings.go:377`; the
  dashboard field's own help text says "Set to `0` to never delete" -
  `tpl/settings_main.gohtml:103`). Revisitable: if a retention period
  is ever wanted, set a value in the 31-1825 range here and update
  privacy.md and the locale About texts in the same PR.
- **Admin 2FA (TOTP)**: maintainer decision 2026-10-30 - **deferred**
  while dashboard access is SSH-tunnel-only (the tunnel already needs
  a VPS login; TOTP adds little). It becomes **REQUIRED the day any
  non-tunnel access is added** (a basic_auth host, a public dashboard
  hostname, anything else that reaches the dashboard without SSH):
  enable it (User, Multi-factor authentication) in the same change.
  v2.7.0 has **no recovery codes** (verified: only enable/disable TOTP
  endpoints exist). If 2FA locks you out, recovery is via the database:
  query the users table and clear totp_secret/totp_enabled for your
  user - then log in and set it up again immediately.

### Verification checklist (run on the VPS; see also privacy.md)

- [ ] systemctl status goatcounter - active, and
      ss -tlnp | grep 8091 shows ONLY 127.0.0.1:8091 (no public
      listener).
- [ ] A GET of https://vliegvuil.nl/count.js - served from the main
      origin (Caddy proxy). NOTE: use a GET, not a HEAD (-I): Caddy's
      reverse_proxy only forwards GET/POST by default, so a HEAD request
      gets a 405 from the route - that 405 is expected and not an error.
      e.g. fetch the script body and expect its first lines.
- [ ] A test visit shows up in the dashboard with a country.
- [ ] Inspect the hits table schema (sqlite3 .schema hits) - no IP
      column. With "Individual pageviews" OFF (maintainer decision), the
      raw `hits` table stays **empty by design** - the dashboard reads the
      `hit_stats` aggregates. Verify there instead:
      `select count(*) from hit_stats;` (grows after a test visit), and
      grep the raw database file for the test IP - no hit. Do NOT use
      `select count(*) from hits` as a check; an empty `hits` is expected
      and not an error.
- [ ] **Store-table check:** stop and start the goatcounter service,
      then select key from store - with KillSignal=SIGKILL the shutdown
      flush did not write the session keys; if it did, tell the
      maintainer and switch the privacy wording to the honest fallback
      ("briefly written to the local database on restart, deleted at
      next start").
- [ ] journalctl -u caddy --since "1 hour ago" piped through an
      IPv4-pattern grep - still no IPs in Caddy logs (error entries are
      scrubbed; if any appear, check they are not from before the scrub
      deploy, then rotate/vacuum the journal).
- [ ] scripts/verify-caddy-headers.sh still passes (ADS-B route still
      strips client IP and headers).
- [ ] caddy validate --config /etc/caddy/Caddyfile with the custom
      binary passes.

