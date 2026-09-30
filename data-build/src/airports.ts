// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airports data build — OurAirports airports.csv trimmed to NL and nearby,
// plus a hand-maintained status overlay (commercial / military-shared / planned).
//
// Source (verified 2026-09-29): https://ourairports.com/data/
//   "All data is released to the Public Domain" — licence: Public Domain
// Download: https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
//   (files are stored on GitHub since 3 Nov 2021)

import { parseCsv } from './csv';
import type { AirportSnapshot, AirportStatus } from './types';

/** Netherlands bounding box with buffer for nearby airports (spec §4) */
export const NL_BBOX = {
  minLat: 50.5,
  maxLat: 54.0,
  minLon: 2.5,
  maxLon: 7.5,
};

/**
 * Hand-maintained status overlay (spec §1: "plus a hand-maintained status
 * overlay (commercial / military-shared / planned)"). ICAO → status.
 * Defaults to 'commercial' for known NL airports not listed here.
 */
export const AIRPORT_STATUS_OVERLAY: Record<string, AirportStatus> = {
  EHAM: 'commercial', // Schiphol
  EHRD: 'commercial', // Rotterdam The Hague
  EHEH: 'military-shared', // Eindhoven (military airbase, civil flights)
  EHVK: 'military-shared', // Volkel
  EHLW: 'military-shared', // Leeuwarden
  EHGR: 'military-shared', // Gilze-Rijen
  EHKD: 'military-shared', // De Kooy
  EHTW: 'military-shared', // Twenthe
  EHWO: 'military-shared', // Woensdrecht
  EHLE: 'planned', // Lelystad — planned commercial (spec §10)
  EHGG: 'commercial', // Groningen Eelde
  EHBK: 'commercial', // Maastricht Aachen
};

/**
 * Filter parsed OurAirports rows to the NL bbox and convert to snapshot form.
 * Keeps NL (EH*) airports that are open and have usable coordinates.
 */
export function filterAirports(
  rows: Map<string, string | null>[],
  bbox: typeof NL_BBOX,
): AirportSnapshot[] {
  const airports: AirportSnapshot[] = [];

  for (const row of rows) {
    const lat = Number(row.get('latitude_deg'));
    const lon = Number(row.get('longitude_deg'));
    const icao = row.get('gps_code') ?? row.get('ident') ?? null;
    const type = row.get('type') ?? null;

    if (!icao?.startsWith('EH')) continue;
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) continue;
    // Skip closed airports
    if (type === 'closed') continue;

    const elevationRaw = row.get('elevation_ft') ?? null;

    airports.push({
      icao,
      iata: row.get('iata_code') ?? null,
      name: row.get('name') ?? icao,
      latitude: lat,
      longitude: lon,
      elevation: elevationRaw !== null && elevationRaw !== '' ? Number(elevationRaw) : null,
      type: type ?? 'unknown',
      status: AIRPORT_STATUS_OVERLAY[icao] ?? 'commercial',
      source: 'OurAirports',
      license: 'Public Domain',
      // Replaced by the build script at run time; fixture default:
      date: '1970-01-01',
    });
  }

  return airports;
}

/** Result of building the airports snapshot */
export interface AirportsBuildResult {
  airports: AirportSnapshot[];
  source: string;
  license: string;
  date: string;
  warnings: string[];
}

/**
 * Build the airports snapshot from an airports.csv document.
 * Returns airports plus metadata for sources.json and any warnings.
 */
export function buildAirports(csvContent: string, snapshotDate: string): AirportsBuildResult {
  const rows = parseCsv(csvContent);
  const warnings: string[] = [];

  const airports = filterAirports(rows, NL_BBOX).map((airport): AirportSnapshot => ({
    ...airport,
    date: snapshotDate,
  }));

  if (airports.length === 0) {
    warnings.push('No airports matched the NL bbox filter — check the input CSV');
  }

  for (const overlayIcao of Object.keys(AIRPORT_STATUS_OVERLAY)) {
    if (!airports.some((a): boolean => a.icao === overlayIcao)) {
      warnings.push(`Status overlay references unknown airport ${overlayIcao}`);
    }
  }

  return {
    airports,
    source: 'OurAirports (https://ourairports.com/data/)',
    license: 'Public Domain',
    date: snapshotDate,
    warnings,
  };
}

/** Serialise airports to JSON for the snapshot file */
export function airportsToJson(airports: AirportSnapshot[]): string {
  return `${JSON.stringify(airports, null, 2)}\n`;
}
