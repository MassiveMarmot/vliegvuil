// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Hook for MapLibre GL map management

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, LngLatBounds, NavigationControl } from 'maplibre-gl';
import type { MapConfig, MapStyle } from '../types';
import { NETHERLANDS_BBOX, getBasemapUrl, PDOK_BRT_ATTRIBUTION } from '../types';
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

// Hook return type
/** MapLibre UI-string locale patch (session 26): the control buttons'
 *  accessible names come from MapLibre's UI strings; we override the
 *  compass one with the translated label (e.g. "Kaart naar het noorden
 *  draaien"), per the locale option in the MapLibre Map constructor. */
export type MapLocalePatch = Record<string, string>;

export interface UseMapReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: MapLibreMap | null;
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
export function useMap(config: MapConfig, _style?: MapStyle, locale?: MapLocalePatch): UseMapReturn {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) {
      return;
    }

    try {
      // Create map instance (maplibre-gl 6 is ESM-only: named import)
      const mapInstance = new MapLibreMap({
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
        locale,
      });

      // Set Netherlands bounds
      const bounds = new LngLatBounds(
        [NETHERLANDS_BBOX[0], NETHERLANDS_BBOX[1]],
        [NETHERLANDS_BBOX[2], NETHERLANDS_BBOX[3]],
      );
      mapInstance.fitBounds(bounds, { padding: 20, duration: 0 });

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
      mapInstance.addControl(compassControl, 'top-right');

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

      // Cleanup function
      return (): void => {
        mapInstance.off('style.load', onStyleLoad);
        mapInstance.removeControl(compassControl);
        mapInstance.remove();
      };
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Unknown map error');
      setMapInitError(error instanceof Error ? error.message : 'Unknown map error');
      console.error('Failed to initialize map:', error);
    }
  }, [config.center, config.zoom, config.minZoom, config.maxZoom, config.pitch, config.bearing, locale]);

  return {
    mapContainer,
    map,
    mapLoaded,
    styleReady,
    tileError,
    mapError,
    mapInitError,
  };
}

export default useMap;
