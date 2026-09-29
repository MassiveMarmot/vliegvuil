// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Hook for managing aircraft data with polling

import { useEffect, useState, useCallback, useRef } from 'react';
import type { DisplayAircraft, AppState } from '../types';
import { DEFAULT_POLLING_CONFIG } from '../types';
import type { AircraftPosition } from '@vliegvuil/core';

// Generate unique ID for aircraft
export function generateAircraftId(icao24: string, callsign: string): string {
  return `${icao24}_${callsign}`;
}

// Convert core AircraftPosition to DisplayAircraft
// Note: core uses latitude/longitude, web uses lat/lon
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
  const isStale = position.timestamp != null
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

// Hook return type
export interface UseAircraftDataReturn extends AppState {
  startPolling: () => void;
  stopPolling: () => void;
  refreshAircraft: () => Promise<void>;
}

/**
 * Hook for managing aircraft data with polling
 * Simulates data fetching - in production this would connect to the actual API
 */
export function useAircraftData(
  config: Partial<{ interval: number; enabled: boolean; maxRetries: number; retryDelay: number }> = {},
): UseAircraftDataReturn {
  const pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...config };
  
  const [aircraft, setAircraft] = useState<Map<string, DisplayAircraft>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<number | null>(null);
  const [showStaleBanner, setShowStaleBanner] = useState(false);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);

  // Generate mock aircraft data
  const generateMockAircraft = useCallback((): AircraftPosition[] => {
    const mockData: AircraftPosition[] = [];
    const now = Math.floor(Date.now() / 1000);
    const baseLat = 52.3086;
    const baseLon = 4.7639;

    // Generate aircraft around Netherlands
    for (let i = 0; i < 500; i++) {
      const lat = baseLat + (Math.random() * 2 - 1) * 0.5;
      const lon = baseLon + (Math.random() * 2 - 1) * 0.5;
      const alt = Math.floor(Math.random() * 12000) + 1000;
      const heading = Math.floor(Math.random() * 360);
      const speed = Math.random() * 500 + 100;
      const callsign = `KLM${Math.floor(1000 + Math.random() * 9000)}`;
      const icao24 = (Math.floor(Math.random() * 0xFFFFFF)).toString(16).padStart(6, '0').toUpperCase();
      const onGround = Math.random() > 0.9;

      mockData.push({
        icao24,
        callsign,
        registration: `PH-${icao24.substring(0, 4)}`,
        type: Math.random() > 0.5 ? 'B737' : 'A320',
        operator: 'KLM',
        latitude: lat,
        longitude: lon,
        altitude: alt,
        speed,
        heading,
        verticalRate: Math.random() > 0.5 ? Math.floor(Math.random() * 2000 - 1000) : null,
        squawk: Math.random() > 0.5 ? (Math.floor(1000 + Math.random() * 7000)).toString() : null,
        timestamp: now - Math.floor(Math.random() * 30),
        onGround,
      });
    }

    return mockData;
  }, []);

  // Fetch aircraft data (mock implementation)
  const fetchAircraftData = useCallback(async (): Promise<AircraftPosition[]> => {
    // Simulate network delay
    await new Promise<void>(resolve => setTimeout(resolve, 100));

    // Simulate error occasionally
    if (Math.random() < 0.01) {
      throw new Error('Failed to fetch aircraft data');
    }

    return generateMockAircraft();
  }, [generateMockAircraft]);

  // Process and update aircraft data
  const updateAircraft = useCallback((newPositions: AircraftPosition[]): void => {
    setAircraft(prev => {
      const updated = new Map(prev);

      for (const position of newPositions) {
        const id = generateAircraftId(position.icao24, position.callsign ?? '');
        const prevAircraft = prev.get(id);
        updated.set(id, toDisplayAircraft(position, prevAircraft));
      }

      return updated;
    });

    setLastUpdate(Date.now());
    setIsLoading(false);
    setError(null);
    setShowStaleBanner(false);
    setStaleMessage(null);
  }, []);

  // Handle fetch errors
  const handleError = useCallback((err: Error, retryCount: number = 0): void => {
    setIsLoading(false);
    setError(err.message);

    // Show stale banner if we have data but error occurred
    if (aircraft.size > 0) {
      setShowStaleBanner(true);
      setStaleMessage('Gegevens niet up-to-date: verbindingsfout');
    }

    // Retry if configured
    if (retryCount < pollingConfig.maxRetries && pollingConfig.enabled) {
      retryRef.current = setTimeout((): void => {
        refreshAircraft();
      }, pollingConfig.retryDelay * (retryCount + 1));
    }
  }, [aircraft.size, pollingConfig.maxRetries, pollingConfig.retryDelay, pollingConfig.enabled]);

  // Refresh aircraft data
  const refreshAircraft = useCallback(async (): Promise<void> => {
    if (!pollingConfig.enabled) {
      return;
    }

    setIsLoading(true);
    setLastPollTime(Date.now());

    try {
      const data = await fetchAircraftData();
      updateAircraft(data);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Unknown error'));
    }
  }, [pollingConfig.enabled, fetchAircraftData, updateAircraft, handleError]);

  // Start polling
  const startPolling = useCallback((): void => {
    if (isPolling) {
      return;
    }

    setIsPolling(true);
    setError(null);

    // Immediate first fetch
    refreshAircraft();

    // Set up polling interval
    pollingRef.current = setInterval((): void => {
      refreshAircraft();
    }, pollingConfig.interval);

    // Check for stale data periodically
    const staleCheck = setInterval((): void => {
      if (lastUpdate != null && Date.now() - lastUpdate > pollingConfig.interval * 3) {
        setShowStaleBanner(true);
        setStaleMessage('Gegevens mogelijk verouderd');
      }
    }, pollingConfig.interval);

    // Store stale check reference
    retryRef.current = staleCheck as unknown as NodeJS.Timeout;
  }, [isPolling, pollingConfig.interval, lastUpdate, refreshAircraft]);

  // Stop polling
  const stopPolling = useCallback((): void => {
    setIsPolling(false);

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (retryRef.current) {
      clearInterval(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
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
