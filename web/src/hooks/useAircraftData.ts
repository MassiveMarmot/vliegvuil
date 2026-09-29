// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Hook for managing aircraft data with polling
import { useEffect, useState, useCallback, useRef } from 'react';
import type { DisplayAircraft, AppState } from '../types';
import { DEFAULT_POLLING_CONFIG } from '../types';
import type { AircraftPosition, PositionProvider } from '@vliegvuil/core';
import { createAdsblolProvider } from '@vliegvuil/core';

/** Aircraft not seen for longer than this are dropped from the display */
export const MAX_AGE_SECONDS = 60;

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

/** Provider factory: real adsb.lol provider via configurable base URL */
export function createProvider(apiBase: string): PositionProvider {
  return createAdsblolProvider({ baseUrl: apiBase });
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
  const mountedRef = useRef(true);

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
      setError(null);
      retryCountRef.current = 0;
      setShowStaleBanner(false);
      setStaleMessage(null);
    },
    [],
  );

  // Handle fetch errors
  const handleError = useCallback(
    (err: Error, refresh: () => Promise<void>): void => {
      setIsLoading(false);
      setError(err.message);
      // Show stale banner if we have data but error occurred
      if (aircraft.size > 0) {
        setShowStaleBanner(true);
        setStaleMessage('Gegevens niet up-to-date: verbindingsfout');
      }
      // Retry if configured
      if (
        retryCountRef.current < pollingConfig.maxRetries &&
        pollingConfig.enabled
      ) {
        retryCountRef.current += 1;
        retryRef.current = setTimeout((): void => {
          void refresh();
        }, pollingConfig.retryDelay * retryCountRef.current);
      }
    },
    [aircraft.size, pollingConfig.maxRetries, pollingConfig.retryDelay, pollingConfig.enabled],
  );

  // Refresh aircraft data
  const refreshAircraft = useCallback(async (): Promise<void> => {
    if (!pollingConfig.enabled) {
      return;
    }
    setIsLoading(true);
    setLastPollTime(Date.now());
    try {
      const data = await fetchAircraftData();
      if (mountedRef.current) {
        updateAircraft(data);
      }
    } catch (err) {
      handleError(
        err instanceof Error ? err : new Error('Unknown error'),
        refreshAircraft,
      );
    }
  }, [pollingConfig.enabled, fetchAircraftData, updateAircraft, handleError]);

  // Start polling
  const startPolling = useCallback((): void => {
    if (isPolling) {
      return;
    }
    setIsPolling(true);
    setError(null);
    retryCountRef.current = 0;

    // Immediate first fetch
    void refreshAircraft();

    // Poll interval
    pollingRef.current = setInterval((): void => {
      void refreshAircraft();
    }, pollingConfig.interval);

    // Periodically check whether data is going stale
    staleCheckRef.current = setInterval((): void => {
      setLastUpdate((last) => {
        if (last != null && Date.now() - last > pollingConfig.interval * 3) {
          setShowStaleBanner(true);
          setStaleMessage('Gegevens mogelijk verouderd');
        }
        return last;
      });
    }, pollingConfig.interval);
  }, [isPolling, pollingConfig.interval, refreshAircraft]);

  // Stop polling
  const stopPolling = useCallback((): void => {
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
