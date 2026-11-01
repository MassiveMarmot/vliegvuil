// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Hook for MapLibre GL map management

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
// MapLibre's own stylesheet: the compass icon (data-URI background on
// .maplibregl-ctrl-icon), the 29x29 ctrl button size and the control-corner
// positioning all live here. Without it the NavigationControl renders an
// empty, size-less button (the invisible-compass bug). Vite emits it as an
// own-origin hashed CSS file, so the CSP's style-src 'self' keeps working;
// the data: SVG backgrounds fall under img-src, which already allows data:.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapConfig } from '../types';
import { fitNetherlands, createMapInstance, mountPortaledControls } from '../map/mapSetup';

// Session 28: bearing threshold (degrees) at which the compass shows.
// Below it the map counts as pointing north and the compass stays hidden.
const COMPASS_BEARING_EPSILON = 0.5;

// Hook return type
/** MapLibre UI-string locale patch (session 26): the control buttons'
 *  accessible names come from MapLibre's UI strings; we override the
 *  compass one with the translated label (e.g. "Kaart naar het noorden
 *  draaien"), per the locale option in the MapLibre Map constructor. */
export type MapLocalePatch = Record<string, string>;

export interface UseMapReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: MapLibreMap | null;
  /** The compass control's DOM element (NavigationControl onAdd return
   *  value), to be rendered by Map.tsx OUTSIDE .map-container — see the
   *  Firefox stacking-order fix where it is created. Null before the map
   *  initializes and after cleanup. */
  compassElement: HTMLElement | null;
  /** The attribution control's DOM element, portaled out of the map
   *  container by Map.tsx (Firefox stacking-order fix, like the
   *  compass). Null before the map initializes and after cleanup. */
  attributionElement: HTMLElement | null;
  /** True once the 'load' event fired (first fully rendered frame). */
  mapLoaded: boolean;
  /** True once the style is loaded ('style.load') — independent of tiles. */
  styleReady: boolean;
  mapError: string | null;
  /** Fatal init failure (e.g. WebGL2 unavailable): set only when the MapLibre
   *  constructor throws, unlike mapError which is also set by runtime 'error'
   *  events (tile failures and the like) and must stay non-blocking. */
  mapInitError: string | null;
  /** Non-blocking notice when basemap tiles fail to load (self-hosted tiles) */
  tileError: boolean;
}

/** Wire the 'rotate'/'rotateend' listeners that drive compass visibility (session 28). */
function trackCompassBearing(
  mapInstance: MapLibreMap,
  setCompassVisible: (visible: boolean) => void,
): () => void {
  // Both 'rotate' and 'rotateend' drive the same check: 'rotate' makes the
  // compass appear as soon as any rotation starts (mouse drag, touch,
  // keyboard Shift+arrow, programmatic setBearing — all go through
  // setBearing/easeTo per the 6.14 source), and 'rotateend' with
  // bearing 0 hides it again only AFTER the 1 s resetNorth ease has
  // finished (duration 0 under prefers-reduced-motion, so the hide is
  // instant there). EPSILON absorbs float noise at north.
  const updateCompassVisibility = (): void => {
    setCompassVisible(Math.abs(mapInstance.getBearing()) >= COMPASS_BEARING_EPSILON);
  };
  mapInstance.on('rotate', updateCompassVisibility);
  mapInstance.on('rotateend', updateCompassVisibility);
  return (): void => {
    mapInstance.off('rotate', updateCompassVisibility);
    mapInstance.off('rotateend', updateCompassVisibility);
  };
}

/** Register the style.load / load / error listeners; returns the style.load unregister. */
function registerMapEvents(
  mapInstance: MapLibreMap,
  setStyleReady: (ready: boolean) => void,
  setMapLoaded: (loaded: boolean) => void,
  setMapError: (message: string | null) => void,
  setTileError: (failed: boolean) => void,
): () => void {
  // Style-ready signal for data layers: 'style.load' fires as soon as
  // the style JSON is parsed and layers created (Style._load in the
  // MapLibre source) — it does NOT wait for any tile. The 'load' event
  // waits for the first fully rendered frame, which never arrives when
  // every basemap tile 404s, so gating layers on it made the aircraft
  // invisible until an interaction forced a render.
  // Handle style load: layers/sources can be added from here on.
  const onStyleLoad = (): void => {
    setStyleReady(true);
  };
  if (mapInstance.isStyleLoaded()) {
    // Style already loaded before this subscription ran.
    setStyleReady(true);
  } else {
    mapInstance.on('style.load', onStyleLoad);
  }

  // Handle map load (first fully rendered frame; kept for consumers
  // that genuinely need the rendered map).
  mapInstance.on('load', () => {
    setMapLoaded(true);
    setMapError(null);
  });

  // Basemap tile errors (self-hosted tiles): one non-blocking notice,
  // never spamming on repeated tile failures (state flips once).
  // Verified against the MapLibre source (4.7, re-verified 6.14): 404 tiles fire NO error
  // event at all (source_cache.ts deliberately suppresses them and
  // falls back to parent tiles) — so this notice appears only for
  // real failures (network errors, 5xx, malformed responses), where
  // event.sourceId is attached by the style's evented parent.
  // MapLibre 6 fires real event classes: the 'error' listener receives
  // an ErrorEvent whose `error` property is the underlying Error.
  mapInstance.on('error', (event) => {
    if ((event as { sourceId?: string }).sourceId === 'pdok-brt') {
      setTileError(true);
    }
    const detail = (event as unknown as { error?: unknown }).error;
    const message = detail instanceof Error ? detail.message : String(event);
    setMapError(message);
    console.error('Map error:', detail ?? event);
  });

  return (): void => {
    mapInstance.off('style.load', onStyleLoad);
  };
}

/**
 * Initialize and manage a MapLibre GL map instance
 */
export function useMap(config: MapConfig, locale?: MapLocalePatch): UseMapReturn {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [compassElement, setCompassElement] = useState<HTMLElement | null>(null);
  // Session 28: compass only when rotated. The bearing threshold in
  // degrees: below it the compass is hidden (float noise at north must
  // not flicker it), at or above it the compass shows.
  const [compassVisible, setCompassVisible] = useState(false);
  // The attribution control's element (AttributionControl onAdd return
  // value), portaled out of the container like the compass (Firefox
  // stacking-order fix; the default control was maintainer-verified
  // invisible: elementFromPoint returned the canvas at its position).
  const [attributionElement, setAttributionElement] = useState<HTMLElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  // Session 26 (review fix): the locale patch is a CONSTRUCTION-only option
  // (MapLibre reads it in _setButtonTitle at onAdd). Keep it in a ref so it
  // never enters the init effect's dependency array — an unstable object
  // there re-created the whole Map on every render (infinite loop, CI OOM).
  const localeRef = useRef(locale);
  localeRef.current = locale;
  // The label string itself is the dependency for the update effect below.
  const compassLabel = locale?.['NavigationControl.ResetBearing'];

  useEffect(() => {
    if (!mapContainer.current) {
      return;
    }
    // Hoisted so the catch path can remove a constructed map: if onAdd or
    // fitBounds throws after the constructor, the instance would otherwise
    // leak (event listeners, WebGL context) with no removal path.
    let mapInstance: MapLibreMap | null = null;

    try {
      mapInstance = createMapInstance(
        mapContainer.current,
        {
          center: config.center,
          zoom: config.zoom,
          minZoom: config.minZoom,
          maxZoom: config.maxZoom,
          pitch: config.pitch,
          bearing: config.bearing,
        },
        localeRef.current,
      );

      // Set Netherlands bounds
      fitNetherlands(mapInstance);

      // The compass and attribution controls, portaled out of the container
      // (see the Firefox fix at the controls' creation site for the full
      // rationale).
      const { compassControl, attributionControl } = mountPortaledControls(
        mapInstance,
        setCompassElement,
        setAttributionElement,
      );

      // Session 28: hide the compass while the map points north.
      const untrackCompassBearing = trackCompassBearing(mapInstance, setCompassVisible);

      // Store map instance
      setMap(mapInstance);

      // Style-ready, load and error wiring (style/tile error handling).
      const unregisterMapEvents = registerMapEvents(
        mapInstance,
        setStyleReady,
        setMapLoaded,
        setMapError,
        setTileError,
      );

      // Cleanup function. The ready signals must reset here: if the effect
      // ever re-runs (it should not, but a config change would), the
      // data-layer effects would otherwise run against the new map before
      // its style loaded.
      // The success path always has a constructed map here; the hoisted
      // binding is nullable only for the catch path.
      const constructedMap = mapInstance as MapLibreMap;
      return (): void => {
        unregisterMapEvents();
        untrackCompassBearing();
        compassControl.onRemove();
        attributionControl.onRemove();
        setCompassElement(null);
        setAttributionElement(null);
        setCompassVisible(false);
        constructedMap.remove();
        setStyleReady(false);
        setMapLoaded(false);
      };
    } catch (error) {
      // A constructed map must be removed even when a later step (fitBounds,
      // the compass onAdd) throws — otherwise the instance leaks.
      mapInstance?.remove();
      setCompassElement(null);
      setAttributionElement(null);
      setMapError(error instanceof Error ? error.message : 'Unknown map error');
      setMapInitError(error instanceof Error ? error.message : 'Unknown map error');
      console.error('Failed to initialize map:', error);
    }
  }, [config.center, config.zoom, config.minZoom, config.maxZoom, config.pitch, config.bearing]);

  // Session 26 (review fix): update the compass button's label in place on a
  // language change — MapLibre 6.14 sets both `title` and `aria-label`
  // (NavigationControl#_setButtonTitle at onAdd), so a later update must
  // set both. No map re-creation, viewport preserved. The compass element
  // is portaled out of the map container (Firefox fix above), so query it
  // directly instead of through map.getContainer().
  useEffect((): void => {
    if (!map || !compassLabel) {
      return;
    }
    // The control element is the ctrl container; the button lives inside
    // it (matches() covers controls whose onAdd returns the button
    // itself, as test fakes do).
    const btn = compassElement?.matches('.maplibregl-ctrl-compass')
      ? compassElement
      : (compassElement?.querySelector('.maplibregl-ctrl-compass') ?? null);
    btn?.setAttribute('aria-label', compassLabel);
    btn?.setAttribute('title', compassLabel);
  }, [map, compassLabel, compassElement]);

  // Session 28: apply compass visibility to the portaled element. The
  // 'hidden' attribute means display:none — not focusable, not announced
  // (never opacity). If the compass is focused while being hidden, move
  // focus to the map region (the MapLibre canvas is tabindex=0 +
  // role=region when interactive — set by the library itself in 6.14),
  // never to <body>.
  useEffect((): void => {
    if (!compassElement) {
      return;
    }
    if (compassVisible) {
      compassElement.removeAttribute('hidden');
      return;
    }
    if (
      compassElement.contains(document.activeElement) &&
      mapContainer.current
    ) {
      const canvas = mapContainer.current.querySelector('canvas');
      (canvas ?? mapContainer.current).focus();
    }
    compassElement.setAttribute('hidden', '');
  }, [compassVisible, compassElement]);

  return {
    mapContainer,
    map,
    compassElement,
    attributionElement,
    mapLoaded,
    styleReady,
    tileError,
    mapError,
    mapInitError,
  };
}

export default useMap;
