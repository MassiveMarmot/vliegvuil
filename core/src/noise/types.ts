// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise contour types

export type NoiseBand = 48 | 56 | 70; // dB Lden bands

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface NoiseContour {
  airport: string;
  year: number;
  band: NoiseBand;
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
  band: NoiseBand;
  year: number;
  inside: boolean;
}

export interface NoiseContours {
  contours: NoiseContour[];
}
