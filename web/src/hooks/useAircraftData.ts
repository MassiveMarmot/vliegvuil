// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Hook for managing aircraft data with polling
import { useEffect, useState, useCallback, useRef } from 'react';
import type { DisplayAircraft, AppState } from '../types';
import { DEFAULT_POLLING_CONFIG } from '../types';
import { planeRotationForHeading } from '../mapIconRenderer';
import type { AircraftPosition, PositionProvider } from '@vliegvuil/core';
import { createAdsbfiProvider, RateLimitError } from '@vliegvuil/core';
import i18n from '../i18n';

/** Aircraft not seen for longer than this are dropped from the display */
export const MAX_AGE_SECONDS = 60;

/** Pause after a 429 without Retry-After (the proxy limit window is 1 min) */
export const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;

/** Generate unique ID for aircraft */
export function generateAircraftId(icao24: string): string {
  // Keyed by icao24 only (the provider already uppercases hex addresses):
  // a callsign appearing, changing or disappearing must never produce a
  // second entry for the same airframe (ghost duplicates that lingered up
  // to MAX_AGE_SECONDS and broke the selection id) — the callsign field is
  // updated in place on the same entry instead.
  return icao24;
}

/**
 * Convert core AircraftPosition to DisplayAircraft.
 * Note: core uses latitude/longitude, web uses lat/lon
 */
export function toDisplayAircraft(
  position: AircraftPosition,
  prevAircraft?: DisplayAircraft,
  /** Server-anchored "now" in unix SECONDS (client clock when unknown);
   *  the caller passes provider.getServerNow() so a skewed client clock
   *  cannot mark fresh aircraft stale or vice versa. */
  nowSeconds?: number,
): DisplayAircraft {
  const now = (nowSeconds ?? Date.now() / 1000) * 1000;
  const heading = position.heading ?? 0;

  // MapLibre icon-rotate is degrees clockwise from north (0 = north).
  // ADS-B heading is also degrees clockwise from north, but the Lucide
  // plane glyph's nose points north-east (45), so the icon rotates by
  // heading - 45 to align the nose with the flight direction.
  const symbolRotate = planeRotationForHeading(heading);

  // Check if data is stale (older than polling interval * 2)
  const isStale =
    position.timestamp != null
      ? now - position.timestamp * 1000 > DEFAULT_POLLING_CONFIG.interval * 2
      : false;

  return {
    id: generateAircraftId(position.icao24),
    icao24: position.icao24,
    callsign: position.callsign,
    registration: position.registration,
    type: position.type,
    operator: position.operator,
    lat: position.latitude,
    lon: position.longitude,
    alt: position.altitude,
    track: position.heading,
    speed: position.speed,
    squawk: position.squawk,
    timestamp: position.timestamp,
    onGround: position.onGround,
    verticalRate: position.verticalRate,
    symbolRotate,
    prevLat: prevAircraft?.lat,
    prevLon: prevAircraft?.lon,
    updatedAt: now,
    isStale,
  };
}

/**
 * Provider factory: real adsb.fi open-data provider via configurable base
 * URL. Retries live in this hook (maxRetries/retryDelay), so the provider is
 * configured with maxRetries: 1 to avoid stacking retry loops: a failure
 * otherwise triggered 3 provider attempts per hook retry (3x), i.e. up
 * to 9 upstream requests per poll cycle.
 */
export function createProvider(apiBase: string): PositionProvider {
  return createAdsbfiProvider({ baseUrl: apiBase, maxRetries: 1 });
}

// Hook return type
export interface UseAircraftDataReturn extends AppState {
  startPolling: () => void;
  stopPolling: () => void;
  refreshAircraft: () => Promise<void>;
}

export interface UseAircraftDataConfig {
  interval: number;
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Hook for managing aircraft data with polling.
 * Real data comes from the core adsb.fi provider through a configurable
 * API base URL (VITE_API_BASE, default /api). VITE_MOCK=1 enables a
 * dev-only mock (web/src/mock/mockAircraftData.ts).
 */
export function useAircraftData(
  config: Partial<UseAircraftDataConfig> = {},
): UseAircraftDataReturn {
  const pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...config };

  const [aircraft, setAircraft] = useState<Map<string, DisplayAircraft>>(
    new Map(),
  );
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // Mirror of lastUpdate for the stale-check interval: state updaters must
  // stay pure (no side effects — they double-fire under StrictMode), so the
  // periodic check reads the ref instead of doing work inside setLastUpdate.
  const lastUpdateRef = useRef<number | null>(null);
  const setLastUpdateTracked = useCallback((value: number | null): void => {
    lastUpdateRef.current = value;
    setLastUpdate(value);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<number | null>(null);
  const [showStaleBanner, setShowStaleBanner] = useState(false);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const staleCheckRef = useRef<NodeJS.Timeout | null>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);
  const providerRef = useRef<PositionProvider | null>(null);
  const retryCountRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const mountedRef = useRef(true);
  // Guards live in refs, never in React state: state is stale inside
  // effects/callbacks and put start/stop in an endless ping-pong
  // (isPolling in startPolling's deps changed its identity on every flip).
  const pollingActiveRef = useRef(false);
  // Tab-hidden pause: separate from pollingActiveRef (startPolling/
  // stopPolling semantics unchanged) and from the 429 pause (retryRef):
  // hidden -> clear BOTH intervals; visible -> one immediate refresh and
  // re-arm. Polling "active" state is untouched so stopPolling stays
  // idempotent and the 429 retry path is not disturbed.
  const visibilityPausedRef = useRef(false);
  const inFlightRef = useRef(false);
  const aircraftSizeRef = useRef(0);
  const configRef = useRef(pollingConfig);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  aircraftSizeRef.current = aircraft.size;
  configRef.current = pollingConfig;

  // The provider serves its young cache after a failed poll instead of
  // throwing; positions are then accompanied by the provider's lastError
  // so this poll is treated as a failure, not a success.
  const fetchAircraftData = useCallback(
    async (): Promise<{ positions: AircraftPosition[]; error: Error | null; serverNow: number }> => {
      if (import.meta.env.VITE_MOCK === '1') {
        const { fetchMockAircraft } = await import('../mock/mockAircraftData');
        return { positions: await fetchMockAircraft(), error: null, serverNow: Date.now() / 1000 };
      }
      if (providerRef.current === null) {
        const base = import.meta.env.VITE_API_BASE ?? '/api';
        providerRef.current = createProvider(base);
      }
      const provider = providerRef.current;
      const positions = await provider.fetchPositions({
        minLatitude: 50.5,
        maxLatitude: 54.0,
        minLongitude: 2.5,
        maxLongitude: 7.5,
      });
      // Server-anchored clock (unix seconds; equals the client clock until
      // a first response carried `now`): all ageing below compares
      // upstream timestamps against THIS, so a client clock skewed by
      // minutes cannot drop fresh aircraft or keep dead ones.
      return { positions, error: provider.getLastError(), serverNow: provider.getServerNow() };
    },
    [],
  );

  // Process and update aircraft data
  const updateAircraft = useCallback(
    (newPositions: AircraftPosition[], nowSeconds: number): void => {
      setAircraft((prev) => {
        const updated = new Map(prev);
        for (const position of newPositions) {
          const id = generateAircraftId(position.icao24);
          const prevAircraft = prev.get(id);
          updated.set(id, toDisplayAircraft(position, prevAircraft, nowSeconds));
        }
        // Drop aircraft not seen for more than MAX_AGE_SECONDS
        for (const [id, ac] of updated) {
          if (nowSeconds - ac.timestamp > MAX_AGE_SECONDS) {
            updated.delete(id);
          }
        }
        return updated;
      });
      setLastUpdateTracked(Date.now());
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      setError(null);
      retryCountRef.current = 0;
      setShowStaleBanner(false);
      setStaleMessage(null);
    },
    [setLastUpdateTracked],
  );

  // (Re)arm the poll interval; always clears the previous one first so
  // intervals can never stack.
  const armInterval = useCallback((): void => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    pollingRef.current = setInterval((): void => {
      void refreshRef.current();
    }, configRef.current.interval);
  }, []);

  // Clear both timers WITHOUT touching the polling-active state (the
  // visibility pause uses this; stopPolling has its own, fuller cleanup).
  const clearTimers = useCallback((): void => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
      staleCheckRef.current = null;
    }
  }, []);

  // Handle fetch errors. Stable identity: reads volatile values via refs.
  const handleError = useCallback(
    (err: Error, refresh: () => Promise<void>): void => {
      setIsLoading(false);
      setError(err.message);
      // Show stale banner if we have data but error occurred
      if (aircraftSizeRef.current > 0) {
        setShowStaleBanner(true);
        setStaleMessage(i18n.t('stale.connection', 'Gegevens niet up-to-date: verbindingsfout'));
      }
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }

      // 429: do not retry. Pause the whole poll loop, then resume.
      if (err instanceof RateLimitError) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        const base = err.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS;
        const delay = Math.max(base, 1000) + Math.random() * 2000;
        retryRef.current = setTimeout((): void => {
          retryRef.current = null;
          if (!pollingActiveRef.current || !mountedRef.current) {
            return;
          }
          retryCountRef.current = 0;
          armInterval();
          void refresh();
        }, delay);
        return;
      }

      // Retry if configured
      if (
        retryCountRef.current < configRef.current.maxRetries &&
        configRef.current.enabled &&
        pollingActiveRef.current
      ) {
        retryCountRef.current += 1;
        retryRef.current = setTimeout((): void => {
          retryRef.current = null;
          void refresh();
        }, configRef.current.retryDelay * retryCountRef.current);
      }
    },
    [armInterval],
  );

  // Refresh aircraft data. Stable identity; never runs two requests at once.
  const refreshAircraft = useCallback(async (): Promise<void> => {
    if (!configRef.current.enabled || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    // Only show the loading banner before the first successful fetch;
    // routine background refreshes keep the previous data on screen.
    setIsLoading(!hasLoadedOnceRef.current);
    setLastPollTime(Date.now());
    try {
      const { positions, error, serverNow } = await fetchAircraftData();
      if (!mountedRef.current) {
        return;
      }
      // A poll the provider served from cache after a failed fetch is a
      // failed poll: run the error path (banner + retry), not the success
      // path, so a failing API never looks like fresh data.
      if (error !== null) {
        handleError(error, refreshRef.current);
        return;
      }
      updateAircraft(positions, serverNow);
    } catch (err) {
      if (mountedRef.current) {
        handleError(
          err instanceof Error ? err : new Error('Unknown error'),
          refreshRef.current,
        );
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [fetchAircraftData, updateAircraft, handleError]);
  refreshRef.current = refreshAircraft;

  // Start polling
  const startPolling = useCallback((): void => {
    if (pollingActiveRef.current) {
      return;
    }
    pollingActiveRef.current = true;
    setIsPolling(true);
    setError(null);
    retryCountRef.current = 0;

    // Immediate first fetch
    void refreshAircraft();

    // Poll interval
    armInterval();

    // Periodically check whether data is going stale
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
    }
    staleCheckRef.current = setInterval((): void => {
      // Pure-updater fix: read the mirrored lastUpdate from the ref and set
      // the banner state directly (the updater used to carry these side
      // effects and return the value unchanged).
      // Elapsed-time measurement is inherently skew-safe (client clock on
      // both sides); only comparisons between the upstream aircraft
      // timestamps (server clock) and "now" need the server anchor, which
      // is handled in updateAircraft via nowSeconds.
      const last = lastUpdateRef.current;
      if (last != null && Date.now() - last > configRef.current.interval * 3) {
        setShowStaleBanner(true);
        setStaleMessage(i18n.t('stale.outdated', 'Gegevens mogelijk verouderd'));
      }
    }, configRef.current.interval);
  }, [armInterval, refreshAircraft]);

  // Stop polling
  const stopPolling = useCallback((): void => {
    pollingActiveRef.current = false;
    setIsPolling(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
      staleCheckRef.current = null;
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  // Pause while the tab is hidden (review finding): a background tab kept
  // polling at 12 req/min against the proxy's 60/min per-IP limit. On
  // becoming visible: ONE immediate refresh (so data is fresh the moment
  // the user looks) and re-arm the intervals. The 429 pause (retryRef),
  // inFlight guard and startPolling/stopPolling idempotence are untouched:
  // a 429 retry timer set while hidden still fires on its own schedule,
  // and stopPolling clears everything regardless of the paused flag.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        visibilityPausedRef.current = true;
        clearTimers();
      } else {
        if (!visibilityPausedRef.current) {
          return;
        }
        visibilityPausedRef.current = false;
        // One immediate refresh on return (not a stacked burst), then the
        // normal cadence resumes. refreshAircraft's inFlight guard makes
        // this safe even if a poll was mid-flight when the tab hid.
        void refreshRef.current();
        if (pollingActiveRef.current) {
          armInterval();
          // Re-arm the stale check exactly like startPolling does.
          if (staleCheckRef.current) {
            clearInterval(staleCheckRef.current);
          }
          staleCheckRef.current = setInterval((): void => {
            const last = lastUpdateRef.current;
            if (last != null && Date.now() - last > configRef.current.interval * 3) {
              setShowStaleBanner(true);
              setStaleMessage(i18n.t('stale.outdated', 'Gegevens mogelijk verouderd'));
            }
          }, configRef.current.interval);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return (): void => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armInterval, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    aircraft,
    lastUpdate,
    isLoading,
    error,
    pollingInterval: pollingConfig.interval,
    isPolling,
    lastPollTime,
    showStaleBanner,
    staleMessage,
    selectedAircraftId: null,
    mapLoaded: false,
    mapError: null,
    startPolling,
    stopPolling,
    refreshAircraft,
  };
}

export default useAircraftData;
