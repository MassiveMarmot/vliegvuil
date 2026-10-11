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

interface RGBA {
  width: number;
  height: number;
  data: Uint8Array;
}

const DARK: [number, number, number] = [0x3b, 0x35, 0x2f];
const WHITE: [number, number, number] = [0xff, 0xff, 0xff];

/**
 * Render a 24x24 airport marker. Same visual language as the aircraft
 * icons (white fill, thin dark border) so the layer reads as one family;
 * the shape differs per status so colour is never the only signal.
 */
export function createAirportIcon(spec: AirportIconSpec): RGBA {
  const size = 24;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  const planeDist = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diamondDist = Math.abs(dx) + Math.abs(dy);
      let fill: [number, number, number] | null = null;
      let border = false;
      if (spec.shape === 'circle') {
        if (dist <= radius && dist > radius - 1.5) border = true;
        else if (dist <= radius - 1.5) fill = spec.fill;
      } else if (spec.shape === 'diamond') {
        if (diamondDist <= radius && diamondDist > radius - 1.5) border = true;
        else if (diamondDist <= radius - 1.5) fill = spec.fill;
      } else {
        // ring: white fill with a dotted border (planned = outline look)
        if (dist <= radius) fill = WHITE;
        if (dist <= radius && dist > radius - 1.5 && ((x + y) % 2 === 0)) border = true;
      }
      // Plane glyph on top of the fill
      const onBody = Math.abs(dx) <= 1.2 && dy >= -planeDist && dy <= planeDist;
      const onWing =
        Math.abs(Math.abs(dx) - (planeDist - Math.abs(dy) * 0.6)) < 1.2 &&
        Math.abs(dy) < planeDist * 0.7;
      const onPlane = onBody || onWing;
      let r = 0, g = 0, b = 0, a = 0;
      if (onPlane && dist <= radius - 1.5) {
        // planned marker: outline plane (dark glyph on white reads fine)
        [r, g, b] = DARK;
        a = 0xff;
      } else if (border) {
        [r, g, b] = DARK;
        a = 0xff;
      } else if (fill !== null) {
        [r, g, b] = fill;
        a = 0xff;
      }
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { width: size, height: size, data };
}

/** Register all airport icons on a map instance (idempotent per icon) */
export function registerAirportIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: RGBA) => void;
}): void {
  for (const spec of AIRPORT_ICON_SPECS) {
    if (!map.hasImage(spec.id)) {
      map.addImage(spec.id, createAirportIcon(spec));
    }
  }
}
