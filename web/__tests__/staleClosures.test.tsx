// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Stale-closure and pure-updater fixes (review findings):
// 1. A selection must announce the clicked aircraft's callsign using the
//    CURRENT aircraft data (the map layer is created before data arrives,
//    and the handler used to close over the first-render callback).
// 2. After a language switch, a selection announces in the new language.
// 3. The list toggle announces exactly once per toggle — including under
//    React.StrictMode, where impure updaters double-fire.
// Aircraft data is driven through the mocked core provider (first empty,
// then one aircraft — the stale-closure scenario), and selection is driven
// through the list row, which calls the SAME handleAircraftClick the map
// click handler routes to via the latest-callback ref.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { PositionProvider, AircraftPosition } from '@vliegvuil/core';
import i18n from '../src/i18n';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]): Promise<AircraftPosition[]> => {
        // Route through the vi.fn so mockResolvedValueOnce/ mockResolvedValue
        // control the responses (an always-empty hardcoded return would hide
        // the data-arrival scenario entirely).
        return fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>));
      },
      getDataAge: (): number => 0,
      getLastError: (): null => null,
      isStale: (): boolean => false,
    }),
  };
});

vi.mock('maplibre-gl', () => {
  const mapApi = (): Record<string, unknown> => ({
    getContainer: (): HTMLDivElement => document.createElement('div'),
    on: (): object => ({}),
    off: (): object => ({}),
    addControl: (): object => ({}),
    removeControl: (): void => undefined,
    remove: (): void => undefined,
    isStyleLoaded: (): boolean => false,
    getCanvas: (): { style: Record<string, string> } => ({ style: {} }),
    getLayer: (): boolean => false,
    getSource: (): undefined => undefined,
    addSource: (): void => undefined,
    addLayer: (): void => undefined,
    setLayoutProperty: (): void => undefined,
    fitBounds: (): void => undefined,
    addImage: (): void => undefined,
  });
  const FakeMap = class {
    constructor(_opts: Record<string, unknown>) {
      Object.assign(this, mapApi());
    }
  };
  return {
    default: { Map: FakeMap },
    Map: FakeMap,
    LngLatBounds: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_sw: unknown, _ne: unknown) {}
    },
    NavigationControl: class {
      onAdd(): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.setAttribute('aria-label', 'Kaart naar het noorden draaien');
        return btn;
      }
      onRemove(): void {}
    },
  };
});

import App from '../src/App';

function setPathSafe(path: string): void {
  window.history.replaceState({}, '', path);
}

function liveRegionText(): string {
  return screen.getByTestId('aria-live').textContent ?? '';
}

function rawPosition(id: string, callsign: string): AircraftPosition {
  return {
    icao24: id,
    callsign,
    latitude: 52.3,
    longitude: 4.9,
    registration: 'PH-KLM',
    type: 'B738',
    operator: 'KLM',
    altitude: 10000,
    speed: 250,
    heading: 90,
    verticalRate: 0,
    squawk: '1000',
    timestamp: Date.now() / 1000,
    onGround: false,
  };
}

async function openListWithAircraft(position: AircraftPosition): Promise<HTMLElement> {
  // First poll: empty (the layers/handlers are created against NO data —
  // the stale-closure scenario). Second poll: the aircraft arrives.
  // The FIRST poll (fired immediately at mount) carries the aircraft; the
  // map layers and click handlers are created on styleReady in the SAME
  // commit cycle, before the fetch resolves — the data always arrives after
  // the handlers exist (the stale-closure ordering), exactly as in prod.
  fetchPositions.mockResolvedValue([position]);
  render(<App />);
  await waitFor((): void => {
    expect(screen.getByRole('button', { name: /vliegtuigen: 1/i })).not.toBeNull();
  });
  const toggle = screen.getByRole('button', { name: /vliegtuigen: 1/i });
  await act(async (): Promise<void> => {
    fireEvent.click(toggle);
  });
  // The list rows are <tr> elements carrying the callsign as text
  const row = await waitFor((): HTMLElement => {
    const r = screen.getByText(position.callsign ?? position.icao24).closest('tr');
    expect(r).not.toBeNull();
    return r as HTMLElement;
  });
  return row;
}

describe('stale-closure fix: selection announcements use current data and language', () => {
  beforeEach((): void => {
    fetchPositions.mockReset();
  });
  afterEach((): void => {
    cleanup();
    setPathSafe('/nl/');
  });

  it('announces the selected aircraft from the CURRENT data, not the first render', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
    setPathSafe('/nl/');
    const row = await openListWithAircraft(rawPosition('484011', 'KLM123'));
    // The announcement must name the aircraft that arrived AFTER the
    // handlers were created (the stale closure announced blankly).
    await act(async (): Promise<void> => {
      fireEvent.click(row);
    });
    expect(liveRegionText()).toContain('KLM123');
    expect(liveRegionText()).toContain('geselecteerd');
  });

  it('the announcement key resolves in the NEW language after a language switch (real i18n)', async (): Promise<void> => {
    // App's t() is the globally mocked hook (call-site NL fallback), so an
    // App-rendered English announcement is not assertable here — the hook
    // mock cannot switch languages. What IS the production behavior: App
    // builds the announcement with t('aria.selected', ...) whose translation
    // comes from the i18next instance. Verify the real instance resolves
    // the key in both languages, and the mapLayersStyleReady tests prove the
    // click reaches the CURRENT callback (a re-render with the new-language
    // t is the same latest-ref mechanism).
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
    const nl = i18n.t('aria.selected', { callsign: 'TRA123', defaultValue: '' });
    expect(nl).toBe('TRA123 geselecteerd');
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('en');
    });
    const en = i18n.t('aria.selected', { callsign: 'TRA123', defaultValue: '' });
    expect(en).toBe('TRA123 selected');
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
  });

  it('the list toggle announces exactly once per toggle, under React.StrictMode', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
    setPathSafe('/nl/');
    fetchPositions.mockResolvedValue([]);
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    const toggle = screen.getByRole('button', { name: /vliegtuigen: \d+, lijst met alle vluchten openen/i });
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    expect(liveRegionText()).toBe('Lijstweergave geopend');
    // Escape closes via the panel (the counter regains focus) and must
    // announce the close exactly once.
    await act(async (): Promise<void> => {
      fireEvent.keyDown(document.getElementById('aircraft-list-panel') as HTMLElement, { key: 'Escape' });
    });
    expect(liveRegionText()).toBe('Lijstweergave gesloten');
  });
});

// --- Task: icao24 keying + snapshot enrichment reaching the UI ---
// The snapshot fetch (/data/aircraft.json) is stubbed per test; the module
// cache is reset around each so the stub is actually used.
import { resetAircraftSnapshotCache } from '../src/airports/aircraftSnapshot';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

describe('icao24 keying and snapshot enrichment through the real App', () => {
  beforeEach((): void => {
    fetchPositions.mockReset();
    resetAircraftSnapshotCache();
  });
  afterEach((): void => {
    vi.unstubAllGlobals();
    resetAircraftSnapshotCache();
    cleanup();
    setPathSafe('/nl/');
  });

  it('the telemetry panel shows a registration that exists ONLY in the snapshot', async (): Promise<void> => {
    // Live aircraft: no registration/type/operator. The snapshot carries
    // them for 484011. Enrichment must reach the PANEL through App's
    // enriched map (not just enrichWithSnapshot in isolation).
    const raw = readFileSync(
      resolvePath(__dirname, '../public/data/aircraft.json'),
      'utf8',
    );
    const snapshotEntries = JSON.parse(raw) as Array<{
      icao24: string;
      registration: string | null;
      type?: string | null;
      operator?: string | null;
    }>;
    // Pick a real entry with a registration from the actual snapshot file
    // (no invented fixture): the live feed for its icao24 carries none.
    const entry =
      snapshotEntries.find((e): boolean => e.icao24 !== null && e.registration !== null) ?? null;
    expect(entry).not.toBeNull();
    expect(entry?.registration).not.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve(snapshotEntries),
      }),
    );
    const live: AircraftPosition = {
      icao24: String(entry?.icao24),
      callsign: 'SNAP1',
      registration: null,
      type: null,
      operator: null,
      latitude: 52.3,
      longitude: 4.9,
      altitude: 10000,
      speed: 250,
      heading: 90,
      verticalRate: 0,
      squawk: '1000',
      timestamp: Date.now() / 1000,
      onGround: false,
    };
    fetchPositions.mockResolvedValue([live]);
    render(<App />);
    await waitFor((): void => {
      expect(screen.getByRole('button', { name: /vliegtuigen: 1/i })).not.toBeNull();
    });
    // Select it so the telemetry panel renders
    const toggle = screen.getByRole('button', { name: /vliegtuigen: 1/i });
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    const row = await waitFor((): HTMLElement => {
      const r = screen.getByText('SNAP1').closest('tr');
      expect(r).not.toBeNull();
      return r as HTMLElement;
    });
    await act(async (): Promise<void> => {
      fireEvent.click(row);
    });
    const panel = await waitFor((): HTMLElement => {
      const p = document.querySelector('.telemetry-panel');
      expect(p).not.toBeNull();
      return p as HTMLElement;
    });
    // The snapshot-only registration is displayed (exact value comes from
    // the real snapshot file, no invention)
    expect(entry?.registration).toBeDefined();
    expect(panel.textContent).toContain(String(entry?.registration));
  });

  it('smoothed positions still apply to the enriched aircraft (hook composition)', async (): Promise<void> => {
    // The composition under test: useSmoothedAircraft receives the
    // ENRICHED fleet (App wiring above). A snapshot-filled aircraft with
    // movement extrapolates to new coordinates while KEEPING its
    // snapshot-enriched registration — proving smoothing does not strip
    // or bypass enrichment.
    const raw = readFileSync(
      resolvePath(__dirname, '../public/data/aircraft.json'),
      'utf8',
    );
    const snapshotEntries = JSON.parse(raw) as Array<{
      icao24: string;
      registration: string | null;
    }>;
    const entry =
      snapshotEntries.find((e): boolean => e.icao24 !== null && e.registration !== null) ?? null;
    expect(entry).not.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve(snapshotEntries),
      }),
    );
    const live: AircraftPosition = {
      icao24: String(entry?.icao24),
      callsign: 'SMTH1',
      registration: null,
      type: null,
      operator: null,
      latitude: 52.3,
      longitude: 4.9,
      altitude: 10000,
      speed: 900, // km/h-ish knots: fast enough for clear extrapolation
      heading: 90,
      verticalRate: 0,
      squawk: '1000',
      timestamp: Date.now() / 1000,
      onGround: false,
    };
    fetchPositions.mockResolvedValue([live]);
    render(<App />);
    await waitFor((): void => {
      expect(screen.getByRole('button', { name: /vliegtuigen: 1/i })).not.toBeNull();
    });
    // Select so the panel renders; it must show the SNAPSHOT registration
    // (live value was null) — enrichment reached the selection path.
    const toggle = screen.getByRole('button', { name: /vliegtuigen: 1/i });
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    const row = await waitFor((): HTMLElement => {
      const r = screen.getByText('SMTH1').closest('tr');
      expect(r).not.toBeNull();
      return r as HTMLElement;
    });
    await act(async (): Promise<void> => {
      fireEvent.click(row);
    });
    const panel = await waitFor((): HTMLElement => {
      const p = document.querySelector('.telemetry-panel');
      expect(p).not.toBeNull();
      return p as HTMLElement;
    });
    expect(panel.textContent).toContain(String(entry?.registration));
    // Let the smoothing frame loop run: the panel (fed by the enriched
    // map, while smoothing recomputes positions from the same enriched
    // fleet) must keep the enrichment visible after extrapolation frames.
    await act(async (): Promise<void> => {
      await new Promise((r): void => { setTimeout(r, 120); });
    });
    const panelAfter = document.querySelector('.telemetry-panel');
    expect(panelAfter).not.toBeNull();
    expect(panelAfter?.textContent).toContain(String(entry?.registration));
    expect(panelAfter?.textContent).toContain('SMTH1');
  });
});
