// ADS-B.lol position provider implementation
// Pure TypeScript - no DOM, no React

import { PositionProvider } from './PositionProvider';
import type {
  AircraftPosition,
  BoundingBox,
  PositionProviderConfig,
} from './types';

// ADS-B.lol API response types
interface AdsblolResponse {
  acList: AdsblolAircraft[];
}

interface AdsblolAircraft {
  Icao: string;
  Call: string;
  Reg: string;
  Type: string;
  Op: string;
  Lat: number;
  Long: number;
  Alt: number;
  Spd: number;
  Hdg: number;
  VerRate: number;
  Squawk: string;
  Ts: number;
  Gnd: boolean;
}

/**
 * ADS-B.lol position provider for live aircraft data
 * 
 * Uses the free ADS-B.lol API which provides real-time aircraft positions.
 * Implements caching, retries, timeout, and bounding box filtering.
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
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ADS-B.lol API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as AdsblolResponse;

    return data.acList
      .filter(ac => this.isInBoundingBox(ac, bbox))
      .map(ac => this.convertAircraft(ac));
  }

  private buildUrl(bbox: BoundingBox): URL {
    const url = new URL(`${this.config.baseUrl}/point`);
    
    // Use center point of bbox for the API request
    // ADS-B.lol returns aircraft within a radius of the point
    const centerLat = (bbox.minLatitude + bbox.maxLatitude) / 2;
    const centerLon = (bbox.minLongitude + bbox.maxLongitude) / 2;
    
    url.searchParams.set('lat', centerLat.toString());
    url.searchParams.set('lon', centerLon.toString());
    
    // Add a generous radius to cover the entire Netherlands bbox
    // Roughly 200km radius should cover NL + buffer
    url.searchParams.set('radius', '200');
    
    return url;
  }

  private isInBoundingBox(ac: AdsblolAircraft, bbox: BoundingBox): boolean {
    if (ac.Lat === 0 || ac.Long === 0) {
      return false; // Invalid coordinates
    }

    return (
      ac.Lat >= bbox.minLatitude &&
      ac.Lat <= bbox.maxLatitude &&
      ac.Long >= bbox.minLongitude &&
      ac.Long <= bbox.maxLongitude
    );
  }

  private convertAircraft(ac: AdsblolAircraft): AircraftPosition {
    return {
      icao24: ac.Icao.toUpperCase(),
      callsign: ac.Call.trim() || null,
      registration: ac.Reg.trim() || null,
      type: ac.Type.trim() || null,
      operator: ac.Op.trim() || null,
      latitude: ac.Lat,
      longitude: ac.Long,
      altitude: ac.Alt !== 0 ? Math.round(ac.Alt) : null,
      speed: ac.Spd !== 0 ? Math.round(ac.Spd * 10) / 10 : null, // Round to 1 decimal
      heading: ac.Hdg !== 0 ? Math.round(ac.Hdg) : null,
      verticalRate: ac.VerRate !== 0 ? Math.round(ac.VerRate) : null,
      squawk: ac.Squawk || null,
      timestamp: ac.Ts,
      onGround: ac.Gnd === true,
    };
  }
}

/**
 * Factory function to create a configured ADS-B.lol provider
 */
export function createAdsblolProvider(
  config: Partial<PositionProviderConfig> = {},
): AdsblolProvider {
  return new AdsblolProvider(config);
}
