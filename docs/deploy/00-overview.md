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

