// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise band styling: colour-blind-safe warm coral-to-red gradient (spec §3)
// with a CSS pattern fallback per band so the legend is colour-independent
// (AGENTS.md: colour-independent legends).
import type { NoiseBand } from '@vliegvuil/core';

export const NOISE_BANDS: readonly NoiseBand[] = [48, 56, 70] as const;

// Warm coral-to-red gradient, distinct in lightness for colour-blind users
export const NOISE_BAND_COLORS: Record<NoiseBand, string> = {
  48: '#f6c6b8',
  56: '#e8896b',
  70: '#b2182b',
};

// Pattern fallback (CSS repeating-linear-gradient), unique per band
export const NOISE_BAND_PATTERNS: Record<NoiseBand, string> = {
  48: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
  56: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 4px)',
  70: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px), repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px)',
};

export const NOISE_FILL_OPACITY = 0.45;
