// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Data build types — snapshot formats shared between data-build and web

export type AirportStatus = 'commercial' | 'military-shared' | 'planned';

/** Airport snapshot entry (trimmed OurAirports row + status overlay) */
export interface AirportSnapshot {
  icao: string;
  iata: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  type: string;
  status: AirportStatus;
  source: string;
  license: string;
  date: string;
}

/** Aircraft database snapshot entry (tar1090-db / aircraft.csv.gz row) */
export interface AircraftSnapshot {
  icao24: string;
  registration: string | null;
  type: string | null;
  model: string | null;
  year: string | null;
  operator: string | null;
  source: string;
  license: string;
  date: string;
}

/** Noise band levels (dB Lden) — spec §2 */
export type NoiseBandLevel = 48 | 56 | 70;

/** Noise contour GeoJSON feature (output of the noise build) */
export interface NoiseContourFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: {
    airport: string;
    band: NoiseBandLevel;
    year: number;
    metric: string;
    source: string;
    license: string;
    caveat?: string;
  };
}

/** Metadata for a produced snapshot file */
export interface SnapshotMeta {
  file: string;
  count: number;
  source: string;
  license: string;
  date: string;
}

export interface BuildResult {
  snapshot: SnapshotMeta;
  warnings: string[];
}
