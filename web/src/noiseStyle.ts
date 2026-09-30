// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';

// Noise band styling: colour-blind-safe warm coral-to-red gradient (spec §3)
// with a CSS pattern fallback per band so the legend is colour-independent
// (AGENTS.md: colour-independent legends).
//
// Bands are per-airport lower bounds (spec §10: the EU END 2021 Schiphol set
// uses 5 dB bands 55–75; decree contours use 48/56/70), so colours and
// patterns are derived from the band lower bound rather than a fixed set.

/** All known band lower bounds (END 2021: 55/60/65/70/75; decree: 48/56/70) */
export const KNOWN_BAND_LOWER_DB: readonly number[] = [48, 55, 56, 60, 65, 70, 75];

/**
 * Colour for a band lower bound: warm coral-to-red gradient interpolated
 * between 48 dB (lightest) and 75 dB (darkest), distinct in lightness so
 * the ramp stays readable for colour-blind users.
 */
export function noiseBandColor(bandLowerDb: number): string {
  const min = 48;
  const max = 75;
  const t = Math.min(1, Math.max(0, (bandLowerDb - min) / (max - min)));
  // Interpolate between light coral (#f6c6b8) and deep red (#b2182b)
  const from: readonly [number, number, number] = [0xf6, 0xc6, 0xb8];
  const to: readonly [number, number, number] = [0xb2, 0x18, 0x2b];
  const mix = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * t);
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hex(mix(0))}${hex(mix(1))}${hex(mix(2))}`;
}

/**
 * CSS pattern fallback (repeating-linear-gradient), unique per band lower
 * bound so swatches are distinguishable without colour.
 */
export function noiseBandPattern(bandLowerDb: number): string {
  const t = Math.min(1, Math.max(0, (bandLowerDb - 48) / (75 - 48)));
  const alpha = (0.15 + 0.2 * t).toFixed(2);
  const angle = bandLowerDb % 2 === 0 ? '45deg' : '0deg';
  return `repeating-linear-gradient(${angle}, transparent, transparent 3px, rgba(0,0,0,${alpha}) 3px, rgba(0,0,0,${alpha}) 4px)`;
}

/** Legacy fixed-set exports kept for the map fill ramp */
export const NOISE_BAND_COLORS: Record<number, string> = {
  48: noiseBandColor(48),
  56: noiseBandColor(56),
  70: noiseBandColor(70),
};

export const NOISE_BAND_PATTERNS: Record<number, string> = {
  48: noiseBandPattern(48),
  56: noiseBandPattern(56),
  70: noiseBandPattern(70),
};

export const NOISE_FILL_OPACITY = 0.45;

/**
 * MapLibre fill colour expression for contour features carrying a numeric
 * `bandLowerDb` property: interpolate the coral-to-red ramp by band.
 */

export function noiseFillExpression(): DataDrivenPropertyValueSpecification<string> {
  return [
    'interpolate',
    ['linear'],
    ['get', 'bandLowerDb'],
    48, noiseBandColor(48),
    75, noiseBandColor(75),
  ] as DataDrivenPropertyValueSpecification<string>;
}
