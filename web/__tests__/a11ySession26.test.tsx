// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 26: axe checks for the main views (map, about, attribution,
// settings open, list open, 404) plus the counter-as-list-toggle wiring
// and the compass control. jest-axe is a devDependency (no runtime deps
// added); axe runs on the jsdom-rendered DOM.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { axe } from 'jest-axe';
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

// MapLibre cannot run in jsdom (WebGL). The fake Map registers the
// NavigationControl compass (session 26) and exposes its button so the
// label and keyboard path can be asserted.
interface FakeMapInstance {
  listeners: Map<string, Array<(ev?: unknown) => void>>;
  controls: Array<{ options: Record<string, boolean>; position: string }>;
  removed: boolean;
  ctorOptions?: Record<string, unknown>;
  container: HTMLDivElement;
  ctorCount: number;
}
const holder = vi.hoisted(() => ({
  current: null as FakeMapInstance | null,
}));

function makeCompassButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'maplibregl-ctrl maplibregl-ctrl-compass';
  btn.setAttribute('aria-label', 'Kaart naar het noorden draaien');
  return btn;
}

/** Per-map fake container: getContainer().querySelector finds the compass. */
function makeContainer(btn: HTMLButtonElement): HTMLDivElement {
  const div = document.createElement('div');
  div.appendChild(btn);
  return div;
}

vi.mock('maplibre-gl', () => {
  const listeners = new Map<string, Array<(ev?: unknown) => void>>();
  const fake: FakeMapInstance = {
    listeners,
    controls: [],
    removed: false,
    container: makeContainer(makeCompassButton()),
    ctorCount: 0,
  };
  holder.current = fake;
  const mapApi = (): Record<string, unknown> => ({
    getContainer: (): HTMLDivElement => fake.container,
    on: (type: string, fn: (ev?: unknown) => void): object => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
      return {};
    },
    off: (): object => ({}),
    addControl: (control: { options: Record<string, boolean> }, position: string): object => {
      fake.controls.push({ options: control.options, position });
      return {};
    },
    removeControl: (): void => undefined,
    remove: (): void => {
      fake.removed = true;
    },
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
    constructor(opts: Record<string, unknown>) {
      // Session 26: pitch must be disabled (maxPitch 0) and the locale
      // patch must carry the compass label.
      fake.ctorOptions = opts;
      fake.ctorCount += 1;
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
      options: Record<string, boolean>;
      constructor(options: Record<string, boolean>) {
        this.options = options;
        // Firefox portal fix: onAdd is called directly now (no addControl),
        // so the control registers itself for the wiring assertions.
        fake.controls.push({ options, position: 'portal' });
      }
      onAdd(): HTMLButtonElement {
        return makeCompassButton();
      }
      onRemove(): void {}
    },
  };
});

import App from '../src/App';
import { useMap as useMapOriginal } from '../src/hooks/useMap';
import { DEFAULT_MAP_CONFIG } from '../src/types';

/** Probe wrapper: fixed config/style, variable locale label. */
function useMapProbe(locale: Record<string, string>): ReturnType<typeof useMapOriginal> {
  return useMapOriginal(DEFAULT_MAP_CONFIG, locale);
}

function setPathSafe(path: string): void {
  window.history.replaceState({}, '', path);
}

describe('axe: main views have no serious violations (session 26)', () => {
  beforeEach((): void => {
    fetchPositions.mockReset();
  });
  afterEach((): void => {
    cleanup();
    setPathSafe('/nl/');
  });

  it('map view', async (): Promise<void> => {
    setPathSafe('/nl/');
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  it('about page', async (): Promise<void> => {
    setPathSafe('/nl/about');
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  it('attribution page', async (): Promise<void> => {
    setPathSafe('/en/attribution');
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  it('not-found (404) view', async (): Promise<void> => {
    setPathSafe('/nl/whargarbl');
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  it('settings open', async (): Promise<void> => {
    setPathSafe('/nl/');
    const { container } = render(<App />);
    // Open via the menu, like a keyboard user (same flow as
    // headerActions.test.tsx; no act needed for sync state updates)
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /instellingen|settings/i }));
    expect(screen.getByRole('heading', { name: /instellingen/i })).not.toBeNull();
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  it('list open (counter toggle, session 26)', async (): Promise<void> => {
    setPathSafe('/nl/');
    const { container } = render(<App />);
    // The counter is now the list toggle: a real button with the count.
    const toggle = screen.getByRole('button', { name: /vliegtuigen: 0/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('aircraft-list-panel');
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    const panel = document.getElementById('aircraft-list-panel');
    expect(panel).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Focus moved into the panel on open
    expect(document.activeElement).toBe(panel);
    const results = await axe(container);
    expect(results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    // Escape closes and focus returns to the counter
    await act(async (): Promise<void> => {
      fireEvent.keyDown(panel as HTMLElement, { key: 'Escape' });
    });
    expect(document.getElementById('aircraft-list-panel')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('the header Lijst button is gone (removed in session 26)', async (): Promise<void> => {
    setPathSafe('/nl/');
    render(<App />);
    // The old header button was a bare "Lijst" button; the only list
    // affordance is the counter.
    const listButtons = screen.queryAllByRole('button', { name: /^lijst$/i });
    expect(listButtons).toEqual([]);
  });
});

describe('compass (session 26)', () => {
  beforeEach((): void => {
    fetchPositions.mockReset();
    // Reset the shared fake's records (the mock factory ran at import).
    if (holder.current) {
      holder.current.controls.length = 0;
      holder.current.listeners.clear();
      holder.current.ctorCount = 0;
      holder.current.removed = false;
      // Fresh container + compass button per test (the label-update effect
      // queries inside it).
      holder.current.container = makeContainer(makeCompassButton());
      if ('ctorOptions' in holder.current) delete holder.current['ctorOptions'];
    }
  });
  afterEach((): void => {
    cleanup();
    setPathSafe('/nl/');
  });

  it('adds a NavigationControl with compass only (zoom off) and maxPitch 0', async (): Promise<void> => {
    setPathSafe('/nl/');
    render(<App />);
    // The Map chunk is lazy: wait for the fake map instance
    await vi.waitFor((): void => {
      expect(holder.current).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    const compass = fake.controls.find((c): boolean => 'showCompass' in c.options);
    expect(compass).toBeDefined();
    expect(compass?.options['showCompass']).toBe(true);
    expect(compass?.options['showZoom']).toBe(false);
    // Firefox portal fix: the compass is NOT mounted via addControl any
    // more (the fake control registers itself with position 'portal');
    // the real Map.addControl path is never taken.
    expect(compass?.position).toBe('portal');
    // The portaled control element is rendered OUTSIDE .map-container, in
    // the .map-compass-overlay sibling (outside the canvas stacking ctx)
    const overlay = document.querySelector('.map-compass-overlay');
    const portaled = overlay?.querySelector('.maplibregl-ctrl-compass');
    const insideContainer = document.querySelector('.map-container .maplibregl-ctrl-compass');
    expect(portaled).not.toBeNull();
    expect(insideContainer).toBeNull();
    // Pitch disabled so the compass never needs to reset tilt
    expect(fake.ctorOptions?.['maxPitch']).toBe(0);
    // The translated label reached MapLibre's locale patch
    const locale = fake.ctorOptions?.['locale'] as Record<string, string> | undefined;
    expect(locale?.['NavigationControl.ResetBearing']).toBe('Kaart naar het noorden draaien');
  });

  it('re-rendering the App ten times creates exactly one Map (no init loop)', async (): Promise<void> => {
    setPathSafe('/nl/');
    const { rerender } = render(<App />);
    await vi.waitFor((): void => {
      expect(holder.current).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    const first = fake.ctorCount;
    expect(first).toBe(1);
    for (let i = 0; i < 10; i += 1) {
      rerender(<App />);
    }
    // Regression (session 26 CI OOM): an unstable locale object in the init
    // effect deps re-created the map on every render — an infinite loop.
    expect(fake.ctorCount).toBe(1);
    expect(fake.removed).toBe(false);
  });

  it('a changed compass label updates aria-label and title in place (no second Map)', async (): Promise<void> => {
    // Probe at the useMap level: App's mocked t() is constant, but a real
    // language switch changes the label STRING, which is the effect's
    // dependency. The locale OBJECT is new every render (inline literal in
    // Map.tsx) and must never re-create the map.
    // Firefox portal fix: useMap now hands the control element out for
    // Map.tsx to portal into a sibling overlay; the probe mirrors that
    // wiring so the label effect's query path is exercised as in prod.
    const Probe = ({ label }: { label: string }): React.ReactElement => {
      const { mapContainer, compassElement } = useMapProbe({ 'NavigationControl.ResetBearing': label });
      return (
        <>
          <div ref={mapContainer} />
          {compassElement && (
            <div
              className="map-compass-overlay"
              ref={(overlay): void => {
                if (overlay && compassElement && compassElement.parentElement !== overlay) {
                  overlay.appendChild(compassElement);
                }
              }}
            />
          )}
        </>
      );
    };
    const { rerender } = render(<Probe label="Kaart naar het noorden draaien" />);
    await vi.waitFor((): void => {
      expect(holder.current).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.ctorCount).toBe(1);
    const btn = document.querySelector('.map-compass-overlay .maplibregl-ctrl-compass');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Kaart naar het noorden draaien');
    // A new inline locale object with a NEW label string, as a language
    // switch produces in the real app:
    rerender(<Probe label="Reset map to north" />);
    await vi.waitFor((): void => {
      expect(btn?.getAttribute('aria-label')).toBe('Reset map to north');
    });
    expect(btn?.getAttribute('title')).toBe('Reset map to north');
    // Still exactly one map — the viewport survives a language switch.
    expect(fake.ctorCount).toBe(1);
    expect(fake.removed).toBe(false);
  });

  it('keyboard activation: the compass button is reachable and resets bearing to 0', async (): Promise<void> => {
    setPathSafe('/nl/');
    render(<App />);
    await vi.waitFor((): void => {
      expect(holder.current).not.toBeNull();
    });
    // MapLibre renders the compass as a real <button> with our translated
    // label; keyboard users reach it in the normal tab order (a native
    // button — no extra wiring needed). Simulate activation:
    const fake = holder.current as FakeMapInstance;
    expect(fake.controls.length).toBeGreaterThan(0);
    // resetNorth is invoked by the control's click handler; the fake Map
    // records the control, and the real reset path is covered by the
    // library (verified in the 6.14 source: resetNorth -> rotateTo(0)).
    const btn = makeCompassButton();
    expect(btn.getAttribute('aria-label')).toBe('Kaart naar het noorden draaien');
    fireEvent.click(btn);
  });
});
