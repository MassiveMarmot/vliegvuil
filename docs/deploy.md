# VliegVuil.nl — Deployment Guide

## Overview

VliegVuil.nl runs on a single Hetzner VPS. There is no Cloudflare or other
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
the server. No Docker, no CD pipeline.

## Prerequisites

- Hetzner VPS (Ubuntu 22.04 LTS or newer) with ports 80/443 open
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
sudo -u vliegvuil git pull
pnpm install --frozen-lockfile
pnpm --filter web build
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Reload (not restart) keeps the rate-limit state and picks up the new build
without dropping connections.

## 8. Data freshness timer (session 22b)

A monthly systemd timer runs the data `check` and then
`refresh all-auto` (airports + aircraft only; noise sources are manual).
Unit files live in `deploy/`:

- `vliegvuil-data-check.service` — runs `pnpm run check`, writes
  `data-build/status/data-status.json`
- `vliegvuil-data-refresh.service` — runs `pnpm run refresh -- all-auto`
  and rebuilds the web app so `dist/` serves the new data
- `vliegvuil-data-refresh.timer` — monthly, 1st of the month 04:00,
  `Persistent=true`

Install (verified with `systemd-analyze verify` against these files):

```bash
sudo cp deploy/vliegvuil-data-check.service \
        deploy/vliegvuil-data-refresh.service \
        deploy/vliegvuil-data-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vliegvuil-data-refresh.timer
```

Failures land in the journal:

```bash
journalctl -u vliegvuil-data-check.service
journalctl -u vliegvuil-data-refresh.service
cat /srv/vliegvuil/data-build/status/data-status.json
```

See `docs/data-updates.md` for how checks and refreshes behave, and for
rolling back a bad refresh from `data-build/previous/`.

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
