// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Main application component

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Map, SimpleBanner, TelemetryPanel, SearchBox, AircraftList, NoiseOverlay, SettingsPanel, AttributionPage } from './components';
import { useAircraftData } from './hooks';
import { useSmoothedAircraft } from './movement/useSmoothedAircraft';
import { useTranslation } from 'react-i18next';
import { DEFAULT_POLLING_CONFIG } from './types';
import type { NoiseContours } from '@vliegvuil/core';
import { loadUnits, type UnitSettings, DEFAULT_UNITS } from './units';

/**
 * Main application component
 * Displays map with aircraft, telemetry panel, search, list view, and status banners
 */
/** Convert core contours back into the GeoJSON FeatureCollection the map layer needs */
type NoiseGeoJson = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> };

function noiseContoursToGeoJson(contours: NoiseContours): NoiseGeoJson {
  return {
    type: 'FeatureCollection',
    features: contours.contours.map((c): { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> } => ({
      type: 'Feature',
      geometry: c.geometry,
      properties: {
        airport: c.airport,
        band: c.band,
        year: c.year,
        source: c.properties.source,
        license: c.properties.license,
      },
    })),
  };
}

function App(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const {
    aircraft,
    lastUpdate,
    isLoading,
    error,
    showStaleBanner,
    staleMessage,
    startPolling,
    stopPolling,
    refreshAircraft,
  } = useAircraftData({ ...DEFAULT_POLLING_CONFIG, enabled: true });

  // Session 16: dead-reckon aircraft between polls (capped ~10 fps);
  // jumps straight to the newest fix under prefers-reduced-motion.
  const { smoothed: smoothedPositions } = useSmoothedAircraft(aircraft);
  const smoothedAircraft = useMemo(() => {
    if (smoothedPositions.size === 0) {
      return aircraft;
    }
    const merged = new globalThis.Map(aircraft);
    for (const [id, pos] of smoothedPositions) {
      const ac = merged.get(id);
      if (ac) {
        merged.set(id, { ...ac, lat: pos.lat, lon: pos.lon });
      }
    }
    return merged;
  }, [aircraft, smoothedPositions]);

  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [noiseContours, setNoiseContours] = useState<NoiseContours | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const [units, setUnits] = useState<UnitSettings>(DEFAULT_UNITS);

  // Load persisted settings on mount (spec §2: localStorage only)
  useEffect((): void => {
    setUnits(loadUnits());
  }, []);

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
    announce(ac ? t('aria.selected', '{{callsign}} geselecteerd', { callsign: ac.callsign ?? ac.icao24 }) : '');
  }, [aircraft, announce]);

  const handleAircraftClick = useCallback((id: string): void => {
    setSelectedAircraftId(prev => {
      const next = prev === id ? null : id;
      const ac = aircraft.get(id);
      announce(next && ac ? t('aria.selected', '{{callsign}} geselecteerd', { callsign: ac.callsign ?? ac.icao24 }) : '');
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
      announce(next ? t('list.opened', 'Lijstweergave geopend') : t('list.closed', 'Lijstweergave gesloten'));
      return next;
    });
  }, [announce]);

  // Noise overlay toggle with announcement (spec §6)
  const handleToggleNoise = useCallback((enabled: boolean): void => {
    setNoiseEnabled(enabled);
    announce(enabled ? t('noise.opened', 'Geluidscontouren getoond') : t('noise.closed', 'Geluidscontouren verborgen'));
  }, [announce]);

  // Load the noise contour snapshot (built by data-build, spec §5)
  useEffect((): (() => void) => {
    let cancelled = false;
    fetch('/noise-contours.geojson')
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown): void => {
        if (cancelled) return;
        const fc = data as { type?: string; features?: unknown[] };
        if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return;
        const contours = (fc.features as Array<{ geometry?: unknown; properties?: Record<string, unknown> }>)
          .filter((f): boolean => f.geometry !== undefined && f.properties !== undefined)
          .map((f): { geometry: unknown; properties: Record<string, unknown> } => ({
            geometry: f.geometry,
            properties: f.properties ?? {},
          }))
          .map((f): NoiseContours['contours'][number] | null => {
            const p = f.properties;
            const band = p['band'];
            const airport = p['airport'];
            const year = p['year'];
            if (typeof band !== 'number' || typeof airport !== 'string' || typeof year !== 'number') return null;
            if (band !== 48 && band !== 56 && band !== 70) return null;
            return {
              airport,
              year,
              band,
              geometry: f.geometry as NoiseContours['contours'][number]['geometry'],
              properties: {
                source: typeof p['source'] === 'string' ? p['source'] : '',
                license: typeof p['license'] === 'string' ? p['license'] : '',
                date: String(p['date'] ?? year),
                ...(typeof p['caveat'] === 'string' ? { caveat: p['caveat'] } : {}),
              },
            };
          })
          .filter((c): c is NoiseContours['contours'][number] => c !== null);
        setNoiseContours({ contours });
      })
      .catch((): void => {
        // Snapshot absent (e.g. not yet built) — overlay stays hidden
        setNoiseContours(null);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const selectedAircraft = selectedAircraftId
    ? aircraft.get(selectedAircraftId) ?? null
    : null;

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Status Banner */}
      {isLoading && (
        <SimpleBanner
          type="info"
          message={t('banner.loading', 'Laden...')}
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
        aircraft={smoothedPositions.size > 0 ? smoothedAircraft : aircraft}
        selectedAircraftId={selectedAircraftId}
        onAircraftClick={handleAircraftClick}
        noiseContours={noiseContours ? noiseContoursToGeoJson(noiseContours) : null}
        noiseEnabled={noiseEnabled}
      />

      {/* Noise overlay toggle + legend (session 10) */}
      <NoiseOverlay
        enabled={noiseEnabled}
        onToggle={handleToggleNoise}
        contours={noiseContours}
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
        <div><strong>{t('app.title', 'VliegVuil.nl')}</strong></div>
        <div>{t('info.aircraftCount', 'Vliegtuigen: {{count}}', { count: aircraft.size })}</div>
        <div>{t('info.lastUpdate', 'Laatste update: {{time}}', {
          time: lastUpdate != null
            ? new Date(lastUpdate).toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'nl-NL')
            : '—',
        })}</div>
      </div>

      {/* Settings toggle (session 11) */}
      <button
        type="button"
        className="settings-toggle"
        onClick={(): void => setShowSettings(prev => !prev)}
        aria-expanded={showSettings}
        aria-controls="settings-panel"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '5rem',
          zIndex: 20,
        }}
      >
        ⚙
      </button>

      {/* Attribution link (session 11) */}
      <button
        type="button"
        className="attribution-toggle"
        onClick={(): void => setShowAttribution(prev => !prev)}
        aria-expanded={showAttribution}
        aria-controls="attribution-region"
        style={{
          position: 'absolute',
          bottom: '5.5rem',
          left: '1rem',
          zIndex: 20,
        }}
      >
        i
      </button>

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
          noiseContours={noiseContours}
          units={units}
        />
      )}

      {/* Settings panel (session 11) */}
      <SettingsPanel
        open={showSettings}
        onClose={(): void => setShowSettings(false)}
        units={units}
        onUnitsChange={setUnits}
      />

      {/* Attribution page (session 11) */}
      {showAttribution && (
        <AttributionPage onClose={(): void => setShowAttribution(false)} />
      )}
    </div>
  );
}

export default App;
