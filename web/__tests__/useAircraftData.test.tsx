// Tests for useAircraftData with a mocked core provider
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AircraftPosition, PositionProvider } from '@vliegvuil/core';

// Mock the core provider factory; the real AdsbfiProvider is covered by
// core/__tests__/providers/adsb-fi.test.ts against the real fixture.
const fetchPositions = vi.fn();
const providerLastError = { current: null as Error | null };
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]) =>
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>)),
      getDataAge: () => 0,
      getLastError: () => providerLastError.current,
      isStale: () => false,
      getServerNow: (): number => Date.now() / 1000,
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
    providerLastError.current = null;
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
    const ac = result.current.aircraft.get('484C5A');
    expect(ac).toBeDefined();
    expect(ac?.alt).toBe(6925);
    expect(result.current.lastUpdate).not.toBeNull();
  });

  it('keys by icao24: a callsign change updates in place (one entry, stable id)', async () => {
    // Same airframe (484C5A), the callsign appears then changes. Under the
    // old icao24_callsign keying each change created a second entry (a
    // ghost that lingered up to MAX_AGE_SECONDS) and the selection id was
    // lost. Now: one entry, keyed by icao24, callsign updated in place.
    fetchPositions
      .mockResolvedValueOnce([position({ callsign: null })])
      .mockResolvedValueOnce([position({ callsign: 'TRA16U' })])
      .mockResolvedValue([position({ callsign: 'NEW123' })]);

    const { result } = renderHook(() => useAircraftData({ interval: 1000 }));
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });
    // No callsign yet: the entry exists under its icao24 key
    expect(result.current.aircraft.get('484C5A')?.callsign).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // A callsign APPEARS: still one entry, same id, field updated
    expect(result.current.aircraft.size).toBe(1);
    expect(result.current.aircraft.has('484C5A')).toBe(true);
    expect(result.current.aircraft.get('484C5A')?.callsign).toBe('TRA16U');
    // A selectedAircraftId of '484C5A' stays valid across the change
    const selectedId = result.current.aircraft.keys().next().value ?? null;
    expect(selectedId).toBe('484C5A');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // The callsign CHANGES: still one entry, same id, field updated
    expect(result.current.aircraft.size).toBe(1);
    expect(result.current.aircraft.get('484C5A')?.callsign).toBe('NEW123');
    // No ghost entries under any callsign-derived key
    expect([...result.current.aircraft.keys()]).toEqual(['484C5A']);
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
    expect(result.current.aircraft.has('484001')).toBe(true);
    expect(result.current.aircraft.has('484C5A')).toBe(false);
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

  it('treats a 500 as a failed poll: error set, stale banner, retry, then recovery', async () => {
    // First a success so aircraft are on screen
    fetchPositions.mockResolvedValue([position()]);
    const { result } = renderHook(() =>
      useAircraftData({ interval: 1000, retryDelay: 100 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.showStaleBanner).toBe(false);

    // Then a 500: the hook must surface it, not treat it as success
    fetchPositions.mockRejectedValue(new Error('adsb.fi API error: 500 Internal Server Error'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(() => {
      expect(result.current.error).toBe('adsb.fi API error: 500 Internal Server Error');
    });
    expect(result.current.showStaleBanner).toBe(true);
    // Aircraft stay on screen (the hook never clears them on an error)
    expect(result.current.aircraft.size).toBe(1);

    // The retry fires without waiting for the poll interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await vi.waitFor(() => {
      expect(fetchPositions.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    // Recovery: the next success clears error and banner
    fetchPositions.mockResolvedValue([position()]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.showStaleBanner).toBe(false);
      expect(result.current.aircraft.size).toBe(1);
    });
  });

  it('treats a cache-served failed poll (provider lastError set) as a failure, not success', async () => {
    // Simulate the provider serving its young cache after a failed fetch:
    // positions resolve AND getLastError() returns the error (the wiring
    // the core PositionProvider now provides).
    fetchPositions.mockResolvedValue([position()]);
    const { result } = renderHook(() =>
      useAircraftData({ interval: 1000, retryDelay: 100 }),
    );
    act(() => {
      result.current.startPolling();
    });
    await vi.waitFor(() => {
      expect(result.current.aircraft.size).toBe(1);
    });

    providerLastError.current = new Error('adsb.fi API error: 503 Service Unavailable');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(() => {
      expect(result.current.error).toBe('adsb.fi API error: 503 Service Unavailable');
    });
    expect(result.current.showStaleBanner).toBe(true);
    // A successful poll must not be mistaken for a cached failure twice

    // Recovery: lastError cleared with the next successful fetch
    providerLastError.current = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.showStaleBanner).toBe(false);
    });
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

  it('toDisplayAircraft keeps heading 0 as 0 (north) and offsets the icon rotation', () => {
    const ac = toDisplayAircraft(position({ heading: 0 }));
    expect(ac.track).toBe(0);
    // The Lucide plane nose points NE (45), so icon-rotate = heading - 45
    expect(ac.symbolRotate).toBe(315);
    const ne = toDisplayAircraft(position({ heading: 45 }));
    expect(ne.symbolRotate).toBe(0);
    const east = toDisplayAircraft(position({ heading: 90 }));
    expect(east.symbolRotate).toBe(45);
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
