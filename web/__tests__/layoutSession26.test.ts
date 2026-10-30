// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 26 layout assertions: the compass (MapLibre NavigationControl,
// top-right, inside the map region below the header) must not overlap the
// header (top bar), noise legend/toggle (bottom-right), telemetry panel
// (bottom-right), airport popup (bottom-center) or the flight counter
// (bottom-left) at 320/360/375 px. jsdom has no layout engine, so this
// asserts the CSS geometry rules that determine those boxes — a geometry
// test, not a rendered-pixels test. Plus a guard for the aircraft icon
// rotation semantics (symbolRotate keeps its rotate-with-map alignment so
// icons keep their true heading on a rotated map).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
const mapSource = readFileSync(resolve(__dirname, '..', 'src', 'components', 'Map.tsx'), 'utf8');
const useMapSource = readFileSync(resolve(__dirname, '..', 'src', 'hooks', 'useMap.ts'), 'utf8');

function rule(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  return re.exec(css)?.[1] ?? '';
}

describe('session 26 layout: compass never overlaps the other chrome', (): void => {
  it('the compass is anchored top-right inside the map region (below the header)', (): void => {
    expect(useMapSource).toContain("addControl(compassControl, 'top-right')");
  });

  it('the header is a top bar; the map region (compass anchor) starts below it', (): void => {
    // .app-header is in normal flow (position: relative, no bottom edge),
    // and the map region is its flex sibling: nothing MapLibre anchors can
    // reach the header bar.
    const header = rule('.app-header');
    expect(header).toMatch(/position:\s*relative/);
    expect(header).not.toMatch(/position:\s*fixed/);
    // No bottom OFFSET (border-bottom is fine); the header bar has no
    // footprint inside the map region.
    expect(header).not.toMatch(/(^|;)\s*bottom:/);
  });

  it('every other chrome element is anchored in a different corner than top-right', (): void => {
    // Noise overlay (toggle + legend): bottom-right
    expect(rule('.noise-overlay')).toMatch(/bottom:\s*1rem/);
    expect(rule('.noise-overlay')).toMatch(/right:\s*1rem/);
    // Telemetry panel: bottom-right
    expect(rule('.telemetry-panel')).toMatch(/bottom:\s*1rem/);
    expect(rule('.telemetry-panel')).toMatch(/right:\s*1rem/);
    // Flight counter (map-status): bottom-left
    expect(rule('.map-status')).toMatch(/bottom:\s*1rem/);
    expect(rule('.map-status')).toMatch(/left:\s*1rem/);
    // Airport popup: bottom-center
    expect(rule('.airport-popup')).toMatch(/left:\s*50%/);
    expect(rule('.airport-popup')).toMatch(/bottom:\s*4\.5rem/);
    // Aircraft list pop-out: bottom-left, above the counter
    expect(rule('.aircraft-list')).toMatch(/bottom:\s*4rem/);
    expect(rule('.aircraft-list')).toMatch(/left:\s*1rem/);
  });

  it('at the narrow widths (max-width: 768px block covers 320/360/375 px) chrome stays out of the top-right corner', (): void => {
    const mobile = /@media \(max-width: 768px\)\s*\{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? '';
    // The list pop-out goes near-full-bleed but stays above the counter;
    // the counter and list stay left-anchored; nothing claims the
    // compass's top-right corner.
    expect(mobile).toMatch(/\.aircraft-list\s*\{[^}]*bottom:\s*3\.5rem/);
    expect(mobile).toMatch(/\.aircraft-list\s*\{[^}]*left:\s*0\.5rem/);
    expect(mobile).not.toMatch(/\.map-status\s*\{[^}]*right/);
    expect(mobile).not.toMatch(/top-right/);
  });
});

describe('session 26: aircraft icons keep their true heading while rotated', (): void => {
  it('the symbol layer uses icon-rotation-alignment "map" (rotate-with-map)', (): void => {
    // Verified against the installed maplibre-gl 6.14.0 source: for point
    // symbols, rotationAlignment === "map" sets rotateWithMap (drawLayer
    // symbols, maplibre-gl-dev.mjs:49925) and the projected icon plane is
    // rotated by the map bearing (line 40809) — the icon turns WITH the
    // map, so icon-rotate (heading - 45) stays relative to map north and
    // the nose keeps pointing at the true heading on a rotated map.
    expect(mapSource).toContain("'icon-rotation-alignment': 'map'");
    expect(mapSource).toContain("'icon-rotate': ['get', 'symbolRotate']");
  });

  it('pitch is disabled so the compass never needs to reset tilt', (): void => {
    expect(useMapSource).toContain('maxPitch: 0');
  });
});

describe('maplibre stylesheet import (invisible-compass fix): control geometry', (): void => {
  it('the compass chrome override keeps the app palette (anchor stays MapLibre\'s own top-right)', (): void => {
    // The header is in normal flow above the map region (asserted above:
    // position: relative, no bottom edge), so MapLibre's top:0 anchor
    // inside .map-container is already below the header bar — no extra
    // offset needed. The library's own corner rule is pinned in
    // maplibreStylesheet.test.ts (built CSS). Here: our override.
    const group = rule('.maplibregl-ctrl-top-right .maplibregl-ctrl-group');
    expect(group).toMatch(/border-radius:\s*10px/);
  });

  it('the attribution control moves to bottom-center, clear of the noise legend, telemetry panel and counter', (): void => {
    // MapLibre anchors the attribution bottom-right by default — the same
    // corner as .noise-overlay and .telemetry-panel. Our override moves
    // it to the bottom-center; the airport popup sits higher
    // (bottom: 4.5rem), so no overlap at 320/360/375 px either. The
    // corner rule uses a two-selector list, so match it directly.
    expect(css).toMatch(
      /\.maplibregl-ctrl-bottom-right,\s*\.maplibregl-ctrl-bottom-left\s*\{[^}]*left:\s*50%[^}]*bottom:\s*0\.25rem[^}]*transform:\s*translateX\(-50%\)/
    );
    expect(css).toMatch(
      /\.maplibregl-ctrl-bottom-right,\s*\.maplibregl-ctrl-bottom-left\s*\{[^}]*right:\s*auto/
    );
    // Still visible (required PDOK/Kadaster attribution): not display:none
    expect(rule('.maplibregl-ctrl-attrib')).not.toMatch(/display:\s*none/);
  });
});

describe('WebGL canvas stacking (Firefox nightly regression, 2026-10-30)', (): void => {
  it('the map container is an explicit z-index:0 stacking context', (): void => {
    // Firefox Nightly 159 + radeonsi hoisted the accelerated canvas
    // layer above the positioned page chrome (counter, noise toggle)
    // once the map started presenting — elementFromPoint returned the
    // canvas at the chrome's positions. An explicit z-index:0 +
    // isolation on the container pins the canvas (and MapLibre's
    // controls) inside one stacking context, so it can never order
    // against the page chrome across the container boundary.
    const container = rule('.map-container');
    expect(container).toMatch(/position:\s*relative/);
    expect(container).toMatch(/z-index:\s*0/);
    expect(container).toMatch(/isolation:\s*isolate/);
    // The page chrome keeps its higher z-indexes in the parent context
    expect(rule('.map-status')).toMatch(/z-index:\s*10/);
    expect(rule('.noise-overlay')).toMatch(/z-index:\s*20/);
  });

  it('the basemap source declares the real tile zoom range (no phantom tiles)', (): void => {
    // The self-hosted tile tree is z6-14 only; the raster source used
    // to declare 0-22, so MapLibre requested z0-5 tiles that always
    // 404 (and each 404 trips the non-blocking tile-error notice).
    expect(useMapSource).toContain(
      'minzoom: DEFAULT_MAP_CONFIG.minZoom,\n              maxzoom: DEFAULT_MAP_CONFIG.maxZoom'
    );
  });
});

describe('compass compositing hint (Firefox canvas-hoist follow-up, PR #124)', (): void => {
  it('the compass corner carries will-change:transform (own composited layer)', (): void => {
    // PR #124 isolated the map container, fixing the page chrome, but the
    // compass is INSIDE the container next to the WebGL canvas and stayed
    // buried under the hoisted canvas layer on the affected Firefox
    // nightly + radeonsi. will-change:transform promotes the corner onto
    // its own composited layer; the library already provides the corner's
    // position:absolute + z-index:2 (pinned in maplibreStylesheet.test.ts).
    expect(rule('.maplibregl-ctrl-top-right')).toMatch(/will-change:\s*transform/);
  });
});
