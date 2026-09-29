// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Aircraft database build — tar1090-db aircraft.csv.gz snapshot
//
// Source (verified 2026-09-29): https://github.com/wiedehopf/tar1090-db
// Download: https://github.com/wiedehopf/tar1090-db/raw/refs/heads/csv/aircraft.csv.gz
// Database maintained from https://github.com/Mictronics/readsb (GPL-3.0).
// TODO(license): the aircraft.csv.gz database itself carries no explicit
// licence statement in the repo — verify with the maintainer before
// redistribution. https://github.com/wiedehopf/tar1090-db
//
// The gzip download + full build runs on the VPS (BUILD.md §6); the functions
// here are pure and tested against fixture CSV rows.

import { parseCsv } from './csv';
import type { AircraftSnapshot } from './types';

/**
 * Convert parsed aircraft.csv rows to snapshot entries.
 * Only rows with an ICAO24 (hex) identifier are kept; only NL-registered
 * aircraft (or optionally all) are kept — the NL subset keeps the snapshot
 * small enough to commit (AGENTS.md: < ~2 MB).
 */
export function filterAircraft(
  rows: Map<string, string | null>[],
  options: { nlOnly: boolean } = { nlOnly: true },
): AircraftSnapshot[] {
  const aircraft: AircraftSnapshot[] = [];

  for (const row of rows) {
    const icao24 = row.get('icao24') ?? row.get('hex') ?? null;
    if (icao24 === null || icao24 === '') continue;

    if (options.nlOnly) {
      // NL registrations start with "PH-" (fixed-wing), "PH-" / "P-" general;
      // keep anything starting with 'PH' plus military "K" prefixes handled by reg field
      const registration = row.get('r') ?? row.get('reg') ?? null;
      if (registration === null || !/^(PH|PJ|PK|PL|PM|PO|PP|PR|PS|PT|K)/.test(registration)) {
        continue;
      }
    }

    aircraft.push({
      icao24: icao24.toUpperCase(),
      registration: row.get('r') ?? row.get('reg') ?? null,
      type: row.get('t') ?? row.get('type') ?? null,
      manufacturer: row.get('desc')?.split(' ')[0] ?? null,
      icaoType: row.get('t') ?? null,
      model: row.get('desc') ?? null,
      operator: row.get('ownOp') ?? row.get('operator') ?? null,
      operatorCallsign: row.get('callSign') ?? row.get('opCallSign') ?? null,
      source: 'tar1090-db',
      // TODO(license): see header — no explicit licence on the DB; verify
      license: 'TODO: verify — see https://github.com/wiedehopf/tar1090-db',
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
 * Build the aircraft snapshot from an aircraft.csv document.
 */
export function buildAircraft(csvContent: string, snapshotDate: string, nlOnly = true): AircraftBuildResult {
  const rows = parseCsv(csvContent);
  const warnings: string[] = [];

  const aircraft = filterAircraft(rows, { nlOnly }).map((ac): AircraftSnapshot => ({
    ...ac,
    date: snapshotDate,
  }));

  if (aircraft.length === 0) {
    warnings.push('No aircraft matched the filter — check the input CSV');
  }

  return {
    aircraft,
    source: 'tar1090-db (https://github.com/wiedehopf/tar1090-db)',
    license: 'TODO: verify — no explicit licence stated, see repo',
    date: snapshotDate,
    warnings,
  };
}

/** Serialise aircraft to JSON for the snapshot file */
export function aircraftToJson(aircraft: AircraftSnapshot[]): string {
  return `${JSON.stringify(aircraft, null, 2)}\n`;
}
