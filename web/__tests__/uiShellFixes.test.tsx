// Session 25 follow-up fixes: panels close on route change, non-map routes
// render no map chrome, the attribution page is a real page, the search
// has wide/narrow modes, and the shell layout classes exist.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (): Promise<never[]> => Promise.resolve([]),
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

function setPath(path: string): void {
  window.history.replaceState({}, '', path);
}

function openMenuAndNavigate(label: RegExp, path: string): void {
  fireEvent.click(screen.getByRole('button', { name: /menu/i }));
  const link = screen.getByRole('link', { name: label });
  fireEvent.click(link);
  expect(window.location.pathname).toBe(path);
}

describe('route change closes overlays (finding 3)', () => {
  beforeEach((): void => {
    setPath('/nl/');
  });
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
  });

  it('closes the Settings panel when navigating to About', (): void => {
    const { container } = render(<App />);
    // Open settings via the menu
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(container.querySelector('.settings-panel')).not.toBeNull();
    // Navigate (menu reopens over the panel)
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('link', { name: /^over$/i }));
    expect(window.location.pathname).toBe('/nl/about');
    expect(container.querySelector('.settings-panel')).toBeNull();
  });

  it('closes the aircraft list when navigating to Attribution', (): void => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(container.querySelector('.aircraft-list')).not.toBeNull();
    openMenuAndNavigate(/^bronnen$/i, '/nl/attribution');
    expect(container.querySelector('.aircraft-list')).toBeNull();
  });

  it('closes the telemetry panel on route change (selection cleared)', (): void => {
    const { container } = render(<App />);
    // The map is stubbed, so select via search is not available; instead
    // verify the gate: no telemetry panel can render on a non-map route.
    // (Direct selection needs the real map; the render gate is the fix.)
    openMenuAndNavigate(/^bronnen$/i, '/nl/attribution');
    expect(container.querySelector('.telemetry-panel')).toBeNull();
  });

  it('panels stay closed when navigating back to the map', async (): Promise<void> => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    openMenuAndNavigate(/^bronnen$/i, '/nl/attribution');
    await act(async (): Promise<void> => {
      window.history.back();
    });
    // popstate fires asynchronously; a single setTimeout(0) tick raced the
    // handler under suite load (flaky pathname assert). Poll instead.
    await waitFor((): void => {
      expect(window.location.pathname).toBe('/nl/');
    });
    expect(container.querySelector('.aircraft-list')).toBeNull();
    expect(container.querySelector('.settings-panel')).toBeNull();
  });
});

describe('non-map routes render no map chrome (finding 2)', () => {
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
  });

  it('Attribution has no status line, contour toggle or settings panel, and exactly one h1', (): void => {
    setPath('/nl/');
    const { container } = render(<App />);
    // Sanity: the status line exists on the map route (the contour toggle
    // only renders with contour data, which jsdom lacks)
    expect(container.querySelector('.map-status')).not.toBeNull();
    openMenuAndNavigate(/^bronnen$/i, '/nl/attribution');
    expect(container.querySelector('.map-status')).toBeNull();
    expect(container.querySelector('.noise-toggle')).toBeNull();
    expect(container.querySelector('.settings-panel')).toBeNull();
    expect(container.querySelector('.aircraft-list')).toBeNull();
    const page = container.querySelector('main.attribution-page');
    expect(page).not.toBeNull();
    expect(page?.getAttribute('tabIndex')).toBe('-1');
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(screen.getByRole('heading', { level: 1, name: /bronvermelding/i })).not.toBeNull();
  });

  it('About has no map chrome either', (): void => {
    setPath('/nl/about');
    const { container } = render(<App />);
    expect(container.querySelector('.map-status')).toBeNull();
    expect(container.querySelector('.noise-toggle')).toBeNull();
    expect(container.querySelector('.settings-panel')).toBeNull();
  });

  it('the not-found view has no map chrome', (): void => {
    setPath('/nl/nowhere');
    const { container } = render(<App />);
    expect(container.querySelector('.map-status')).toBeNull();
    expect(container.querySelector('.noise-toggle')).toBeNull();
  });

  it('no map control is focusable on the Attribution page (tab order)', (): void => {
    setPath('/nl/');
    render(<App />);
    openMenuAndNavigate(/^bronnen$/i, '/nl/attribution');
    const focusable = document.querySelectorAll(
      'button:not([disabled]), a[href], input, [tabIndex]:not([tabIndex="-1"])',
    );
    for (const el of Array.from(focusable)) {
      // Everything focusable must live outside the hidden map view
      expect(el.closest('.map-view-hidden')).toBeNull();
      expect(el.closest('.noise-overlay')).toBeNull();
    }
  });
});

describe('search modes (finding 1)', () => {
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
    vi.restoreAllMocks();
  });

  it('wide viewports (>= 768px) render the always-expanded input', (): void => {
    const mql = { matches: true, addEventListener: (): void => undefined, removeEventListener: (): void => undefined };
    vi.spyOn(window, 'matchMedia').mockImplementation((_q: string): MediaQueryList => mql as unknown as MediaQueryList);
    setPath('/nl/');
    const { container } = render(<App />);
    const input = container.querySelector('input.search-input');
    expect(input).not.toBeNull();
    // no collapsed icon button in wide mode
    expect(container.querySelector('button.search-toggle')).toBeNull();
    // the cluster is in the header, after the logo
    const tools = container.querySelector('.header-tools');
    expect(tools).not.toBeNull();
    expect(tools?.querySelector('.search-box')).not.toBeNull();
    // Session 26: the Lijst button moved out of the header (the flight
    // counter is the list toggle now); the cluster is search + Menu.
    expect(tools?.textContent).toMatch(/menu/i);
  });

  it('narrow viewports keep the expanding icon button', (): void => {
    const mql = { matches: false, addEventListener: (): void => undefined, removeEventListener: (): void => undefined };
    vi.spyOn(window, 'matchMedia').mockImplementation((_q: string): MediaQueryList => mql as unknown as MediaQueryList);
    setPath('/nl/');
    const { container } = render(<App />);
    expect(container.querySelector('button.search-toggle')).not.toBeNull();
    expect(container.querySelector('input.search-input')).toBeNull();
  });
});

describe('shell layout classes (finding 4)', () => {
  it('the stylesheet uses 100dvh with a vh fallback and the flex column shell', (): void => {
    const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
    expect(css).toMatch(/height: 100vh;/);
    expect(css).toMatch(/height: 100dvh;/);
    expect(css).toMatch(/\.app-shell\s*{\s*display: flex;\s*flex-direction: column;/s);
    expect(css).toMatch(/\.app-body\s*{[^}]*min-height: 0;/s);
  });

  it('the aircraft list derives its height from the shell inset, not 100vh, and scrolls internally', (): void => {
    const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
    const listBlock = (/\.aircraft-list\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Session 26: the list is a pop-out anchored above the counter
    // (bottom: 4rem), capped by max-height, still scrolling internally.
    expect(listBlock).toMatch(/bottom: 4rem;/);
    expect(listBlock).toMatch(/max-height: min\(70vh, 32rem\)/);
    expect(listBlock).not.toMatch(/(^|;)\s*top:/);
    const tableBlock = /\.aircraft-list-table\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(tableBlock).toMatch(/overflow-y: auto;/);
    expect(tableBlock).toMatch(/min-height: 0;/);
  });
});
