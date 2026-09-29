/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_MAPTILER_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type declarations for @vliegvuil/core
// This allows the web package to import from the core package in development
declare module '@vliegvuil/core' {
  export interface AircraftPosition {
    icao24: string;
    callsign: string | null;
    registration: string | null;
    type: string | null;
    operator: string | null;
    latitude: number;
    longitude: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    verticalRate: number | null;
    squawk: string | null;
    timestamp: number;
    onGround: boolean;
  }

  export type { AircraftPosition };
}
