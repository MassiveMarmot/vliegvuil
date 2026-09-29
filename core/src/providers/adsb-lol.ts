// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ADS-B.lol position provider implementation
// Pure TypeScript - no DOM, no React
// Response shape verified against https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}
// (radius in nautical miles, max 250); fixture: core/__tests__/fixtures/adsb-lol-point.json
import { PositionProvider } from './PositionProvider';
import type {
  AircraftPosition,
  BoundingBox,
  PositionProviderConfig,
} from './types';

/** Real adsb.lol v2 response (only the fields we consume) */
interface AdsblolResponse {
  ac?: AdsblolAircraft[];
  now?: number;
}

interface AdsblolAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_NM = 1.852;
const MAX_RADIUS_NM = 250;

/** Great-circle distance between two points in kilometres */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Radius (nautical miles) needed to cover the bounding box from its centre,
 * capped at the API's maximum of 250 nm.
 */
export function radiusForBoundingBox(bbox: BoundingBox): number {
  const centerLat = (bbox.minLatitude + bbox.maxLatitude) / 2;
  const centerLon = (bbox.minLongitude + bbox.maxLongitude) / 2;
  const corners: Array<[number, number]> = [
    [bbox.minLatitude, bbox.minLongitude],
    [bbox.minLatitude, bbox.maxLongitude],
    [bbox.maxLatitude, bbox.minLongitude],
    [bbox.maxLatitude, bbox.maxLongitude],
  ];
  let maxKm = 0;
  for (const [lat, lon] of corners) {
    maxKm = Math.max(maxKm, haversineKm(centerLat, centerLon, lat, lon));
  }
  return Math.min(Math.ceil(maxKm / KM_PER_NM), MAX_RADIUS_NM);
}

/** Trimmed string or null when missing/empty */
function trimmedOrNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;}

/**
 * ADS-B.lol position provider for live aircraft data.
 */
export class AdsblolProvider extends PositionProvider {
  constructor(config: Partial<PositionProviderConfig> = {}) {
    super({
      baseUrl: 'https://api.adsb.lol/v2',
      ...config,
    });
  }

  async fetchFromSource(bbox: BoundingBox): Promise<AircraftPosition[]> {
    const url = this.buildUrl(bbox);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(
        `ADS-B.lol API error: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as AdsblolResponse;
    return (data.ac ?? [])
      .filter((ac) => this.isInBoundingBox(ac, bbox))
      .map((ac) => this.convertAircraft(ac, data.now));
  }

  private buildUrl(bbox: BoundingBox): URL {
    const centerLat = (bbox.minLatitude + bbox.maxLatitude) / 2;
    const centerLon = (bbox.minLongitude + bbox.maxLongitude) / 2;
    const radius = radiusForBoundingBox(bbox);
    return new URL(
      `${this.config.baseUrl}/point/${centerLat.toFixed(4)}/${centerLon.toFixed(4)}/${radius}`,
    );
  }

  private isInBoundingBox(ac: AdsblolAircraft, bbox: BoundingBox): boolean {
    if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') {
      return false;
    }
    return (
      ac.lat >= bbox.minLatitude &&
      ac.lat <= bbox.maxLatitude &&
      ac.lon >= bbox.minLongitude &&
      ac.lon <= bbox.maxLongitude
    );
  }

  private convertAircraft(
    ac: AdsblolAircraft,
    nowSeconds: number | undefined,
  ): AircraftPosition {
    const onGround = ac.alt_baro === 'ground';
    const now = nowSeconds ?? Date.now() / 1000;
    const seenPos = typeof ac.seen_pos === 'number' ? ac.seen_pos : 0;
    return {
      icao24: ac.hex.toUpperCase(),
      callsign: trimmedOrNull(ac.flight),
      registration: trimmedOrNull(ac.r),
      type: trimmedOrNull(ac.t),
      operator: null,
      latitude: ac.lat as number,
      longitude: ac.lon as number,
      altitude:
        onGround || typeof ac.alt_baro !== 'number'
          ? null
          : Math.round(ac.alt_baro),
      speed: typeof ac.gs === 'number' ? Math.round(ac.gs * 10) / 10 : null,
      heading: typeof ac.track === 'number' ? ac.track : null,
      verticalRate:
        typeof ac.baro_rate === 'number' ? Math.round(ac.baro_rate) : null,
      squawk: trimmedOrNull(ac.squawk),
      timestamp: Math.round(now - seenPos),
      onGround,
    };
  }
}

/** Factory function to create a configured ADS-B.lol provider */
export function createAdsblolProvider(
  config: Partial<PositionProviderConfig> = {},
): AdsblolProvider {
  return new AdsblolProvider(config);
}
