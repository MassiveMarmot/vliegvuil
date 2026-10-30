import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'path';

/**
 * maplibre-gl 6.x builds its worker URL at RUNTIME via
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, so the bundler
 * never sees the file as an asset and does not emit it (the planes,
 * airport and noise layers then fail with "disallowed MIME type" because
 * the SPA fallback answers index.html for the missing file). Emit the
 * worker UNHASHED next to the hashed chunks: import.meta.url of the Map
 * chunk resolves to /assets/, so the runtime URL only matches an unhashed
 * /assets/maplibre-gl-worker.mjs. Never `?url` imports: they hash the
 * filename and the runtime URL would not match. The worker file is
 * self-contained (no relative imports), so this one file is sufficient.
 */
function maplibreWorkerAsset(): Plugin {
  return {
    name: 'vliegvuil:maplibre-worker',
    apply: 'build',
    generateBundle() {
      const require = createRequire(import.meta.url);
      const pkgJson = require.resolve('maplibre-gl/package.json');
      const workerPath = path.join(path.dirname(pkgJson), 'dist', 'maplibre-gl-worker.mjs');
      this.emitFile({
        type: 'asset',
        fileName: 'assets/maplibre-gl-worker.mjs',
        source: readFileSync(workerPath),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    maplibreWorkerAsset(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'VliegVuil.nl',
        short_name: 'VliegVuil',
        description: 'Visualisatie van vliegvervuiling in Nederland',
        lang: 'nl',
        theme_color: '#f7f3ec',
        background_color: '#f7f3ec',
        display: 'standalone',
        // The language path is required: the router shows not-found at '/'
        // (Caddy's root redirect does not run for the installed PWA). scope
        // stays '/' so the app can still navigate to /en/ pages.
        start_url: '/nl/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,svg,woff2,png}'],
        // App shell only: never touch /api or PDOK tile traffic.
        // Session 25: real paths. The navigation fallback serves the app
        // shell for /{lang}/... deep links but never for the API, the
        // self-hosted tiles, the map glyphs or other static asset paths.
        // Session 25b: the prerendered per-language pages
        // (/{lang}/index.html, /{lang}/about/index.html, ...) are precached
        // by the html glob; the navigation fallback stays the language-
        // neutral shell (index.html), which routes by URL path — so one
        // language's shell is never served for another language's URL.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/tiles\//,
          /^\/fonts\//,
          /^\/data\//,
          /^\/noise-contours\.geojson$/,
          /\.[a-z0-9]+$/i,
        ],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@vliegvuil/core': path.resolve(__dirname, '../core/src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
