// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Visibility pause (review finding): a hidden tab must stop polling and
// the stale-check; on becoming visible exactly ONE immediate refresh
// fires and the cadence re-arms. Fake timers drive the hidden/visible
// transitions. Also: skew-safe ageing — a client clock +10 min ahead
// must not drop fresh aircraft, and a clock -10 min behind must not
// keep truly-old ones (the provider's server-anchored now is used).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
// The fake provider's server clock: controlled per test.
const providerServerNow = { current: 0 };
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]) =>
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>)),
      getDataAge: () => 0,
      getLastError: () => null,
      isStale: () => false,
      getServerNow: (): number => providerServerNow.current,
    }),
  };
});

import { useAircraftData } from '../src/hooks/useAircraftData';

// Same wiring as App.tsx (pollingStability.test.tsx pattern)
function Harness(): React.ReactElement {
  const { startPolling, stopPolling } = useAircraftData();
  useEffect(() => {
    startPolling();
    return (): void => stopPolling();
  }, [startPolling, stopPolling]);
  return <div />;
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: (): string => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('visibility pause', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchPositions.mockReset();
    fetchPositions.mockResolvedValue([]);
    providerServerNow.current = Date.now() / 1000;
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('a hidden tab fires no poll requests; visible triggers exactly one immediate refresh', async () => {
    render(<Harness />);
    // The immediate first fetch at mount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchPositions).toHaveBeenCalledTimes(1);

    // Hide: intervals cleared
    setHidden(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchPositions).toHaveBeenCalledTimes(1); // nothing while hidden

    // Visible again: exactly ONE immediate refresh, then the cadence
    const before = fetchPositions.mock.calls.length;
    setHidden(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchPositions.mock.calls.length).toBe(before + 1);

    // ...and then the normal interval resumes (one tick = one request)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(fetchPositions.mock.calls.length).toBe(before + 2);
  });

  it('no burst on visible when the tab was never hidden', async () => {
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchPositions).toHaveBeenCalledTimes(1);
    // A redundant visibilitychange (still visible) must not fetch again
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchPositions).toHaveBeenCalledTimes(1);
  });
});

describe('skew-safe ageing (server-anchored now)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    fetchPositions.mockReset();
    providerServerNow.current = Date.now() / 1000; // anchored to the server clock
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a client clock +10 min AHEAD keeps fresh aircraft (server anchor wins)', async () => {
    // The aircraft timestamp is fresh against the SERVER clock; the client
    // clock runs 10 minutes ahead. Under client-clock ageing every
    // aircraft would be dropped (600 s > MAX_AGE_SECONDS).
    const serverNow = Date.now() / 1000;
    providerServerNow.current = serverNow;
    fetchPositions.mockResolvedValue([
      {
        icao24: '484C5A',
        callsign: 'TRA16U',
        registration: null,
        type: null,
        operator: null,
        latitude: 52.5,
        longitude: 4.47,
        altitude: 6925,
        speed: 281.8,
        heading: 25.66,
        verticalRate: -1216,
        squawk: '1000',
        timestamp: serverNow - 10, // fresh: 10 s old on the SERVER clock
        onGround: false,
      },
    ]);
    const { result } = renderHookHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.aircraft.size).toBe(1);
    expect(result.current.aircraft.get('484C5A')?.isStale).toBe(false);
  });

  it('a client clock 10 min BEHIND still drops truly old aircraft', async () => {
    // The aircraft was last seen 10 minutes ago on the SERVER clock; the
    // client clock runs 10 minutes behind (client-side it looks fresh).
    const serverNow = Date.now() / 1000;
    providerServerNow.current = serverNow;
    fetchPositions.mockResolvedValue([
      {
        icao24: '484C5A',
        callsign: 'TRA16U',
        registration: null,
        type: null,
        operator: null,
        latitude: 52.5,
        longitude: 4.47,
        altitude: 6925,
        speed: 281.8,
        heading: 25.66,
        verticalRate: -1216,
        squawk: '1000',
        timestamp: serverNow - 600, // 600 s old on the SERVER clock
        onGround: false,
      },
    ]);
    const { result } = renderHookHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.aircraft.size).toBe(0);
  });

  it('a fresh aircraft becomes isStale on the SERVER clock, not the client clock', async () => {
    const serverNow = Date.now() / 1000;
    providerServerNow.current = serverNow;
    fetchPositions.mockResolvedValue([
      {
        icao24: '484C5A',
        callsign: 'TRA16U',
        registration: null,
        type: null,
        operator: null,
        latitude: 52.5,
        longitude: 4.47,
        altitude: 6925,
        speed: 281.8,
        heading: 25.66,
        verticalRate: -1216,
        squawk: '1000',
        timestamp: serverNow - 11, // older than interval*2 (10 s) on the server clock
        onGround: false,
      },
    ]);
    const { result } = renderHookHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const ac = result.current.aircraft.get('484C5A');
    expect(ac).toBeDefined();
    expect(ac?.isStale).toBe(true);
  });
});

// Hook harness that exposes the result (skew tests need the fleet state)
import { renderHook } from '@testing-library/react';
function renderHookHarness(): { result: { current: ReturnType<typeof useAircraftData> } } {
  const rendered = renderHook((): ReturnType<typeof useAircraftData> => useAircraftData());
  act(() => {
    rendered.result.current.startPolling();
  });
  return rendered;
}
