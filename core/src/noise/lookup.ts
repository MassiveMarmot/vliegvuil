// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise contour lookup utilities

import type { Point } from '../geometry/types';
import type { NoiseContours, NoiseLookupResult } from './types';
import { pointInPolygon, pointInMultiPolygon } from '../geometry/pointInPolygon';

/**
 * Lookup noise band at a specific point
 * Returns the highest band that contains the point
 */
export function lookupNoiseBand(
  point: Point,
  contours: NoiseContours,
): NoiseLookupResult | null {
  // Sort contours by band in descending order to find highest band first
  const sortedContours = [...contours.contours].sort((a, b) => b.band - a.band);

  for (const contour of sortedContours) {
    const geometry = contour.geometry;
    
    if (geometry.type === 'Polygon') {
      const coordinates = geometry.coordinates[0];
      if (coordinates && pointInPolygon(point, { coordinates })) {
        return {
          airport: contour.airport,
          band: contour.band,
          year: contour.year,
          inside: true,
        };
      }
    } else if (geometry.type === 'MultiPolygon') {
      const coordinates = geometry.coordinates;
      if (coordinates && pointInMultiPolygon(point, coordinates)) {
        return {
          airport: contour.airport,
          band: contour.band,
          year: contour.year,
          inside: true,
        };
      }
    }
  }

  return null;
}

/**
 * Get noise badge text for a point
 */
export function getNoiseBadgeText(
  point: Point,
  contours: NoiseContours,
): string | null {
  const result = lookupNoiseBand(point, contours);
  
  if (!result) {
    return null;
  }

  return `Inside the >=${result.band} dB Lden contour of ${result.airport}, ${result.year}`;
}
