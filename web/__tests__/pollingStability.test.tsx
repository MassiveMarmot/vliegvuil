// Regression tests: App-style mount effect must not ping-pong start/stop,
// and a 429 must pause polling instead of retrying.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsblolProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]) =>
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>)),
      getDataAge: () => 0,
      getLastError: () => null,
      isStale: () => false,
    }),
  };
});

import { RateLimitError } from '@vliegvuil/core';
import { useAircraftData } from '../src/hooks/useAircraftData';
import { DEFAULT_POLLING_CONFIG } from '../src/types';

const effectRuns = { n: 0 };

// Same wiring as App.tsx
function Harness(): null {
  const { startPolling, stopPolling } = useAircraftData({
    ...DEFAULT_POLLING_CONFIG,
    enabled: true,
  });
  useEffect((): (() => void) => {
    effectRuns.n += 1;
    startPolling();
    return (): void => stopPolling();
  }, [startPolling, stopPolling]);
  return null;
}

describe('polling stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    effectRuns.n = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mount effect runs once and polls once per interval (empty results)', async () => {
    fetchPositions.mockResolvedValue([]);
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(effectRuns.n).toBe(1);
    // immediate + one per 5 s tick
    expect(fetchPositions.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('never runs two requests concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetchPositions.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 12_000)); // slower than interval
      inFlight -= 1;
      return [];
    });
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(maxInFlight).toBe(1);
  });

  it('pauses on 429 (no retries) and resumes after Retry-After', async () => {
    fetchPositions.mockRejectedValue(new RateLimitError(30_000));
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(fetchPositions).toHaveBeenCalledTimes(1);

    fetchPositions.mockResolvedValue([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000); // past 30 s + jitter (<2 s)
    });
    expect(fetchPositions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
