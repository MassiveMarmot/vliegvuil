// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airport layer data (session 23): lazy-loaded airports.json, the
// type filter that decides which airports get a marker, and the
// status mapping for labels and popups. Pure data logic, no DOM and
// no maplibre, so tests stay light.

/** Raw entry as produced by the data build (web/public/data/airports.json) */
export interface AirportData {
  icao: string;
  iata: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  type: string;
  status: string;
  source: string;
  license: string;
  date: string;
}

/**
 * Airport types that get a marker on the map (session 23 decision):
 * large and medium airports only; heliports and small airfields are
 * not shown. Small constant so the choice is a one-line change.
 */
export const SHOWN_AIRPORT_TYPES: readonly string[] = ['large_airport', 'medium_airport'];

/** Translated status of a shown airport, or null when not to be surfaced */
export type AirportStatus = 'commercial' | 'military-shared' | 'planned';

/**
 * The status overlay reads "commercial" for heliports and small
 * airfields too, which is misleading (known data caveat). Status is
 * therefore only surfaced for the airports we actually show, and any
 * value outside the three known statuses maps to null (not shown)
 * rather than a guessed label.
 */
export function statusForAirport(airport: AirportData): AirportStatus | null {
  if (!SHOWN_AIRPORT_TYPES.includes(airport.type)) {
    return null;
  }
  if (
    airport.status === 'commercial' ||
    airport.status === 'military-shared' ||
    airport.status === 'planned'
  ) {
    return airport.status;
  }
  return null;
}

/** Only airports of a shown type get a marker */
export function filterAirports(airports: readonly AirportData[]): AirportData[] {
  return airports.filter((a): boolean => SHOWN_AIRPORT_TYPES.includes(a.type));
}

/**
 * MapLibre GeoJSON FeatureCollection for the airport symbol layer.
 * Properties carry what the label and the popup need; status uses a
 * numeric encoding so the layer can vary the marker shape by status
 * without colour being the only carrier (AGENTS.md a11y rule): 0 =
 * commercial, 1 = military-shared, 2 = planned, -1 = unknown.
 */
export const STATUS_CODES: Record<AirportStatus, number> = {
  commercial: 0,
  'military-shared': 1,
  planned: 2,
};

export interface AirportFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    icao: string;
    name: string;
    status: AirportStatus | null;
    statusCode: number;
  };
}

export function airportsToGeoJson(airports: readonly AirportData[]): {
  type: 'FeatureCollection';
  features: AirportFeature[];
} {
  return {
    type: 'FeatureCollection',
    features: filterAirports(airports).map((a): AirportFeature => {
      const status = statusForAirport(a);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] },
        properties: {
          icao: a.icao,
          name: a.name,
          status,
          statusCode: status === null ? -1 : STATUS_CODES[status],
        },
      };
    }),
  };
}

/**
 * Fetch airports.json lazily (session 23): only when the map is ready,
 * never at startup, and not in the service-worker precache. The parsed
 * list is cached in this module-level promise so repeat calls (e.g.
 * remounts) do not refetch.
 */
let airportsPromise: Promise<AirportData[]> | null = null;

export function loadAirports(url = '/data/airports.json'): Promise<AirportData[]> {
  airportsPromise ??= fetch(url)
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data): AirportData[] => {
        if (!Array.isArray(data)) {
          return [];
        }
        return data.filter(
          (a): a is AirportData =>
            typeof a === 'object' && a !== null &&
            typeof (a as AirportData).icao === 'string' &&
            typeof (a as AirportData).latitude === 'number' &&
            typeof (a as AirportData).longitude === 'number',
        );
      })
      .catch((): AirportData[] => {
        // Snapshot absent or malformed: no airport layer
        airportsPromise = null;
        return [];
      });
  return airportsPromise;
}

/** Test hook: reset the module-level fetch cache */
export function resetAirportsCache(): void {
  airportsPromise = null;
}
