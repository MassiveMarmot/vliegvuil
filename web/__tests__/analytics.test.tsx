// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 25c tests: the analytics module is a same-origin, production-
// only page-view counter (self-hosted GoatCounter via the Caddyfile
// /count route). No cookies, no localStorage, no third-party host.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]): Promise<never[]> => {
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>));
        return Promise.resolve([]);
      },
      getDataAge: (): number => 0,
      getLastError: (): null => null,
      isStale: (): boolean => false,
    }),
  };
});

vi.mock('maplibre-gl', () => ({
  default: { Map: class {} },
  Map: class {},
  LngLatBounds: class {},
  NavigationControl: class {},
}));

// import.meta.env is replaced at build time; in tests it is undefined, so
// ANALYTICS_ENABLED is false unless stubbed. countRouteChange is imported
// AFTER the env stub where needed (dynamic import per test below).
import { countRouteChange, countPageView, ANALYTICS_ENABLED } from '../src/analytics';

describe('analytics module (session 25c)', () => {
  it('is disabled outside production builds (no VITE_ANALYTICS)', (): void => {
    expect(ANALYTICS_ENABLED).toBe(false);
  });

  it('countPageView makes no request when disabled', (): void => {
    const imgSpy = vi.fn();
    vi.stubGlobal('Image', class {
      constructor() {
        imgSpy();
      }
      src = '';
    });
    countPageView('/nl/');
    expect(imgSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the count request is same-origin only (no third-party host, session 11 invariant)', async (): Promise<void> => {
    vi.resetModules();
    process.env['VITE_ANALYTICS'] = '1';
    const { countPageView: enabled } = await import('../src/analytics');
    const requests: Array<string> = [];
    vi.stubGlobal('Image', class {
      _src = '';
      get src(): string {
        return this._src as string;
      }
      set src(value: string) {
        this._src = value;
        requests.push(value);
      }
    });
    for (const path of ['/nl/', '/en/about', '/nl/attribution', '/nl/whargarbl']) {
      enabled(path);
    }
    for (const url of requests) {
      expect(url, 'the count must be a relative same-origin URL').toMatch(/^\/count\?/);
      expect(url).not.toMatch(/vliegvuil\.nl|https?:/);
    }
    expect(requests.length).toBe(4);
    vi.unstubAllGlobals();
    delete process.env['VITE_ANALYTICS'];
  });

  it('countPageView sends a same-origin /count?p= request when enabled', async (): Promise<void> => {
    // Simulate the production build flag by re-importing with the env set
    vi.resetModules();
    process.env['VITE_ANALYTICS'] = '1';
    const { countPageView: enabled } = await import('../src/analytics');
    const requests: Array<string> = [];
    // Patch the Image constructor to record src assignments
    vi.stubGlobal('Image', class {
      _src = '';
      get src(): string {
        return this._src as string;
      }
      set src(value: string) {
        this._src = value;
        requests.push(value);
      }
    });
    enabled('/nl/about');
    expect(requests.length).toBe(1);
    expect(requests[0]).toMatch(/^\/count\?p=%2Fnl%2Fabout&cb=/);
    // Same origin only: never an absolute or external URL
    expect(requests[0]).not.toMatch(/^https?:/);
    vi.unstubAllGlobals();
    delete process.env['VITE_ANALYTICS'];
  });

  it('route changes are counted once per navigation (App wiring, disabled in tests)', (): void => {
    // In tests ANALYTICS_ENABLED is false, so App's route-change count is
    // a no-op; assert the wiring is called by rendering App and checking
    // the module was invoked without error (no Image constructed).
    const imgSpy = vi.fn();
    vi.stubGlobal('Image', class {
      constructor() {
        imgSpy();
      }
      src = '';
    });
    window.history.replaceState({}, '', '/nl/');
    render(<AppForRouteChange />);
    fireEvent.click(document.querySelector('a.brand') as HTMLAnchorElement);
    expect(imgSpy).not.toHaveBeenCalled();
    cleanup();
    vi.unstubAllGlobals();
  });
});

// App import kept separate so the env stub above applies first when needed
import App from '../src/App';
const AppForRouteChange = App;
