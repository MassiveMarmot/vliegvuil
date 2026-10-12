// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
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

// Self-hosted BRT-A tiles: the PNG tiles are downloaded once from the PDOK
// WMTS (scripts/vps-tiles-update.js) and served from our own origin, so the
// browser never contacts service.pdok.nl. Kept as the same {z}/{x}/{y}.png
// layout. Kadaster attribution stays (BRT-A is CC-BY 4.0).
export const PDOK_BRT_TILE_URL = '/tiles/{z}/{x}/{y}.png';

export const PDOK_BRT_ATTRIBUTION = 'Kaartgegevens © PDOK / Kadaster';

export const PDOK_BRT_STYLE: MapStyle = {
  url: PDOK_BRT_TILE_URL,
  name: 'PDOK BRT Achtergrondkaart',
};

/** Basemap tile URL from config (VITE_TILE_URL), PDOK default */
export function getBasemapUrl(): string {
  return import.meta.env.VITE_TILE_URL ?? PDOK_BRT_TILE_URL;
}

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
