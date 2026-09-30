// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise contour types

/**
 * Kind of contour dataset. "actual" contours are calculated from the traffic
 * that actually flew in a reference year; "permitted" contours are planning
 * contours under an airport decree (maximum permitted use).
 */
export type NoiseKind = 'actual' | 'permitted';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

/**
 * A noise contour ring set for one airport / band lower bound / year.
 * Bands are expressed as a lower bound in dB (e.g. 55 means ">= 55 dB"),
 * because sources differ: the EU END 2021 Schiphol set uses 5 dB bands
 * (55, 60, 65, 70, 75), while airport-decree contours use 48/56/70.
 */
export interface NoiseContour {
  airport: string;
  year: number;
  /** Lower bound of the band in dB (band covers bandLowerDb..bandLowerDb+4 or more) */
  bandLowerDb: number;
  metric: string;
  kind: NoiseKind;
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  properties: {
    source: string;
    license: string;
    date: string;
    /** E.g. "civil traffic only" for Eindhoven civil Lden */
    caveat?: string;
  };
}

export interface NoiseLookupResult {
  airport: string;
  bandLowerDb: number;
  metric: string;
  kind: NoiseKind;
  year: number;
  inside: boolean;
}

export interface NoiseContours {
  contours: NoiseContour[];
}
