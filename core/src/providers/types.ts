// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Position provider types

export interface AircraftPosition {
  icao24: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  operator: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null; // feet
  speed: number | null; // knots
  heading: number | null; // degrees, 0-360
  verticalRate: number | null; // feet per minute, positive = climbing
  squawk: string | null;
  timestamp: number; // Unix timestamp in seconds
  onGround: boolean;
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface PositionProvider {
  fetchPositions(bbox: BoundingBox): Promise<AircraftPosition[]>;
  getDataAge(): number; // seconds since last update
  getLastError(): Error | null;
  isStale(): boolean;
}

export interface PositionProviderConfig {
  baseUrl: string;
  pollInterval: number; // milliseconds
  cacheTTL: number; // seconds
  maxRetries: number;
  timeout: number; // milliseconds
}

// Netherlands bounding box with North Sea buffer for approaches
export const NETHERLANDS_BBOX: BoundingBox = {
  minLatitude: 50.5,
  maxLatitude: 54.0,
  minLongitude: 2.5,
  maxLongitude: 7.5,
};

// Default configuration for position providers
export const DEFAULT_PROVIDER_CONFIG: PositionProviderConfig = {
  baseUrl: 'https://api.adsb.lol/v2',
  pollInterval: 5000,
  cacheTTL: 5,
  maxRetries: 3,
  timeout: 10000,
};

/**
 * Thrown when the upstream (or our same-origin proxy) answers 429.
 * Callers must pause polling instead of retrying: every retry spends more
 * of the same per-IP budget that was just exhausted.
 */
export class RateLimitError extends Error {
  readonly status = 429;
  /** Server-requested wait in ms (from Retry-After), or null if absent */
  readonly retryAfterMs: number | null;

  constructor(retryAfterMs: number | null = null) {
    super('Rate limited (429 Too Many Requests)');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return null;
}
