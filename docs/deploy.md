# VliegVuil.nl — Deployment Guide

## Overview

VliegVuil.nl runs on a single OVHcloud VPS (2 vCPU, 4 GB RAM, 40 GB storage)
with Ubuntu 26.04 LTS. There is no Cloudflare or other proxy in front: the
browser connects directly to Caddy, which serves the static app and
reverse-proxies the ADS-B API on the **same origin**
(`/api/*` → `https://opendata.adsb.fi/api/v2/*`). Because the API is same origin,
CORS is not needed and no CORS headers are sent.

```text
┌───────────────────────────────┐        ┌──────────────────┐
│  Browser                      │        │  adsb.fi API     │
│  https://vliegvuil.nl         │        │  (external)      │
│   ├── static app  ────────────┼──► Caddy ── /api/* ───────►│
│   └── /api/*      (same origin)│  (VPS)  ~5s micro-cache    │
└───────────────────────────────┘        no client IP sent   │
                                         ┌──────────────────────┐
   /count (same origin): page view;  │ GoatCounter 127.0.0.1 │
   country + session key derived     │ (loopback only;       │
   in memory; IP never stored or     │  dashboard NOT proxied)│
   logged - see 6b and privacy.md    │                      │
                                         └──────────────────┘
```

Deployment model: git pull from GitHub, then build on the server, by hand.
No Docker, no CD pipeline, nothing deploys from GitHub. Data refreshes arrive
as reviewed pull requests (see §8); the server never runs them.

Throughout this guide, replace `<owner>` with the GitHub account that owns
the repository.

## Prerequisites

- VPS running **Ubuntu 26.04 LTS** with ports 80 and 443 (TCP) reachable
- Domain `vliegvuil.nl` with an A record (and an AAAA record if the VPS has
  IPv6) pointing at the server
- `git`, `curl`, `gnupg`, `python3` (used by `scripts/verify-caddy-headers.sh`),
  a Go toolchain (for `xcaddy`), and Node.js 22 with npm and pnpm (for
  building the web app)
- SSH access with a key

Ubuntu 26.04 notes (from the Ubuntu 26.04 release notes and package pages):

- `sudo` is now **sudo-rs** and most core utilities are the Rust **uutils**
  implementations. In 26.04, `cp`, `mv` and `rm` are **still GNU** (they
  switch in 26.10), and the commands in this guide use only basic features
  anyway. The traditional sudo is available as `sudo.ws` (and the GNU
  coreutils as the `coreutils-from-gnu` package) if anything misbehaves.
- **Do not use `sudo -H`.** sudo-rs does not list a `-H` option in its manual
  and always sets `HOME` from the target user, so `sudo -u vliegvuil bash -c
  '...'` already runs with the right home directory. This guide omits `-H`.
- Ubuntu's `nodejs` package is 22.22.1 (universe), which satisfies the
  repository's `engines` requirement (Node ≥ 22). Corepack is a separate,
  **old** package in Ubuntu 26.04 (`node-corepack` 0.24.0); Corepack older
  than 0.31.0 fails to download pnpm 10.1+ with "Cannot find matching keyid".
  This guide therefore installs pnpm with npm instead of using Corepack.
- Check what you actually have: `go version` and `node -v`. If Caddy or
  `xcaddy` needs a newer Go than Ubuntu provides, install Go from
  <https://go.dev/dl/>.
- `nodejs`, `npm` and `golang-go` come from the `universe` component. If
  `apt` cannot find them, run `sudo add-apt-repository universe`.
- Ubuntu home directories are not world-readable by default, and
  `sudo -u vliegvuil` inherits your current directory. **Run the commands in
  this guide from a neutral directory** (`cd /tmp`) to avoid "cannot access
  current directory" errors.

### Server baseline (once)

```bash
cd /tmp
sudo apt update && sudo apt upgrade
sudo apt install git curl gnupg ca-certificates golang-go nodejs npm
# unattended security updates (usually enabled on Ubuntu Server; verify)
sudo apt install unattended-upgrades
systemctl status unattended-upgrades --no-pager

# SSH by key only (keep your current session open while testing!)
sudo tee /etc/ssh/sshd_config.d/10-vliegvuil.conf <<'CONF'
PasswordAuthentication no
PermitRootLogin no
CONF
sudo sshd -t
# Ubuntu 26.04 starts sshd through ssh.socket; restarting ssh.service applies
# the new authentication settings and keeps your open session alive.
sudo systemctl restart ssh
# Show the settings sshd actually uses. Drop-in files are read in alphabetical
# order and the first value wins, so 10-vliegvuil.conf takes precedence over
# e.g. a provider's 50-cloud-init.conf.
sudo sshd -T | grep -iE '^(passwordauthentication|permitrootlogin)'

# Firewall (Ubuntu ships ufw inactive). Allow SSH first.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp     # HTTP/3
sudo ufw logging off       # ufw logs blocked packets with source IPs
sudo ufw enable
```

If your provider also offers a network firewall, allow the same ports there.

On OVHcloud this is the **Edge Network Firewall** (Control Panel → Network →
Public IP Addresses → ⋯ next to the VPS IPv4 → Configure Edge Network
Firewall). It is stateless and **IPv4-only**; ufw stays the authoritative
firewall, also for IPv6. Configure these rules (lowest priority number is
evaluated first; evaluation stops at the first match), then enable the
firewall while keeping your current SSH session open:

| Priority | Action | Protocol | Destination port | Notes |
|---|---|---|---|---|
| 0 | Accept | TCP | — | TCP state `Established` (stateless firewall; OVH advises this) |
| 1 | Accept | TCP | 22 | SSH; leave the source port empty |
| 2 | Accept | TCP | 80 | HTTP; needed for Let's Encrypt HTTP-01 and the redirect |
| 3 | Accept | TCP | 443 | HTTPS |
| 4 | Accept | UDP | 443 | HTTP/3; see the QUIC caveat below |
| 19 | Deny | IPv4 | — | Catch-all deny; without it accept-only rules are ineffective |

Caveats (from OVHcloud's Edge Network Firewall guide):

- The rules cannot *open* ports; the server firewall (ufw) decides that.
  Keep both in sync when the port set changes.
- QUIC (HTTP/3) is currently dropped at the OVHcloud network edge for IPv4
  regardless of these settings; IPv4 visitors fall back to HTTP/2. Over
  IPv6 (AAAA record) HTTP/3 still works, since the edge firewall is v4-only.
- The firewall auto-engages during a DDoS attack even when disabled, and
  the rules then apply — so keep the rules correct even if it is off.

Time sync is handled by `chrony`, the default on **new** Ubuntu 26.04
installs (a provider image may differ; check with `chronyc tracking`).

### DNS records

When the domain is registered, point it at the server. The site is reachable
over IPv4 and IPv6, so create both records at the registrar:

- **A record**: `vliegvuil.nl` → the VPS IPv4 address
- **AAAA record**: `vliegvuil.nl` → the VPS IPv6 address (check with
  `ip -6 addr show` on the server; use the public `2xxx:…` address)

Without the AAAA record the site works, but IPv6 visitors cannot connect
(and HTTP/3, which OVHcloud's edge drops for IPv4, stays unreachable). Add
the AAAA record after registering the domain and verify from a client with
`dig A vliegvuil.nl +short` and `dig AAAA vliegvuil.nl +short`. If the VPS
has no IPv6 address, skip the AAAA record.

Post-setup checklist:

- [ ] key login as a non-root user works, from a **new** terminal
- [ ] `ssh -o PreferredAuthentications=password <user>@vliegvuil.nl` is refused
- [ ] `sudo sshd -T` shows `passwordauthentication no` and `permitrootlogin no`
- [ ] `sudo ufw status` shows only OpenSSH, 80/tcp, 443/tcp, 443/udp
- [ ] if a provider edge firewall is enabled, its rule set matches the ufw
      port set and a `Deny` catch-all exists
- [ ] once the domain is registered: A and AAAA records resolve to the VPS
      (`dig A vliegvuil.nl +short`, `dig AAAA vliegvuil.nl +short`)
- [ ] `systemctl is-active unattended-upgrades` prints active
- [ ] `chronyc tracking` reports a synchronised clock
- [ ] the OVHcloud web console (KVM) was tested once — it is the break-glass
      path once password SSH is off

## 1. Install Caddy with the required modules

Rate limiting and the micro-cache are **Caddy modules**, not part of the
standard distribution. Install Caddy from its official apt repository first
(this provides the `caddy` user, `/etc/caddy`, `/var/lib/caddy` and the
systemd unit), then swap in a custom binary the way Caddy's documentation
describes (<https://caddyserver.com/docs/build>, "Package support files for
custom builds for Debian/Ubuntu/Raspbian").

```bash
# 1a. Caddy from the official repository. If these commands differ from the
#     current instructions at https://caddyserver.com/docs/install, follow those.
#     (Caddy's page also lists debian-keyring, debian-archive-keyring and
#     apt-transport-https; they are not needed to verify Caddy's repository.)
cd /tmp
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
               /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

```bash
# 1b. Build the custom binary as an unprivileged user (not root).
cd /tmp
sudo useradd -m -s /bin/bash vliegvuil || true   # also used in §2
sudo -u vliegvuil bash -c '
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
  cd ~ && ~/go/bin/xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/cache-handler \
    --with github.com/darkweak/storages/otter/caddy
'
```

The first-time build above is unpinned (latest). For every later rebuild use
`sudo scripts/vps-caddy-update.sh` instead: it builds with the pinned
versions from `scripts/caddy-versions.env` (the same set CI validates),
validates before installing, and restarts with rollback. If you ever build
by hand again, pin it (`xcaddy build <caddy-version> --with module@<version>`
from `scripts/caddy-versions.env`) and record the versions you deployed.

```bash
# 1c. Install it next to the packaged binary (official procedure).
sudo dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy
sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
sudo chown root:root /usr/bin/caddy.custom && sudo chmod 755 /usr/bin/caddy.custom
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50
sudo systemctl restart caddy
```

With this setup the packaged systemd unit keeps working unchanged and
`apt upgrade` can no longer overwrite the custom binary.

Modules used (three; confirm each licence in its repository before relying
on it):

- `mholt/caddy-ratelimit` — the `rate_limit` directive
  (<https://github.com/mholt/caddy-ratelimit>)
- `caddyserver/cache-handler` — the `cache` directive for the ~5s micro-cache
  (<https://github.com/caddyserver/cache-handler>). Since Souin v1.7.0 a
  storage module must be built in, hence `darkweak/storages/otter/caddy`
  (<https://github.com/darkweak/storages>).

Check the binary:

```bash
caddy version
caddy list-modules | grep -E 'ratelimit|cache'
```

## 2. Install the app

The repository is public, so the server can clone it over HTTPS **without
any credential**. If the repository is ever made private again, use a
read-only deploy key instead (GitHub → Settings → Deploy keys, leave "Allow
write access" unchecked, and verify GitHub's SSH host key fingerprint
against the one published in GitHub's documentation before accepting it).

```bash
# The app lives in /srv/vliegvuil (owned by the vliegvuil user); the user's
# home is /home/vliegvuil, so the clone target is an empty directory.
cd /tmp
sudo useradd -m -s /bin/bash vliegvuil || true
sudo mkdir -p /srv/vliegvuil
sudo chown vliegvuil:vliegvuil /srv/vliegvuil
sudo chmod 755 /srv/vliegvuil          # the caddy user must be able to read it

sudo -u vliegvuil git clone https://github.com/<owner>/vliegvuil.git /srv/vliegvuil
```

## 3. Build the web app

Run builds as the `vliegvuil` user so files are not owned by root.

The repository pins its package manager (`packageManager` in `package.json`,
currently `pnpm@10.34.1`). Install exactly that version once, and keep it in
sync when the pin changes:

```bash
cd /tmp
grep '"packageManager"' /srv/vliegvuil/package.json   # shows the pinned pnpm version
sudo npm install -g pnpm@10.34.1                      # use the version printed above
pnpm --version
```

The repository's `preinstall` script runs `npx only-allow pnpm`, which is why
`npm` must be installed as well.

```bash
sudo -u vliegvuil bash -c '
  cd /srv/vliegvuil
  pnpm install --frozen-lockfile
  # VITE_ANALYTICS=1: production builds count page views (session 25c);
  # dev, tests and CI builds run without it and never count.
  VITE_ANALYTICS=1 pnpm --filter web build
'
```

The built app ends up in `/srv/vliegvuil/web/dist` — the path the Caddyfile
expects.

### Build-time site configuration (session 25b)

The build bakes the site origin and name into the prerendered pages,
sitemap and robots.txt. The variables (see `web/src/config/site.ts` and
`web/scripts/gen-static-pages.ts`):

- `VITE_SITE_ORIGIN` — the canonical origin, e.g. `https://vliegvuil.nl`
  (default). Used in every canonical URL, hreflang alternate, `og:url` and
  the sitemap.
- `VITE_SITE_NAME` — the visible site name (default `VliegVuil.nl`).

**Building for another origin** (for example a sibling site on another
domain — the code contains no hard-coded domain):

```bash
VITE_SITE_ORIGIN=https://example.eu VITE_SITE_NAME="Example.eu" VITE_ANALYTICS=1 \
  pnpm --filter web build
```

The same command produces `dist/{nl,en}/…` prerendered pages, robots.txt and
sitemap.xml pointing at `https://example.eu`. No other change is needed;
the Caddyfile's root redirect and `x-default` hreflang target follow the
redirect rules above, and `dist/robots.txt`'s `Sitemap:` line uses the new
origin. Nothing about the deployment itself is origin-specific beyond these
variables and the site block in the Caddyfile.

## 4. Install the Caddyfile

```bash
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile

# The caddy user must be able to read the built app:
sudo -u caddy test -r /srv/vliegvuil/web/dist/index.html && echo "readable"

sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

**Always run `caddy validate` with the custom binary from step 1** — the
standard distribution rejects the `rate_limit` and `cache` directives. On
the first start Caddy obtains the TLS certificate automatically; this needs
the DNS record from the prerequisites and ports 80/443 open.

### Staging (optional, not set up yet)

Staging does not exist today. This section is a plan for when a change needs
testing against real Caddy behaviour that a local preview cannot provide
(the root redirect, `try_files` deep links, response headers, a generated
sitemap/robots.txt; the first candidate is session 25b). Plain UI work is
tested locally (next section), not on staging.

Convention: a staging subdomain (`staging.vliegvuil.nl`) on the same VPS.

- **DNS**: A and AAAA records for the staging hostname pointing at the same
  VPS. Caddy then obtains and renews the certificate automatically: a site
  address with a hostname activates automatic HTTPS, which provisions
  certificates and redirects HTTP to HTTPS
  (<https://caddyserver.com/docs/automatic-https>, "Effects"). No manual
  certificate step is needed.
- **Separate web root**: build the branch under test to its own root (for
  example `/srv/vliegvuil-staging/web/dist`), never the production root
  (`/srv/vliegvuil/web/dist`), so a staging deploy cannot overwrite
  production files.
- **Access control**: the staging block must be behind HTTP Basic
  Authentication. Caddy's directive is `basic_auth` (renamed from
  `basicauth` in v2.8.0;
  <https://caddyserver.com/docs/caddyfile/directives/basic_auth>). Hashes,
  never plaintext: generate with `caddy hash-password` and put the hash in
  the config.
- **Not indexed**: serve `X-Robots-Tag: noindex` on every response (a plain
  `header X-Robots-Tag "noindex"` per
  <https://caddyserver.com/docs/caddyfile/directives/header>) plus a
  disallow-all `robots.txt` from the staging root.
- **Why access control is required**: every certificate Caddy obtains from a
  public CA is submitted to Certificate Transparency logs, and those logs
  are crawled by bots that discover hostnames. Let's Encrypt documents
  this: "After successful validation, your certificate will be submitted to
  numerous Certificate Transparency (CT) logs ... automated CT crawling bots
  will be able to discover your domain, attempt to access it, and generate
  further traffic in your webserver logs."
  (<https://letsencrypt.org/docs/faq/>). A staging hostname is therefore
  discoverable by anyone, not secret.
- **HSTS**: the production site sends HSTS with `max-age=86400` (one day),
  without `includeSubDomains` and without `preload` (see "HSTS: enabled at
  the first ramp-up step" in the header verification section below) — so
  the apex header does not cover a staging subdomain, and staging must
  serve valid HTTPS on its own. Do not add a HSTS header to the staging
  block; staging is not a place to make that decision (see the HSTS and
  Subdomains plan in this file).
- **Shared resources — decide, do not assume**:
  - *Tiles*: share `/srv/vliegvuil/tiles` (symlink or read-only bind) or
    run a second 24 h tile download for a fully isolated copy. Both cost
    something (coupling vs disk and another Fair-Use download) — decide
    before setting staging up.
  - */api proxy*: staging would be a second consumer of adsb.fi's 1 req/s
    public limit, and the micro-cache keys include the request host
    (Souin cache keys include the host unless disabled; see the cache
    handler's `key.disable_host` option,
    <https://github.com/caddyserver/cache-handler>), so staging requests
    are not served from production's cache. Prefer running staging with
    mock data (`VITE_MOCK=1`) and not proxying `/api` at all.
  - *Rate-limit zones*: rate-limit zones are identified by name across the
    whole Caddy instance ("rate limit zones, which have a unique name of
    your choosing", <https://github.com/mholt/caddy-ratelimit>); a second
    site block must use its own zone names, or it will share limits with
    production.
  - *Analytics*: GoatCounter (session 25c) must not count staging traffic;
    decide the exclusion (separate site id or blocked script) when 25c is
    implemented.
- **Maintenance cost**: staging is one more build step, one more
  certificate and a wider patch surface. Keep it off when not in use:
  remove the DNS record and the site block, then reload Caddy (the normal
  validate/reload sequence from the sections above).

**UNTESTED TEMPLATE** — never run, not validated; a starting point only.
Kept `caddy fmt`-formatted (tabs, single blank lines). Omit the `/api`
proxy unless deliberately testing it (mock data instead); no rate-limit or
cache directives (own zones would be needed, see above); no HSTS. The
disallow-all `robots.txt` is a plain file in the staging root, not a Caddy
directive.

```
staging.vliegvuil.nl {
	basic_auth {
		# caddy hash-password
		staging <hashed-password>
	}
	root * /srv/vliegvuil-staging/web/dist
	try_files {path} /index.html
	file_server
	encode zstd gzip
	header X-Robots-Tag "noindex"
}
```

The template has not been run or validated in this repo's CI (CI validates
the production Caddyfile only). Run `caddy validate` with the custom binary
on the VPS before reloading, per the normal update sequence.

### Local preview

For plain UI work, run the Vite dev server locally — no VPS or Caddy
needed:

```bash
pnpm install
VITE_MOCK=1 pnpm --filter @vliegvuil/web dev
```

`VITE_MOCK=1` matters: there is no dev-server proxy for `/api`
(`web/vite.config.ts` configures none; `useAircraftData.ts` falls back to
the mock module only when `VITE_MOCK=1`), so without it the aircraft poll
fails and the stale/error banner shows. Other local limitations:

- `/tiles/` returns 404 locally, so the basemap is empty (the aircraft
  layer still renders — it is independent of basemap tiles).
- The service worker only exists after `pnpm build` and only acts under
  `vite preview` (a build preview), not the dev server.
- What a local preview cannot test: Caddy deep links and `try_files`, the
  real `/api` proxy (headers, micro-cache, rate limiting), the real tile
  serving and headers, and the production response headers. Those need
  staging or the production server.

### Root redirect ( / -> /{lang}/ )

`/` has no language segment, so the app itself would render the not-found
view. The Caddyfile's `vliegvuil.nl` block therefore has a `handle` for
exactly `/` (a named matcher, placed before the other handle blocks) that:

- sets `Vary: Accept-Language` and `Cache-Control: no-store` (the redirect
  is language-dependent, so caches must key on the request language and
  must not store it), then
- redirects with **302** (deliberately not 301: browser- or
  language-preference changes must not be remembered) to `/en/` when the
  request's `Accept-Language` header starts with an English tag
  (`header_regexp ^\s*en([-;,\s]|$)`), otherwise to `/nl/` (the default).

The first-listed tag decides: `en-US,en;q=0.9` goes to `/en/`, and `nl`,
`de` or no header go to `/nl/`. **q-values are not parsed** — a header like
`de;q=1.0, en;q=0.9` starts with `de` and therefore goes to `/nl/`, even
though the q-values say otherwise. That is the accepted trade-off: it keeps
the rule a single regex with no q-value parsing in Caddy config.

Verify after deploy:

```bash
# English-first header: 302 to /en/
curl -sSI -H 'Accept-Language: en-US,en;q=0.9' https://vliegvuil.nl/ | grep -iE 'HTTP/|location|vary|cache-control'
# Dutch, German and no header: 302 to /nl/
curl -sSI -H 'Accept-Language: nl-NL,nl;q=0.9' https://vliegvuil.nl/ | grep -i location
curl -sSI -H 'Accept-Language: de-DE,de;q=0.9,en;q=0.5' https://vliegvuil.nl/ | grep -i location
curl -sSI https://vliegvuil.nl/ | grep -i location
```

Expected: every response is `302` with `Location: /en/` or `Location: /nl/`,
carries `Vary: Accept-Language` and `Cache-Control: no-store`, and `/nl/`
or `/en/` (the SPA routes) still serve the app as before. The status quo
before this change — `/` showing the in-app not-found page — is the bug
this fixes.

## 5. Privacy properties (what to expect)

- **No access logs.** Caddy does not write access logs unless one is
  explicitly configured; the Caddyfile does not configure one. There is no
  `access_log off` directive because that is not valid Caddy syntax — see
  <https://caddyserver.com/docs/caddyfile/directives/log>.
- **No visitor IP in any log (scrubbed error log).** Caddy's HTTP error
  logger (`http.log.error`) embeds the full request object (remote_ip,
  client_ip, headers, URI — which also contains the map viewport) in every
  failed or cancelled request; with the SPA polling /api every 5 s,
  cancelled polls made IPs accumulate in the journal (found during the
  25c deploy verification). The Caddyfile routes that logger through a
  filter encoder that DELETES the request object and redacts IPs from
  the error field, and excludes it from the default log; Go stdlib
  server messages (`http.stdlib`, including TLS handshake failures) log
  at Debug level and are not emitted at the default INFO level.
  Verified against the Caddy 2.11.7 source and by live tests (see the
  scrub PR): a forced 500 logs status/duration/trace but no request
  object; a garbage-HTTP + failed-TLS-handshake test produced zero IPs
  in the log.
- **No client IP upstream.** All requests to `/api/*` are forwarded with
  `X-Forwarded-For` (and friends) deleted and a fixed
  `User-Agent: VliegVuil.nl/1.0 (+https://vliegvuil.nl)`. adsb.fi never
  learns the visitor IP.
- **Same-origin API.** The app makes no third-party API calls and no CORS
  headers exist. `connect-src` is `'self'` only. The analytics count
  (session 25c) is same-origin too: `/count` and `/count.js` are proxied
  by Caddy to the loopback GoatCounter (see 6b), so the browser still
  contacts only vliegvuil.nl.
- **One route sees the visitor IP, on purpose:** the Caddy-to-GoatCounter
  localhost route passes `X-Forwarded-For` so GoatCounter can derive the
  country and the session key **in memory**. With `KillSignal=SIGKILL`
  (see 6b) the session key is never written to disk; the IP is never
  stored in the database or logged by either Caddy or GoatCounter. Every
  other route - and the entire ADS-B proxy - still strips the IP.
- **Third-party requests from the browser:** none. The basemap tiles are
  self-hosted at `/tiles/{z}/{x}/{y}.png`; `service.pdok.nl` appears in no
  CSP directive.
  `worker-src 'self' blob:` permits the PWA service worker (`/sw.js`,
  same-origin script) plus MapLibre's blob workers.
- **System logs are a separate thing.** `sshd` logs administrator logins and
  the firewall logging is turned off in the baseline (`ufw logging off`).

Observation from the live server (2026-10-12): Caddy serves the
self-hosted map-glyph `.pbf` files without a `Content-Type` header
(the `verify-caddy-headers.sh` check only asserts it is not HTML;
MapLibre accepts the files regardless). TODO for a later Caddy
update: map `.pbf` to an explicit content type, e.g.
`header /fonts/* Content-Type application/octet-stream`, or register
`application/vnd.mapbox-vector-tile` if the MapLibre docs recommend
it — verify there first.

Verify the header stripping at any time:

```bash
cd /srv/vliegvuil && scripts/verify-caddy-headers.sh "$(command -v caddy)"
```

This spins up a local echo upstream, proxies through Caddy with the same
`header_up` directives, and fails if any client-identifying header or the
test client IP reaches the upstream.

Verify that visitor IPs do not end up in the journal. Open the site from a
device, then check:

```bash
sudo journalctl -u caddy --since "1 hour ago" \
  | grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}' || echo "no IPv4 addresses found"
```

Caddy's error logs can mention client addresses in some situations (for
example failed TLS handshakes; not verified here). If addresses appear, cap
journal retention, for example:

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/10-retention.conf <<'CONF'
[Journal]
MaxRetentionSec=7day
CONF
sudo systemctl restart systemd-journald
```

and update `docs/privacy.md` to describe what is actually logged.

## 6. Rate limiting and micro-cache

| Zone | Key | Limit | Purpose |
|------|-----|-------|---------|
| `static_per_ip` | `{remote_host}` | 120 events / 1 min | SPA and its assets (catch-all only) |
| `api_per_ip` | `{remote_host}` | 60 events / 1 min | `/api/*` proxy |
| `tiles_per_ip` | `{remote_host}` | 600 events / 1 min | `/tiles/*` self-hosted basemap (generous ceiling; cheap cached PNGs) |

The zones are scoped per route: the static zone lives inside the catch-all
handle, so tile requests (dozens per map view) and API polls never eat the
SPA's budget, and vice versa. Before the tiles existed this was not visible:
the site-level zone counted every request, so a 404 flood from missing tiles
could starve the `/api` aircraft poll (429s surfacing as the rate-limit
banner).

The `/api/*` responses are micro-cached for 5 s (`cache { ttl 5s }`, otter
storage), which bounds upstream request pressure regardless of visitor
count. The upstream sends `Cache-Control: no-store`, which would make every
response a cache miss (`Cache-Status: ...; detail=NO-STORE-DIRECTIVE`); the
cache block therefore sets `mode bypass_response` so Souin ignores the
upstream response's cache directives and stores each response for the
5 s TTL (request-side RFC 7234 rules still apply). Note the app polls
roughly every few seconds per visitor; the 60/min zone leaves generous
headroom while capping abuse.

Expected `/api` response headers (what the proxy lets through):

- Kept: `Content-Type`, `Content-Length`, `Date` and Caddy's own headers
  (`Server: Caddy`, the security headers from the site block).
- Stripped (set by the upstream / Cloudflare, removed with `header_down`):
  `nel`, `Report-To`, `Reporting-Endpoints`, `Reporting-To`, every `Cf-*`
  header (`cf-ray`, `cf-cache-status`, ...), `Strict-Transport-Security`,
  `Set-Cookie`, and the upstream's `Server`/`Via`/`X-Powered-By` (Caddy's
  own `Server` header replaces it).
- Added by the cache: `Cache-Status` with a HIT on the second request
  within the 5 s TTL.

HSTS: enabled at the first ramp-up step, `max-age=86400` (one day), via a
`Strict-Transport-Security "max-age=86400"` line in the site-level `header`
block of the `vliegvuil.nl` Caddy site.

- **Current value and why**: one day is the deliberate first step of the
  ramp-up (docs/BUILD.md section 6, "Before 25b"). HSTS is sticky: a broken
  certificate or a bad reload locks browsers out until the max-age ends,
  so the first step is short enough to survive a day of mistakes.
- **includeSubDomains and preload are intentionally off.** Future
  subdomains (for example `stats.` for the GoatCounter dashboard, session
  25c) must serve valid HTTPS over their whole lifetime before
  includeSubDomains is ever considered; with it, a subdomain that drops
  HTTPS becomes unreachable for HSTS-pinned visitors. Preload is out of
  scope until the maintainer explicitly decides.
- **Ramp-up** (a later explicit decision each time, recorded here when it
  changes): 1 week, then 1 month, then longer - raise one step only
  after a clean period without TLS problems at the previous step.
- The site-level header applies to every response of the site block,
  `/api` included (Caddy `header` directives at site level run for all
  requests; the `/api` handler's `header_down -Strict-Transport-Security`
  strips the *upstream's* header inside `reverse_proxy` and does not undo
  the site-level one).

Verification (GET, not HEAD - the upstream answers 405 to HEAD):

```bash
curl -sS -D- -o /dev/null https://vliegvuil.nl/ | grep -i strict-transport
curl -sS -D- -o /dev/null https://vliegvuil.nl/nl/ | grep -i strict-transport
curl -sS -D- -o /dev/null https://vliegvuil.nl/api/lat/52.25/lon/5.0/dist/250 | grep -i strict-transport
```

Expect exactly one `Strict-Transport-Security: max-age=86400` line per
response. (A `/tiles/` URL should carry it too; the tile download is
still in progress, so missing tile files are expected - check a tile
that exists once the tile run completes.)

Verify after deploy (GET, not HEAD: the upstream answers 405 to HEAD):

```bash
URL=https://vliegvuil.nl/api/lat/52.2500/lon/5.0000/dist/250
# First request: expect no nel/report-to/reporting-/cf-*/strict-transport-security
# or set-cookie, and a cache MISS in Cache-Status.
curl -sS -D - -o /dev/null "$URL"
# Second request within 5 s: same headers, and a cache HIT.
curl -sS -D - -o /dev/null "$URL" | grep -iE 'cache-status|nel|report-to|reporting-|cf-|strict-transport-security|set-cookie'
# The grep must print only the Cache-Status HIT line: none of the stripped
# headers may appear. If nothing prints at all, Cache-Status was not sent
# either; investigate before accepting the deploy.
```

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
sudo -u goatcounter sh -c 'mkdir -p /var/lib/goatcounter/db'

# Download the v2.7.0 linux-amd64 binary from the GitHub release:
#   https://github.com/zgoat/goatcounter/releases/tag/v2.7.0
#   (asset: goatcounter-v2.7.0-linux-amd64.gz)
sudo -u goatcounter sh -c '
  gunzip -c /tmp/goatcounter-v2.7.0-linux-amd64.gz > /usr/local/bin/goatcounter
  chmod +x /usr/local/bin/goatcounter
'

# Create the site (the vhost MUST match the Caddy Host header):
sudo -u goatcounter /usr/local/bin/goatcounter db \
  -db sqlite:///var/lib/goatcounter/db/goatcounter.sqlite \
  create site -vhost vliegvuil.nl -user.email=<admin-email>
```

### systemd unit

`/etc/systemd/system/goatcounter.service`:

```ini
[Unit]
Description=GoatCounter analytics (vliegvuil.nl)
After=network.target

[Service]
Type=notify
User=goatcounter
Group=goatcounter
WorkingDirectory=/var/lib/goatcounter
# -listen: loopback ONLY. GoatCounter's RealIP middleware trusts
# X-Forwarded-For/X-Real-Ip with no trusted-proxy setting (verified in
# v2.7.0), so the listener must never be reachable except via Caddy.
# -smtp stdout, no -errors: no mail is sent.
# -ratelimit count: keep the default /count rate limit (4/s).
# NEVER add -debug: the session debug log prints the session key.
# NO -geodb: the country DB is embedded; this flag is only for the
# optional City DB, which we do not use.
KillSignal=SIGKILL
ExecStart=/usr/local/bin/goatcounter serve \
  -listen 127.0.0.1:8091 \
  -db sqlite:///var/lib/goatcounter/db/goatcounter.sqlite \
  -ratelimit count
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
  vacuum): **pending maintainer decision** - propose 730 (2 years); set
  it once and record the chosen value here.
- **Admin 2FA**: enable TOTP (User, Multi-factor authentication).
  v2.7.0 has **no recovery codes** (verified: only enable/disable TOTP
  endpoints exist). If 2FA locks you out, recovery is via the database:
  query the users table and clear totp_secret/totp_enabled for your
  user - then log in and set it up again immediately.

### Verification checklist (run on the VPS; see also privacy.md)

- [ ] systemctl status goatcounter - active, and
      ss -tlnp | grep 8091 shows ONLY 127.0.0.1:8091 (no public
      listener).
- [ ] curl -sSI https://vliegvuil.nl/count.js | head -5 - served from
      the main origin (Caddy proxy).
- [ ] A test visit shows up in the dashboard with a country.
- [ ] Inspect the hits table schema (sqlite3 .schema hits) - no IP
      column; then grep the database file and the journal for the test
      IP: no hit.
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

## 7. Updates

```bash
cd /tmp
sudo -u vliegvuil bash -c '
  cd /srv/vliegvuil
  git pull --ff-only
  pnpm install --frozen-lockfile
  # VITE_ANALYTICS=1: production builds count page views (session 25c)
  VITE_ANALYTICS=1 pnpm --filter web build
'
# Only if the Caddyfile changed in this update:
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If `package.json` changed its `packageManager` pin, reinstall pnpm at the new
version first (§3).

Reload (not restart) keeps the rate-limit state and picks up the new build
without dropping connections.

The build replaces `web/dist` in place, so for the ~15 seconds it takes the
site can serve a half-written app. That is acceptable for now. If it ever
matters, build into a release directory and switch a symlink that the
Caddyfile's `root` points at.

This is also the whole deploy after you merge a data refresh PR. Keep the
server's working tree clean (`git status` should show nothing): if it is
not, `git pull --ff-only` fails, which is the signal that something edited
tracked files on the server.

Rolling back a bad release: revert the pull request on GitHub, then repeat
the commands above.

## 8. Data updates (option C)

The server runs **no data jobs**. Data freshness is handled by GitHub Actions
workflows (session 22c): a scheduled check opens or updates one issue when
upstream datasets changed, and a scheduled or manually dispatched refresh
opens a pull request with the changed snapshots and `sources.json`. You
review and merge the PR, then deploy as in §7.

- The VPS needs no GitHub credential while the repository is public.
- Never run `refresh` on the server: it rewrites tracked files in
  `web/public/data/` and the server would diverge from git.
- Roll back a bad refresh by reverting the data PR on GitHub, then §7.

The `deploy/` timer files were removed from the repository in session 22c
(the workflows replaced them). If you installed them from an earlier
version of this guide, remove them once:

```bash
sudo systemctl disable --now vliegvuil-data-refresh.timer
sudo rm -f /etc/systemd/system/vliegvuil-data-check.service \
           /etc/systemd/system/vliegvuil-data-refresh.service \
           /etc/systemd/system/vliegvuil-data-refresh.timer
sudo systemctl daemon-reload
```

See `docs/data-updates.md` for how the two workflows work and what to
check after the first real run (`workflow_dispatch` with `dry_run`).

## 8b. Self-hosted basemap tiles (BRT-A)

The map background is served from our own origin (`/tiles/{z}/{x}/{y}.png`);
the browser never contacts `service.pdok.nl`. The tiles are a one-time copy
of the PDOK BRT Achtergrondkaart WMTS (CC-BY 4.0, Kadaster; attribution
stays in the app). Expected size: ~769 MB for the app's NL bbox, zoom 6-14
(~80,000 tiles, dry-run sampled 2026-10-12).

First run / refresh (manual, no timers):

```bash
# Estimate first (no full download):
sudo -u vliegvuil node /srv/vliegvuil/scripts/vps-tiles-update.js --dry-run

# Real run: survives an SSH disconnect via systemd-run; ~24 hours at the
# default spread. Log and progress are written inside the tile dir.
sudo systemd-run --unit=vliegvuil-tiles --working-directory=/srv/vliegvuil \
  node /srv/vliegvuil/scripts/vps-tiles-update.js --spread-hours 24
```

Monitor and stop:

```bash
journalctl -u vliegvuil-tiles -f          # progress (also: tiles.new.download.log in /srv/vliegvuil)
systemctl stop vliegvuil-tiles             # clean stop; rerun the same command to resume
```

The download is strictly sequential (one request at a time), spread with
jitter, honours `Retry-After` on 429/503 and slows the rest of the run,
retries with backoff, and aborts after 5 consecutive failures instead of
hammering the server (PDOK Fair Use publishes no numeric rate limit). It is
resumable: existing valid tiles are skipped, safe to Ctrl-C and rerun.

When it finishes it swaps `tiles.new` into `/srv/vliegvuil/tiles`
(keeping `tiles.old` for rollback), then reload Caddy. The swap is
guarded: a partial run — a custom `--min-zoom`/`--max-zoom` range, a
custom `--out`, or any non-404 failure — is NOT swapped in (the live set
stays untouched; the partial set remains in `tiles.new` for a rerun;
the script exits 1). 404s are genuine upstream holes and do not block
the swap: the map falls back to parent tiles for those. State and the
download log are written next to the tile tree (`tiles.new.state.json`,
`tiles.new.download.log` in `/srv/vliegvuil/`), never inside it, so
they are never published under `/tiles/`. The rename pair (live → old,
new → live) is two separate `rename()` calls — POSIX cannot atomically
exchange directories — so there is a sub-millisecond gap where no live
directory exists; Caddy answers 404 for those instants and MapLibre
falls back to parent tiles, so visitors never see a broken map.

```bash
sudo systemctl reload caddy
curl -sSI https://vliegvuil.nl/tiles/8/132/84.png   # 200 + image/png + Cache-Control
```

Rollback: `sudo rm -rf /srv/vliegvuil/tiles && sudo mv /srv/vliegvuil/tiles.old /srv/vliegvuil/tiles && sudo systemctl reload caddy`.

Caddy serves `/tiles/*` with `Cache-Control: public, max-age=604800`, no
directory listing; missing tiles return a quick 404 (no SPA fallback).

Note on the in-app notice ("Kaartachtergrond kon niet geladen worden"):
it appears only for real tile failures (network errors, 5xx), NOT for
404s — MapLibre 4.7 deliberately fires no error event for a 404 tile and
silently falls back to parent tiles (verified in the MapLibre source,
`source_cache.ts`). So during the first download the map quietly shows
the background colour and the planes layer keeps working; no banner
appears until tiles actually fail to load for a non-404 reason.

## 9. Maintenance

- **Caddy security updates.** `apt upgrade` updates only the packaged binary
  (`/usr/bin/caddy.default`); the custom one is **not** updated. Watch
  Caddy's releases, and at least monthly rebuild with the repo script:

  ```bash
  cd /srv/vliegvuil && git pull --ff-only
  sudo scripts/vps-caddy-update.sh
  ```

  The script (in the repo, so it is versioned and CI-checked alongside the
  Caddyfile it installs) builds the custom binary with the SAME pinned
  versions the `validate-caddyfile` CI job uses, and never leaves a broken
  state:

  1. Sources `scripts/caddy-versions.env` — the single source of truth for
     the pins (Caddy v2.11.7, xcaddy v0.4.7, caddy-ratelimit v0.1.0,
     cache-handler v0.17.0, storages/otter v0.0.20), read by both the script
     and `.github/workflows/ci.yml`.
  2. Creates **two temp directories**: a vliegvuil-owned build dir and a
     root-owned work dir (mode 700) — the build runs unprivileged in its
     own dir, and only root copies the finished binary into the work dir.
     A pre-flight check verifies vliegvuil can write to the build dir
     BEFORE the multi-minute build starts.
  3. Builds to the **build dir** (nothing installed yet); root installs the
     binary copy into the root-owned work dir and removes the build copy.
  4. **Validates the new binary against the repo Caddyfile in the work
     dir** — a failed validate aborts before anything is installed.
  5. Backs up the current binary and Caddyfile.
  6. Installs both, then runs `systemctl restart caddy` — a restart, NOT a
     reload: SIGHUP re-reads the Caddyfile but does not swap the running
     binary, so a reload would leave the new build inactive until the next
     restart. The restart briefly drops open connections (a second or two);
     this is NOT zero downtime.
  7. Post-restart check: if caddy is not active, restores the backups,
     restarts again and tells you to investigate if the rollback also fails.

  Both temp directories are removed by an EXIT trap that preserves the
  script's exit status, on success and on failure.

  Each run appends a timestamped `caddy version` line to
  `/var/log/caddy-versions.log` — the record of deployed versions.

  Troubleshooting:

  - `caddy: go build caddy: copying /tmp/go-build.../a.out: open
    /tmp/caddy-build.../caddy.custom.new: permission denied` — the build
    output directory was not writable by `vliegvuil`. This was a real
    failure (observed 2026-10): the script used to hand the unprivileged
    build a root-owned `mktemp` dir (mode 700), so the whole compile
    succeeded and only the final copy failed. The two-directory fix and
    the pre-flight write check above make this impossible; if you still
    see it, check that `sudo -u vliegvuil mktemp -d /tmp/caddy-build.XXXXXX`
    succeeds and that no older script version is being run.

  Notes:

  - `set -euo pipefail` stops at the first failure; because validation runs
    BEFORE anything is installed, a broken build or a failed validate never
    touches the running Caddy.
  - **Pins are the single source of truth.** `scripts/caddy-versions.env` is
    read by BOTH this script and the `validate-caddyfile` CI job (which also
    fails the build when `caddy fmt --diff` would change the Caddyfile).
    When you bump a pin, do it in that one file, in the same PR rebuild the
    VPS binary (`sudo scripts/vps-caddy-update.sh`) — the pins, the
    CI-validated set and the deployed binary always move together.
  - xcaddy itself is pinned too (v0.4.7): the build tool reproduces what CI
    used, not whatever `@latest` ships that day.
  - This is a small piece of infrastructure you own: keep it simple, and
    update it in the same sitting whenever the module set or paths change.
- **Version-lag check.** `apt upgrade` updates `/usr/bin/caddy.default`
  only, so the packaged and custom binaries can drift. To see how far:
  ```bash
  caddy version
  /usr/bin/caddy.default version
  caddy list-modules | grep -E 'rate_limit|cache|otter'
  ```
  `caddy` resolves through `update-alternatives` to the custom binary;
  `caddy list-modules` tells stock from custom in one glance (the custom
  build lists `rate_limit`, `cache` and `otter`; a stock binary does not).
  If `caddy.default` reports a newer version than the custom binary, run
  `sudo scripts/vps-caddy-update.sh` to rebuild the custom binary from the
  repo with the pinned versions (it also re-copies the Caddyfile, validates
  before installing, restarts, and rolls back if the restart check fails).
- **Do not `apt-mark hold caddy`.** The apt package must keep updating:
  it delivers `caddy.default` and Caddy's systemd service files, which the
  custom binary does not replace. The custom binary is updated by the
  script above, not by apt, so holding the package would only freeze the
  fallback binary and the service definitions, defeating the point of
  having both.
- **Reading memory usage.** Judge memory by the `available` column of
  `free -h` (`MemAvailable`), not by `used` or `free`. Linux fills spare RAM
  with reclaimable page cache by design, so a 4 GB VPS that shows only a few
  hundred MB "free" is healthy, not leaking. The long-running processes are
  Caddy and little else; a high `buff/cache` value is expected. Use
  `systemctl status caddy` / `ps -o rss= -C caddy` if you want the actual
  Caddy RSS.
- **Optional: cap Caddy's Go heap.** As a safety net against a future cache
  or module regression growing the Go heap, you can give Caddy a soft memory
  limit with a systemd drop-in. It is not needed today (measured Caddy RSS
  is tens of MB); add it only if you want the guarantee:
  ```bash
  sudo mkdir -p /etc/systemd/system/caddy.service.d
  sudo tee /etc/systemd/system/caddy.service.d/90-gomemlimit.conf >/dev/null <<'CONF'
  [Service]
  Environment=GOMEMLIMIT=1GiB
  CONF
  sudo systemctl daemon-reload
  sudo systemctl restart caddy
  ```
  `GOMEMLIMIT` is a soft limit: the Go garbage collector runs harder as the
  heap approaches it instead of letting it grow without bounds. Pick a
  value well below the VPS RAM (1 GiB on the 4 GB VPS leaves ample room for
  page cache and peaks); if Caddy ever needs more, raise it or remove the
  drop-in.
- **System updates.** Unattended upgrades handle security patches. After
  kernel updates, reboot when `/var/run/reboot-required` exists.
- **Node, Go and pnpm.** Keep Node in line with CI (Node 22), pnpm with the
  `packageManager` pin, and Go with what `xcaddy` needs.
- **State and backups.** The only state on the server is Caddy's TLS data in
  `/var/lib/caddy`, which Caddy recreates on its own. Everything else can be
  rebuilt from git, so the server is disposable: if it breaks, reinstall and
  follow this guide from the top.

## Troubleshooting

```bash
# Validation must pass before every reload
caddy validate --config /etc/caddy/Caddyfile

# Error logs (no access logs exist). HTTP error entries are SCRUBBED:
# no request object (no IP/headers/URI), only status/duration/trace -
# see the global log config at the top of the Caddyfile.
journalctl -u caddy -f
# GoatCounter errors (stderr only; never enable -debug: the session debug
# log prints the session key)
journalctl -u goatcounter -f

# Live checks
curl -sSI https://vliegvuil.nl | head -20
curl -sS https://vliegvuil.nl/api/point/52.37/4.9/5 | head -c 200
```

If `caddy validate` reports an unknown directive (`rate_limit`, `cache`),
you are running the standard distribution instead of the custom binary from
step 1: check `update-alternatives --display caddy`.

If the certificate is not issued, check that the DNS record points at this
server and that ports 80 and 443 are open in both the server firewall and
any provider firewall.

If `pnpm install` fails with "Cannot find matching keyid", something is using
Corepack: remove the Corepack shims (`sudo corepack disable`) and use the
npm-installed pnpm from §3.

If `sudo` rejects an option that works elsewhere, you are on sudo-rs; try the
original with `sudo.ws` to compare.
