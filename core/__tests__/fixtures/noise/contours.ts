// Noise contour test fixtures
// Simplified GeoJSON polygons for testing point-in-polygon noise lookup

import type { NoiseContour, NoiseContours, NoiseKind } from '../../../src/noise/types';

// Simplified Schiphol noise contours (48, 56, 70 dB Lden)
// These are simplified rectangles representing the actual contour areas
// Coordinates: [longitude, latitude] - Note: GeoJSON uses [lon, lat] order

// Schiphol Airport area (approximate center: 52.3086, 4.7639)
// Polygon: array of rings, each ring is array of [lon, lat] points
const SCHIPHOL_48DB: number[][][] = [
  [
    [4.6, 52.2],
    [4.9, 52.2],
    [4.9, 52.4],
    [4.6, 52.4],
    [4.6, 52.2],
  ],
];

const SCHIPHOL_56DB: number[][][] = [
  [
    [4.65, 52.25],
    [4.85, 52.25],
    [4.85, 52.35],
    [4.65, 52.35],
    [4.65, 52.25],
  ],
];

const SCHIPHOL_70DB: number[][][] = [
  [
    [4.7, 52.28],
    [4.8, 52.28],
    [4.8, 52.32],
    [4.7, 52.32],
    [4.7, 52.28],
  ],
];

// Rotterdam The Hague Airport (approximate: 51.965, 4.479)
const ROTTERDAM_48DB: number[][][] = [
  [
    [4.3, 51.9],
    [4.6, 51.9],
    [4.6, 52.0],
    [4.3, 52.0],
    [4.3, 51.9],
  ],
];

const ROTTERDAM_56DB: number[][][] = [
  [
    [4.35, 51.92],
    [4.55, 51.92],
    [4.55, 51.98],
    [4.35, 51.98],
    [4.35, 51.92],
  ],
];

// Eindhoven Airport (approximate: 51.450, 5.373)
const EINDHOVEN_48DB: number[][][] = [
  [
    [5.2, 51.4],
    [5.5, 51.4],
    [5.5, 51.5],
    [5.2, 51.5],
    [5.2, 51.4],
  ],
];

// Multi-polygon example (airport with disconnected noise areas)
// MultiPolygon: array of polygons, each polygon is array of rings, each ring is array of coordinates
const MULTI_POLYGON_CONTOUR: number[][][][] = [
  [
    [
      [4.7, 52.3],
      [4.8, 52.3],
      [4.8, 52.4],
      [4.7, 52.4],
      [4.7, 52.3],
    ],
  ],
  [
    [
      [5.0, 52.3],
      [5.1, 52.3],
      [5.1, 52.4],
      [5.0, 52.4],
      [5.0, 52.3],
    ],
  ],
];

// Helper to create NoiseContour objects
export interface TestNoiseContour {
  airport: string;
  year: number;
  bandLowerDb: number;
  metric: string;
  kind: NoiseKind;
  coordinates: number[][][] | number[][][][];
  geometryType: 'Polygon' | 'MultiPolygon';
  properties: {
    source: string;
    license: string;
    date: string;
  };
}

// Schiphol contours
export const SCHIPHOL_CONTOURS: TestNoiseContour[] = [
  {
    airport: 'Schiphol',
    year: 2024,
    bandLowerDb: 55,
    metric: 'Lden',
    kind: 'actual',
    coordinates: SCHIPHOL_48DB,
    geometryType: 'Polygon',
    properties: {
      source: 'RIVM/Atlas Leefomgeving',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
  {
    airport: 'Schiphol',
    year: 2024,
    bandLowerDb: 60,
    metric: 'Lden',
    kind: 'actual',
    coordinates: SCHIPHOL_56DB,
    geometryType: 'Polygon',
    properties: {
      source: 'RIVM/Atlas Leefomgeving',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
  {
    airport: 'Schiphol',
    year: 2024,
    bandLowerDb: 70,
    metric: 'Lden',
    kind: 'actual',
    coordinates: SCHIPHOL_70DB,
    geometryType: 'Polygon',
    properties: {
      source: 'RIVM/Atlas Leefomgeving',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
];

// Rotterdam contours
export const ROTTERDAM_CONTOURS: TestNoiseContour[] = [
  {
    airport: 'Rotterdam The Hague',
    year: 2024,
    bandLowerDb: 55,
    metric: 'Lden',
    kind: 'actual',
    coordinates: ROTTERDAM_48DB,
    geometryType: 'Polygon',
    properties: {
      source: 'CLO/NLR',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
  {
    airport: 'Rotterdam The Hague',
    year: 2024,
    bandLowerDb: 60,
    metric: 'Lden',
    kind: 'actual',
    coordinates: ROTTERDAM_56DB,
    geometryType: 'Polygon',
    properties: {
      source: 'CLO/NLR',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
];

// Eindhoven contours
export const EINDHOVEN_CONTOURS: TestNoiseContour[] = [
  {
    airport: 'Eindhoven',
    year: 2024,
    bandLowerDb: 56,
    metric: 'Lden',
    kind: 'permitted',
    coordinates: EINDHOVEN_48DB,
    geometryType: 'Polygon',
    properties: {
      source: 'CLO/NLR',
      license: 'CC-BY-4.0',
      date: '2024-01-01',
    },
  },
];

// Multi-polygon contour example
export const MULTI_POLYGON_TEST_CONTOUR: TestNoiseContour = {
  airport: 'Test Airport',
  year: 2024,
  bandLowerDb: 60,
  metric: 'Lden',
  kind: 'actual',
  coordinates: MULTI_POLYGON_CONTOUR,
  geometryType: 'MultiPolygon',
  properties: {
    source: 'Test',
    license: 'CC-BY-4.0',
    date: '2024-01-01',
  },
};

// Convert test fixtures to proper NoiseContour objects
function createNoiseContour(testContour: TestNoiseContour): NoiseContour {
  if (testContour.geometryType === 'Polygon') {
    return {
      airport: testContour.airport,
      year: testContour.year,
      bandLowerDb: testContour.bandLowerDb,
      metric: testContour.metric,
      kind: testContour.kind,
      geometry: {
        type: 'Polygon',
        coordinates: testContour.coordinates as number[][][],
      },
      properties: testContour.properties,
    };
  } else {
    return {
      airport: testContour.airport,
      year: testContour.year,
      bandLowerDb: testContour.bandLowerDb,
      metric: testContour.metric,
      kind: testContour.kind,
      geometry: {
        type: 'MultiPolygon',
        coordinates: testContour.coordinates as number[][][][],
      },
      properties: testContour.properties,
    };
  }
}

// Create NoiseContours collections
export function createSchipholNoiseContours(): NoiseContours {
  return {
    contours: SCHIPHOL_CONTOURS.map(createNoiseContour),
  };
}

export function createRotterdamNoiseContours(): NoiseContours {
  return {
    contours: ROTTERDAM_CONTOURS.map(createNoiseContour),
  };
}

export function createEindhovenNoiseContours(): NoiseContours {
  return {
    contours: EINDHOVEN_CONTOURS.map(createNoiseContour),
  };
}

export function createAllNoiseContours(): NoiseContours {
  return {
    contours: [
      ...SCHIPHOL_CONTOURS,
      ...ROTTERDAM_CONTOURS,
      ...EINDHOVEN_CONTOURS,
    ].map(createNoiseContour),
  };
}

export function createMultiPolygonTestContours(): NoiseContours {
  return {
    contours: [createNoiseContour(MULTI_POLYGON_TEST_CONTOUR)],
  };
}

// Test points - using { x: longitude, y: latitude } for pointInPolygon
// Note: pointInPolygon expects { x, y } where x=longitude, y=latitude
// 
// Contour boundaries:
// SCHIPHOL_70DB: [4.7, 52.28] to [4.8, 52.32]
// SCHIPHOL_56DB: [4.65, 52.25] to [4.85, 52.35]
// SCHIPHOL_48DB: [4.6, 52.2] to [4.9, 52.4]
//
// MULTI_POLYGON_CONTOUR[0]: [4.7, 52.3] to [4.8, 52.4]
// MULTI_POLYGON_CONTOUR[1]: [5.0, 52.3] to [5.1, 52.4]
//
// Point selection:
// - 70 dB only: inside [4.7, 52.28]-[4.8, 52.32] but outside [4.65, 52.25]-[4.85, 52.35] -> impossible, 70 is subset of 56
// - 56 dB only: inside [4.65, 52.25]-[4.85, 52.35] but outside [4.7, 52.28]-[4.8, 52.32]
//   -> e.g., (4.66, 52.26) is in 56 and 48 but not 70
// - 48 dB only: inside [4.6, 52.2]-[4.9, 52.4] but outside [4.65, 52.25]-[4.85, 52.35]
//   -> e.g., (4.62, 52.21) is in 48 but not 56 or 70
export const TEST_POINTS = {
  // Schiphol area
  SCHIPHOL_CENTER: { x: 4.7639, y: 52.3086 },
  SCHIPHOL_INSIDE_70DB: { x: 4.75, y: 52.30 },
  SCHIPHOL_INSIDE_56DB: { x: 4.66, y: 52.26 },
  SCHIPHOL_INSIDE_48DB: { x: 4.62, y: 52.21 },
  SCHIPHOL_OUTSIDE: { x: 5.0, y: 52.5 },

  // Rotterdam area
  ROTTERDAM_CENTER: { x: 4.479, y: 51.965 },
  ROTTERDAM_INSIDE_56DB: { x: 4.45, y: 51.95 },
  ROTTERDAM_OUTSIDE: { x: 4.0, y: 51.5 },

  // Eindhoven area
  EINDHOVEN_CENTER: { x: 5.373, y: 51.450 },
  EINDHOVEN_INSIDE_48DB: { x: 5.4, y: 51.45 },
  EINDHOVEN_OUTSIDE: { x: 5.0, y: 51.0 },

  // Multi-polygon test
  MULTI_POLY_INSIDE_FIRST: { x: 4.75, y: 52.35 },
  MULTI_POLY_INSIDE_SECOND: { x: 5.05, y: 52.35 },
  MULTI_POLY_OUTSIDE: { x: 4.9, y: 52.35 },
};
