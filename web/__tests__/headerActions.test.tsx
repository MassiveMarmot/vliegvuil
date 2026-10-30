// Session 25 follow-up: header actions triggered on a non-map route
// navigate to the map first, then apply, so the result is visible and no
// stale state (a panel popping open on the next map visit) is left behind.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { PositionProvider, AircraftPosition } from '@vliegvuil/core';

// Two aircraft (core positions) so a search has a result to select; the
// app converts them to DisplayAircraft on update.
const FIXTURE: AircraftPosition[] = [
  {
    icao24: '484011', callsign: 'KLM123', registration: 'PH-KLM',
    type: 'B738', operator: 'KLM', latitude: 52.3, longitude: 4.9,
    altitude: 10000, speed: 250, heading: 90, squawk: '1000',
    onGround: false, verticalRate: 0, timestamp: Math.floor(Date.now() / 1000),
  },
  {
    icao24: '3c1234', callsign: 'DLH456', registration: 'D-AABC',
    type: 'A320', operator: 'Lufthansa', latitude: 52.1, longitude: 5.2,
    altitude: 8000, speed: 300, heading: 270, squawk: '1000',
    onGround: false, verticalRate: 0, timestamp: Math.floor(Date.now() / 1000),
  },
];
// fetchPositions returns the fixture; the mock search then has results.
const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]): Promise<typeof FIXTURE> => {
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>));
        return Promise.resolve(FIXTURE);
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
}));
vi.mock('../src/components/Map', () => ({
  Map: (): null => null,
  default: (): null => null,
}));

import App from '../src/App';

function setPath(path: string): void {
  window.history.replaceState({}, '', path);
}

// jsdom lacks matchMedia (the search box's mode hook needs it)
beforeEach((): void => {
  const mql = {
    matches: false,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (_q: string): MediaQueryList => mql as unknown as MediaQueryList,
  );
});

async function renderAndWait(path: string): Promise<void> {
  setPath(path);
  render(<App />);
  // Let the first poll resolve so the search has aircraft
  await act(async (): Promise<void> => {
    await new Promise((r): void => { setTimeout(r, 10); });
  });
}

describe('header actions from non-map routes (session 25 fix)', () => {
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
    vi.restoreAllMocks();
  });

  it('Settings from the About menu navigates to the map and opens the panel', async (): Promise<void> => {
    await renderAndWait('/nl/about');
    expect(window.location.pathname).toBe('/nl/about');
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(window.location.pathname).toBe('/nl/');
    const panel = document.querySelector('.settings-panel');
    expect(panel).not.toBeNull();
  });

  it('session 26: the list toggle (counter) exists only on the map route', async (): Promise<void> => {
    // The header Lijst button is gone; the counter that replaced it is map
    // chrome, so from About there is no list affordance (session 26
    // decision). On the map it toggles the list as before.
    await renderAndWait('/nl/about');
    expect(screen.queryByRole('button', { name: /vliegtuigen: \d+/i })).toBeNull();
    cleanup();
    await renderAndWait('/nl/');
    const toggle = screen.getByRole('button', { name: /vliegtuigen: \d+/i });
    fireEvent.click(toggle);
    expect(document.querySelector('.aircraft-list')).not.toBeNull();
  });

  it('a search selection from About navigates to the map and shows the telemetry panel for that aircraft', async (): Promise<void> => {
    await renderAndWait('/nl/about');
    // Expand the search (narrow mode: icon button) and type a query
    // The mocked t() returns the raw key when the call has no fallback
    fireEvent.click(screen.getByRole('button', { name: /search\.open/i }));
    const input = document.querySelector('input.search-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'KLM123' } });
    fireEvent.focus(input);
    // The results dropdown appears; click the result
    const result = await screen.findByRole('option');
    const button = result.querySelector('button');
    expect(button).not.toBeNull();
    fireEvent.mouseDown(button as HTMLElement);
    expect(window.location.pathname).toBe('/nl/');
    // The telemetry panel shows the selected aircraft
    const telemetry = document.querySelector('.telemetry-panel');
    expect(telemetry).not.toBeNull();
    expect(telemetry?.textContent).toContain('KLM123');
  });

  it('on the map the three actions behave as before (settings opens; list toggles)', async (): Promise<void> => {
    await renderAndWait('/nl/');
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(document.querySelector('.settings-panel')).not.toBeNull();
    // Close settings, then toggle the list twice (open, close)
    fireEvent.click(screen.getByRole('button', { name: /sluiten/i }));
    expect(document.querySelector('.settings-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(document.querySelector('.aircraft-list')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(document.querySelector('.aircraft-list')).toBeNull();
  });

  it('navigating About -> map via the menu does not open Settings', async (): Promise<void> => {
    await renderAndWait('/nl/about');
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('link', { name: /^kaart$/i }));
    expect(window.location.pathname).toBe('/nl/');
    expect(document.querySelector('.settings-panel')).toBeNull();
  });

  it('no stale state: opening Settings on About then going to the map by link leaves the panel closed', async (): Promise<void> => {
    await renderAndWait('/nl/about');
    // Open settings (navigates to the map AND opens the panel) — that is
    // the new behaviour. The OLD bug left showSettings true with no panel;
    // prove the new path shows the panel immediately and a later About ->
    // map link keeps it closed.
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(document.querySelector('.settings-panel')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /sluiten/i }));
    // About again, then map via the brand link: no panel
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('link', { name: /^over$/i }));
    fireEvent.click(screen.getByRole('link', { name: /vliegvuil/i }));
    expect(window.location.pathname).toBe('/nl/');
    expect(document.querySelector('.settings-panel')).toBeNull();
  });
});

describe('Settings and List are mutually exclusive', () => {
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
    vi.restoreAllMocks();
  });

  it('Settings open, click List: the list is open and Settings is closed', async (): Promise<void> => {
    await renderAndWait('/nl/');
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(document.querySelector('.settings-panel')).not.toBeNull();
    // Open the list: Settings must close
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(document.querySelector('.aircraft-list')).not.toBeNull();
    expect(document.querySelector('.settings-panel')).toBeNull();
  });

  it('List open, choose Settings in the menu: Settings is open and the list is closed', async (): Promise<void> => {
    await renderAndWait('/nl/');
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(document.querySelector('.aircraft-list')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(document.querySelector('.settings-panel')).not.toBeNull();
    expect(document.querySelector('.aircraft-list')).toBeNull();
  });

  it('opening and closing each one alone behaves as before', async (): Promise<void> => {
    await renderAndWait('/nl/');
    // Settings alone
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen/i }));
    expect(document.querySelector('.settings-panel')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /sluiten/i }));
    expect(document.querySelector('.settings-panel')).toBeNull();
    // List alone: open then close
    fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    expect(document.querySelector('.aircraft-list')).not.toBeNull();
    // The list's own close button
    const closeButton = document.querySelector('.aircraft-list-close') as HTMLElement | null;
    if (closeButton) {
      fireEvent.click(closeButton);
    } else {
      fireEvent.click(screen.getByRole('button', { name: /vliegtuigen: \d+/i }));
    }
    expect(document.querySelector('.aircraft-list')).toBeNull();
    // Nothing opened
    expect(document.querySelector('.settings-panel')).toBeNull();
  });
});
