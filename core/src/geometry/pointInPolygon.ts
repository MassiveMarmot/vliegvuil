// Point-in-polygon algorithm (ray casting)

import type { Point, Polygon } from './types';

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  const { x, y } = point;
  const coordinates = polygon.coordinates;

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const xi = coordinates[i]?.[0] ?? 0;
    const yi = coordinates[i]?.[1] ?? 0;
    const xj = coordinates[j]?.[0] ?? 0;
    const yj = coordinates[j]?.[1] ?? 0;

    const intersect =
      (yi ?? 0) > y !== (yj ?? 0) > y && x < (((xj ?? 0) - (xi ?? 0)) * (y - (yi ?? 0))) / ((yj ?? 0) - (yi ?? 0)) + (xi ?? 0);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is inside any of the polygons in a multi-polygon
 */
export function pointInMultiPolygon(
  point: Point,
  multiPolygon: number[][][] | number[][][][],
): boolean {
  for (const polygon of multiPolygon as number[][][]) {
    if (pointInPolygon(point, { coordinates: polygon })) {
      return true;
    }
  }
  return false;
}
