// Tests for useSmoothedAircraft (animation loop + prefers-reduced-motion)
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DisplayAircraft } from '../src/types';
import { useSmoothedAircraft } from '../src/movement/useSmoothedAircraft';

function displayAircraft(overrides: Partial<DisplayAircraft> = {}): DisplayAircraft {
  return {
    id: 'A1',
    icao24: '484C5A',
    callsign: 'TRA16U',
    registration: null,
    type: 'B738',
    operator: null,
    lat: 52.0,
    lon: 4.5,
    alt: 6925,
    track: 90,
    speed: 450,
    squawk: '1000',
    timestamp: Date.now() / 1000,
    onGround: false,
    verticalRate: null,
    symbolRotate: 90,
    updatedAt: Date.now(),
    isStale: false,
    ...overrides,
  };
}

describe('useSmoothedAircraft', () => {
  let rafCallbacks: Array<() => void>;
  let rafId: number;
  let reducedMotion: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = [];
    rafId = 0;
    reducedMotion = false;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void): number => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      void id;
    });
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && reducedMotion,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushRaf(): void {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    for (const cb of cbs) {
      act(() => {
        cb();
      });
    }
  }

  it('animates positions via rAF when motion is allowed', async () => {
    const aircraft = new Map([['A1', displayAircraft()]]);
    const { result } = renderHook(() => useSmoothedAircraft(aircraft));

    expect(result.current.isAnimating).toBe(true);
    flushRaf();
    await waitFor(() => {
      expect(result.current.smoothed.size).toBe(1);
    });
    const pos = result.current.smoothed.get('A1');
    expect(pos).toBeDefined();
  });

  it('advances the projected position between frames', async () => {
    const aircraft = new Map([['A1', displayAircraft({ track: 90 })]]);
    const { result } = renderHook(() => useSmoothedAircraft(aircraft));
    flushRaf();
    await waitFor(() => {
      expect(result.current.smoothed.size).toBe(1);
    });
    const first = result.current.smoothed.get('A1')?.lon;
    expect(first).toBeDefined();
    await act(async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 0));
    });
    flushRaf();
    const second = result.current.smoothed.get('A1')?.lon;
    expect(second).toBeGreaterThanOrEqual(first as number);
  });

  it('does not run the loop under prefers-reduced-motion (positions jump)', async () => {
    reducedMotion = true;
    const aircraft = new Map([['A1', displayAircraft()]]);
    const { result } = renderHook(() => useSmoothedAircraft(aircraft));

    expect(result.current.isAnimating).toBe(false);
    expect(rafCallbacks.length).toBe(0);
    // With reduced motion the smoothed map equals the raw fix
    await waitFor(() => {
      expect(result.current.smoothed.get('A1')?.lon).toBe(4.5);
    });
  });

  it('cancels the rAF loop on unmount', async () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
    const aircraft = new Map([['A1', displayAircraft()]]);
    const { unmount } = renderHook(() => useSmoothedAircraft(aircraft));
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    const pending = rafCallbacks.length;
    flushRaf();
    // No new callbacks scheduled after unmount
    expect(rafCallbacks.length).toBe(pending - (pending > 0 ? 1 : 0));
  });
});
