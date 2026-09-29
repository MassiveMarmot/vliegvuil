# Architecture

## Overview

VliegVuil.nl is a monorepo with three workspaces and a strict layering rule: `/core` is pure TypeScript with no DOM or React, so it can be reused in a future Capacitor native build.

```
┌───────────────────────────────┐
│  /web (React + Vite + MapLibre) │
│    hooks ─ components ─ i18n     │
└──────────────┬────────────────┘
               │ imports types + logic
┌──────────────▼────────────────┐
│  /core (pure TS, no DOM)       │
│    providers / interpolation / │
│    geometry / noise lookup      │
└───────────────────────────────┘
┌───────────────────────────────┐
│  /data-build (Node scripts)    │
│    airports / aircraft / noise │
│    → snapshots → GeoJSON/PMTiles│
└───────────────────────────────┘
```

## Runtime data flow

1. The web app polls its own origin every 5 s for aircraft positions (`useAircraftData`).
2. In production, Caddy reverse-proxies those requests to the adsb.lol API with a ~5 s micro-cache, strips client IP/headers upstream, and rate-limits per IP. In dev, the Vite proxy stands in.
3. Positions go through core's `PositionProvider` interface; `toDisplayAircraft` converts them for the UI, with dead-reckoning interpolation for smooth movement between updates.
4. Noise lookup runs entirely client-side: the app fetches a small GeoJSON contour snapshot (built by `/data-build`) and uses core's point-in-polygon `lookupNoiseBand`.

## Build-time data

`/data-build` scripts produce snapshots committed to the repo (or as release artifacts when large):

- **Airports**: OurAirports trimmed to NL + a status overlay (commercial / military-shared / planned)
- **Aircraft DB**: tar1090-db CSV snapshot (ODC-By-1.0, derived from Mictronics aircraft-database)
- **Noise contours**: RIVM/Atlas Leefomgeving (Schiphol) and CLO/NLR (regional, 2018 & 2024) contours simplified to GeoJSON; large PMTiles are built on the VPS with tippecanoe and gitignored

Every snapshot records its source, licence, and date in `sources.json`, which also feeds the in-app attribution page.

## Key decisions

- **Provider interface**: adsb.lol sits behind `PositionProvider` so fallbacks (adsb.fi, airplanes.live, OpenSky) can be added without UI changes.
- **Client-side noise lookup**: avoids a spatial backend; contours are small enough for in-browser point-in-polygon.
- **Eindhoven civil contours**: civil Lden chosen over military Ke contours; labelled "civil traffic only" in the UI.
- **PWA app shell only**: offline caching covers the shell, not live data — the app is honest about needing a connection for positions.
- **Ambient state**: app-level state is plain React state; Zustand is available if state grows.

## Testing

Each module ships with Vitest tests: core (providers, interpolation, geometry, noise), web (components, hooks), data-build (snapshot builders). CI runs lint, typecheck (building core first), and tests on every PR.
