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
