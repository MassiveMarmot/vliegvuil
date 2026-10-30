// Regression tests for the basemap-404 bug: with every basemap tile 404ing,
// MapLibre's 'load' event never fires (it requires the first fully rendered
// frame; see Map#_render in the MapLibre source), so the aircraft, noise and
// airport layers must be gated on the style-ready signal ('style.load')
// instead. These tests render the real Map component against a fake
// maplibre-gl whose Map fires 'style.load' but never 'load'.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

interface FakeSource {
  setData: (data: unknown) => void;
  spec: unknown;
  data: unknown;
}

interface FakeMapInstance {
  listeners: Map<string, Array<(ev?: unknown) => void>>;
  addedImages: string[];
  sources: Map<string, FakeSource>;
  layers: string[];
  removed: boolean;
  styleLoaded: boolean;
}

// Holder is hoisted above the vi.mock factory so both can share state.
const holder = vi.hoisted(() => ({
  current: null as FakeMapInstance | null,
  autoStyleLoad: true,
  preLoadedStyle: false,
}));

function fakeMapApi(): Record<string, unknown> {
  const listeners: Map<string, Array<(ev?: unknown) => void>> = new Map();
  const fake: FakeMapInstance = {
    listeners,
    addedImages: [],
    sources: new Map(),
    layers: [],
    removed: false,
    styleLoaded: holder.preLoadedStyle,
  };
  holder.current = fake;
  if (holder.autoStyleLoad) {
    // The real Map fires 'style.load' once the style JSON is parsed and
    // layers created (Style#_load) — without waiting for any tile. It does
    // NOT fire 'load' here: that is the bug scenario.
    queueMicrotask(() => {
      for (const l of listeners.get('style.load') ?? []) l();
    });
  }
  return {
    on: (type: string, layerOrFn: string | ((ev?: unknown) => void), maybeFn?: (ev?: unknown) => void): object => {
      const fn = typeof layerOrFn === 'string' ? maybeFn : layerOrFn;
      const key = typeof layerOrFn === 'string' ? `${type}:${layerOrFn}` : type;
      const arr = listeners.get(key) ?? [];
      arr.push(fn as (ev?: unknown) => void);
      listeners.set(key, arr);
      return {};
    },
    // Session 26: the compass label-update effect queries the container.
    getContainer: (): HTMLDivElement => document.createElement('div'),
    off: (type: string, layerOrFn: string | ((ev?: unknown) => void), maybeFn?: (ev?: unknown) => void): object => {
      const fn = typeof layerOrFn === 'string' ? maybeFn : layerOrFn;
      const key = typeof layerOrFn === 'string' ? `${type}:${layerOrFn}` : type;
      const arr = listeners.get(key) ?? [];
      const idx = arr.indexOf(fn as (ev?: unknown) => void);
      if (idx >= 0) arr.splice(idx, 1);
      return {};
    },
    once: (): object => ({}),
    // Session 26: useMap registers the compass NavigationControl (fake
    // acceptance only; the compass itself has its own tests).
    addControl: (_control: unknown, _position: string): object => ({}),
    removeControl: (): void => undefined,
    addImage: (id: string): void => {
      fake.addedImages.push(id);
    },
    hasImage: (): boolean => false,
    remove: (): void => {
      fake.removed = true;
    },
    isStyleLoaded: (): boolean => fake.styleLoaded,
    getCanvas: (): { style: Record<string, string> } => ({ style: {} }),
    getLayer: (id: string): boolean => fake.layers.includes(id),
    getSource: (id: string): FakeSource | undefined => fake.sources.get(id),
    addSource: (id: string, spec: unknown): void => {
      const specObj = spec as { data?: unknown };
      fake.sources.set(id, {
        setData: (data: unknown): void => {
          const s = fake.sources.get(id);
          if (s) s.data = data;
        },
        spec,
        data: specObj?.data ?? null,
      });
    },
    addLayer: (layer: { id: string }): void => {
      fake.layers.push(layer.id);
    },
    setLayoutProperty: (): void => undefined,
    fitBounds: (): void => undefined,
  };
}

vi.mock('maplibre-gl', () => {
  return {
    default: {
      Map: class {
        constructor() {
          Object.assign(this, fakeMapApi());
        }
      },
    },
    Map: class {
      constructor() {
        Object.assign(this, fakeMapApi());
      }
    },
    LngLatBounds: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_sw: unknown, _ne: unknown) {
        // no-op in the fake
      }
    },
    // Session 26: compass-only NavigationControl fake (constructor acceptance).
    NavigationControl: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_options: unknown) {}
      onAdd(): null {
        return null;
      }
      onRemove(): void {}
    },
  };
});

import { Map as MapComponent } from '../src/components/Map';
import type { DisplayAircraft } from '../src/types';

function featureCount(fake: FakeMapInstance, sourceId: string): number {
  const source = fake.sources.get(sourceId) as FakeSource;
  const data = source.data as { features?: unknown[] } | null;
  return data?.features?.length ?? 0;
}

function makeAircraft(id: string, icao24: string): Map<string, DisplayAircraft> {
  return new Map([
    [
      id,
      {
        id,
        icao24,
        callsign: 'KLM123',
        registration: 'PH-KLM',
        type: 'B738',
        operator: 'KLM',
        lat: 52.3,
        lon: 4.9,
        alt: 10000,
        speed: 250,
        track: 90,
        squawk: '1000',
        timestamp: Date.now() / 1000,
        onGround: false,
        verticalRate: 0,
        symbolRotate: 90,
        isStale: false,
        updatedAt: Date.now(),
      },
    ],
  ]);
}

describe('layers are independent of basemap tile loading', () => {
  beforeEach(() => {
    holder.current = null;
    holder.autoStyleLoad = true;
    holder.preLoadedStyle = false;
  });

  it('adds the aircraft source and layer once "style.load" fired and never "load"', async () => {
    render(
      <MapComponent
        aircraft={makeAircraft('a1', '484011')}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    await vi.waitFor(() => {
      expect(holder.current?.sources.has('aircraft')).toBe(true);
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers).toContain('aircraft-symbols');
    expect(featureCount(fake, 'aircraft')).toBe(1);
  });

  it('adds the noise layer when contours are provided without any "load" event', async () => {
    const contours = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[4.6, 52.2], [5.0, 52.2], [5.0, 52.5], [4.6, 52.5], [4.6, 52.2]]],
          },
          properties: { airport: 'EHAM', bandLowerDb: 55 },
        },
      ],
    };
    render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
        noiseContours={contours as never}
        noiseEnabled
      />,
    );
    await vi.waitFor(() => {
      expect(holder.current?.sources.has('noise-contours')).toBe(true);
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers).toContain('noise-contours-fill');
  });

  it('adds the airport layers when airports are provided without any "load" event', async () => {
    const airports = [
      {
        icao: 'EHAM',
        name: 'Amsterdam Schiphol',
        latitude: 52.3,
        longitude: 4.9,
        status: 'commercial' as const,
      },
    ] as never;
    render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
        airports={airports}
        onAirportClick={(): void => undefined}
      />,
    );
    await vi.waitFor(() => {
      expect(holder.current?.sources.has('airports')).toBe(true);
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers).toContain('airport-markers');
    expect(fake.layers).toContain('airport-labels');
  });

  it('adds nothing before the style is ready', async () => {
    holder.autoStyleLoad = false;
    render(
      <MapComponent
        aircraft={makeAircraft('a0', '484000')}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers.length).toBe(0);
    expect(fake.sources.size).toBe(0);
  });
});

describe('regression: existing behaviour unchanged', () => {
  beforeEach(() => {
    holder.current = null;
    holder.autoStyleLoad = true;
    holder.preLoadedStyle = false;
  });

  it('adds layers once and reuses setData on aircraft updates (no duplicate layers, one click handler)', async () => {
    const { rerender } = render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    await vi.waitFor(() => {
      expect(holder.current?.sources.has('aircraft')).toBe(true);
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers.filter((l) => l === 'aircraft-symbols')).toHaveLength(1);
    rerender(
      <MapComponent
        aircraft={makeAircraft('a2', '3c1234')}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    expect(fake.layers.filter((l) => l === 'aircraft-symbols')).toHaveLength(1);
    expect(featureCount(fake, 'aircraft')).toBe(1);
    expect(fake.listeners.get('click:aircraft-symbols')).toHaveLength(1);
  });

  it('handles a style already loaded when the hook subscribes (isStyleLoaded path, no event needed)', async () => {
    holder.autoStyleLoad = false;
    holder.preLoadedStyle = true;
    render(
      <MapComponent
        aircraft={makeAircraft('a3', '484012')}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    await vi.waitFor(() => {
      expect(holder.current?.sources.has('aircraft')).toBe(true);
    });
    const fake = holder.current as FakeMapInstance;
    expect(fake.layers).toContain('aircraft-symbols');
    expect(featureCount(fake, 'aircraft')).toBe(1);
  });
});
