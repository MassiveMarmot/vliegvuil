// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Map as MapLibreMap, LngLatBounds, NavigationControl, AttributionControl } from 'maplibre-gl';
import type { MapConfig } from '../types';
import { NETHERLANDS_BBOX } from '../types';
import type { MapLocalePatch } from '../hooks/useMap';
import { buildMapStyle } from './mapStyle';

/** Fit the Netherlands into the viewport, then snap the zoom to an integer. */
export function fitNetherlands(mapInstance: MapLibreMap): void {
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
}

/** Create the map instance (maplibre-gl 6 is ESM-only: named import). */
export function createMapInstance(
  container: HTMLDivElement,
  config: MapConfig,
  locale: MapLocalePatch | undefined,
): MapLibreMap {
  return new MapLibreMap({
    container,
    style: buildMapStyle(),
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
    // Firefox regression fix (compass PR #126 follow-up): the default
    // attribution control mounts via addControl INSIDE .map-container
    // - invisible on the affected Firefox (Gecko misorders the canvas
    // above controls in that stacking context; maintainer-verified via
    // elementFromPoint returning the canvas at the control's
    // position). We create the AttributionControl ourselves and portal
    // it out (see mountPortaledControls); attribution is a CC-BY
    // requirement (PDOK BRT-A, Natural Earth), so it must be VISIBLE.
    attributionControl: false,
  });
}

/** Mount the compass and attribution controls portaled OUT of .map-container (the Firefox fix). */
export function mountPortaledControls(
  mapInstance: MapLibreMap,
  onCompassElement: (el: HTMLElement) => void,
  onAttributionElement: (el: HTMLElement) => void,
): { compassControl: NavigationControl; attributionControl: AttributionControl } {
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
  const compassElement = compassControl.onAdd(mapInstance);
  if (compassElement) {
    compassElement.classList.add('map-compass-portal');
    onCompassElement(compassElement);
  }

  // Attribution control, portaled the same way (Firefox fix).
  // compact: false - the panel must be EXPANDED (the attributions are
  // the CC-BY requirement; a collapsed toggle could be missed). The
  // text comes from the style sources' `attribution` fields
  // (NEIGHBOURS_ATTRIBUTION, PDOK_BRT_ATTRIBUTION) - the same fields
  // the default control read.
  const attributionControl = new AttributionControl({ compact: false });
  const attributionElement = attributionControl.onAdd(mapInstance);
  if (attributionElement) {
    attributionElement.classList.add('map-attribution-portal');
    onAttributionElement(attributionElement);
  }

  return { compassControl, attributionControl };
}
