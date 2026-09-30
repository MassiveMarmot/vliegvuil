// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Aircraft database build — tar1090-db aircraft.csv.gz snapshot
//
// Source (verified 2026-09-30): https://github.com/wiedehopf/tar1090-db
// Download: https://github.com/wiedehopf/tar1090-db/raw/refs/heads/csv/aircraft.csv.gz
// Format (verified from the repo's toJson.py, the writer of this CSV):
// semicolon-separated, no header, one aircraft per line:
//   icao24;reg;typeCode;flags;longType;year;ownOp;(trailing empty)
// written with csv.writer(delimiter=';', quoting=QUOTE_NONE, escapechar='\\')
//
// The database is maintained from https://github.com/Mictronics/aircraft-database
// whose exports are made available under the Open Data Commons Attribution
// License (ODC-By-1.0) — see sources.json.

import type { AircraftSnapshot } from './types';

/** Column indexes in the semicolon-separated aircraft.csv (see header) */
const COL_ICAO24 = 0;
const COL_REG = 1;
const COL_TYPE = 2;
const COL_LONGTYPE = 4;
const COL_YEAR = 5;
const COL_OWNOP = 6;

/** Field names used in the row maps produced by parseTar1090Csv */
const FIELD_ICAO24 = 'icao24';
const FIELD_REG = 'reg';
const FIELD_TYPE = 'typeCode';
const FIELD_LONGTYPE = 'longType';
const FIELD_YEAR = 'year';
const FIELD_OWNOP = 'ownOp';

/**
 * Parse the tar1090-db aircraft.csv (semicolon-separated, no header) into
 * row maps, matching the shape the OurAirports CSV parser produces.
 */
export function parseTar1090Csv(content: string): Map<string, string | null>[] {
  const rows: Map<string, string | null>[] = [];
  for (const line of content.split('\n')) {
    if (line === '') continue;
    const cols = line.split(';');
    const get = (index: number): string | null => {
      const value = cols[index];
      return value === undefined || value === '' ? null : value;
    };
    const row = new Map<string, string | null>();
    row.set(FIELD_ICAO24, get(COL_ICAO24));
    row.set(FIELD_REG, get(COL_REG));
    row.set(FIELD_TYPE, get(COL_TYPE));
    row.set(FIELD_LONGTYPE, get(COL_LONGTYPE));
    row.set(FIELD_YEAR, get(COL_YEAR));
    row.set(FIELD_OWNOP, get(COL_OWNOP));
    rows.push(row);
  }
  return rows;
}

/**
 * Filter parsed aircraft.csv rows to snapshot entries.
 * Only rows with an ICAO24 (hex) identifier are kept; with nlOnly only
 * NL-registered aircraft (registration starting with a NL prefix) are kept —
 * the NL subset keeps the snapshot small enough to commit (AGENTS.md < ~2 MB).
 */
export function filterAircraft(
  rows: Map<string, string | null>[],
  options: { nlOnly: boolean } = { nlOnly: true },
): AircraftSnapshot[] {
  const aircraft: AircraftSnapshot[] = [];
  for (const row of rows) {
    const icao24 = row.get(FIELD_ICAO24) ?? null;
    if (icao24 === null || icao24 === '') continue;
    const registration = row.get(FIELD_REG) ?? null;
    if (options.nlOnly) {
      // NL registrations: PH- (fixed wing), PJ-/PK-/PL-/PM-/PO-/PP-/PR-/PS-/PT-
      // (gliders etc.), plus military K- prefix; see sources.json notes.
      if (registration === null || !/^(PH|PJ|PK|PL|PM|PO|PP|PR|PS|PT|K)/.test(registration)) {
        continue;
      }
    }
    aircraft.push({
      icao24: icao24.toUpperCase(),
      registration,
      type: row.get(FIELD_TYPE) ?? null,
      model: row.get(FIELD_LONGTYPE) ?? null,
      year: row.get(FIELD_YEAR) ?? null,
      operator: row.get(FIELD_OWNOP) ?? null,
      source: 'tar1090-db',
      license: 'ODC-By-1.0',
      date: '1970-01-01',
    });
  }
  return aircraft;
}

/** Result of building the aircraft snapshot */
export interface AircraftBuildResult {
  aircraft: AircraftSnapshot[];
  source: string;
  license: string;
  date: string;
  warnings: string[];
}

/**
 * Build the aircraft snapshot from a tar1090-db aircraft.csv document.
 */
export function buildAircraft(
  csvContent: string,
  snapshotDate: string,
  nlOnly = true,
): AircraftBuildResult {
  const rows = parseTar1090Csv(csvContent);
  const warnings: string[] = [];
  const aircraft = filterAircraft(rows, { nlOnly }).map(
    (ac): AircraftSnapshot => ({
      ...ac,
      date: snapshotDate,
    }),
  );
  if (aircraft.length === 0) {
    warnings.push('No aircraft matched the filter — check the input CSV');
  }
  return {
    aircraft,
    source: 'tar1090-db (https://github.com/wiedehopf/tar1090-db)',
    license: 'ODC-By-1.0',
    date: snapshotDate,
    warnings,
  };
}

/**
 * Serialise aircraft to JSON for the snapshot file. Compact (no indentation):
 * the NL subset is ~10k entries and must stay under the ~2 MB commit limit
 * (AGENTS.md), so the snapshot is written as one entry per line instead.
 */
export function aircraftToJson(aircraft: AircraftSnapshot[]): string {
  if (aircraft.length === 0) return '[]\n';
  const lines = aircraft.map((ac): string => JSON.stringify(ac));
  return `[\n${lines.join(',\n')}\n]\n`;
}
