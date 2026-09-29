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

export function createAirplaneIcon(
  colors: IconColors = { glyph: [0x3b, 0x35, 0x2f], fill: [0xff, 0xff, 0xff] },
): { width: number; height: number; data: Uint8Array } {
  const size = 24;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  const planeDist = 7; // distance from centre for the plane body pixels
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Thin dark border ring, then white circle fill
      if (dist <= radius && dist > radius - 1.5) {
        data[idx] = 0x3b; data[idx + 1] = 0x35; data[idx + 2] = 0x2f; data[idx + 3] = 0xff;
      } else if (dist <= radius - 1.5) {
        // Plane glyph: simple upward triangle along the vertical axis
        const onBody = Math.abs(dx) <= 1.2 && dy >= -planeDist && dy <= planeDist;
        const onWing = Math.abs(Math.abs(dx) - (planeDist - Math.abs(dy) * 0.6)) < 1.2 && Math.abs(dy) < planeDist * 0.7;
        const isPlane = onBody || onWing;
        const c = isPlane ? colors.glyph : colors.fill;
        data[idx] = c[0];
        data[idx + 1] = c[1];
        data[idx + 2] = c[2];
        data[idx + 3] = 0xff;
      }
    }
  }
  return { width: size, height: size, data };
}

/**
 * Pre-rendered icons per altitude band (session 17): icon-color cannot
 * tint a non-SDF image, so each band gets its own registered image with
 * the band colour baked in. Map callsign labels are dropped for v0
 * (glyphs decision); callsigns render in the panel and list instead.
 */
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

/** Register every band icon plus the selected variant on the map */
export function registerAircraftIcons(map: maplibregl.Map): void {
  for (const band of ALTITUDE_BANDS) {
    if (!map.hasImage(band.id)) {
      map.addImage(band.id, createAirplaneIcon({ glyph: band.color, fill: [0xff, 0xff, 0xff] }));
    }
  }
  if (!map.hasImage(SELECTED_ICON_ID)) {
    map.addImage(
      SELECTED_ICON_ID,
      createAirplaneIcon({ glyph: [0xff, 0xff, 0xff], fill: [0xd3, 0x1a, 0x1a] }),
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
