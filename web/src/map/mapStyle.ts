// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { StyleSpecification } from 'maplibre-gl';
import { getBasemapUrl, PDOK_BRT_ATTRIBUTION, TILE_MIN_ZOOM, TILE_MAX_ZOOM } from '../types';
import { AIRPORT_GLYPHS_URL } from '../airports/airportLayer';

// Country context for bordering states: the PDOK BRT basemap renders only the
// Netherlands (abroad is transparent by design), so neighbouring countries
// come from a bundled public-domain Natural Earth clip (same origin, ~38 KB).
const NEIGHBOURS_SOURCE_ID = 'neighbours';
const NEIGHBOURS_GEOJSON_URL = '/data/neighbours.geojson';
const NEIGHBOURS_ATTRIBUTION = 'Made with Natural Earth';

// Flat, muted colours that sit under the BRT map without competing with it
// (palette per SPEC §3: cream/sand land, soft blue-grey water).
const NEIGHBOURS_FILL_COLOR = '#efe7d9';
const NEIGHBOURS_BORDER_COLOR = '#8c7f6b';
const MAP_BACKGROUND_COLOR = '#b8c6cc';

/** The base style: PDOK BRT raster tiles over the bundled Natural Earth neighbours. */
export function buildMapStyle(): StyleSpecification {
  return {
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
      { id: 'background', type: 'background', paint: { 'background-color': MAP_BACKGROUND_COLOR } },
      {
        id: 'neighbours-fill',
        type: 'fill',
        source: NEIGHBOURS_SOURCE_ID,
        paint: { 'fill-color': NEIGHBOURS_FILL_COLOR },
      },
      {
        id: 'neighbours-border',
        type: 'line',
        source: NEIGHBOURS_SOURCE_ID,
        paint: { 'line-color': NEIGHBOURS_BORDER_COLOR, 'line-width': 1.5 },
      },
      { id: 'pdok-brt-layer', type: 'raster', source: 'pdok-brt', minzoom: 0, maxzoom: 22 },
    ],
  };
}
