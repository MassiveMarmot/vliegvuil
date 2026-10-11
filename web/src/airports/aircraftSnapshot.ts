// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Aircraft snapshot fallback (session 23): when the live adsb.fi feed
// lacks registration, type or operator, fill the gap from the aircraft
// database snapshot (web/public/data/aircraft.json) by ICAO24 hex.
// Live values always win; the snapshot only fills gaps. Loaded lazily
// on first need, cached in this module, never precached.
import type { DisplayAircraft } from '../types';

/** Raw snapshot entry as produced by the data build */
export interface AircraftSnapshotEntry {
  icao24: string;
  registration: string | null;
  type: string | null;
  model?: string | null;
  operator?: string | null;
  year?: string | null;
}

let snapshotPromise: Promise<Map<string, AircraftSnapshotEntry>> | null = null;

/**
 * Fetch and index the snapshot by ICAO24 (uppercase hex). Cached: the
 * second call returns the same promise, so the file is fetched once.
 * A failed load resolves to an empty map (no fallback available).
 */
export function loadAircraftSnapshot(
  url = '/data/aircraft.json',
): Promise<Map<string, AircraftSnapshotEntry>> {
  snapshotPromise ??= fetch(url)
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data): Map<string, AircraftSnapshotEntry> => {
        const map = new Map<string, AircraftSnapshotEntry>();
        if (!Array.isArray(data)) {
          return map;
        }
        for (const entry of data) {
          if (
            typeof entry === 'object' && entry !== null &&
            typeof (entry as AircraftSnapshotEntry).icao24 === 'string'
          ) {
            map.set((entry as AircraftSnapshotEntry).icao24.toUpperCase(), entry as AircraftSnapshotEntry);
          }
        }
        return map;
      })
      .catch((): Map<string, AircraftSnapshotEntry> => {
        snapshotPromise = null;
        return new Map();
      });
  return snapshotPromise;
}

/** Test hook: reset the module-level fetch cache */
export function resetAircraftSnapshotCache(): void {
  snapshotPromise = null;
}

/**
 * Fill missing registration, type and operator from the snapshot.
 * Live values are never overwritten; an aircraft missing from the
 * snapshot (or a missing hex) is returned unchanged.
 */
export function enrichWithSnapshot(
  aircraft: DisplayAircraft,
  snapshot: ReadonlyMap<string, AircraftSnapshotEntry>,
): DisplayAircraft {
  const entry = snapshot.get(aircraft.icao24.toUpperCase());
  if (entry === undefined) {
    return aircraft;
  }
  const registration = aircraft.registration ?? entry.registration;
  const type = aircraft.type ?? (entry.type ?? null);
  const operator = aircraft.operator ?? (entry.operator ?? null);
  if (
    registration === aircraft.registration &&
    type === aircraft.type &&
    operator === aircraft.operator
  ) {
    return aircraft;
  }
  return { ...aircraft, registration, type, operator };
}

/**
 * Enrich a batch of aircraft, loading the snapshot lazily on first
 * need. If the snapshot cannot be loaded, the fleet is returned
 * unchanged (an empty snapshot fills nothing).
 */
export async function enrichFleet(
  aircraft: ReadonlyMap<string, DisplayAircraft>,
): Promise<Map<string, DisplayAircraft>> {
  const snapshot = await loadAircraftSnapshot();
  const fleet = new Map<string, DisplayAircraft>();
  for (const [id, ac] of aircraft) {
    fleet.set(id, enrichWithSnapshot(ac, snapshot));
  }
  return fleet;
}
