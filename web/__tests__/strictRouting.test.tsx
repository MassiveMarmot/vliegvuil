// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Strict routing + page-view counting (review findings):
// 1. parsePath must reject extra segments (/nl/about/x was rendered as
//    About), double slashes (/nl//about) and anything but the three
//    known pages after the language segment.
// 2. A page view counts only when the PATHNAME actually changed: a
//    first load of '/' (SW path: not-found first, then map) counts
//    exactly ONCE, and a language change counts once.
// 3. The not-found view carries <meta name="robots" content="noindex">
//    and other routes do not.
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { parsePath } from '../src/hooks/useRouter';
import type { PositionProvider, AircraftPosition } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]): Promise<AircraftPosition[]> =>
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>)),
      getDataAge: () => 0,
      getLastError: () => null,
      isStale: () => false,
      getServerNow: (): number => Date.now() / 1000,
    }),
  };
});
vi.mock('maplibre-gl', () => {
  const mapApi = (): Record<string, unknown> => ({
    getContainer: (): HTMLDivElement => document.createElement('div'),
    on: (): object => ({}), off: (): object => ({}),
    addControl: (): object => ({}), removeControl: (): void => undefined,
    remove: (): void => undefined, isStyleLoaded: (): boolean => false,
    getCanvas: (): { style: Record<string, string> } => ({ style: {} }),
    getLayer: (): boolean => false, getSource: (): undefined => undefined,
    addSource: (): void => undefined, addLayer: (): void => undefined,
    setLayoutProperty: (): void => undefined, fitBounds: (): void => undefined,
    addImage: (): void => undefined,
  });
  const FakeMap = class { constructor() { Object.assign(this, mapApi()); } };
  return {
    default: { Map: FakeMap }, Map: FakeMap,
    LngLatBounds: class { constructor() {} },
    NavigationControl: class {
      onAdd(): HTMLButtonElement {
        const b = document.createElement('button');
        b.setAttribute('aria-label', 'x');
        return b;
      }
      onRemove(): void {}
    },
  };
});



// The env flag must be set BEFORE App (and its analytics import) loads, so
// ANALYTICS_ENABLED binds true for the whole file. The Image stub records
// every /count request's p= path.
process.env['VITE_ANALYTICS'] = '1';
const allCountedPaths: Array<string> = [];
vi.stubGlobal('Image', class {
  _src = '';
  get src(): string { return this._src; }
  set src(value: string) {
    this._src = value;
    const p = new URLSearchParams(value.split('?')[1] ?? '').get('p');
    if (p !== null) allCountedPaths.push(p);
  }
});
function countedPaths(): { paths: Array<string> } {
  return { paths: allCountedPaths };
}
// Imported AFTER the env flag is set (static imports are hoisted above
// it), so App's analytics module binds ANALYTICS_ENABLED = true.
let App: React.ComponentType;
beforeAll(async (): Promise<void> => {
  App = (await import('../src/App')).default;
});

function setPath(path: string): void {
  window.history.replaceState({}, '', path);
}

beforeEach(() => {
  fetchPositions.mockReset();
  fetchPositions.mockResolvedValue([]);
  allCountedPaths.length = 0;
});
afterEach(() => {
  cleanup();
  setPath('/nl/');
});

describe('parsePath is strict', () => {
  it('/nl/ and /nl are the map', () => {
    expect(parsePath('/nl/')).toEqual({ language: 'nl', route: 'map' });
    expect(parsePath('/nl')).toEqual({ language: 'nl', route: 'map' });
  });
  it('/nl/about and /nl/about/ are about (one optional trailing slash)', () => {
    expect(parsePath('/nl/about')).toEqual({ language: 'nl', route: 'about' });
    expect(parsePath('/nl/about/')).toEqual({ language: 'nl', route: 'about' });
  });
  it('extra segments are not-found: /nl/about/x', () => {
    expect(parsePath('/nl/about/x')).toEqual({ language: 'nl', route: 'not-found' });
  });
  it('double slashes are not-found: /nl//about', () => {
    expect(parsePath('/nl//about')).toEqual({ language: 'nl', route: 'not-found' });
  });
  it('unknown pages are not-found: /nl/whargarbl', () => {
    expect(parsePath('/nl/whargarbl')).toEqual({ language: 'nl', route: 'not-found' });
  });
  it('trailing slash only: /nl/// is not-found', () => {
    expect(parsePath('/nl///')).toEqual({ language: 'nl', route: 'not-found' });
  });
  it('no language segment is not-found', () => {
    expect(parsePath('/')).toEqual({ language: 'nl', route: 'not-found' });
  });
});

describe('page views count exactly once per real navigation', () => {
  it('a first load of "/" counts exactly once (SW not-found -> map path)', async () => {
    const { paths } = countedPaths();
    setPath('/');
    render(<App />);
    // The router's mount effect replaces '/' with the language root
    // (which language depends on navigator.languages in this environment)
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    const settled = window.location.pathname;
    expect(settled).toMatch(/^\/(nl|en)\/$/);
    // Exactly ONE count of the settled path — not one for the not-found
    // first paint plus one for the redirect, and none for re-renders.
    expect(paths.filter((p): boolean => p === settled)).toHaveLength(1);
    // The transient not-found path ('/') was never counted
    expect(paths).toHaveLength(1);
  });

  it('a language switch counts exactly once for the new path', async () => {
    const { paths } = countedPaths();
    setPath('/nl/');
    render(<App />);
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(paths.filter((p): boolean => p === '/nl/')).toHaveLength(1);
    // Switch language via the menu (nl -> en): the path becomes /en/
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const enSwitch = screen.getByRole('link', { name: /^english$/i });
    await act(async (): Promise<void> => {
      fireEvent.click(enSwitch);
    });
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(window.location.pathname).toBe('/en/');
    expect(paths.filter((p): boolean => p === '/en/')).toHaveLength(1);
    // No extra counts of the old path from re-renders
    expect(paths.filter((p): boolean => p === '/nl/')).toHaveLength(1);
  });
});

describe('not-found carries noindex, other routes do not', () => {
  function robotsMeta(): HTMLMetaElement | null {
    return document.querySelector('meta[name="robots"]');
  }

  it('shows noindex on the not-found view', async () => {
    setPath('/nl/whargarbl');
    render(<App />);
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(robotsMeta()?.getAttribute('content')).toBe('noindex');
  });

  it('no noindex on the map route', async () => {
    setPath('/nl/');
    render(<App />);
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(robotsMeta()).toBeNull();
  });

  it('noindex is removed again after navigating from not-found to a page', async () => {
    setPath('/nl/whargarbl');
    render(<App />);
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(robotsMeta()?.getAttribute('content')).toBe('noindex');
    // Navigate home via the brand link
    fireEvent.click(document.querySelector('a.brand') as HTMLAnchorElement);
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 0); });
    });
    expect(robotsMeta()).toBeNull();
  });
});
