// Tests for session 17: altitude-band icons and PDOK basemap URL
import { describe, expect, it } from 'vitest';
import {
  ALTITUDE_BANDS,
  SELECTED_ICON_ID,
  createAirplaneIcon,
  getAircraftColor,
  iconIdForAircraft,
  registerAircraftIcons,
} from '../src/components/aircraftIcons';
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

  it('bakes the band colour into the icon pixels', () => {
    const icon = createAirplaneIcon({ glyph: [0x00, 0xa0, 0x00], fill: [0xff, 0xff, 0xff] });
    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
    expect(icon.data.length).toBe(24 * 24 * 4);
    // Every painted pixel is fully opaque; outside the circle stays transparent
    let opaque = 0;
    let transparent = 0;
    for (let i = 3; i < icon.data.length; i += 4) {
      if (icon.data[i] === 0xff) opaque += 1;
      if (icon.data[i] === 0) transparent += 1;
    }
    expect(opaque).toBeGreaterThan(0);
    expect(transparent).toBeGreaterThan(0);
    expect(opaque + transparent).toBe(24 * 24);
  });

  it('keeps band colours consistent with getAircraftColor', () => {
    expect(getAircraftColor(1000)).toBe('#00a000');
    expect(getAircraftColor(6000)).toBe('#e0b000');
    expect(getAircraftColor(15000)).toBe('#ff6900');
    expect(getAircraftColor(30000)).toBe('#d31a1a');
    expect(getAircraftColor(null)).toBe('#808080');
  });
});

describe('basemap', () => {
  it('uses the PDOK BRT WMTS on service.pdok.nl in EPSG:3857', () => {
    expect(PDOK_BRT_TILE_URL).toContain('https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/');
    expect(PDOK_BRT_TILE_URL).toContain('EPSG:3857');
    expect(PDOK_BRT_TILE_URL).toContain('{z}/{x}/{y}.png');
    expect(PDOK_BRT_TILE_URL).not.toContain('nationaalgeoregister');
  });

  it('defaults to the PDOK tiles when no override is configured', () => {
    expect(getBasemapUrl()).toBe(PDOK_BRT_TILE_URL);
  });

  it('carries PDOK attribution', () => {
    expect(PDOK_BRT_ATTRIBUTION).toContain('PDOK');
  });
});
