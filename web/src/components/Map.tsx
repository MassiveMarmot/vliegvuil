// Map component with aircraft rendering

import React, { useEffect } from 'react';
import maplibregl, { SymbolLayerSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import type { DisplayAircraft } from '../types';
import { useMap } from '../hooks';
import { DEFAULT_MAP_CONFIG, PDOK_BRT_STYLE } from '../types';
import { NOISE_BAND_COLORS, NOISE_FILL_OPACITY } from '../noiseStyle';

// Aircraft symbol layer configuration
const AIRCRAFT_LAYER_ID = 'aircraft-symbols';
const AIRCRAFT_SOURCE_ID = 'aircraft';

// Symbol layer properties
const SYMBOL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'icon-image': ['get', 'icon'],
  'icon-rotate': ['get', 'symbolRotate'],
  'icon-rotation-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'icon-size': 0.5,
  'text-field': ['get', 'callsign'],
  'text-font': ['Noto Sans Regular'],
  'text-size': 10,
  'text-offset': [0, 1.5],
  'text-anchor': 'top',
  'text-allow-overlap': true,
};

const SYMBOL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#000000',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1,
};

// Color based on altitude
export function getAircraftColor(alt: number | null): string {
  if (alt === null) return '#808080';
  
  if (alt < 5000) return '#00ff00';
  if (alt < 10000) return '#ffff00';
  if (alt < 20000) return '#ffa500';
  return '#ff0000';
}

export interface MapProps {
  aircraft: Map<string, DisplayAircraft>;
  selectedAircraftId: string | null;
  onAircraftClick: (id: string) => void;
  /** Noise contour GeoJSON for the overlay fill layer (session 10) */
  noiseContours?: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> } | null;
  /** Whether the noise overlay layer is visible */
  noiseEnabled?: boolean;
}

/**
 * Map component that renders aircraft on a MapLibre map
 */
const NOISE_SOURCE_ID = 'noise-contours';
const NOISE_LAYER_ID = 'noise-contours-fill';

export function Map({ aircraft, selectedAircraftId, onAircraftClick, noiseContours, noiseEnabled = false }: MapProps): React.ReactElement {
  const { mapContainer, map, mapLoaded } = useMap(DEFAULT_MAP_CONFIG, PDOK_BRT_STYLE);

  // Update aircraft layer when data changes
  useEffect(() => {
    if (!map || !mapLoaded) {
      return;
    }

    // Add airplane icon if not already added
    if (!map.hasImage('airplane')) {
      map.addImage('airplane', { width: 24, height: 24, data: new Uint8Array() } as unknown as HTMLImageElement);
    }

    // Convert aircraft map to GeoJSON feature collection
    const features = Array.from(aircraft.values()).map(ac => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [ac.lon, ac.lat] as [number, number],
      },
      properties: {
        id: ac.id,
        callsign: ac.callsign,
        icao24: ac.icao24,
        alt: ac.alt ?? 0,
        speed: ac.speed,
        track: ac.track,
        symbolRotate: ac.symbolRotate,
        isStale: ac.isStale,
        onGround: ac.onGround,
        selected: ac.id === selectedAircraftId,
        icon: 'airplane',
      },
    }));

    const geoJson = {
      type: 'FeatureCollection' as const,
      features,
    };

    // Get or create source
    if (map.getSource(AIRCRAFT_SOURCE_ID)) {
      (map.getSource(AIRCRAFT_SOURCE_ID) as maplibregl.GeoJSONSource).setData(geoJson);
    } else {
      map.addSource(AIRCRAFT_SOURCE_ID, {
        type: 'geojson',
        data: geoJson,
      });
    }

    // Get or create layer
    if (map.getLayer(AIRCRAFT_LAYER_ID)) {
      // Layer exists, just update data
    } else {
      // Create new layer
      map.addLayer({
        id: AIRCRAFT_LAYER_ID,
        type: 'symbol',
        source: AIRCRAFT_SOURCE_ID,
        layout: SYMBOL_LAYOUT,
        paint: SYMBOL_PAINT,
      });

      // Add click handler
      map.on('click', AIRCRAFT_LAYER_ID, (e: MapLayerMouseEvent) => {
        const features = e.features;
        if (features && features.length > 0) {
          const feature = features[0];
          const props = (feature as { properties?: Record<string, unknown> }).properties;
          const id = props?.id as string | undefined;
          if (id && onAircraftClick) {
            onAircraftClick(id);
          }
        }
      });

      // Change cursor to pointer on hover
      map.on('mouseenter', AIRCRAFT_LAYER_ID, () => {
        if (map.getCanvas()) {
          map.getCanvas().style.cursor = 'pointer';
        }
      });
      map.on('mouseleave', AIRCRAFT_LAYER_ID, () => {
        if (map.getCanvas()) {
          map.getCanvas().style.cursor = '';
        }
      });
    }

    // Update icon color based on selection, stale status, and altitude
    map.setPaintProperty(AIRCRAFT_LAYER_ID, 'icon-color', [
      'case',
      ['==', ['get', 'selected'], true], '#ff0000',
      ['==', ['get', 'isStale'], true], '#808080',
      ['==', ['get', 'onGround'], true], '#0000ff',
      ['get', 'alt'],
    ]);

    // Update icon opacity based on stale status
    map.setPaintProperty(AIRCRAFT_LAYER_ID, 'icon-opacity', [
      'case',
      ['==', ['get', 'isStale'], true], 0.5,
      1,
    ]);

    map.setPaintProperty(AIRCRAFT_LAYER_ID, 'text-color', [
      'case',
      ['==', ['get', 'selected'], true], '#ffffff',
      '#000000',
    ]);

  }, [map, mapLoaded, aircraft, selectedAircraftId, onAircraftClick]);

  // Noise overlay layer (session 10): fill below aircraft symbols
  useEffect((): void => {
    if (!map || !mapLoaded || !noiseContours) {
      return;
    }
    const noiseData = noiseContours as unknown as maplibregl.GeoJSONSourceSpecification['data'];
    if (!map.getSource(NOISE_SOURCE_ID)) {
      map.addSource(NOISE_SOURCE_ID, {
        type: 'geojson',
        data: noiseData,
      });
    } else {
      (map.getSource(NOISE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(noiseData);
    }
    if (!map.getLayer(NOISE_LAYER_ID)) {
      map.addLayer(
        {
          id: NOISE_LAYER_ID,
          type: 'fill',
          source: NOISE_SOURCE_ID,
          layout: { visibility: noiseEnabled ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'band'],
              48, NOISE_BAND_COLORS[48],
              56, NOISE_BAND_COLORS[56],
              70, NOISE_BAND_COLORS[70],
              '#cccccc',
            ],
            'fill-opacity': NOISE_FILL_OPACITY,
            'fill-outline-color': [
              'match',
              ['get', 'band'],
              48, NOISE_BAND_COLORS[56],
              56, NOISE_BAND_COLORS[70],
              70, '#7a0c16',
              '#999999',
            ],
          },
        },
        AIRCRAFT_LAYER_ID,
      );
    } else {
      map.setLayoutProperty(NOISE_LAYER_ID, 'visibility', noiseEnabled ? 'visible' : 'none');
    }
  }, [map, mapLoaded, noiseContours, noiseEnabled]);

  return (
    <div
      ref={mapContainer}
      className="map-container"
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    />
  );
}

export default Map;
