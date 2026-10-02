// Tests for useAircraftData with a mocked core provider
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AircraftPosition, PositionProvider } from '@vliegvuil/core';

// Mock the core provider factory; the real AdsblolProvider is covered by
// core/__tests__/providers/adsb-fi.test.ts against the real fixture.
const fetchPositions = vi.fn();
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
    }),
  };
});

import {
  useAircraftData,
  MAX_AGE_SECONDS,
  toDisplayAircraft,
} from '../src/hooks/useAircraftData';

function position(overrides: Partial<AircraftPosition> = {}): AircraftPosition {
  return {
    icao24: '484C5A',
    callsign: 'TRA16U',
    registration: 'PH-HSC',
    type: 'B738',
    operator: null,
    latitude: 52.5,
    longitude: 4.47,
    altitude: 6925,
    speed: 281.8,
    heading: 25.66,
    verticalRate: -1216,
    squawk: '1000',
    timestamp: Date.now() / 1000,
    onGround: false,
    ...overrides,
  };
}

describe('useAircraftData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches real positions through the core provider', async () => {
    fetchPositions.mockResolvedValue([position()]);
    const { result } = renderHook(() => useAircraftData());

    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });

    expect(fetchPositions).toHaveBeenCalledTimes(1);
    const bbox = fetchPositions.mock.calls[0]?.[0];
    expect(bbox).toEqual({
      minLatitude: 50.5,
      maxLatitude: 54.0,
      minLongitude: 2.5,
      maxLongitude: 7.5,
    });
    const ac = result.current.aircraft.get('484C5A_TRA16U');
    expect(ac).toBeDefined();
    expect(ac?.alt).toBe(6925);
    expect(result.current.lastUpdate).not.toBeNull();
  });

  it('drops aircraft not seen for more than 60 seconds', async () => {
    const now = Date.now() / 1000;
    fetchPositions
      .mockResolvedValueOnce([position()])
      .mockResolvedValueOnce([
        position({ icao24: '484001', callsign: 'KLM123' }),
        // stale: seen 61 s ago
        position({ icao24: '484C5A', callsign: 'TRA16U', timestamp: now - (MAX_AGE_SECONDS + 1) }),
      ]);

    const { result } = renderHook(() =>
      useAircraftData({ interval: 1000 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.aircraft.size).toBe(1);
    expect(result.current.aircraft.has('484001_KLM123')).toBe(true);
    expect(result.current.aircraft.has('484C5A_TRA16U')).toBe(false);
  });

  it('retries with backoff and clears timers on stopPolling', async () => {
    fetchPositions.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() =>
      useAircraftData({ interval: 1000, retryDelay: 100 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(fetchPositions.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    // retry scheduled after retryDelay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchPositions.mock.calls.length).toBeGreaterThanOrEqual(2);

    act(() => {
      result.current.stopPolling();
    });
    const callsAfterStop = fetchPositions.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchPositions.mock.calls.length).toBe(callsAfterStop);
    expect(result.current.isPolling).toBe(false);
  });

  it('shows the stale banner when data is older than 3 intervals', async () => {
    fetchPositions.mockResolvedValue([position()]);
    const { result } = renderHook(() =>
      useAircraftData({ interval: 1000 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });
    expect(result.current.showStaleBanner).toBe(false);

    // stop delivering data; advance past 3 intervals
    fetchPositions.mockRejectedValue(new Error('network down'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.showStaleBanner).toBe(true);
  });

  it('cleans up all timers on unmount', async () => {
    fetchPositions.mockResolvedValue([position()]);
    const { result, unmount } = renderHook(() =>
      useAircraftData({ interval: 1000 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });
    unmount();
    const callsAtUnmount = fetchPositions.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchPositions.mock.calls.length).toBe(callsAtUnmount);
  });

  it('toDisplayAircraft keeps heading 0 as 0 (north)', () => {
    const ac = toDisplayAircraft(position({ heading: 0 }));
    expect(ac.track).toBe(0);
    expect(ac.symbolRotate).toBe(0);
  });
  it('does not show the loading banner during routine background refreshes', async () => {
    fetchPositions.mockResolvedValue([position()]);
    const { result } = renderHook(() =>
      useAircraftData({ interval: 5000 }),
    );
    act(() => {
      result.current.startPolling();
    });
    // First fetch: banner visible until data arrives
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });
    expect(result.current.isLoading).toBe(false);
    // Next poll cycle completes: isLoading must stay false throughout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await vi.waitFor(() => {
      expect(fetchPositions.mock.calls.length).toBe(2);
    });
    expect(result.current.isLoading).toBe(false);
  });
});
