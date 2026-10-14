// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Pure helpers for the canvas-based Lucide map icons. No maplibre import
// here (per the repo rule for pure helpers); no canvas use either — the
// drawing lives in mapIconCanvas.ts so the maths stays testable in jsdom.

/**
 * The Lucide plane icon's nose points north-east (45 degrees clockwise
 * from north). MapLibre's icon-rotate is degrees clockwise from north,
 * so an aircraft with ADS-B heading h must rotate the icon by
 * (h - 45) to point the nose along the flight direction.
 */
export function planeRotationForHeading(heading: number): number {
  const normalized = heading - 45;
  // Wrap into [0, 360)
  return ((normalized % 360) + 360) % 360;
}
