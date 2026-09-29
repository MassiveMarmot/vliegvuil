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
      const coords2D = coordinates as unknown as number[][][];
      if (coordinates && pointInMultiPolygon(point, coords2D)) {
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
