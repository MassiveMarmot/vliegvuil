# VliegVuil.nl — Deployment Guide

## Overview

VliegVuil.nl runs on a single OVHcloud VPS (2 vCPU, 4 GB RAM, 40 GB storage). There is no Cloudflare or other
proxy in front: the browser connects directly to Caddy, which serves the
static app and reverse-proxies the ADS-B API on the **same origin**
(`/api/*` → `https://api.adsb.lol/v2/*`). Because the API is same-origin,
CORS is not needed and no CORS headers are sent.

```text
┌───────────────────────────────┐        ┌──────────────────┐
│  Browser                      │        │  adsb.lol API    │
│  https://vliegvuil.nl         │        │  (external)      │
│   ├── static app  ────────────┼──► Caddy ── /api/* ───────►│
│   └── /api/*      (same origin)│  (VPS)  ~5s micro-cache    │
└───────────────────────────────┘        no client IP sent   │
                                         └──────────────────┘
```

Deployment model: git pull from GitHub (read-only deploy key), then build on
the server, by hand. No Docker, no CD pipeline, nothing deploys from GitHub.
Data refreshes arrive as reviewed pull requests (see §8); the server never
runs them.

## Prerequisites

- VPS (Debian stable or Ubuntu LTS) with ports 80/443 open, SSH by key only
- Domain `vliegvuil.nl` with an A record pointing at the server IP
- Go toolchain (for `xcaddy`; any currently supported Go version)
- Node.js and pnpm (for building the web app)
- SSH access

## 0. One-time server setup and hardening (OVHcloud, 2 vCPU / 4 GB / 40 GB)

Run these once on a fresh Debian stable or Ubuntu LTS install, before
anything in the sections below. Order matters: keep one SSH session open
until key-based login is confirmed working.

### 0.1 System basics

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades git curl
sudo dpkg-reconfigure -plow unattended-upgrades
sudo timedatectl set-timezone Europe/Amsterdam
```

### 0.2 SSH: keys only, no root login

Generate a **dedicated key** on your own machine (not a general-purpose
key), e.g. `ssh-keygen -t ed25519 -C "vliegvuil-vps"`, and add the public
half to the instance (in the OVHcloud panel at creation, or into
`~/.ssh/authorized_keys` afterwards). Keeping the private key in a
password manager with SSH-agent support (e.g. KeePassXC) is fine, but the
key is your only way in once password login is off, so also keep a
break-glass path: the OVHcloud web console (KVM) works without SSH.

Then, in `/etc/ssh/sshd_config` (or a drop-in under
`/etc/ssh/sshd_config.d/`):

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

```bash
sudo sshd -t && sudo systemctl restart ssh
```

Leave the current session open and verify login from a **new** terminal
before closing it.

### 0.3 Firewall and brute-force protection

```bash
sudo apt install -y ufw fail2ban
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo systemctl enable --now fail2ban
```

Nothing else is public: no database, no Node listener, no monitoring
port. OVHcloud applies anti-DDoS filtering at its network edge.

### 0.4 Automatic security updates

Enabled in §0.1 (`unattended-upgrades`, security updates only). Verify:

```bash
systemctl is-active unattended-upgrades
sudo tail -5 /var/log/unattended-upgrades/unattended-upgrades.log
```

### 0.5 A second human user (admin) and the service user

Do not run anything as root beyond setup. The app is owned by the
`vliegvuil` user (created in §2); Caddy runs as its packaged service
user. If you want a separate admin account with sudo:

```bash
sudo adduser <your-admin-name>
sudo usermod -aG sudo <your-admin-name>
# install your SSH key for the new user, then test login in a new terminal
```

### 0.6 No access logs, ever

The Caddyfile (§4) deliberately configures no access log, and the
service never logs client IPs. Do not add access logging later without
rewriting `docs/privacy.md` first. OVHcloud's own network-layer
infrastructure logs are outside our control and covered in
`privacy.md`.

### 0.7 Node.js and pnpm

Install Node 22 (the repo's `engines.node`) from NodeSource, then enable
pnpm via corepack:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@10.34.1 --activate
```

(The pnpm version comes from `packageManager` in `package.json`.)

### 0.8 Go toolchain (for the custom Caddy build in §1)

```bash
sudo apt install -y golang-go
```

Any currently supported Go version works for `xcaddy`.

### 0.9 DNS

Point an A record for `vliegvuil.nl` at the instance IPv4 address and an
AAAA record at its IPv6 address. Caddy obtains and renews Let's Encrypt
certificates automatically via the ACME HTTP-01 challenge on port 80.

### 0.10 Post-setup checklist

- [ ] `ssh <admin>@vliegvuil.nl` works with the key, as non-root
- [ ] `ssh -o PreferredAuthentications=password <admin>@vliegvuil.nl` is refused
- [ ] `sudo ufw status` shows only OpenSSH and 80,443/tcp allowed
- [ ] `systemctl is-active fail2ban unattended-upgrades` prints active twice
- [ ] OVHcloud web console login tested once (break-glass path)
- [ ] `ss -tlnp` shows nothing unexpected listening before Caddy starts

Then continue with §1 (custom Caddy build).

## 1. Build Caddy with the required modules

Rate limiting and the micro-cache are **Caddy modules**, not part of the
standard distribution. Build a custom binary once with
[xcaddy](https://github.com/caddyserver/xcaddy):

```bash
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
xcaddy build \
  --with github.com/mholt/caddy-ratelimit \
  --with github.com/caddyserver/cache-handler \
  --with github.com/darkweak/storages/otter/caddy \
  --output /usr/local/bin/caddy
```

Modules used (both Apache-2.0):

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

```bash
# Deploy key (read-only) as the git user
sudo useradd -m -d /srv/vliegvuil vliegvuil || true
sudo -u vliegvuil ssh-keygen -t ed25519 -N '' -f /srv/vliegvuil/.ssh/id_ed25519
# Add /srv/vliegvuil/.ssh/id_ed25519.pub as a read-only deploy key in GitHub

sudo -u vliegvuil git clone git@github.com:MassiveMarmot/vliegvuil.git /srv/vliegvuil
```

## 3. Build the web app

```bash
cd /srv/vliegvuil
pnpm install --frozen-lockfile
pnpm --filter web build
```

The built app ends up in `/srv/vliegvuil/web/dist` — the path the Caddyfile
expects.

## 4. Install the Caddyfile

```bash
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

**Always run `caddy validate` with the custom binary from step 1** — the
standard distribution rejects the `rate_limit` and `cache` directives.

If you use the packaged systemd unit, point `ExecStart` at the custom binary
(`/usr/local/bin/caddy`), then:

```bash
sudo systemctl enable --now caddy
sudo systemctl status caddy
```

## 5. Privacy properties (what to expect)

- **No access logs.** Caddy does not write access logs unless one is
  explicitly configured; the Caddyfile does not configure one. There is no
  `access_log off` directive because that is not valid Caddy syntax — see
  <https://caddyserver.com/docs/caddyfile/directives/log>. Error logs go to
  stderr (visible via `journalctl -u caddy`).
- **No client IP upstream.** All requests to `/api/*` are forwarded with
  `X-Forwarded-For` (and friends) deleted and a fixed
  `User-Agent: VliegVuil.nl/1.0`. adsb.lol never learns the visitor IP.
- **Same-origin API.** `connect-src 'self'` is the whole CSP connect policy;
  there are no third-party API calls and no CORS headers.
- **Only third-party request from the browser:** PDOK tiles
  (`https://service.pdok.nl`), allowed in `img-src`.

Verify the header stripping at any time:

```bash
scripts/verify-caddy-headers.sh /usr/local/bin/caddy
```

This spins up a local echo upstream, proxies through Caddy with the same
`header_up` directives, and fails if any client-identifying header or the
test client IP reaches the upstream.

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
cd /srv/vliegvuil
sudo -u vliegvuil git pull --ff-only
pnpm install --frozen-lockfile
pnpm --filter web build
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Reload (not restart) keeps the rate-limit state and picks up the new build
without dropping connections.

This is also the whole deploy after you merge a data refresh PR. Keep the
server's working tree clean (`git status` should show nothing): if it is
not, `git pull --ff-only` fails, which is the signal that something edited
tracked files on the server.

## 8. Data updates (option C)

The server runs **no data jobs**. Data freshness is handled by GitHub Actions
workflows (session 22c): a scheduled check opens or updates one issue when
upstream datasets changed, and a scheduled or manually dispatched refresh
opens a pull request with the changed snapshots and `sources.json`. You review
and merge the PR, then deploy as in §7.

- The VPS needs no GitHub credential beyond the read-only deploy key.
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
step 1.
