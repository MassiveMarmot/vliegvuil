// Hook for MapLibre GL map management

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, LngLatBounds } from 'maplibre-gl';
import type { MapConfig, MapStyle } from '../types';
import { NETHERLANDS_BBOX } from '../types';

// Hook return type
export interface UseMapReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: MapLibreMap | null;
  mapLoaded: boolean;
  mapError: string | null;
}

/**
 * Initialize and manage a MapLibre GL map instance
 */
export function useMap(config: MapConfig, style: MapStyle): UseMapReturn {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

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
          sources: {
            'pdok-brt': {
              type: 'raster',
              tiles: [style.url],
              tileSize: 256,
              attribution: 'PDOK BRT Achtergrondkaart',
            },
          },
          layers: [
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
  }, [config.center, config.zoom, config.minZoom, config.maxZoom, config.pitch, config.bearing, style.url]);

  return {
    mapContainer,
    map,
    mapLoaded,
    mapError,
  };
}

export default useMap;
