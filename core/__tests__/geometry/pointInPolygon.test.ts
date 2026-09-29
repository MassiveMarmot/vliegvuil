// Tests for point-in-polygon algorithm
import { describe, expect, it } from 'vitest';
import { pointInPolygon, pointInMultiPolygon } from '../../src/geometry/pointInPolygon';
import type { Point, Polygon } from '../../src/geometry/types';

describe('pointInPolygon', () => {
  it('should detect point inside simple square polygon', () => {
    const polygon: Polygon = {
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    };

    // Point inside
    expect(pointInPolygon({ x: 5, y: 5 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 1, y: 1 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 9, y: 9 }, polygon)).toBe(true);

    // Point outside
    expect(pointInPolygon({ x: 11, y: 5 }, polygon)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 11 }, polygon)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, polygon)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, polygon)).toBe(false);
  });

  it('should detect point inside triangle polygon', () => {
    const polygon: Polygon = {
      coordinates: [
        [0, 0],
        [10, 0],
        [5, 10],
      ],
    };

    expect(pointInPolygon({ x: 5, y: 5 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 2 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 2 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 11 }, polygon)).toBe(false);
  });

  it('should detect point inside complex polygon', () => {
    // Netherlands-like shape (simplified)
    const polygon: Polygon = {
      coordinates: [
        [50.5, 2.5],
        [50.5, 7.5],
        [54.0, 7.5],
        [54.0, 2.5],
      ],
    };

    // Amsterdam area
    expect(pointInPolygon({ x: 52.3086, y: 4.7639 }, polygon)).toBe(true);
    // Rotterdam area
    expect(pointInPolygon({ x: 51.965, y: 4.479 }, polygon)).toBe(true);
    // Outside Netherlands
    expect(pointInPolygon({ x: 55.0, y: 5.0 }, polygon)).toBe(false);
    expect(pointInPolygon({ x: 52.0, y: 10.0 }, polygon)).toBe(false);
  });
});

describe('pointInMultiPolygon', () => {
  it('should detect point inside first polygon of multi-polygon', () => {
    const multiPolygon = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ];

    expect(pointInMultiPolygon({ x: 5, y: 5 }, multiPolygon)).toBe(true);
    expect(pointInMultiPolygon({ x: 25, y: 25 }, multiPolygon)).toBe(true);
  });

  it('should return false for point outside all polygons', () => {
    const multiPolygon = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ];

    expect(pointInMultiPolygon({ x: 15, y: 15 }, multiPolygon)).toBe(false);
  });

  it('should handle empty multi-polygon', () => {
    const multiPolygon: number[][][] = [];
    expect(pointInMultiPolygon({ x: 5, y: 5 }, multiPolygon)).toBe(false);
  });
});
