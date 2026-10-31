// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Reduced-motion branch of useSmoothedAircraft (review finding): the raw
// map used to be built ONCE from snapshotRef and never followed aircraft
// updates. With prefers-reduced-motion forced on, updated positions must
// reach the smoothed output on every data change — and the rAF loop must
// NOT start. The input here mirrors App's wiring (the enriched fleet).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DisplayAircraft } from '../src/types';
import { useSmoothedAircraft } from '../src/movement/useSmoothedAircraft';

function makeAircraft(id: string, lat: number, lon: number): DisplayAircraft {
  return {
    id,
    icao24: id,
    callsign: id,
    registration: null,
    type: null,
    operator: null,
    lat,
    lon,
    alt: 10000,
    track: 90,
    speed: 250,
    squawk: '1000',
    timestamp: Date.now() / 1000,
    onGround: false,
    verticalRate: 0,
    symbolRotate: 45,
    isStale: false,
    updatedAt: Date.now(),
  };
}

describe('reduced-motion branch follows aircraft updates', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string): MediaQueryList =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: (): void => undefined,
          removeListener: (): void => undefined,
          addEventListener: (): void => undefined,
          removeEventListener: (): void => undefined,
          dispatchEvent: (): boolean => false,
        }) as MediaQueryList,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('raw positions update on every aircraft change, without the rAF loop', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const first = new Map([[ '484C5A', makeAircraft('484C5A', 52.0, 4.5) ]]);
    const { result, rerender } = renderHook(
      ({ fleet }): ReturnType<typeof useSmoothedAircraft> => useSmoothedAircraft(fleet),
      { initialProps: { fleet: first } },
    );

    // First data: position available, no animation
    expect(result.current.isAnimating).toBe(false);
    expect(result.current.smoothed.get('484C5A')).toEqual({
      id: '484C5A',
      lat: 52.0,
      lon: 4.5,
    });
    expect(rafSpy).not.toHaveBeenCalled();

    // Second poll: the aircraft moved — the output must follow
    const second = new Map([[ '484C5A', makeAircraft('484C5A', 52.1, 4.6) ]]);
    rerender({ fleet: second });
    expect(result.current.smoothed.get('484C5A')).toEqual({
      id: '484C5A',
      lat: 52.1,
      lon: 4.6,
    });

    // Third poll: a NEW aircraft appears and the old one is gone
    const third = new Map([[ '484001', makeAircraft('484001', 51.9, 4.4) ]]);
    rerender({ fleet: third });
    expect(result.current.smoothed.get('484C5A')).toBeUndefined();
    expect(result.current.smoothed.get('484001')).toEqual({
      id: '484001',
      lat: 51.9,
      lon: 4.4,
    });

    // The rAF loop never started
    expect(rafSpy).not.toHaveBeenCalled();
    expect(result.current.isAnimating).toBe(false);
  });
});
