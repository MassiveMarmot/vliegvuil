// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise contours data build — converts contour polygons to small GeoJSON
// for client-side point-in-polygon lookup, plus a PMTiles build script.
//
// Verified sources (2026-09-30):
//   Schiphol: EU Environmental Noise Directive (END) 2021 contours, dataset
//     "Geluidbelastingkaart hoofd luchthavens, Lden en Lnight, 2021 (INSPIRE)"
//     https://data.overheid.nl/dataset/bc7703a1-9323-4e4f-9ce7-246ace877b59
//     licence CC-0 1.0 (per data.overheid.nl "Licentie: CC-0 (1.0)").
//     WFS feature type gpkg:NoiseContours_majorAirportsIncludingAgglomeration_Lden
//     carries categories Lden5559/Lden6064/Lden6569/Lden7074/LdenGreaterThan75
//     → mapped to band lower bounds 55/60/65/70/75, kind "actual",
//     label "actual traffic 2021 (EU END)".
//   Regional airports (Rotterdam, Eindhoven, Maastricht, Groningen Eelde):
//     CLO/NLR contours 2018 & 2024 exist (CLO indicator 0588) but are
//     published as map images only — no open vector download (checked
//     data.pbl.nl embeds: bitmap/PDF only). TODO: maintainer will request
//     vectors from RIVM/NLR. NOT included in the build.
//   Groningen province WFS "LuchthavensGeluidcontouren" (data.overheid.nl
//     dataset 6975) contains only Heliport Eemshaven, Oostwold and
//     Stadskanaal contour lines — no Eelde/Eindhoven; not used.
//
// Per BUILD.md §4 row 22: "PMTiles generation stays a documented VPS step."

import type { NoiseContourFeature } from './types';

/**
 * Input contour: GeoJSON feature from a verified official source.
 * geometry is GeoJSON Polygon or MultiPolygon in WGS84 lon/lat.
 */
export interface RawContour {
  airport: string;
  year: number;
  /** Lower bound of the band in dB (e.g. 55 for the END 55–59 dB class) */
  bandLowerDb: number;
  metric: string; // e.g. "Lden"
  kind: 'actual' | 'permitted';
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
  precision: 3, // ≈ 110 m — fine for dB-band contour lookup, keeps file small
  minRingPoints: 4,
};

/** END 2021 category → band lower bound (verified against the real WFS response) */
export const END_CATEGORY_TO_BAND: Record<string, number> = {
  Lden5559: 55,
  Lden6064: 60,
  Lden6569: 65,
  Lden7074: 70,
  LdenGreaterThan75: 75,
};

/** Round a coordinate to the given precision */
function roundCoord(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Simplify a ring: rounds coordinates and removes consecutive duplicates.
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
 * app for point-in-polygon noise lookup (spec §5).
 */
export function buildNoiseGeoJson(
  contours: RawContour[],
  options: SimplifyOptions = DEFAULT_SIMPLIFY,
): { features: NoiseContourFeature[]; warnings: string[] } {
  const features: NoiseContourFeature[] = [];
  const warnings: string[] = [];

  for (const contour of contours) {
    if (!Number.isInteger(contour.bandLowerDb) || contour.bandLowerDb < 20 || contour.bandLowerDb > 90) {
      warnings.push(`Unsupported band lower bound ${String(contour.bandLowerDb)} for ${contour.airport}`);
      continue;
    }

    let geometry: NoiseContourFeature['geometry'];

    if (contour.geometry.type === 'Polygon') {
      const rings = contour.geometry.coordinates
        .map((ring): number[][] => simplifyRing(ring, options))
        .filter((ring): boolean => ring.length >= options.minRingPoints);
      if (rings.length === 0) {
        warnings.push(`All rings simplified away for ${contour.airport} band ${String(contour.bandLowerDb)}`);
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
        warnings.push(`All polygons simplified away for ${contour.airport} band ${String(contour.bandLowerDb)}`);
        continue;
      }
      geometry = { type: 'MultiPolygon', coordinates: [polygons] };
    }

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        airport: contour.airport,
        bandLowerDb: contour.bandLowerDb,
        year: contour.year,
        metric: contour.metric,
        kind: contour.kind,
        source: contour.source,
        license: contour.license,
        ...(contour.caveat !== undefined ? { caveat: contour.caveat } : {}),
      },
    });
  }

  return { features, warnings };
}

/**
 * Convert a raw END 2021 WFS FeatureCollection (as returned by the
 * haleconnect WFS with OUTPUTFORMAT=application/json) into RawContours.
 * Only category, geometry and source fields are read; unknown categories
 * produce warnings, never guessed bands.
 */
export function endWfsToRawContours(
  featureCollection: { features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }> },
  source: string,
  license: string,
  year: number,
  airport: string,
): { contours: RawContour[]; warnings: string[] } {
  const contours: RawContour[] = [];
  const warnings: string[] = [];
  const features = featureCollection.features ?? [];
  for (const feature of features) {
    const category = feature.properties?.['category'];
    const geometry = feature.geometry as
      | { type: string; coordinates: unknown }
      | undefined
      | null;
    if (typeof category !== 'string' || geometry === undefined || geometry === null) {
      warnings.push('END feature missing category or geometry — skipped');
      continue;
    }
    const bandLowerDb = END_CATEGORY_TO_BAND[category];
    if (bandLowerDb === undefined) {
      warnings.push(`Unknown END category ${category} — skipped (not guessed)`);
      continue;
    }
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      warnings.push(`Unsupported geometry ${String(geometry.type)} for category ${category} — skipped`);
      continue;
    }
    contours.push({
      airport,
      year,
      bandLowerDb,
      metric: 'Lden',
      kind: 'actual',
      geometry: geometry as RawContour['geometry'],
      source,
      license,
    });
  }
  return { contours, warnings };
}

/**
 * PMTiles build command (documented for the VPS run — BUILD.md §4 row 22:
 * "PMTiles generation stays a documented VPS step").
 */
export function pmtilesCommand(inputFile: string, outputFile: string): string {
  return `tippecanoe -o ${outputFile} --no-tile-size-limit --minimum-zoom=8 --maximum-zoom=14 --layer=noise ${inputFile}`;
}

/** Serialise the GeoJSON snapshot */
export function noiseGeoJsonToJson(features: NoiseContourFeature[]): string {
  return `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`;
}
