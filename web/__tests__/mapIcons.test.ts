// Tests for session 17: altitude-band icons and PDOK basemap URL
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALTITUDE_BANDS,
  SELECTED_ICON_ID,
  getAircraftColor,
  iconIdForAircraft,
  registerAircraftIcons,
} from '../src/components/aircraftIcons';
import { planeRotationForHeading } from '../src/mapIconRenderer';
import {
  PDOK_BRT_TILE_URL,
  PDOK_BRT_ATTRIBUTION,
  getBasemapUrl,
} from '../src/types';

describe('altitude band icons', () => {
  it('maps altitudes to band icons', () => {
    expect(iconIdForAircraft(0, false)).toBe('airplane-low');
    expect(iconIdForAircraft(4999, false)).toBe('airplane-low');
    expect(iconIdForAircraft(5000, false)).toBe('airplane-mid');
    expect(iconIdForAircraft(9999, false)).toBe('airplane-mid');
    expect(iconIdForAircraft(10000, false)).toBe('airplane-high');
    expect(iconIdForAircraft(20000, false)).toBe('airplane-veryhigh');
    expect(iconIdForAircraft(41000, false)).toBe('airplane-veryhigh');
  });

  it('maps ground and unknown aircraft to the ground icon', () => {
    expect(iconIdForAircraft(1234, true)).toBe('airplane-ground');
    expect(iconIdForAircraft(null, false)).toBe('airplane-ground');
  });

  it('registers one image per band plus the selected variant', () => {
    const added: string[] = [];
    const map = {
      hasImage: (id: string): boolean => false,
      addImage: (id: string): void => {
        added.push(id);
      },
    };
    registerAircraftIcons(map as unknown as Parameters<typeof registerAircraftIcons>[0]);
    expect(added).toHaveLength(ALTITUDE_BANDS.length + 1);
    for (const band of ALTITUDE_BANDS) {
      expect(added).toContain(band.id);
    }
    expect(added).toContain(SELECTED_ICON_ID);
  });

  // The Lucide plane's nose points north-east (45), so the layer rotates
  // the icon by heading - 45, wrapped into [0, 360).
  it('rotates the plane icon by heading minus 45 degrees', () => {
    expect(planeRotationForHeading(0)).toBe(315);
    expect(planeRotationForHeading(45)).toBe(0);
    expect(planeRotationForHeading(90)).toBe(45);
    expect(planeRotationForHeading(180)).toBe(135);
    expect(planeRotationForHeading(359)).toBe(314);
  });
  it('wraps the rotation around 0/360', () => {
    expect(planeRotationForHeading(0)).toBe(315);
    expect(planeRotationForHeading(360)).toBe(315);
    expect(planeRotationForHeading(405)).toBe(0);
    expect(planeRotationForHeading(-45)).toBe(270);
    for (let h = -720; h <= 720; h += 15) {
      const r = planeRotationForHeading(h);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });

  it('keeps band colours consistent with getAircraftColor', () => {
    expect(getAircraftColor(1000)).toBe('#008a00');
    expect(getAircraftColor(6000)).toBe('#a67c00');
    expect(getAircraftColor(15000)).toBe('#d95a00');
    expect(getAircraftColor(30000)).toBe('#d31a1a');
    expect(getAircraftColor(null)).toBe('#808080');
  });
});

describe('basemap', () => {
  it('serves the BRT-A tiles from our own origin (self-hosted)', () => {
    expect(PDOK_BRT_TILE_URL).toBe('/tiles/{z}/{x}/{y}.png');
    // The browser must never contact the PDOK tile host
    expect(PDOK_BRT_TILE_URL).not.toContain('service.pdok.nl');
    expect(PDOK_BRT_TILE_URL).not.toContain('nationaalgeoregister');
  });
  it('defaults to the self-hosted tiles when no override is configured', () => {
    expect(getBasemapUrl()).toBe(PDOK_BRT_TILE_URL);
  });
  it('keeps the Kadaster attribution (BRT-A is CC-BY 4.0)', () => {
    expect(PDOK_BRT_ATTRIBUTION).toContain('PDOK');
    expect(PDOK_BRT_ATTRIBUTION).toContain('Kadaster');
  });
  it('the shipped CSP no longer allows service.pdok.nl', () => {
    // Regression: nothing should need the PDOK origin any more
    const caddy = readFileSync(resolve(__dirname, '..', '..', 'Caddyfile'), 'utf8');
    const csp = /Content-Security-Policy "([^"]+)"/.exec(caddy)?.[1] ?? '';
    expect(csp).not.toContain('service.pdok.nl');
    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });
});
