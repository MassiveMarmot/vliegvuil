// Web application types

// Aircraft for display (extends core type with UI-specific fields)
export interface DisplayAircraft {
  id: string;
  icao24: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  operator: string | null;
  lat: number;
  lon: number;
  alt: number | null;
  track: number | null;
  speed: number | null;
  squawk: string | null;
  timestamp: number;
  onGround: boolean;
  verticalRate: number | null;
  // Symbol rotation in degrees (0-360)
  symbolRotate: number;
  // Previous position for smooth animation
  prevLat?: number;
  prevLon?: number;
  // Timestamp when position was last updated
  updatedAt: number;
  // Whether this is stale data
  isStale: boolean;
}

// Map configuration
export interface MapConfig {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  pitch: number;
  bearing: number;
}

// Map style configuration
export interface MapStyle {
  url: string;
  name: string;
}

// Application state
export interface AppState {
  // Map state
  mapLoaded: boolean;
  mapError: string | null;
  
  // Aircraft data
  aircraft: Map<string, DisplayAircraft>;
  lastUpdate: number | null;
  isLoading: boolean;
  error: string | null;
  
  // Polling state
  pollingInterval: number;
  isPolling: boolean;
  lastPollTime: number | null;
  
  // Stale/down banner
  showStaleBanner: boolean;
  staleMessage: string | null;
  
  // Selected aircraft for details panel
  selectedAircraftId: string | null;
}

// Status banner state
export interface BannerState {
  type: 'info' | 'warning' | 'error' | null;
  message: string | null;
  visible: boolean;
}

// Polling configuration
export interface PollingConfig {
  interval: number; // milliseconds
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
}

// Default map configuration for Netherlands
export const DEFAULT_MAP_CONFIG: MapConfig = {
  center: [4.7639, 52.3086], // Schiphol area
  zoom: 8,
  minZoom: 6,
  maxZoom: 14,
  pitch: 0,
  bearing: 0,
};

// PDOK BRT (Base Register Topografie) style
export const PDOK_BRT_STYLE: MapStyle = {
  url: 'https://geodata.nationaalgeoregister.nl/tiles/service/tms/1.0.0/brtachtergrondkaart/{z}/{x}/{y}.png',
  name: 'PDOK BRT Achtergrondkaart',
};

// Default polling configuration
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  interval: 5000, // 5 seconds
  enabled: true,
  maxRetries: 3,
  retryDelay: 1000,
};

// Bounding box for Netherlands (used for filtering)
export const NETHERLANDS_BBOX: [number, number, number, number] = [
  2.5, // min lon
  50.5, // min lat
  7.5, // max lon
  54.0, // max lat
];
