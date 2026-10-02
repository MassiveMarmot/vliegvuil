/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the adsb.fi proxy; same-origin /api by default */
  readonly VITE_API_BASE: string;
  /** Legacy MapTiler key (unused; kept for type compatibility) */
  readonly VITE_MAPTILER_KEY: string;
  /** Dev-only: set to '1' to serve mock aircraft data */
  readonly VITE_MOCK: string;
  /** Optional override for the basemap tile URL (PDOK default) */
  readonly VITE_TILE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
