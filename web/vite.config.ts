import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,png}'],
        // App shell only: never touch /api or PDOK tile traffic.
        // Session 25: real paths. The navigation fallback serves the app
        // shell for /{lang}/... deep links but never for the API, the
        // self-hosted tiles, the map glyphs or other static asset paths.
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
