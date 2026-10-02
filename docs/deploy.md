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

To build against a known Caddy version instead of the latest one, pin it
(`xcaddy build <caddy-version> --with module@<version>`) and record the
versions you deployed.

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
  pnpm --filter web build
'
```

The built app ends up in `/srv/vliegvuil/web/dist` — the path the Caddyfile
expects. Later sessions add build-time variables (for example
`VITE_SITE_ORIGIN`); document them here when they exist.

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

### Temporary preview before the domain is registered

The reload above cannot succeed until the domain is registered and its DNS
records point at the server (Caddy cannot obtain a certificate without it).
To preview the built app before that, append a temporary plain-HTTP site
block for the provider hostname (here `<vps-hostname>`, e.g.
`vps-xxxxxxx.vps.ovh.net`) to the running Caddyfile:

```bash
sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'CONF'

# TEMPORARY: preview on the provider hostname until the domain is
# registered. Remove this block after the domain go-live (see below).
http://<vps-hostname> {
	root * /srv/vliegvuil/web/dist
	try_files {path} /index.html
	file_server
	encode zstd gzip

	handle /api/* {
		uri strip_prefix /api
		reverse_proxy https://opendata.adsb.fi {
			header_up -X-Forwarded-For
			header_up -X-Real-IP
			header_up -X-Forwarded-Proto
			header_up -X-Forwarded-Host
			header_up User-Agent "VliegVuil.nl/1.0 (+https://vliegvuil.nl)"
			header_up Accept "application/json"
			header_down -Server
			header_down -Via
			header_down -X-Powered-By
		}
	}
}
CONF

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The preview is then reachable at `http://<vps-hostname>`. Notes:

- The `http://` prefix forces plain HTTP, so Caddy does not attempt any
  certificate issuance for the provider hostname; the browser shows a
  "not secure" warning, which is expected for a preview.
- The block deliberately omits `rate_limit`, `cache` and the security
  headers: rate-limit zones are global in caddy-ratelimit (re-declaring
  them in a second block can conflict), and the headers matter for the
  real site, not the preview.
- The API proxy is included so the map loads live aircraft.
- `caddy validate` may warn that the Caddyfile input is not formatted; that
  comes from appending to a file and is cosmetic. Do not run
  `caddy fmt --overwrite` here — it would reformat the whole file.
- While this block exists the app is publicly reachable at the provider
  hostname over HTTP. That is usually acceptable (the repository is
  public), but the preview is not private.

**Remove the temporary block at the domain go-live** by copying the repo's
Caddyfile back over it — the normal §4 install sequence, which also picks up
the certificate on the reload:

```bash
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 5. Privacy properties (what to expect)

- **No access logs.** Caddy does not write access logs unless one is
  explicitly configured; the Caddyfile does not configure one. There is no
  `access_log off` directive because that is not valid Caddy syntax — see
  <https://caddyserver.com/docs/caddyfile/directives/log>. Error logs go to
  stderr (visible via `journalctl -u caddy`).
- **No client IP upstream.** All requests to `/api/*` are forwarded with
  `X-Forwarded-For` (and friends) deleted and a fixed
  `User-Agent: VliegVuil.nl/1.0 (+https://vliegvuil.nl)`. adsb.fi never
  learns the visitor IP.
- **Same-origin API.** `connect-src 'self'` is the whole CSP connect policy;
  there are no third-party API calls and no CORS headers.
- **Only third-party request from the browser:** PDOK tiles
  (`https://service.pdok.nl`), allowed in `img-src`.
- **System logs are a separate thing.** `sshd` logs administrator logins and
  the firewall logging is turned off in the baseline (`ufw logging off`).

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
| `static_per_ip` | `{remote_host}` | 120 events / 1 min | Static assets |
| `api_per_ip` | `{remote_host}` | 60 events / 1 min | `/api/*` proxy |

The `/api/*` responses are micro-cached for 5 s (`cache { ttl 5s }`, otter
storage), which bounds upstream request pressure regardless of visitor
count. Note the app polls roughly every few seconds per visitor; the 60/min
zone leaves generous headroom while capping abuse.

## 7. Updates

```bash
cd /tmp
sudo -u vliegvuil bash -c '
  cd /srv/vliegvuil
  git pull --ff-only
  pnpm install --frozen-lockfile
  pnpm --filter web build
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

If you installed the retired systemd timer from an earlier version of this
guide, remove it:

```bash
sudo systemctl disable --now vliegvuil-data-refresh.timer
sudo rm -f /etc/systemd/system/vliegvuil-data-check.service \
           /etc/systemd/system/vliegvuil-data-refresh.service \
           /etc/systemd/system/vliegvuil-data-refresh.timer
sudo systemctl daemon-reload
```

Until session 22c is merged, run `check` and `refresh` on your own machine,
commit the result to a branch and open a PR by hand. See
`docs/data-updates.md`.

## 9. Maintenance

- **Caddy security updates.** `apt upgrade` updates only the packaged binary
  (`/usr/bin/caddy.default`); the custom one is **not** updated. Watch
  Caddy's releases, and at least monthly rebuild with step 1b, then:

  ```bash
  sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
  sudo chown root:root /usr/bin/caddy.custom && sudo chmod 755 /usr/bin/caddy.custom
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl restart caddy
  caddy version
  ```

  Record the Caddy and module versions you deployed.

  **The whole rebuild as one command.** To make the monthly rebuild low-effort
  and mistake-proof, wrap it in a script. Create it once:

  ```bash
  sudo tee /usr/local/sbin/rebuild-caddy >/dev/null <<'SCRIPT'
  #!/usr/bin/env bash
  set -euo pipefail
  cd /tmp

  sudo -u vliegvuil bash -c '
    go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
    cd ~ && ~/go/bin/xcaddy build \
      --with github.com/mholt/caddy-ratelimit \
      --with github.com/caddyserver/cache-handler \
      --with github.com/darkweak/storages/otter/caddy
  '

  sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
  sudo chown root:root /usr/bin/caddy.custom
  sudo chmod 755 /usr/bin/caddy.custom
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl restart caddy

  echo "$(date -Is)  $(/usr/bin/caddy.custom version)" | tee -a /var/log/caddy-versions.log
  echo "Deployed: $(/usr/bin/caddy.custom version)"
  SCRIPT
  sudo chmod 755 /usr/local/sbin/rebuild-caddy
  ```

  The monthly rebuild is then a single command:

  ```bash
  sudo rebuild-caddy
  ```

  Notes on the script:

  - `set -euo pipefail` stops before the restart if the build or `caddy
    validate` fails, so a broken build cannot take down the running Caddy.
    Validation runs after the swap but before the restart; during a routine
    rebuild the config does not change, so a failure there indicates a module
    incompatibility — exactly what you want caught before restarting.
  - Each run appends a timestamped `caddy version` line to
    `/var/log/caddy-versions.log`, which is the record of deployed versions
    this section asks for.
  - The script builds `@latest` (no pinned versions). That is the
    set-and-forget choice: security fixes arrive automatically and no
    bookkeeping is needed. The trade-off is that each rebuild silently jumps
    to the newest Caddy and module versions; if you ever need change
    control, pin versions in the `xcaddy build` command instead.
  - This is a small piece of infrastructure you own: keep it simple, and
    update it in the same sitting whenever the module set or paths change.
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

# Error logs (no access logs exist)
journalctl -u caddy -f

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
