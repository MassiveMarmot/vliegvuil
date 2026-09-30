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
