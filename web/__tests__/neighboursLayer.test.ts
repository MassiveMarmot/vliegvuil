// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useMap } from '../src/hooks/useMap';

describe('neighbours context layer', () => {
  const geojsonPath = resolve(__dirname, '../public/data/neighbours.geojson');

  it('ships a valid FeatureCollection with country features', () => {
    const gj = JSON.parse(readFileSync(geojsonPath, 'utf-8')) as {
      type: string;
      features: Array<{ properties: { name?: string } }>;
    };
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.features.length).toBeGreaterThan(5);
    const names = gj.features.map((f) => f.properties.name);
    for (const expected of ['Belgium', 'Germany', 'United Kingdom', 'Denmark']) {
      expect(names).toContain(expected);
    }
  });

  it('excludes the Netherlands itself (PDOK BRT covers it)', () => {
    const gj = JSON.parse(readFileSync(geojsonPath, 'utf-8')) as {
      features: Array<{ properties: { name?: string; adm0_a3?: string } }>;
    };
    const codes = gj.features.map((f) => f.properties.adm0_a3);
    expect(codes).not.toContain('NLD');
  });

  it('is small enough to commit (< 2 MB repo cap)', () => {
    const bytes = readFileSync(geojsonPath).byteLength;
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('is wired into the map hook module', () => {
    const source = readFileSync(resolve(__dirname, '../src/hooks/useMap.ts'), 'utf-8');
    expect(source).toContain("data: NEIGHBOURS_GEOJSON_URL");
    expect(source).toContain('neighbours-fill');
    expect(source).toContain('neighbours-border');
    // the context layers must render below the PDOK raster
    expect(source.indexOf('neighbours-fill')).toBeLessThan(
      source.indexOf('pdok-brt-layer'),
    );
  });

  it('useMap is exported (smoke check for the hook module)', () => {
    expect(typeof useMap).toBe('function');
  });
});
