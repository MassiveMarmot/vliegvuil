// Geometry types

export interface Point {
  x: number;
  y: number;
}

export interface Polygon {
  coordinates: number[][];
}

export interface MultiPolygon {
  coordinates: number[][][];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: Record<string, unknown>;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
