// Main application component

import React, { useEffect, useState, useCallback } from 'react';
import { Map, SimpleBanner, TelemetryPanel, SearchBox } from './components';
import { useAircraftData } from './hooks';
import { DEFAULT_POLLING_CONFIG } from './types';

/**
 * Main application component
 * Displays map with aircraft, telemetry panel, search, and status banners
 */
function App(): React.ReactElement {
  const {
    aircraft,
    isLoading,
    error,
    showStaleBanner,
    staleMessage,
    startPolling,
    stopPolling,
    refreshAircraft,
  } = useAircraftData({ ...DEFAULT_POLLING_CONFIG, enabled: true });

  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);

  // Start polling on mount
  useEffect((): (() => void) => {
    startPolling();
    return (): void => stopPolling();
  }, [startPolling, stopPolling]);

  // Handle aircraft selection (map click, search result, or toggle off)
  const handleAircraftSelect = useCallback((id: string): void => {
    setSelectedAircraftId(id);
  }, []);

  const handleAircraftClick = useCallback((id: string): void => {
    setSelectedAircraftId(prev => (prev === id ? null : id));
  }, []);

  const handleCloseTelemetry = useCallback((): void => {
    setSelectedAircraftId(null);
  }, []);

  // Handle banner dismiss
  const handleDismissBanner = useCallback((): void => {
    refreshAircraft();
  }, [refreshAircraft]);

  const selectedAircraft = selectedAircraftId
    ? aircraft.get(selectedAircraftId) ?? null
    : null;

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Status Banner */}
      {isLoading && (
        <SimpleBanner
          type="info"
          message="Laden..."
          visible={true}
        />
      )}

      {error && (
        <SimpleBanner
          type="error"
          message={error}
          visible={true}
          onDismiss={handleDismissBanner}
        />
      )}

      {showStaleBanner && staleMessage && (
        <SimpleBanner
          type="warning"
          message={staleMessage}
          visible={true}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* Search */}
      <SearchBox
        aircraft={aircraft}
        onSelect={handleAircraftSelect}
      />

      {/* Map */}
      <Map
        aircraft={aircraft}
        selectedAircraftId={selectedAircraftId}
        onAircraftClick={handleAircraftClick}
      />

      {/* Info overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '1rem',
          left: '1rem',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: '0.75rem 1rem',
          borderRadius: '0.25rem',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '0.875rem',
          zIndex: 10,
        }}
      >
        <div><strong>VliegVuil.nl</strong></div>
        <div>Vliegtuigen: {aircraft.size}</div>
        <div>Laatste update: {new Date().toLocaleTimeString('nl-NL')}</div>
      </div>

      {/* Telemetry panel for selected aircraft */}
      {selectedAircraft && (
        <TelemetryPanel
          aircraft={selectedAircraft}
          onClose={handleCloseTelemetry}
        />
      )}
    </div>
  );
}

export default App;
