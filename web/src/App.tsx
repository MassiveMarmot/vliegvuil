// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Main application component

import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  SimpleBanner,
  TelemetryPanel,
  SearchBox,
  AircraftList,
  NoiseOverlay,
  SettingsPanel,
  AttributionPage,
} from './components';
import { Header } from './components/Header';
import { AboutPage } from './components/AboutPage';
import { NotFoundPage } from './components/NotFoundPage';
import { useRouter, pagePath } from './hooks/useRouter';
import MapErrorBoundary from './components/MapErrorBoundary';
// MapLibre is the heaviest dependency (~1 MB); load it in its own chunk.
// The direct module path keeps the components barrel (which re-exports Map)
// from pulling maplibre-gl into the initial bundle.
const Map = lazy(() => import('./components/Map'));

/** Session 26: id of the list panel, referenced by the counter toggle's aria-controls */
const AIRCRAFT_LIST_ID = 'aircraft-list-panel';
import { useAircraftData } from './hooks';
import { countRouteChange } from './analytics';
import { useSmoothedAircraft } from './movement/useSmoothedAircraft';
import { useTranslation } from 'react-i18next';
import { DEFAULT_POLLING_CONFIG, type DisplayAircraft } from './types';
import type { NoiseContours } from '@vliegvuil/core';
import noiseSources from '../../sources.json';
import { loadUnits, type UnitSettings, DEFAULT_UNITS } from './units';
import { loadAirports, type AirportData, type AirportStatus } from './airports/airports';
import { iataFor } from './airports/airportLayer';
import { enrichFleet } from './airports/aircraftSnapshot';
const AirportPopup = lazy(() => import('./airports/AirportPopup'));
import type { AirportPopupData } from './airports/airportLayer';

/**
 * Main application component
 * Displays map with aircraft, telemetry panel, search, list view, and status banners
 */
/** Convert core contours back into the GeoJSON FeatureCollection the map layer needs */
type NoiseGeoJson = {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }>;
};

function noiseContoursToGeoJson(contours: NoiseContours): NoiseGeoJson {
  return {
    type: 'FeatureCollection',
    features: contours.contours.map(
      (c): { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> } => ({
        type: 'Feature',
        geometry: c.geometry,
        properties: {
          airport: c.airport,
          bandLowerDb: c.bandLowerDb,
          metric: c.metric,
          kind: c.kind,
          year: c.year,
          source: c.properties.source,
          license: c.properties.license,
        },
      })
    ),
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
  // Session 26: the list toggle is the flight counter; focus returns to it
  // when the list closes (the header Lijst button is gone).
  const listToggleButtonRef = useRef<HTMLButtonElement>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [noiseContours, setNoiseContours] = useState<NoiseContours | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [attributionFocusSection, setAttributionFocusSection] = useState<string | undefined>(
    undefined
  );
  const [units, setUnits] = useState<UnitSettings>(DEFAULT_UNITS);

  // Airport layer (session 23): fetch lazily once the app is up; the
  // layer is on by default (no toggle) and airports.json is not in the
  // service-worker precache.
  const [airports, setAirports] = useState<AirportData[]>([]);
  const [selectedAirport, setSelectedAirport] = useState<AirportPopupData | null>(null);

  // Aircraft snapshot fallback (session 23): enrich the fleet with the
  // lazily-loaded snapshot; live values always win, the snapshot only
  // fills gaps. The snapshot fetch is cached, so this is a Map lookup
  // per aircraft on every poll, not a refetch.
  const [enrichedAircraft, setEnrichedAircraft] = useState<Map<string, DisplayAircraft> | null>(
    null
  );
  useEffect((): void => {
    void enrichFleet(aircraft).then((fleet): void => {
      setEnrichedAircraft(fleet);
    });
  }, [aircraft]);

  // Load persisted settings on mount (spec §2: localStorage only)
  useEffect((): void => {
    setUnits(loadUnits());
  }, []);

  // Lazy-load the airport list once (session 23). A failed fetch
  // resolves to an empty list: no airport layer, no error banner.
  useEffect((): (() => void) => {
    let cancelled = false;
    void loadAirports().then((data): void => {
      if (!cancelled) setAirports(data);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Ref so the live region is addressable for testing
  const liveRegionRef = useRef<HTMLDivElement>(null);
  // Routing (session 25): language from the URL path, pages via the
  // History API; the map view keeps polling, the about/attribution views
  // are static content over a plain background.
  const { state: routeState, navigate } = useRouter();
  const { language, route } = routeState;
  const mainRef = useRef<HTMLElement>(null);
  // Route change: document.title, <html lang>, focus to the page h1,
  // announce via the live region (spec section 6).
  useEffect((): void => {
    document.documentElement.lang = language;
    // Session 25c: count the route change (same-origin /count, production
    // builds only; the module no-ops elsewhere). Counted for every route
    // incl. not-found, per the session plan.
    countRouteChange(window.location.pathname);
    const titles: Record<string, string> = {
      map: t('title.map', 'VliegVuil.nl - live vliegverkeer en geluidscontouren'),
      about: t('title.about', 'Over - VliegVuil.nl'),
      attribution: t('title.attribution', 'Bronnen - VliegVuil.nl'),
      'not-found': t('title.notFound', 'Pagina niet gevonden - VliegVuil.nl'),
    };
    document.title = titles[route] ?? titles['map'] ?? '';
    if (route !== 'map') {
      // Session 25 fix: no overlay survives into a page without a map.
      // The overlays are also unmounted on non-map routes (see render),
      // so they leave the tab order and the a11y tree entirely.
      setShowSettings(false);
      setShowList(false);
      setSelectedAircraftId(null);
      setSelectedAirport(null);
      mainRef.current?.focus();
    }
  }, [language, route, t]);

  // Start polling on mount
  useEffect((): (() => void) => {
    startPolling();
    return (): void => stopPolling();
  }, [startPolling, stopPolling]);

  // Announce selection changes to screen readers (spec §6)
  const announce = useCallback((message: string): void => {
    setLiveMessage(message);
  }, []);

  // Handle aircraft selection (map click, search result, list row).
  // On a non-map route the result is invisible, so navigate to the map
  // first and select in the same batched update: the route-change effect
  // only resets overlays when the new route is NOT the map, so it does
  // not undo the selection.
  const handleAircraftSelect = useCallback(
    (id: string): void => {
      if (route !== 'map') {
        navigate(pagePath(language, 'map'));
      }
      setSelectedAircraftId(id);
      const ac = aircraft.get(id);
      announce(
        ac
          ? t('aria.selected', '{{callsign}} geselecteerd', { callsign: ac.callsign ?? ac.icao24 })
          : ''
      );
    },
    [route, navigate, language, aircraft, announce, t]
  );

  const handleAircraftClick = useCallback(
    (id: string): void => {
      // Pure updaters only: the announce() side effect used to live inside
      // the setSelectedAircraftId updater, where it double-fires under
      // StrictMode and (worse) closures over the aircraft map are fine here
      // but the updater must stay pure. Compute the next selection from the
      // CURRENT id (selectedAircraftId state), set it, then announce outside.
      const next = selectedAircraftId === id ? null : id;
      setSelectedAircraftId(next);
      const ac = next ? aircraft.get(id) : undefined;
      announce(
        next && ac
          ? t('aria.selected', '{{callsign}} geselecteerd', {
              callsign: ac.callsign ?? ac.icao24,
            })
          : ''
      );
    },
    [selectedAircraftId, aircraft, announce, t]
  );

  const handleCloseTelemetry = useCallback((): void => {
    setSelectedAircraftId(null);
  }, []);

  // Airport popup (session 23): map symbol layers are not focusable,
  // so the popup is the keyboard/screen-reader path for airport info;
  // it manages focus like the telemetry panel. Selection is announced
  // to the live region for screen readers.
  const handleAirportClick = useCallback(
    (airport: AirportPopupData): void => {
      setSelectedAirport(airport);
      announce(t('airport.selected', '{{name}} geselecteerd', { name: airport.name }));
    },
    [announce, t]
  );

  const handleCloseAirport = useCallback((): void => {
    setSelectedAirport(null);
  }, []);

  // Handle banner dismiss
  const handleDismissBanner = useCallback((): void => {
    refreshAircraft();
  }, [refreshAircraft]);

  // Settings (session 25 fix): opening settings from a non-map route
  // navigates to the map first, so the panel is actually visible instead
  // of leaving a stale showSettings that pops open on the next map visit.
  // Settings and the list are mutually exclusive: opening one closes the
  // other (the list unmounts, so it cannot steal focus back).
  const handleOpenSettings = useCallback((): void => {
    if (route !== 'map') {
      navigate(pagePath(language, 'map'));
    }
    setShowList(false);
    setShowSettings(true);
  }, [route, navigate, language]);

  // List view toggle with announcement (spec §6: layer/panel toggles
  // announced). On a non-map route the list is invisible: navigate to the
  // map and OPEN the list (never toggle closed from a page).
  const handleToggleList = useCallback((): void => {
    if (route !== 'map') {
      navigate(pagePath(language, 'map'));
      setShowSettings(false);
      setShowList(true);
      announce(t('list.opened', 'Lijstweergave geopend'));
      return;
    }
    // Pure updaters only: showList/showSettings changes and the announce()
    // side effect used to live inside the setShowList updater (double-fires
    // under StrictMode). Compute from the CURRENT state, set outside.
    const next = !showList;
    setShowList(next);
    // Opening the list closes Settings (mutually exclusive); closing the
    // list leaves Settings alone.
    if (next) {
      setShowSettings(false);
    }
    announce(
      next
        ? t('list.opened', 'Lijstweergave geopend')
        : t('list.closed', 'Lijstweergave gesloten')
    );
  }, [route, navigate, language, showList, announce, t]);

  // Session 26 focus management for the counter-anchored list: focus moves
  // into the panel on open and returns to the counter button on close
  // (the toggle is the counter; the header Lijst button is gone).
  const prevShowListRef = useRef(false);
  useEffect((): void => {
    const wasOpen = prevShowListRef.current;
    prevShowListRef.current = showList;
    if (showList && !wasOpen) {
      document.getElementById(AIRCRAFT_LIST_ID)?.focus();
    } else if (!showList && wasOpen && route === 'map') {
      listToggleButtonRef.current?.focus();
    }
  }, [showList, route]);

  // Fatal map-init failure (WebGL2 unavailable): open the list view from
  // the notice — a pure open, never a toggle-close (spec: the list is the
  // data alternative to the map).
  const handleOpenListFromMapError = useCallback((): void => {
    if (!showList) {
      handleToggleList();
    }
  }, [showList, handleToggleList]);

  // Noise overlay toggle with announcement (spec §6)
  const handleToggleNoise = useCallback(
    (enabled: boolean): void => {
      setNoiseEnabled(enabled);
      announce(
        enabled
          ? t('noise.opened', 'Geluidscontouren getoond')
          : t('noise.closed', 'Geluidscontouren verborgen')
      );
    },
    [announce, t]
  );

  // Open the Attribution page at the noise layer section: navigation is a
  // route now (session 25); the focus section travels as state.
  const handleOpenNoiseSources = useCallback((): void => {
    setAttributionFocusSection('noise');
    navigate(pagePath(language, 'attribution'));
  }, [language, navigate]);

  // Load the noise contour snapshot (built by data-build, spec §5)
  useEffect((): (() => void) => {
    let cancelled = false;
    fetch('/noise-contours.geojson')
      .then((res): Promise<unknown> =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data: unknown): void => {
        if (cancelled) return;
        const fc = data as { type?: string; features?: unknown[] };
        if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return;
        const contours = (
          fc.features as Array<{ geometry?: unknown; properties?: Record<string, unknown> }>
        )
          .filter((f): boolean => f.geometry !== undefined && f.properties !== undefined)
          .map((f): { geometry: unknown; properties: Record<string, unknown> } => ({
            geometry: f.geometry,
            properties: f.properties ?? {},
          }))
          .map((f): NoiseContours['contours'][number] | null => {
            const p = f.properties;
            const bandLowerDb = p['bandLowerDb'];
            const airport = p['airport'];
            const year = p['year'];
            const metric = p['metric'];
            const kind = p['kind'];
            if (
              typeof bandLowerDb !== 'number' ||
              typeof airport !== 'string' ||
              typeof year !== 'number' ||
              typeof metric !== 'string'
            )
              return null;
            if (kind !== 'actual' && kind !== 'permitted') return null;
            // The legend year must agree with the recorded state in sources.json
            // (session 22b); features from a different reference year are dropped.
            const recordedYear = (
              noiseSources as { sources: Array<{ id: string; referenceYear?: number }> }
            ).sources.find((s): boolean => s.id === 'rivm-end-2021-noise')?.referenceYear;
            if (recordedYear !== undefined && year !== recordedYear) return null;
            return {
              airport,
              year,
              bandLowerDb,
              metric,
              kind,
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

  const selectedAircraft = selectedAircraftId ? (aircraft.get(selectedAircraftId) ?? null) : null;

  return (
    <div className="app-shell">
      <Header
        language={language}
        route={route}
        onNavigate={navigate}
        onOpenSettings={handleOpenSettings}
        search={<SearchBox aircraft={aircraft} onSelect={handleAircraftSelect} />}
        skipTargetId="map-region"
      />
      <div className="app-body">
        {/* Status Banner */}
        {isLoading && (
          <SimpleBanner type="info" message={t('banner.loading', 'Laden...')} visible={true} />
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

        {/* Map (lazy-loaded MapLibre chunk); the boundary catches a 404 on
          the old hashed chunk right after a deploy (session 24). Session 26:
          the map region is a <main> landmark with a label (one main per
          page: the page-content <main>s render only on non-map routes,
          and this region is display:none there anyway). */}
        <main
          id={'map-region'}
          ref={mainRef}
          aria-label={t('nav.map', 'Kaart')}
          className={route === 'map' ? 'map-view' : 'map-view map-view-hidden'}
        >
          <MapErrorBoundary t={t}>
            <Suspense
              fallback={
                <div
                  className="map-container"
                  role="status"
                  aria-label={t('app.loading', 'Laden...')}
                />
              }
            >
              <Map
                aircraft={
                  smoothedPositions.size > 0 ? smoothedAircraft : (enrichedAircraft ?? aircraft)
                }

                selectedAircraftId={selectedAircraftId}
                onAircraftClick={handleAircraftClick}
                noiseContours={noiseContours ? noiseContoursToGeoJson(noiseContours) : null}
                noiseEnabled={noiseEnabled}
                airports={airports}
                onAirportClick={handleAirportClick}
                onOpenList={handleOpenListFromMapError}
              />
            </Suspense>
          </MapErrorBoundary>
        </main>

        {/* Map chrome (session 25 fix): only on the map route. On About,
            Attribution and not-found the map is covered and none of these
            controls render — not focusable, not in the a11y tree. */}
        {route === 'map' && (
          <>
            {/* Noise overlay toggle + legend (session 10) */}
            <NoiseOverlay
              enabled={noiseEnabled}
              onToggle={handleToggleNoise}
              contours={noiseContours}
              onOpenSources={handleOpenNoiseSources}
            />

            {/* Session 26: the flight counter IS the list toggle (the
                header Lijst button is gone). A real button with an
                accessible name that carries the count and the action
                (aria-label: open the list / close the list), plus a
                visible affordance: an aria-hidden list icon and a
                chevron that flips with aria-expanded (up when closed,
                because the panel pops out ABOVE the counter).
                aria-expanded/aria-controls wire it to the pop-out. */}
            <div className="map-status">
              <button
                type="button"
                className="map-status-toggle"
                ref={listToggleButtonRef}
                aria-expanded={showList}
                aria-controls={AIRCRAFT_LIST_ID}
                aria-label={t(
                  showList
                    ? 'info.listToggleClose'
                    : 'info.listToggleOpen',
                  showList
                    ? 'Vliegtuigen: {{count}}, lijst sluiten'
                    : 'Vliegtuigen: {{count}}, lijst met alle vluchten openen',
                  { count: aircraft.size }
                )}
                onClick={handleToggleList}
              >
                <svg className="map-status-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
                  <rect x="1.5" y="2.5" width="13" height="2" rx="1" fill="currentColor" />
                  <rect x="1.5" y="7" width="13" height="2" rx="1" fill="currentColor" />
                  <rect x="1.5" y="11.5" width="9" height="2" rx="1" fill="currentColor" />
                </svg>
                {t('info.aircraftCount', 'Vliegtuigen: {{count}}', { count: aircraft.size })}
                <svg className="map-status-chevron" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
                  <path d="M4 10 L8 6 L12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div aria-hidden="true">
                {t('info.lastUpdate', 'Laatste update: {{time}}', {
                  time:
                    lastUpdate != null
                      ? new Date(lastUpdate).toLocaleTimeString(
                          i18n.language === 'en' ? 'en-GB' : 'nl-NL'
                        )
                      : '—',
                })}
              </div>
            </div>
          </>
        )}

        {/* Aircraft list view (keyboard/screen-reader alternative);
            route-gated so it never survives a route change. Session 26:
            pop-out anchored above the counter (id referenced by the
            toggle's aria-controls). */}
        {route === 'map' && showList && (
          <AircraftList
            id={AIRCRAFT_LIST_ID}
            aircraft={aircraft}
            selectedAircraftId={selectedAircraftId}
            onSelect={handleAircraftSelect}
            onClose={handleToggleList}
            units={units}
          />
        )}

        {/* Airport popup (session 23); lazy so the main bundle stays small */}
        {route === 'map' && selectedAirport && (
          <Suspense fallback={null}>
            <AirportPopup
              icao={selectedAirport.icao}
              iata={iataFor(airports, selectedAirport.icao)}
              name={selectedAirport.name}
              status={selectedAirport.status as AirportStatus | null}
              onClose={handleCloseAirport}
            />
          </Suspense>
        )}

        {/* Telemetry panel for selected aircraft */}
        {route === 'map' && selectedAircraft && (
          <TelemetryPanel
            aircraft={selectedAircraft}
            onClose={handleCloseTelemetry}
            noiseContours={noiseContours}
            units={units}
          />
        )}

        {/* Settings panel (session 11) */}
        <SettingsPanel
          open={route === 'map' && showSettings}
          onClose={(): void => setShowSettings(false)}
          units={units}
          onUnitsChange={setUnits}
        />

        {/* Attribution page (routed, session 25 fix: a real page like
            About — no close button, no floating panel); focusSection
            deep-links to a layer section */}
        {route === 'attribution' && (
          <AttributionPage focusSectionId={attributionFocusSection} />
        )}
        {/* About page (routed, session 25) */}
        {route === 'about' && <AboutPage language={language} onNavigate={navigate} />}
        {/* Not-found view (session 25) */}
        {route === 'not-found' && <NotFoundPage language={language} onNavigate={navigate} />}
      </div>
    </div>
  );
}

export default App;
