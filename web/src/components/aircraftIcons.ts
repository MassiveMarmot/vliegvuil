// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Pure aircraft-icon helpers (no maplibre import so tests stay light).
// MapLibre's icon-color cannot tint a non-SDF image, so one icon is
// pre-rendered per altitude band with the colour baked in (session 17).
import type maplibregl from 'maplibre-gl';

export interface IconColors {
  glyph: [number, number, number];
  fill: [number, number, number];
}

// Canvas-rendered Lucide plane on a white badge with a dark ring (the
// glyph colour is baked in per band; MapLibre cannot tint non-SDF images).
// The plane glyph's nose points north-east, so the map layer rotates it
// by heading - 45 (see planeRotationForHeading and its test).
import { renderBadgeIcon } from '../mapIconCanvas';

export interface AltitudeBand {
  id: string;
  minAlt: number;
  color: [number, number, number];
}

export const ALTITUDE_BANDS: AltitudeBand[] = [
  { id: 'airplane-ground', minAlt: Number.NEGATIVE_INFINITY, color: [0x80, 0x80, 0x80] },
  { id: 'airplane-low', minAlt: 0, color: [0x00, 0xa0, 0x00] },
  { id: 'airplane-mid', minAlt: 5000, color: [0xe0, 0xb0, 0x00] },
  { id: 'airplane-high', minAlt: 10000, color: [0xff, 0x69, 0x00] },
  { id: 'airplane-veryhigh', minAlt: 20000, color: [0xd3, 0x1a, 0x1a] },
];

export const SELECTED_ICON_ID = 'airplane-selected';

/** Icon id for an aircraft's altitude band (ground-aware) */
export function iconIdForAircraft(
  alt: number | null,
  onGround: boolean,
): string {
  if (onGround || alt === null) {
    return 'airplane-ground';
  }
  let band: AltitudeBand = ALTITUDE_BANDS[1] as AltitudeBand;
  for (const b of ALTITUDE_BANDS) {
    if (alt >= b.minAlt) {
      band = b;
    }
  }
  return band.id;
}

/** Register every band icon plus the selected variant on the map (2x). */
export function registerAircraftIcons(map: maplibregl.Map): void {
  for (const band of ALTITUDE_BANDS) {
    if (!map.hasImage(band.id)) {
      map.addImage(
        band.id,
        renderBadgeIcon('plane', { glyph: band.color, fill: [0xff, 0xff, 0xff], shape: 'circle' }),
        { pixelRatio: 2 },
      );
    }
  }
  if (!map.hasImage(SELECTED_ICON_ID)) {
    map.addImage(
      SELECTED_ICON_ID,
      renderBadgeIcon('plane', { glyph: [0xff, 0xff, 0xff], fill: [0xd3, 0x1a, 0x1a], shape: 'circle' }),
      { pixelRatio: 2 },
    );
  }
}

// Colour based on altitude (used by legends/tests)
export function getAircraftColor(alt: number | null): string {
  if (alt === null) return '#808080';
  if (alt < 5000) return '#00a000';
  if (alt < 10000) return '#e0b000';
  if (alt < 20000) return '#ff6900';
  return '#d31a1a';
}
