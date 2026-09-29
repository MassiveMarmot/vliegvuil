import { describe, it, expect } from 'vitest';
import {
  buildNoiseGeoJson,
  simplifyRing,
  pmtilesCommand,
  noiseGeoJsonToJson,
  DEFAULT_SIMPLIFY,
  type RawContour,
} from '../src/noise';

// Fixture contour: small square around a point, plus noisy precision
const schiphol48: RawContour = {
  airport: 'EHAM',
  year: 2024,
  band: 48,
  metric: 'Lden',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [4.7000000001, 52.2500000003],
        [4.9000000007, 52.2500000011],
        [4.9000000009, 52.4000000002],
        [4.7000000004, 52.4000000008],
        [4.7000000001, 52.2500000003],
      ],
    ],
  },
  source: 'RIVM/Atlas Leefomgeving (TODO: verify)',
  license: 'TODO: verify',
};

const eindhoven56: RawContour = {
  airport: 'EHEH',
  year: 2024,
  band: 56,
  metric: 'Lden',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [5.20, 51.35],
          [5.40, 51.35],
          [5.40, 51.50],
          [5.20, 51.50],
          [5.20, 51.35],
        ],
      ],
    ],
  },
  source: 'CLO/NLR (TODO: verify)',
  license: 'TODO: verify',
  caveat: 'civil traffic only',
};

describe('simplifyRing', (): void => {
  it('rounds coordinates to the given precision', (): void => {
    const ring = [[4.123456789, 52.987654321]];
    const simplified = simplifyRing(ring, { precision: 5, minRingPoints: 0 });
    expect(simplified[0]).toEqual([4.12346, 52.98765]);
  });

  it('removes consecutive duplicate points after rounding', (): void => {
    const ring = [
      [4.100001, 52.100001],
      [4.1000009, 52.1000008], // rounds to the same point
      [4.2000001, 52.2000002],
    ];
    const simplified = simplifyRing(ring, DEFAULT_SIMPLIFY);
    // 2 unique points, plus the closing point appended back to the first
    expect(simplified).toHaveLength(3);
    expect(simplified[0]).toEqual(simplified[2]);
    expect(simplified[0]).not.toEqual(simplified[1]);
  });

  it('closes an open ring', (): void => {
    const ring = [
      [4.1, 52.1],
      [4.2, 52.1],
      [4.2, 52.2],
    ];
    const simplified = simplifyRing(ring, DEFAULT_SIMPLIFY);
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    expect(first).toEqual(last);
  });
});

describe('buildNoiseGeoJson', (): void => {
  it('converts polygons with rounded coordinates and properties', (): void => {
    const { features, warnings } = buildNoiseGeoJson([schiphol48]);
    expect(warnings).toEqual([]);
    expect(features).toHaveLength(1);

    const feature = features[0];
    expect(feature.type).toBe('Feature');
    expect(feature.properties.airport).toBe('EHAM');
    expect(feature.properties.band).toBe(48);
    expect(feature.properties.year).toBe(2024);
    expect(feature.properties.metric).toBe('Lden');
    expect(feature.geometry.type).toBe('Polygon');
  });

  it('keeps the caveat property (Eindhoven civil traffic only)', (): void => {
    const { features } = buildNoiseGeoJson([eindhoven56]);
    expect(features[0]?.properties.caveat).toBe('civil traffic only');
  });

  it('rejects unsupported band levels with a warning', (): void => {
    const bad: RawContour = {
      ...schiphol48,
      band: 55 as unknown as 48,
    };
    const { features, warnings } = buildNoiseGeoJson([bad]);
    expect(features).toHaveLength(0);
    expect(warnings[0]).toContain('Unsupported band');
  });

  it('drops rings that simplify below the minimum point count', (): void => {
    const tiny: RawContour = {
      ...schiphol48,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [4.7, 52.25],
            [4.7, 52.25],
          ],
        ],
      },
    };
    const { features, warnings } = buildNoiseGeoJson([tiny]);
    expect(features).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('pmtilesCommand', (): void => {
  it('returns the documented tippecanoe command', (): void => {
    const cmd = pmtilesCommand('noise-contours.geojson', 'noise-contours.pmtiles');
    expect(cmd).toContain('tippecanoe');
    expect(cmd).toContain('noise-contours.pmtiles');
    expect(cmd).toContain('--layer=noise');
  });
});

describe('noiseGeoJsonToJson', (): void => {
  it('serialises to a valid FeatureCollection', (): void => {
    const { features } = buildNoiseGeoJson([schiphol48, eindhoven56]);
    const parsed = JSON.parse(noiseGeoJsonToJson(features)) as {
      type: string;
      features: unknown[];
    };
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(2);
  });
});
