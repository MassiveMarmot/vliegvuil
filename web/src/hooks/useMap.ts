// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Hook for MapLibre GL map management

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, LngLatBounds, NavigationControl, AttributionControl } from 'maplibre-gl';
// MapLibre's own stylesheet: the compass icon (data-URI background on
// .maplibregl-ctrl-icon), the 29x29 ctrl button size and the control-corner
// positioning all live here. Without it the NavigationControl renders an
// empty, size-less button (the invisible-compass bug). Vite emits it as an
// own-origin hashed CSS file, so the CSP's style-src 'self' keeps working;
// the data: SVG backgrounds fall under img-src, which already allows data:.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapConfig } from '../types';
import { NETHERLANDS_BBOX, getBasemapUrl, PDOK_BRT_ATTRIBUTION, TILE_MIN_ZOOM, TILE_MAX_ZOOM } from '../types';
import { AIRPORT_GLYPHS_URL } from '../airports/airportLayer';

// Country context for bordering states: the PDOK BRT basemap renders only the
// Netherlands (abroad is transparent by design), so neighbouring countries
// come from a bundled public-domain Natural Earth clip (same origin, ~38 KB).
const NEIGHBOURS_SOURCE_ID = 'neighbours';
const NEIGHBOURS_GEOJSON_URL = '/data/neighbours.geojson';
const NEIGHBOURS_ATTRIBUTION = 'Made with Natural Earth';

// Flat, muted colours that sit under the BRT map without competing with it
// (palette per SPEC \u00a73: cream/sand land, soft blue-grey water).
const NEIGHBOURS_FILL_COLOR = '#efe7d9';
const NEIGHBOURS_BORDER_COLOR = '#8c7f6b';
const MAP_BACKGROUND_COLOR = '#b8c6cc';

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

    // The compass control's element once onAdd has produced it (see the
    // Firefox fix at the control's creation site for the full rationale).
    let compassElement: HTMLElement | null = null;
    let attributionElement: HTMLElement | null = null;
    // Hoisted so the catch path can remove a constructed map: if onAdd or
    // fitBounds throws after the constructor, the instance would otherwise
    // leak (event listeners, WebGL context) with no removal path.
    let mapInstance: MapLibreMap | null = null;

    try {
      // Create map instance (maplibre-gl 6 is ESM-only: named import)
      mapInstance = new MapLibreMap({
        container: mapContainer.current,
        style: {
          version: 8,
          // Airport labels (session 23) use self-hosted glyphs from our
          // own origin; no third-party font host (spec §5).
          glyphs: AIRPORT_GLYPHS_URL,
          sources: {
            neighbours: {
              type: 'geojson',
              data: NEIGHBOURS_GEOJSON_URL,
              attribution: NEIGHBOURS_ATTRIBUTION,
            },
            'pdok-brt': {
              type: 'raster',
              tiles: [getBasemapUrl()],
              tileSize: 256,
              attribution: PDOK_BRT_ATTRIBUTION,
              // The self-hosted tile tree only exists for TILE zooms
              // 6-14 (TILE_MIN_ZOOM/TILE_MAX_ZOOM — the same range
              // scripts/vps-tiles-update.js downloads). Declaring the
              // real range here stops MapLibre from requesting tile
              // zooms that always 404 (each 404 trips the non-blocking
              // tile-error notice). These are TILE zooms, deliberately
              // decoupled from the MAP zooms in DEFAULT_MAP_CONFIG
              // (review fix): with 256px raster tiles the covering zoom
              // is round(mapZoom+1), so feeding the map's min/max here
              // (or these to the Map) mixes the two bases and stretches
              // or blanks tiles.
              minzoom: TILE_MIN_ZOOM,
              maxzoom: TILE_MAX_ZOOM,
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': MAP_BACKGROUND_COLOR,
              },
            },
            {
              id: 'neighbours-fill',
              type: 'fill',
              source: NEIGHBOURS_SOURCE_ID,
              paint: {
                'fill-color': NEIGHBOURS_FILL_COLOR,
              },
            },
            {
              id: 'neighbours-border',
              type: 'line',
              source: NEIGHBOURS_SOURCE_ID,
              paint: {
                'line-color': NEIGHBOURS_BORDER_COLOR,
                'line-width': 1.5,
              },
            },
            {
              id: 'pdok-brt-layer',
              type: 'raster',
              source: 'pdok-brt',
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center: config.center as [number, number],
        zoom: config.zoom,
        minZoom: config.minZoom,
        maxZoom: config.maxZoom,
        pitch: config.pitch,
        bearing: config.bearing,
        // Session 26: pitch is disabled entirely (the map is a 2D NL view;
        // no interaction can tilt it) so the compass never needs to reset
        // tilt — it only ever resets the bearing to 0.
        maxPitch: 0,
        locale: localeRef.current,
        // Firefox regression fix (compass PR #126 follow-up): the default
        // attribution control mounts via addControl INSIDE .map-container
        // - invisible on the affected Firefox (Gecko misorders the canvas
        // above controls in that stacking context; maintainer-verified via
        // elementFromPoint returning the canvas at the control's
        // position). We create the AttributionControl ourselves and portal
        // it out (see below); attribution is a CC-BY requirement
        // (PDOK BRT-A, Natural Earth), so it must be VISIBLE.
        attributionControl: false,
      });

      // Set Netherlands bounds
      const bounds = new LngLatBounds(
        [NETHERLANDS_BBOX[0], NETHERLANDS_BBOX[1]],
        [NETHERLANDS_BBOX[2], NETHERLANDS_BBOX[3]],
      );
      mapInstance.fitBounds(bounds, { padding: 20, duration: 0 });
      // Sharp initial view (review fix): raster tiles are 1:1 only at
      // integer map zooms (the covering zoom rounds to a tile level;
      // fractional zooms scale tiles 0.71x-1.41x and blur the baked-in
      // place names). fitBounds produces a fractional zoom on desktop
      // viewports (~6.3-6.9 here); snap it to an integer so the FIRST
      // view is 1:1. floor() shows the whole country with a little extra
      // margin (ceil would crop the edges); at the smallest supported
      // viewport (320px) minZoom 6 already clamps fitBounds to exactly
      // 6.0, so the floor never cuts the Netherlands off. User zoom
      // (wheel/pinch) is deliberately left alone.
      const fitted = mapInstance.getZoom();
      if (!Number.isInteger(fitted)) {
        mapInstance.setZoom(Math.floor(fitted));
      }

      // Session 26 compass: MapLibre's built-in NavigationControl with the
      // compass only (zoom buttons off, verified against the installed 6.14
      // source: NavigationControlOptions showZoom/showCompass). The compass
      // is always rendered (6.x has no "show only when rotated" option;
      // visualizePitch only tilts the icon — moot here because pitch is
      // disabled below). Clicking it calls map.resetNorth() (a 1 s animated
      // rotateTo(0)); MapLibre's easeTo sets duration 0 automatically under
      // prefers-reduced-motion (browser.prefersReducedMotion in the source),
      // so the reset is animation-free for reduced-motion users.
      const compassControl = new NavigationControl({
        showZoom: false,
        showCompass: true,
      });
      // Anchor: top-right, BELOW the header bar. Every other chrome element
      // occupies another corner (noise overlay + telemetry: bottom-right;
      // counter + list: bottom-left; header: top bar; airport popup:
      // bottom-center), so the compass owns the top-right corner at every
      // tested width (320/360/375 px included).
      //
      // Firefox regression follow-up: do NOT use map.addControl. addControl
      // mounts the control INSIDE .map-container, in the same stacking
      // context as the WebGL canvas — and on the affected Firefox nightly
      // + radeonsi the canvas orders above it (elementFromPoint returns the
      // canvas at the compass position; z-index/position/will-change on the
      // corner do not help, because Gecko's stacking order itself misorders
      // them). The proven fix (the counter and noise toggle were rescued
      // exactly this way, PR #124) is to render the chrome OUTSIDE the
      // canvas's stacking context: onAdd returns the control's element
      // unattached (IControl contract, maplibre-gl.d.ts), Map.tsx portals it
      // into a sibling overlay of .map-container, and the overlay owns the
      // positioning. The control still registers its map listeners through
      // onAdd; cleanup calls onRemove (Map.remove() only detaches controls
      // IT mounted via addControl).
      compassElement = compassControl.onAdd(mapInstance);
      if (compassElement) {
        compassElement.classList.add('map-compass-portal');
        setCompassElement(compassElement);
      }

      // Session 28: hide the compass while the map points north. Both
      // 'rotate' and 'rotateend' drive the same check: 'rotate' makes the
      // compass appear as soon as any rotation starts (mouse drag, touch,
      // keyboard Shift+arrow, programmatic setBearing — all go through
      // setBearing/easeTo per the 6.14 source), and 'rotateend' with
      // bearing 0 hides it again only AFTER the 1 s resetNorth ease has
      // finished (duration 0 under prefers-reduced-motion, so the hide is
      // instant there). EPSILON absorbs float noise at north.
      const bearingMap = mapInstance;
      const updateCompassVisibility = (): void => {
        setCompassVisible(Math.abs(bearingMap.getBearing()) >= COMPASS_BEARING_EPSILON);
      };
      mapInstance.on('rotate', updateCompassVisibility);
      mapInstance.on('rotateend', updateCompassVisibility);
      // Initial state: hidden (config.bearing is 0).

      // Attribution control, portaled the same way (Firefox fix).
      // compact: false - the panel must be EXPANDED (the attributions are
      // the CC-BY requirement; a collapsed toggle could be missed). The
      // text comes from the style sources' `attribution` fields
      // (NEIGHBOURS_ATTRIBUTION, PDOK_BRT_ATTRIBUTION) - the same fields
      // the default control read.
      const attributionControl = new AttributionControl({ compact: false });
      attributionElement = attributionControl.onAdd(mapInstance);
      if (attributionElement) {
        attributionElement.classList.add('map-attribution-portal');
        setAttributionElement(attributionElement);
      }

      // Store map instance
      setMap(mapInstance);

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

      // Cleanup function. The ready signals must reset here: if the effect
      // ever re-runs (it should not, but a config change would), the
      // data-layer effects would otherwise run against the new map before
      // its style loaded.
      // The success path always has a constructed map here; the hoisted
      // binding is nullable only for the catch path.
      const constructedMap = mapInstance as MapLibreMap;
      return (): void => {
        constructedMap.off('style.load', onStyleLoad);
        constructedMap.off('rotate', updateCompassVisibility);
        constructedMap.off('rotateend', updateCompassVisibility);
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
