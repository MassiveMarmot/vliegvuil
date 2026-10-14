// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airport marker icons (session 23). Baked RGBA images like the aircraft
// icons: maplibre cannot tint non-SDF images, so one image is registered
// per status. Status is carried by shape (marker + glyph), never by colour
// alone (AGENTS.md a11y rule). Shapes: commercial = circle, military-shared
// = diamond, planned = dashed ring; tower-control glyph, dark on white.
// Ids and looks live in ../mapIconSpecs.ts; pixels in ../mapIconData.ts.
import { AIRPORT_ICON_SPECS } from '../mapIconSpecs';
import { registerBakedIcons } from '../mapIconBaked';
import type { IconRegistry } from '../mapIconBaked';

export { AIRPORT_ICON_SPECS };
export type { AirportIconSpec } from '../mapIconSpecs';

/** Icon id for a statusCode (0 commercial, 1 military-shared, 2 planned) */
export function airportIconId(statusCode: number): string {
  const spec = AIRPORT_ICON_SPECS[statusCode];
  return spec !== undefined ? spec.id : 'airport-commercial';
}

/** Register every airport status icon on the map (2x resolution). */
export function registerAirportIcons(map: IconRegistry): void {
  registerBakedIcons(map, AIRPORT_ICON_SPECS.map((s) => s.id));
}
