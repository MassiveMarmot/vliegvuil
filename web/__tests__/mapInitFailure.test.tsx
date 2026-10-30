// Fatal map-init failure (WebGL2 unavailable): MapLibre 6's constructor
// throws GPUInitializationError synchronously when it cannot create a
// WebGL2 context (verified against the 6.14.0 source: Map#constructor calls
// _setupPainter() and rethrows). useMap must surface that as a distinct
// mapInitError state — NOT mapError, which runtime 'error' events also set
// (tile failures, context loss) and which must stay non-blocking. These
// tests render the real Map component against a fake maplibre-gl whose
// Map constructor throws, mirroring mapLayersStyleReady.test.tsx.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';

// Holder is hoisted above the vi.mock factory so both can share state.
const holder = vi.hoisted(() => ({
  // When true, the fake Map constructor throws a GPUInitializationError-
  // shaped Error, as maplibre-gl 6 does without WebGL2.
  throwOnConstruct: false,
  // Runtime 'error' listeners registered by useMap (kept so a test can
  // fire a tile-style error event).
  listeners: new Map<string, Array<(ev?: unknown) => void>>(),
}));

function fakeMapApi(): Record<string, unknown> {
  const listeners = holder.listeners;
  return {
    on: (type: string, fn: (ev?: unknown) => void): object => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
      return {};
    },
    off: (): object => ({}),
    // Session 26: the compass label-update effect queries the container.
    getContainer: (): HTMLDivElement => document.createElement('div'),
    // Session 26: useMap registers the compass NavigationControl.
    addControl: (_control: unknown, _position: string): object => ({}),
    removeControl: (): void => undefined,
    once: (): object => ({}),
    addImage: (): void => undefined,
    hasImage: (): boolean => false,
    remove: (): void => undefined,
    isStyleLoaded: (): boolean => false,
    getCanvas: (): { style: Record<string, string> } => ({ style: {} }),
    getLayer: (): boolean => false,
    getSource: (): undefined => undefined,
    addSource: (): void => undefined,
    addLayer: (): void => undefined,
    setLayoutProperty: (): void => undefined,
    fitBounds: (): void => undefined,
  };
}

vi.mock('maplibre-gl', () => {
  const FakeMap = class {
    constructor() {
      if (holder.throwOnConstruct) {
        throw new Error(
          'WebGL2 is required to display this map. We are sorry, but it seems that your browser does not support WebGL2, a technology for rendering 3D graphics on the web. Read more on https://wiki.openstreetmap.org/wiki/This_map_requires_WebGL',
        );
      }
      Object.assign(this, fakeMapApi());
    }
  };
  return {
    default: { Map: FakeMap },
    Map: FakeMap,
    LngLatBounds: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_sw: unknown, _ne: unknown) {
        // no-op in the fake
      }
    },
    // Session 26: useMap constructs a compass-only NavigationControl.
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

describe('fatal map init failure (WebGL2 unavailable)', () => {
  beforeEach(() => {
    holder.throwOnConstruct = false;
    holder.listeners = new Map();
  });

  it('shows the blocking notice with role="status" when the constructor throws', () => {
    holder.throwOnConstruct = true;
    render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
        onOpenList={(): void => undefined}
      />,
    );
    const notice = screen.getByTestId('map-init-error-notice');
    expect(notice.getAttribute('role')).toBe('status');
    // The mocked t() returns the call-site NL fallback.
    expect(notice.textContent).toContain('WebGL2');
    expect(notice.textContent).toContain('De lijst werkt nog wel');
    // The open-list affordance renders.
    expect(screen.getByRole('button', { name: /lijst/i })).not.toBeNull();
    // The non-blocking tile notice is NOT shown (no tile error happened).
    expect(screen.queryByTestId('tile-error-notice')).toBeNull();
  });

  it('calls onOpenList when the notice button is clicked', () => {
    holder.throwOnConstruct = true;
    const onOpenList = vi.fn();
    render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
        onOpenList={onOpenList}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /lijst/i }));
    expect(onOpenList).toHaveBeenCalledTimes(1);
  });

  it('a runtime error event (tile failure) does NOT show the blocking notice', () => {
    const { rerender } = render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    const errListeners = holder.listeners.get('error') ?? [];
    expect(errListeners.length).toBeGreaterThan(0);
    // Fire a tile-style error event (sourceId attached, as the pdok-brt
    // raster source errors carry it via the style's evented parent).
    for (const l of errListeners) {
      l({ sourceId: 'pdok-brt', error: new Error('RasterTileSource error') });
    }
    // Force a re-render so any state update is flushed.
    rerender(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    // mapError is set, but the blocking notice must not appear; the
    // non-blocking tile notice is the one that does.
    expect(screen.queryByTestId('map-init-error-notice')).toBeNull();
    expect(screen.getByTestId('tile-error-notice')).not.toBeNull();
  });

  it('the aircraft counter stays usable in App-level integration (list opens from the notice)', () => {
    // App-level wiring is covered by the onOpenList callback test above plus
    // the App test that passes handleToggleList; here we assert the notice
    // does not block rendering the map container when construction succeeds.
    holder.throwOnConstruct = false;
    render(
      <MapComponent
        aircraft={new Map()}
        selectedAircraftId={null}
        onAircraftClick={(): void => undefined}
      />,
    );
    expect(screen.queryByTestId('map-init-error-notice')).toBeNull();
    cleanup();
  });
});

// --- App-level wiring: the list and the counter stay usable ---
// The mocked t() returns the call-site fallback (Dutch).

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (): unknown => ({
      fetchPositions: (...args: unknown[]): Promise<unknown[]> =>
        fetchPositions(...(args as [unknown])),
      getDataAge: (): number => 0,
      getLastError: (): null => null,
      isStale: (): boolean => false,
    }),
  };
});

import App from '../src/App';

describe('App with WebGL2 unavailable', () => {
  beforeEach(() => {
    holder.throwOnConstruct = true;
    holder.listeners = new Map();
    fetchPositions.mockReset();
    window.history.replaceState({}, '', '/nl/');
  });

  it('init failure shows the blocking notice; the counter and the list stay usable', async () => {
    fetchPositions.mockResolvedValue([
      {
        icao24: '484011',
        callsign: 'KLM123',
        registration: 'PH-KLM',
        type: 'B738',
        operator: 'KLM',
        latitude: 52.3,
        longitude: 4.9,
        altitude: 10000,
        speed: 250,
        heading: 90,
        verticalRate: 0,
        squawk: '1000',
        timestamp: Date.now() / 1000,
        onGround: false,
      },
    ]);
    render(<App />);
    // The Map chunk is lazy: wait for the fatal-init notice.
    const notice = await screen.findByTestId('map-init-error-notice');
    expect(notice.getAttribute('role')).toBe('status');
    // The aircraft counter still renders with the live count.
    expect(screen.getByText(/Vliegtuigen: 1/)).not.toBeNull();
    // The open-list button in the notice opens the aircraft list (scoped:
    // the Header also has a "Lijst" toggle button).
    fireEvent.click(within(notice).getByRole('button', { name: /lijst/i }));
    expect(await screen.findByRole('table')).not.toBeNull();
    expect(screen.getByText('KLM123')).not.toBeNull();
  });
});
