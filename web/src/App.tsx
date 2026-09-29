// Main application component

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Map, SimpleBanner, TelemetryPanel, SearchBox, AircraftList } from './components';
import { useAircraftData } from './hooks';
import { DEFAULT_POLLING_CONFIG } from './types';

/**
 * Main application component
 * Displays map with aircraft, telemetry panel, search, list view, and status banners
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
  const [showList, setShowList] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  // Ref so the live region is addressable for testing
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Start polling on mount
  useEffect((): (() => void) => {
    startPolling();
    return (): void => stopPolling();
  }, [startPolling, stopPolling]);

  // Announce selection changes to screen readers (spec §6)
  const announce = useCallback((message: string): void => {
    setLiveMessage(message);
  }, []);

  // Handle aircraft selection (map click, search result, list row)
  const handleAircraftSelect = useCallback((id: string): void => {
    setSelectedAircraftId(id);
    const ac = aircraft.get(id);
    announce(ac ? `${ac.callsign ?? ac.icao24} geselecteerd` : '');
  }, [aircraft, announce]);

  const handleAircraftClick = useCallback((id: string): void => {
    setSelectedAircraftId(prev => {
      const next = prev === id ? null : id;
      const ac = aircraft.get(id);
      announce(next && ac ? `${ac.callsign ?? ac.icao24} geselecteerd` : '');
      return next;
    });
  }, [aircraft, announce]);

  const handleCloseTelemetry = useCallback((): void => {
    setSelectedAircraftId(null);
  }, []);

  // Handle banner dismiss
  const handleDismissBanner = useCallback((): void => {
    refreshAircraft();
  }, [refreshAircraft]);

  // List view toggle with announcement (spec §6: layer/panel toggles announced)
  const handleToggleList = useCallback((): void => {
    setShowList(prev => {
      const next = !prev;
      announce(next ? 'Lijstweergave geopend' : 'Lijstweergave gesloten');
      return next;
    });
  }, [announce]);

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

      {/* ARIA live region for selection and toggle announcements */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        className="visually-hidden"
        data-testid="aria-live"
      >
        {liveMessage}
      </div>

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

      {/* List view toggle */}
      <button
        type="button"
        className="aircraft-list-toggle"
        onClick={handleToggleList}
        aria-expanded={showList}
        aria-controls="aircraft-list-region"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 20,
        }}
      >
        Lijst
      </button>

      {/* Aircraft list view (keyboard/screen-reader alternative) */}
      {showList && (
        <AircraftList
          aircraft={aircraft}
          selectedAircraftId={selectedAircraftId}
          onSelect={handleAircraftSelect}
          onClose={handleToggleList}
        />
      )}

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
