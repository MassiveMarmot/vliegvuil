// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Single source of truth for every baked map icon: ids, glyphs, colours,
// shapes. Pure data (no DOM, no maplibre) so the build-time generator, the
// runtime registry and the drift test all read the same thing.
import type { IconName } from './icons/paths';
import type { BadgeSpec } from './mapIconDraw';

export interface AltitudeBand {
  id: string;
  minAlt: number;
  /** Glyph colour; every band is >= 3:1 against the white badge (WCAG 1.4.11) */
  color: [number, number, number];
}

export const ALTITUDE_BANDS: AltitudeBand[] = [
  { id: 'airplane-ground', minAlt: Number.NEGATIVE_INFINITY, color: [0x80, 0x80, 0x80] }, // 3.95:1
  { id: 'airplane-low', minAlt: 0, color: [0x00, 0x8a, 0x00] }, // 4.53:1
  { id: 'airplane-mid', minAlt: 5000, color: [0xa6, 0x7c, 0x00] }, // 3.82:1
  { id: 'airplane-high', minAlt: 10000, color: [0xd9, 0x5a, 0x00] }, // 3.88:1
  { id: 'airplane-veryhigh', minAlt: 20000, color: [0xd3, 0x1a, 0x1a] }, // 5.34:1
];

export const SELECTED_ICON_ID = 'airplane-selected';

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

const WHITE: [number, number, number] = [0xff, 0xff, 0xff];
const DARK: [number, number, number] = [0x3b, 0x35, 0x2f];

export interface BakedIconSpec {
  id: string;
  icon: IconName;
  badge: BadgeSpec;
}

/** Aircraft planes are solid; airport towers stay outline (open sub-paths). */
export const BAKED_ICON_SPECS: readonly BakedIconSpec[] = [
  ...ALTITUDE_BANDS.map((b): BakedIconSpec => ({
    id: b.id,
    icon: 'plane',
    badge: { glyph: b.color, fill: WHITE, shape: 'circle', solid: true },
  })),
  {
    id: SELECTED_ICON_ID,
    icon: 'plane',
    badge: { glyph: WHITE, fill: [0xd3, 0x1a, 0x1a], shape: 'circle', solid: true },
  },
  ...AIRPORT_ICON_SPECS.map((s): BakedIconSpec => ({
    id: s.id,
    icon: 'tower-control',
    badge: { glyph: DARK, fill: WHITE, shape: s.shape },
  })),
];
