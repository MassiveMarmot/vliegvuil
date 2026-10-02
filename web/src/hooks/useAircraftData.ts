// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Hook for managing aircraft data with polling
import { useEffect, useState, useCallback, useRef } from 'react';
import type { DisplayAircraft, AppState } from '../types';
import { DEFAULT_POLLING_CONFIG } from '../types';
import type { AircraftPosition, PositionProvider } from '@vliegvuil/core';
import { createAdsbfiProvider, RateLimitError } from '@vliegvuil/core';
import i18n from '../i18n';

/** Aircraft not seen for longer than this are dropped from the display */
export const MAX_AGE_SECONDS = 60;

/** Pause after a 429 without Retry-After (the proxy limit window is 1 min) */
export const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;

/** Generate unique ID for aircraft */
export function generateAircraftId(icao24: string, callsign: string): string {
  return `${icao24}_${callsign}`;
}

/**
 * Convert core AircraftPosition to DisplayAircraft.
 * Note: core uses latitude/longitude, web uses lat/lon
 */
export function toDisplayAircraft(
  position: AircraftPosition,
  prevAircraft?: DisplayAircraft,
): DisplayAircraft {
  const now = Date.now();
  const heading = position.heading ?? 0;

  // MapLibre uses degrees clockwise from north (0 = north, 90 = east)
  // ADS-B heading is also degrees clockwise from north
  const symbolRotate = heading;

  // Check if data is stale (older than polling interval * 2)
  const isStale =
    position.timestamp != null
      ? now - position.timestamp * 1000 > DEFAULT_POLLING_CONFIG.interval * 2
      : false;

  return {
    id: generateAircraftId(position.icao24, position.callsign ?? ''),
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
 * Real data comes from the core adsb.lol provider through a configurable
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
  const inFlightRef = useRef(false);
  const aircraftSizeRef = useRef(0);
  const configRef = useRef(pollingConfig);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  aircraftSizeRef.current = aircraft.size;
  configRef.current = pollingConfig;

  const fetchAircraftData = useCallback(
    async (): Promise<AircraftPosition[]> => {
      if (import.meta.env.VITE_MOCK === '1') {
        const { fetchMockAircraft } = await import('../mock/mockAircraftData');
        return fetchMockAircraft();
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
      return positions;
    },
    [],
  );

  // Process and update aircraft data
  const updateAircraft = useCallback(
    (newPositions: AircraftPosition[]): void => {
      const nowSeconds = Date.now() / 1000;
      setAircraft((prev) => {
        const updated = new Map(prev);
        for (const position of newPositions) {
          const id = generateAircraftId(position.icao24, position.callsign ?? '');
          const prevAircraft = prev.get(id);
          updated.set(id, toDisplayAircraft(position, prevAircraft));
        }
        // Drop aircraft not seen for more than MAX_AGE_SECONDS
        for (const [id, ac] of updated) {
          if (nowSeconds - ac.timestamp > MAX_AGE_SECONDS) {
            updated.delete(id);
          }
        }
        return updated;
      });
      setLastUpdate(Date.now());
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      setError(null);
      retryCountRef.current = 0;
      setShowStaleBanner(false);
      setStaleMessage(null);
    },
    [],
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
      const data = await fetchAircraftData();
      if (mountedRef.current) {
        updateAircraft(data);
      }
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
      setLastUpdate((last) => {
        if (last != null && Date.now() - last > configRef.current.interval * 3) {
          setShowStaleBanner(true);
          setStaleMessage(i18n.t('stale.outdated', 'Gegevens mogelijk verouderd'));
        }
        return last;
      });
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
