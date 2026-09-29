// Noise contours data build — converts contour polygons to small GeoJSON
// for client-side point-in-polygon lookup, plus a PMTiles build script.
//
// Sources (spec §1):
//   Schiphol: RIVM / Atlas Leefomgeving — TODO: verify dataset URL + licence
//   Regional (Rotterdam, Eindhoven, Maastricht, Groningen Eelde): CLO/NLR
//     contours 2018 & 2024 — TODO: verify dataset URL + licence
//   Eindhoven: CIVIL Lden contours (decision made 2026-09-29; label
//     "civil traffic only" per spec §10).
//
// Per BUILD.md §4 row 9: "Script runs; large tiles gitignored, release
// artifact documented." The PMTiles generation itself runs on the VPS.

import type { NoiseBandLevel, NoiseContourFeature } from './types';

/**
 * Input contour: GeoJSON feature from an (to-be-verified) official source.
 * geometry is GeoJSON Polygon or MultiPolygon in WGS84 lon/lat.
 */
export interface RawContour {
  airport: string;
  year: number;
  band: NoiseBandLevel;
  metric: string; // e.g. "Lden"
  /** GeoJSON coordinates: Polygon or MultiPolygon */
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  source: string;
  license: string;
  /** E.g. "civil traffic only" for Eindhoven civil Lden */
  caveat?: string;
}

/** Simplification options */
export interface SimplifyOptions {
  /** Max number of decimal places to keep (≈ precision in degrees) */
  precision: number;
  /** Drop rings with fewer than this many points */
  minRingPoints: number;
}

export const DEFAULT_SIMPLIFY: SimplifyOptions = {
  precision: 5, // ≈ 1.1 m — plenty for 48-70 dB contour lookup
  minRingPoints: 4,
};

/** Round a coordinate to the given precision */
function roundCoord(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Simplify a ring: rounds coordinates and removes consecutive duplicates.
 * (Conservative — a proper Douglas-Peucker can be added later; rounding alone
 * typically removes 40-60% of points from official contour exports.)
 */
export function simplifyRing(ring: number[][], options: SimplifyOptions): number[][] {
  const result: number[][] = [];
  for (const coord of ring) {
    if (coord === undefined || coord.length < 2) continue;
    const lon = roundCoord(coord[0] ?? 0, options.precision);
    const lat = roundCoord(coord[1] ?? 0, options.precision);
    const prev = result.at(-1);
    if (prev?.[0] === lon && prev?.[1] === lat) continue;
    result.push([lon, lat]);
  }
  // Ensure closed ring
  const first = result[0];
  const last = result[result.length - 1];
  const firstLon = first?.[0];
  const firstLat = first?.[1];
  const lastLon = last?.[0];
  const lastLat = last?.[1];
  if (
    firstLon !== undefined && firstLat !== undefined &&
    lastLon !== undefined && lastLat !== undefined &&
    (firstLon !== lastLon || firstLat !== lastLat)
  ) {
    result.push([firstLon, firstLat]);
  }
  return result;
}

/**
 * Convert raw contours to the trimmed GeoJSON snapshot consumed by the web
 * app for point-in-polygon noise lookup (spec §5: "Noise lookup runs
 * client-side against local GeoJSON").
 */
export function buildNoiseGeoJson(
  contours: RawContour[],
  options: SimplifyOptions = DEFAULT_SIMPLIFY,
): { features: NoiseContourFeature[]; warnings: string[] } {
  const features: NoiseContourFeature[] = [];
  const warnings: string[] = [];

  for (const contour of contours) {
    if (contour.band !== 48 && contour.band !== 56 && contour.band !== 70) {
      warnings.push(`Unsupported band ${String(contour.band)} for ${contour.airport} — expected 48/56/70`);
      continue;
    }

    let geometry: NoiseContourFeature['geometry'];

    if (contour.geometry.type === 'Polygon') {
      const rings = contour.geometry.coordinates
        .map((ring): number[][] => simplifyRing(ring, options))
        .filter((ring): boolean => ring.length >= options.minRingPoints);
      if (rings.length === 0) {
        warnings.push(`All rings simplified away for ${contour.airport} band ${String(contour.band)}`);
        continue;
      }
      geometry = { type: 'Polygon', coordinates: rings };
    } else {
      const polygons: number[][][] = [];
      for (const polygon of contour.geometry.coordinates) {
        const rings = polygon
          .map((ring): number[][] => simplifyRing(ring, options))
          .filter((ring): boolean => ring.length >= options.minRingPoints);
        if (rings.length > 0) {
          polygons.push(...rings);
        }
      }
      if (polygons.length === 0) {
        warnings.push(`All polygons simplified away for ${contour.airport} band ${String(contour.band)}`);
        continue;
      }
      geometry = { type: 'MultiPolygon', coordinates: [polygons] };
    }

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        airport: contour.airport,
        band: contour.band,
        year: contour.year,
        metric: contour.metric,
        source: contour.source,
        license: contour.license,
        ...(contour.caveat !== undefined ? { caveat: contour.caveat } : {}),
      },
    });
  }

  return { features, warnings };
}

/**
 * PMTiles build command (documented for the VPS run — BUILD.md §4 row 9:
 * "large tiles gitignored, release artifact documented").
 *
 * The actual conversion is done by the `tippecanoe` CLI on the VPS:
 *   tippecanoe -o noise-contours.pmtiles \
 *     --no-tile-size-limit \
 *     --minimum-zoom=8 --maximum-zoom=14 \
 *     --layer=noise \
 *     noise-contours.geojson
 * This function returns that command string so deploy docs stay in sync.
 */
export function pmtilesCommand(inputFile: string, outputFile: string): string {
  return `tippecanoe -o ${outputFile} --no-tile-size-limit --minimum-zoom=8 --maximum-zoom=14 --layer=noise ${inputFile}`;
}

/** Serialise the GeoJSON snapshot */
export function noiseGeoJsonToJson(features: NoiseContourFeature[]): string {
  return `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`;
}
