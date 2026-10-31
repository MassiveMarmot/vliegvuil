// Wiring tests for the installed-PWA root path (the '/'+manifest bug):
// the service worker's navigation fallback serves index.html for '/' and
// bypasses Caddy's root redirect, so the router itself must redirect '/'
// to a language root, and the manifest must not start at '/'.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]) => {
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>));
        return Promise.resolve([]);
      },
      getDataAge: (): number => 0,
      getLastError: (): null => null,
      isStale: (): boolean => false,
      getServerNow: (): number => Date.now() / 1000,
    }),
  };
});

vi.mock('maplibre-gl', () => ({
  default: { Map: class {} },
  Map: class {},
  LngLatBounds: class {},
}));
vi.mock('../src/components/Map', () => ({
  Map: (): null => null,
  default: (): null => null,
}));

import App from '../src/App';
import { rootLanguage } from '../src/hooks/useRouter';

describe('root path wiring (installed PWA)', () => {
  beforeEach((): void => {
    fetchPositions.mockClear();
    window.history.replaceState({}, '', '/');
  });
  afterEach((): void => {
    cleanup();
    window.history.replaceState({}, '', '/nl/');
  });

  it("redirects '/' to /nl/ and renders the map, not the not-found page", (): void => {
    // jsdom's default navigator.languages is ['en-US'], which correctly
    // redirects to /en/; pin the languages so the default-nl branch runs.
    vi.stubGlobal('navigator', { languages: ['nl-NL'] });
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(window.location.pathname).toBe('/nl/');
    // The map view renders (header present, no not-found heading)
    expect(document.querySelector('.app-header')).not.toBeNull();
    expect(screenQueryNotFound()).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects '/' to /en/ when the first navigator language tag is English", (): void => {
    vi.stubGlobal('navigator', { languages: ['en-US', 'en'] });
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(window.location.pathname).toBe('/en/');
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects '/' to /nl/ for a non-English first language tag", (): void => {
    vi.stubGlobal('navigator', { languages: ['de-DE', 'en'] });
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(window.location.pathname).toBe('/nl/');
    cleanup();
    vi.unstubAllGlobals();
  });

  it('rootLanguage: en only for a leading English tag, nl otherwise', (): void => {
    expect(rootLanguage(['en'])).toBe('en');
    expect(rootLanguage(['en-GB', 'nl'])).toBe('en');
    expect(rootLanguage(['nl-NL', 'en'])).toBe('nl');
    expect(rootLanguage(['de'])).toBe('nl');
    expect(rootLanguage([])).toBe('nl');
  });
});

describe('manifest start_url (built output)', () => {
  const manifestPath = resolve(__dirname, '..', 'dist', 'manifest.webmanifest');

  it('is built (run `pnpm --filter @vliegvuil/web build` before this test)', () => {
    expect(existsSync(manifestPath), `${manifestPath} not found`).toBe(true);
  });

  it("starts at a language path ('/nl/'), never at '/'", (): void => {
    if (!existsSync(manifestPath)) return; // covered by the guard above
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      start_url?: string;
      scope?: string;
    };
    // The router shows not-found at '/', and the installed PWA bypasses
    // Caddy's root redirect, so the manifest must not start there.
    expect(manifest.start_url).toBe('/nl/');
    // scope stays '/' so the installed app can still navigate to /en/.
    expect(manifest.scope).toBe('/');
  });

  it('the MapLibre worker file is emitted unhashed (build-output wiring)', (): void => {
    // maplibre-gl 6 derives the worker URL at runtime from
    // import.meta.url of the chunk in /assets/, so the worker MUST be at
    // dist/assets/maplibre-gl-worker.mjs — unhashed, or the runtime URL
    // never matches and every GeoJSON layer silently dies in the browser
    // (observed live: Firefox "disallowed MIME type text/html").
    const worker = resolve(__dirname, '..', 'dist', 'assets', 'maplibre-gl-worker.mjs');
    if (!existsSync(worker)) {
      // covered by the guard above if the build never ran
      throw new Error(
        'dist/assets/maplibre-gl-worker.mjs is MISSING: the maplibreWorkerAsset ' +
          'plugin in web/vite.config.ts did not emit the worker. Planes, airports ' +
          'and the noise overlay will not render.',
      );
    }
    const bytes = readFileSync(worker);
    expect(bytes.length).toBeGreaterThan(100_000);
    // It is a self-contained ESM module: no relative imports that would 404.
    expect(bytes.subarray(0, 50).includes('import')).toBe(false);
  });

  it('the favicon referenced by index.html and the SW precache exists', (): void => {
    const favicon = resolve(__dirname, '..', 'public', 'favicon.ico');
    expect(existsSync(favicon), 'web/public/favicon.ico not found').toBe(true);
    if (existsSync(favicon)) {
      // ICO magic: reserved 0, type 1 (icon)
      const buf = readFileSync(favicon);
      expect(buf.readUInt16LE(0)).toBe(0);
      expect(buf.readUInt16LE(2)).toBe(1);
      expect(buf.readUInt16LE(4)).toBeGreaterThan(0);
    }
  });
});

function screenQueryNotFound(): Element | null {
  return document.querySelector('main.not-found-page, .not-found-page');
}
