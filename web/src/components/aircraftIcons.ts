// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Pure aircraft-icon helpers (no maplibre import so tests stay light).
// MapLibre's icon-color cannot tint a non-SDF image, so one icon is baked
// per altitude band with the colour in it. The plane glyph's nose points
// north-east, so the map layer rotates it by heading - 45 (see
// planeRotationForHeading and its test). Bands and colours live in
// ../mapIconSpecs.ts; pixels in ../mapIconData.ts (pnpm gen:icons).
import { ALTITUDE_BANDS, SELECTED_ICON_ID } from '../mapIconSpecs';
import { registerBakedIcons } from '../mapIconBaked';
import type { AltitudeBand } from '../mapIconSpecs';
import type { IconRegistry } from '../mapIconBaked';

export { ALTITUDE_BANDS, SELECTED_ICON_ID };
export type { AltitudeBand };

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
export function registerAircraftIcons(map: IconRegistry): void {
  registerBakedIcons(map, [...ALTITUDE_BANDS.map((b) => b.id), SELECTED_ICON_ID]);
}

// Colour based on altitude (used by legends/tests)
export function getAircraftColor(alt: number | null): string {
  if (alt === null) return '#808080';
  if (alt < 5000) return '#008a00';
  if (alt < 10000) return '#a67c00';
  if (alt < 20000) return '#d95a00';
  return '#d31a1a';
}
