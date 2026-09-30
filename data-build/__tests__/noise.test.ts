import { describe, it, expect } from 'vitest';
import {
  buildNoiseGeoJson,
  simplifyRing,
  pmtilesCommand,
  noiseGeoJsonToJson,
  endWfsToRawContours,
  END_CATEGORY_TO_BAND,
  DEFAULT_SIMPLIFY,
  type RawContour,
} from '../src/noise';

// Fixture contour: small square around a point, plus noisy precision
const schiphol55: RawContour = {
  airport: 'EHAM',
  year: 2021,
  bandLowerDb: 55,
  metric: 'Lden',
  kind: 'actual',
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
  source: 'RIVM/CVGG — EU END 2021 noise contours',
  license: 'CC0-1.0',
};

const eindhoven56: RawContour = {
  airport: 'EHEH',
  year: 2024,
  bandLowerDb: 56,
  metric: 'Lden',
  kind: 'permitted',
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
  source: 'CLO/NLR',
  license: 'CC-BY-4.0',
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

describe('END_CATEGORY_TO_BAND', (): void => {
  it('maps the verified END 2021 categories to band lower bounds', (): void => {
    expect(END_CATEGORY_TO_BAND).toEqual({
      Lden5559: 55,
      Lden6064: 60,
      Lden6569: 65,
      Lden7074: 70,
      LdenGreaterThan75: 75,
    });
  });
});

describe('endWfsToRawContours', (): void => {
  it('converts real-shaped END WFS features into raw contours', (): void => {
    const fc = {
      features: [
        {
          properties: { gml_id: 'FEATURE_a', category: 'Lden5559', source: 'majorAirportsIncludingAgglomeration', id: 1 },
          geometry: { type: 'Polygon', coordinates: [[[4.7, 52.25], [4.9, 52.25], [4.9, 52.4], [4.7, 52.4], [4.7, 52.25]]] },
        },
      ],
    };
    const { contours, warnings } = endWfsToRawContours(fc, 'src', 'CC0-1.0', 2021, 'Schiphol');
    expect(warnings).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]?.bandLowerDb).toBe(55);
    expect(contours[0]?.kind).toBe('actual');
    expect(contours[0]?.airport).toBe('Schiphol');
  });

  it('warns and skips unknown categories instead of guessing', (): void => {
    const fc = {
      features: [
        { properties: { category: 'Lden4047' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      ],
    };
    const { contours, warnings } = endWfsToRawContours(fc, 'src', 'CC0-1.0', 2021, 'Schiphol');
    expect(contours).toHaveLength(0);
    expect(warnings[0]).toContain('Unknown END category');
  });
});

describe('buildNoiseGeoJson', (): void => {
  it('converts polygons with rounded coordinates and properties', (): void => {
    const { features, warnings } = buildNoiseGeoJson([schiphol55]);
    expect(warnings).toEqual([]);
    expect(features).toHaveLength(1);
    const feature = features[0];
    expect(feature.type).toBe('Feature');
    expect(feature.properties.airport).toBe('EHAM');
    expect(feature.properties.bandLowerDb).toBe(55);
    expect(feature.properties.year).toBe(2021);
    expect(feature.properties.metric).toBe('Lden');
    expect(feature.properties.kind).toBe('actual');
    expect(feature.geometry.type).toBe('Polygon');
  });

  it('keeps the caveat property (Eindhoven civil traffic only)', (): void => {
    const { features } = buildNoiseGeoJson([eindhoven56]);
    expect(features[0]?.properties.caveat).toBe('civil traffic only');
  });

  it('rejects out-of-range band lower bounds with a warning', (): void => {
    const bad: RawContour = {
      ...schiphol55,
      bandLowerDb: 12,
    };
    const { features, warnings } = buildNoiseGeoJson([bad]);
    expect(features).toHaveLength(0);
    expect(warnings[0]).toContain('Unsupported band lower bound');
  });

  it('drops rings that simplify below the minimum point count', (): void => {
    const tiny: RawContour = {
      ...schiphol55,
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
    expect(pmtilesCommand('noise-contours.geojson', 'noise-contours.pmtiles')).toBe(
      'tippecanoe -o noise-contours.pmtiles --no-tile-size-limit --minimum-zoom=8 --maximum-zoom=14 --layer=noise noise-contours.geojson',
    );
  });
});

describe('noiseGeoJsonToJson', (): void => {
  it('serialises a FeatureCollection', (): void => {
    const { features } = buildNoiseGeoJson([schiphol55]);
    const json = JSON.parse(noiseGeoJsonToJson(features));
    expect(json.type).toBe('FeatureCollection');
    expect(json.features).toHaveLength(1);
  });
});
