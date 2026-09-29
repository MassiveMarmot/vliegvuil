// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
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
 * Can accept either:
 * - number[][][][]: GeoJSON MultiPolygon (array of polygons, each polygon is array of rings)
 * - number[][][]: Array of rings (simplified, each ring treated as a polygon)
 */
export function pointInMultiPolygon(
  point: Point,
  multiPolygon: number[][][] | number[][][][],
): boolean {
  // Check if this is a full MultiPolygon (4D) or array of rings (3D)
  // For GeoJSON MultiPolygon: array of polygons, each polygon is array of rings
  // For simplified: array of rings directly
  // 
  // Check: mp[0][0][0] is a coordinate pair (array of 2 numbers) -> 4D
  //        mp[0][0] is a coordinate pair -> 3D
  const firstPoly = multiPolygon[0];
  const firstRing = firstPoly?.[0];
  
  // If firstRing[0] is an array (coordinate pair), then this is a 4D MultiPolygon
  if (firstRing && Array.isArray(firstRing[0]) && firstRing[0].length === 2) {
    // Input is number[][][][] - GeoJSON MultiPolygon (array of polygons)
    for (const polygon of multiPolygon as number[][][][]) {
      // Each polygon is an array of rings; use the first (exterior) ring
      const exteriorRing = polygon[0];
      if (exteriorRing && pointInPolygon(point, { coordinates: exteriorRing })) {
        return true;
      }
    }
  } else {
    // Input is number[][][] - array of rings
    for (const ring of multiPolygon as number[][][]) {
      if (pointInPolygon(point, { coordinates: ring })) {
        return true;
      }
    }
  }
  
  return false;
}
