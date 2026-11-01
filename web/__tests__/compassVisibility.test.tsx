// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 28: the compass shows only when the map is rotated. MapLibre
// cannot run in jsdom (WebGL), so this mirrors the a11ySession26 fake-map
// harness: a fake Map records 'rotate'/'rotateend' listeners, and the
// tests fire them and assert DOM state (the hidden attribute and focus),
// never CSS text.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { useMap } from '../src/hooks/useMap';
import { DEFAULT_MAP_CONFIG } from '../src/types';

interface FakeMapInstance {
  listeners: Map<string, Array<(ev?: unknown) => void>>;
  bearing: number;
  container: HTMLDivElement;
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

vi.mock('maplibre-gl', () => {
  const listeners = new Map<string, Array<(ev?: unknown) => void>>();
  const fake: FakeMapInstance = {
    listeners,
    bearing: 0,
    container: document.createElement('div'),
  };
  holder.current = fake;
  // Like the real MapLibre: the canvas (tabindex=0, role=region — set by
  // the library itself in 6.14 for interactive maps) lives INSIDE the
  // container element passed to the constructor.
  const canvas = document.createElement('canvas');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'region');
  const mapApi = (): Record<string, unknown> => ({
    getContainer: (): HTMLDivElement => fake.container,
    on: (type: string, fn: (ev?: unknown) => void): object => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
      return {};
    },
    off: (type: string, fn: (ev?: unknown) => void): object => {
      const arr = (listeners.get(type) ?? []).filter((f): boolean => f !== fn);
      listeners.set(type, arr);
      return {};
    },
    getBearing: (): number => fake.bearing,
    getCanvas: (): HTMLCanvasElement => canvas,
    remove: (): void => undefined,
    isStyleLoaded: (): boolean => false,
    fitBounds: (): void => undefined,
    getZoom: (): number => 8,
    setZoom: (): void => undefined,
  });
  const FakeMap = class {
    constructor(opts: Record<string, unknown>) {
      fake.container = (opts['container'] as HTMLDivElement) ?? document.createElement('div');
      fake.container.appendChild(canvas);
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
        return makeCompassButton();
      }
      onRemove(): void {}
    },
    AttributionControl: class {
      onAdd(): HTMLElement {
        return document.createElement('div');
      }
      onRemove(): void {}
    },
  };
});

/** Mirrors Map.tsx: the compass element is portaled into a sibling overlay. */
const Probe = (): React.ReactElement => {
  const { mapContainer, compassElement } = useMap(DEFAULT_MAP_CONFIG);
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

function fire(fake: FakeMapInstance, type: string): void {
  for (const fn of fake.listeners.get(type) ?? []) {
    fn();
  }
}

function compassEl(): HTMLElement | null {
  return document.querySelector('.map-compass-overlay .maplibregl-ctrl-compass') as HTMLElement | null;
}

function compassBtn(): HTMLButtonElement | null {
  return document.querySelector('.map-compass-overlay .maplibregl-ctrl-compass') as HTMLButtonElement | null;
}

describe('compass visibility (session 28)', () => {
  beforeEach((): void => {
    if (holder.current) {
      holder.current.listeners.clear();
      holder.current.bearing = 0;
    }
  });
  afterEach((): void => {
    cleanup();
  });

  it('is hidden after init at bearing 0', async (): Promise<void> => {
    render(<Probe />);
    await vi.waitFor((): void => {
      expect(compassEl()).not.toBeNull();
    });
    expect(compassEl()?.hasAttribute('hidden')).toBe(true);
  });

  it('shows when a rotate event reports a rotated bearing', async (): Promise<void> => {
    render(<Probe />);
    await vi.waitFor((): void => {
      expect(compassEl()).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    fake.bearing = 40;
    fire(fake, 'rotate');
    await vi.waitFor((): void => {
      expect(compassEl()?.hasAttribute('hidden')).toBe(false);
    });
  });

  it('hides again when rotateend reports bearing 0 (after the reset finished)', async (): Promise<void> => {
    render(<Probe />);
    await vi.waitFor((): void => {
      expect(compassEl()).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    fake.bearing = 40;
    fire(fake, 'rotate');
    await vi.waitFor((): void => {
      expect(compassEl()?.hasAttribute('hidden')).toBe(false);
    });
    fake.bearing = 0;
    fire(fake, 'rotateend');
    await vi.waitFor((): void => {
      expect(compassEl()?.hasAttribute('hidden')).toBe(true);
    });
  });

  it('moves focus to the map region when the focused compass hides, never body', async (): Promise<void> => {
    render(<Probe />);
    await vi.waitFor((): void => {
      expect(compassBtn()).not.toBeNull();
    });
    const fake = holder.current as FakeMapInstance;
    fake.bearing = 40;
    fire(fake, 'rotate');
    await vi.waitFor((): void => {
      expect(compassEl()?.hasAttribute('hidden')).toBe(false);
    });
    const btn = compassBtn() as HTMLButtonElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    fake.bearing = 0;
    fire(fake, 'rotateend');
    await vi.waitFor((): void => {
      expect(compassEl()?.hasAttribute('hidden')).toBe(true);
    });
    const active = document.activeElement;
    expect(active?.tagName).toBe('CANVAS');
    expect(active).not.toBe(document.body);
  });

  it('reduced motion: hiding after rotateend(0) is synchronous, no animation dependency', async (): Promise<void> => {
    // Under prefers-reduced-motion the reset ease has duration 0, so
    // 'rotate'/'rotateend' fire in immediate succession; the hidden/show
    // toggling is purely the hidden attribute (the CSS pop-in is
    // no-preference-only and must not be required for visibility). The
    // hide must therefore be applied synchronously in the same act() as
    // the rotateend event — no waitFor, no timers.
    const mql = (query: string): MediaQueryList => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => false,
    });
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(mql));
    try {
      render(<Probe />);
      await vi.waitFor((): void => {
        expect(compassEl()).not.toBeNull();
      });
      const fake = holder.current as FakeMapInstance;
      expect(compassEl()?.hasAttribute('hidden')).toBe(true);
      fake.bearing = 15;
      fire(fake, 'rotate');
      await vi.waitFor((): void => {
        expect(compassEl()?.hasAttribute('hidden')).toBe(false);
      });
      fake.bearing = 0;
      act((): void => {
        fire(fake, 'rotateend');
      });
      // Synchronous: the hidden attribute is set in the same act() batch,
      // not after a timer or animation frame.
      expect(compassEl()?.hasAttribute('hidden')).toBe(true);
      // No inline animation style was introduced; visibility is the
      // attribute alone.
      expect(compassEl()?.getAttribute('style')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
