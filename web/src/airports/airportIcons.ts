// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airport marker icons (session 23). Pre-rendered RGBA images like the
// aircraft icons: maplibre cannot tint non-SDF images, so one image is
// registered per status. Status is carried by shape (marker + glyph),
// never by colour alone (AGENTS.md a11y rule).
//
// Shapes: commercial = filled circle with plane glyph; military-shared =
// filled square (rotated diamond) with plane glyph; planned = circle with
// dashed-look ring and plane glyph in outline. All dark on white.

export interface AirportIconSpec {
  id: string;
  shape: 'circle' | 'diamond' | 'ring';
  fill: [number, number, number];
}

/** Icon ids per airport status (statusCode from airports.ts) */
export const AIRPORT_ICON_SPECS: readonly AirportIconSpec[] = [
  { id: 'airport-commercial', shape: 'circle', fill: [0x3b, 0x35, 0x2f] },
  { id: 'airport-military', shape: 'diamond', fill: [0x3b, 0x35, 0x2f] },
  { id: 'airport-planned', shape: 'ring', fill: [0xff, 0xff, 0xff] },
];

/** Icon id for a statusCode (0 commercial, 1 military-shared, 2 planned) */
export function airportIconId(statusCode: number): string {
  const spec = AIRPORT_ICON_SPECS[statusCode];
  return spec !== undefined ? spec.id : 'airport-commercial';
}

// Canvas-rendered Lucide tower-control on a status badge (session 23
// follow-up): shape carries status (circle commercial, diamond
// military-shared, dashed ring planned), never colour alone. The glyph
// strokes dark on white (or white on dark for planned's outline look).
import { renderBadgeIcon } from '../mapIconCanvas';

const DARK: [number, number, number] = [0x3b, 0x35, 0x2f];
const WHITE: [number, number, number] = [0xff, 0xff, 0xff];

/** Register every airport status icon on the map (2x resolution). */
export function registerAirportIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: { width: number; height: number; data: Uint8Array }, options?: { pixelRatio: number }) => void;
}): void {
  for (const spec of AIRPORT_ICON_SPECS) {
    if (!map.hasImage(spec.id)) {
      map.addImage(
        spec.id,
        renderBadgeIcon('tower-control', {
          shape: spec.shape,
          fill: spec.shape === 'ring' ? WHITE : WHITE,
          glyph: DARK,
        }),
        { pixelRatio: 2 },
      );
    }
  }
}
