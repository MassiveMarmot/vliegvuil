/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the adsb.lol proxy; same-origin /api by default */
  readonly VITE_API_BASE: string;
  /** Legacy MapTiler key (unused; kept for type compatibility) */
  readonly VITE_MAPTILER_KEY: string;
  /** Dev-only: set to '1' to serve mock aircraft data */
  readonly VITE_MOCK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
