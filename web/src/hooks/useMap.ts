// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Hook for MapLibre GL map management

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, LngLatBounds } from 'maplibre-gl';
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
export interface UseMapReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: MapLibreMap | null;
  mapLoaded: boolean;
  mapError: string | null;
  /** Non-blocking notice when basemap tiles fail to load (self-hosted tiles) */
  tileError: boolean;
}

/**
 * Initialize and manage a MapLibre GL map instance
 */
export function useMap(config: MapConfig, _style?: MapStyle): UseMapReturn {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) {
      return;
    }

    try {
      // Create map instance
      const mapInstance = new maplibregl.Map({
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
      });

      // Set Netherlands bounds
      const bounds = new LngLatBounds(
        [NETHERLANDS_BBOX[0], NETHERLANDS_BBOX[1]],
        [NETHERLANDS_BBOX[2], NETHERLANDS_BBOX[3]],
      );
      mapInstance.fitBounds(bounds, { padding: 20, duration: 0 });

      // Store map instance
      setMap(mapInstance);

      // Handle map load
      mapInstance.on('load', () => {
        setMapLoaded(true);
        setMapError(null);
      });

      // Basemap tile errors (self-hosted tiles): one non-blocking notice,
      // never spamming on repeated tile failures (state flips once).
      // Verified against the MapLibre 4.7 source: 404 tiles fire NO error
      // event at all (source_cache.ts deliberately suppresses them and
      // falls back to parent tiles) — so this notice appears only for
      // real failures (network errors, 5xx, malformed responses), where
      // event.sourceId is attached by the style's evented parent.
      mapInstance.on('error', (event: { sourceId?: string }) => {
        if (event.sourceId === 'pdok-brt') {
          setTileError(true);
        }
      });
      // Handle map errors
      mapInstance.on('error', (error: Error) => {
        setMapError(error.message);
        console.error('Map error:', error);
      });

      // Cleanup function
      return (): void => {
        mapInstance.remove();
      };
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Unknown map error');
      console.error('Failed to initialize map:', error);
    }
  }, [config.center, config.zoom, config.minZoom, config.maxZoom, config.pitch, config.bearing]);

  return {
    mapContainer,
    map,
    mapLoaded,
    tileError,
    mapError,
  };
}

export default useMap;
