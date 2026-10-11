// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airport map-layer constants and helpers (session 23). Kept free of
// maplibre imports so tests stay light; Map.tsx assembles the actual
// layer definitions from these values.
import { airportsToGeoJson, type AirportData, type AirportStatus } from './airports';

export const AIRPORT_SOURCE_ID = 'airports';
export const AIRPORT_MARKER_LAYER_ID = 'airport-markers';
export const AIRPORT_LABEL_LAYER_ID = 'airport-labels';

/**
 * Labels appear from this zoom level so the default NL view (zoom 8,
 * fitted to the country bounds) is not cluttered with 12 labels.
 * Tuned to be above the initial fitBounds zoom for the Netherlands.
 */
export const AIRPORT_LABEL_MIN_ZOOM = 9;

/**
 * Font stack for airport labels. Self-hosted glyphs served from our own
 * origin (web/public/fonts/...), generated from Space Grotesk (OFL
 * 1.1), the UI typeface — no third-party font host, CSP unchanged
 * (same-origin requests are allowed by every 'self' directive).
 * The stack name is the one fontnik bakes into the PBF files.
 */
export const AIRPORT_FONT_STACK = 'Space Grotesk Regular';

/** Glyph URL pattern for the map style (same origin, ranges on disk) */
export const AIRPORT_GLYPHS_URL = '/fonts/{fontstack}/{range}.pbf';

/** Data for the airport popup, derived from a clicked feature */
export interface AirportPopupData {
  icao: string;
  name: string;
  status: AirportStatus | null;
}

/**
 * Build the GeoJSON for the airport source. Exposed separately so the
 * layer wiring (Map.tsx) stays declarative and this stays testable.
 */
export function airportLayerConfig(): {
  airportLayer: (airports: readonly AirportData[]) => ReturnType<typeof airportsToGeoJson>;
} {
  return {
    airportLayer: (airports: readonly AirportData[]) => airportsToGeoJson(airports),
  };
}

/** IATA lookup for the popup (from the raw airport list) */
export function iataFor(airports: readonly AirportData[], icao: string): string | null {
  const found = airports.find((a): boolean => a.icao === icao);
  return found !== undefined && found.iata !== '' ? found.iata : null;
}

export type { AirportData, AirportStatus } from './airports';
