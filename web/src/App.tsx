// Main application component

import React, { useEffect, useState, useCallback } from 'react';
import { Map, SimpleBanner } from './components';
import { useAircraftData } from './hooks';
import { DEFAULT_POLLING_CONFIG } from './types';

/**
 * Main application component
 * Displays map with aircraft and status banners
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

  // Handle aircraft click
  const handleAircraftClick = useCallback((id: string): void => {
    setSelectedAircraftId(prev => prev === id ? null : id);
  }, []);

  // Handle banner dismiss
  const handleDismissBanner = useCallback((): void => {
    refreshAircraft();
  }, [refreshAircraft]);

  // Render selected aircraft details
  const renderAircraftDetails = (): React.ReactElement | null => {
    const ac = aircraft.get(selectedAircraftId ?? '');
    if (!ac) return null;
    
    return (
      <div>
        <p><strong>Callsign:</strong> {ac.callsign}</p>
        <p><strong>ICAO24:</strong> {ac.icao24}</p>
        <p><strong>Type:</strong> {ac.type ?? 'Onbekend'}</p>
        <p><strong>Hoogte:</strong> {ac.alt != null ? `${Math.round(ac.alt)} ft` : 'N/A'}</p>
        <p><strong>Snelheid:</strong> {ac.speed != null ? `${Math.round(ac.speed)} kn` : 'N/A'}</p>
        <p><strong>Koers:</strong> {ac.track != null ? `${Math.round(ac.track)}°` : 'N/A'}</p>
        <p><strong>Positie:</strong> {ac.lat?.toFixed(4)}, {ac.lon?.toFixed(4)}</p>
        <p><strong>Op de grond:</strong> {ac.onGround ? 'Ja' : 'Nee'}</p>
      </div>
    );
  };

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
        }}
      >
        <div><strong>VliegVuil.nl</strong></div>
        <div>Vliegtuigen: {aircraft.size}</div>
        <div>Laatste update: {new Date().toLocaleTimeString('nl-NL')}</div>
      </div>

      {/* Selected aircraft details */}
      {selectedAircraftId && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '1rem',
            borderRadius: '0.25rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '0.875rem',
            maxWidth: '300px',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Vliegtuig Details</h3>
          {renderAircraftDetails()}
        </div>
      )}
    </div>
  );
}

export default App;
