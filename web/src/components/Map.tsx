// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Map component with aircraft rendering

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl, { SymbolLayerSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import type { DisplayAircraft } from '../types';
import { useMap } from '../hooks/useMap';
import { DEFAULT_MAP_CONFIG, PDOK_BRT_STYLE } from '../types';
import { NOISE_FILL_OPACITY, noiseFillExpression } from '../noiseStyle';
import {
  registerAircraftIcons,
  iconIdForAircraft,
  SELECTED_ICON_ID,
} from './aircraftIcons';
import { renderBadgeIcon } from '../mapIconCanvas';
import {
  AIRPORT_SOURCE_ID,
  AIRPORT_MARKER_LAYER_ID,
  AIRPORT_LABEL_LAYER_ID,
  AIRPORT_LABEL_MIN_ZOOM,
  AIRPORT_FONT_STACK,
  airportLayerConfig,
} from '../airports/airportLayer';
import { registerAirportIcons, airportIconId } from '../airports/airportIcons';
import type { AirportPopupData } from '../airports/airportLayer';

// Aircraft symbol layer configuration
const AIRCRAFT_LAYER_ID = 'aircraft-symbols';
const AIRCRAFT_SOURCE_ID = 'aircraft';

// Symbol layer properties
const SYMBOL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'icon-image': ['case', ['==', ['get', 'selected'], true], SELECTED_ICON_ID, ['get', 'icon']],
  'icon-rotate': ['get', 'symbolRotate'],
  'icon-rotation-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  // The registered images render at 2x (pixelRatio: 2, 48px for a 24px badge);
  // icon-size 1.0 shows them at their intended display size (~24px). The old
  // 0.5 halved the badge to ~12px, too small on the live map.
  'icon-size': 1.0,
};

const SYMBOL_PAINT: SymbolLayerSpecification['paint'] = {
  'icon-opacity': ['case', ['==', ['get', 'isStale'], true], 0.5, 1],
};

export interface MapProps {
  aircraft: Map<string, DisplayAircraft>;
  selectedAircraftId: string | null;
  onAircraftClick: (id: string) => void;
  /** Noise contour GeoJSON for the overlay fill layer (session 10) */
  noiseContours?: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> } | null;
  /** Whether the noise overlay layer is visible */
  noiseEnabled?: boolean;
  /** Airports to show as markers (session 23); loaded lazily by App */
  airports?: readonly import('../airports/airports').AirportData[];
  /** Called when a visitor clicks an airport marker */
  onAirportClick?: (airport: AirportPopupData) => void;
}

/**
 * Map component that renders aircraft on a MapLibre map
 */
const NOISE_SOURCE_ID = 'noise-contours';
const NOISE_LAYER_ID = 'noise-contours-fill';

export function Map({ aircraft, selectedAircraftId, onAircraftClick, noiseContours, noiseEnabled = false, airports, onAirportClick }: MapProps): React.ReactElement {
  // styleReady ('style.load') gates the data layers, not mapLoaded ('load'):
  // with every basemap tile 404ing, 'load' never fires (it requires the first
  // fully rendered frame) and aircraft stayed invisible until a click.
  const { mapContainer, map, styleReady, tileError } = useMap(DEFAULT_MAP_CONFIG, PDOK_BRT_STYLE);

  // Update aircraft layer when data changes
  useEffect(() => {
    if (!map || !styleReady) {
      return;
    }
    // Register the altitude-band icons (session 17)
    registerAircraftIcons(map);

    // Legacy 'airplane' image (canvas-rendered plane on a white badge);
    // the layer itself selects per-band ids / the selected variant.
    if (!map.hasImage('airplane')) {
      map.addImage(
        'airplane',
        renderBadgeIcon('plane', { glyph: [0x3b, 0x35, 0x2f], fill: [0xff, 0xff, 0xff], shape: 'circle' }),
        { pixelRatio: 2 },
      );
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
        icon: iconIdForAircraft(ac.alt, ac.onGround),
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

  }, [map, styleReady, aircraft, selectedAircraftId, onAircraftClick]);

  // Noise overlay layer (session 10): fill below aircraft symbols
  useEffect((): void => {
    if (!map || !styleReady || !noiseContours) {
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
            'fill-color': noiseFillExpression(),
            'fill-opacity': NOISE_FILL_OPACITY,
            'fill-outline-color': noiseFillExpression(),
          },
        },
        AIRCRAFT_LAYER_ID,
      );
    } else {
      map.setLayoutProperty(NOISE_LAYER_ID, 'visibility', noiseEnabled ? 'visible' : 'none');
    }
  }, [map, styleReady, noiseContours, noiseEnabled]);

  // Airport layer (session 23): markers always visible, name labels
  // from LABEL_MIN_ZOOM to avoid clutter at the default NL view. Both
  // layers render BELOW the aircraft symbols so aircraft stay on top.
  useEffect((): void => {
    if (!map || !styleReady) {
      return;
    }
    registerAirportIcons(map);
    if (!airports || airports.length === 0) {
      if (map.getSource(AIRPORT_SOURCE_ID)) {
        (map.getSource(AIRPORT_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
      return;
    }
    const { airportLayer } = airportLayerConfig();
    const data = airportLayer(airports);
    if (!map.getSource(AIRPORT_SOURCE_ID)) {
      map.addSource(AIRPORT_SOURCE_ID, {
        type: 'geojson',
        data: data as unknown as maplibregl.GeoJSONSourceSpecification['data'],
      });
    } else {
      (map.getSource(AIRPORT_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
        data as unknown as maplibregl.GeoJSONSourceSpecification['data'],
      );
    }
    if (!map.getLayer(AIRPORT_MARKER_LAYER_ID)) {
      map.addLayer(
        {
          id: AIRPORT_MARKER_LAYER_ID,
          type: 'symbol',
          source: AIRPORT_SOURCE_ID,
          layout: {
            'icon-image': [
              'match',
              ['get', 'statusCode'],
              0, airportIconId(0),
              1, airportIconId(1),
              2, airportIconId(2),
              airportIconId(0),
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': 1.1,
          },
        },
        AIRCRAFT_LAYER_ID,
      );
      map.on('click', AIRPORT_MARKER_LAYER_ID, (e: MapLayerMouseEvent) => {
        const features = e.features;
        if (features && features.length > 0 && onAirportClick) {
          const props = (features[0] as { properties?: Record<string, unknown> }).properties;
          if (props) {
            onAirportClick({
              icao: String(props['icao']),
              name: String(props['name']),
              status:
                props['status'] === 'commercial' || props['status'] === 'military-shared' || props['status'] === 'planned'
                  ? props['status']
                  : null,
            });
          }
        }
      });
      map.on('mouseenter', AIRPORT_MARKER_LAYER_ID, () => {
        if (map.getCanvas()) {
          map.getCanvas().style.cursor = 'pointer';
        }
      });
      map.on('mouseleave', AIRPORT_MARKER_LAYER_ID, () => {
        if (map.getCanvas()) {
          map.getCanvas().style.cursor = '';
        }
      });
    }
    if (!map.getLayer(AIRPORT_LABEL_LAYER_ID)) {
      map.addLayer(
        {
          id: AIRPORT_LABEL_LAYER_ID,
          type: 'symbol',
          source: AIRPORT_SOURCE_ID,
          minzoom: AIRPORT_LABEL_MIN_ZOOM,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': [AIRPORT_FONT_STACK],
            'text-size': 12,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-optional': true,
          },
          paint: {
            'text-color': '#3b352f',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        },
        AIRCRAFT_LAYER_ID,
      );
    }
  }, [map, styleReady, airports, onAirportClick]);

  const { t } = useTranslation();

  return (
    <div
      ref={mapContainer}
      className="map-container"
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    >
      {/* Non-blocking notice when the self-hosted basemap tiles fail to
          load; the aircraft layer keeps working (spec: planes unaffected) */}
      {tileError && (
        <div
          role="status"
          aria-live="polite"
          data-testid="tile-error-notice"
          style={{
            position: 'absolute',
            top: '4.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 245, 235, 0.95)',
            color: '#7a4a1a',
            padding: '0.35rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
            border: '1px solid #e5c9a8',
            zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          {t('map.tileError', 'Kaartachtergrond kon niet geladen worden')}
        </div>
      )}
    </div>
  );
}

export default Map;
