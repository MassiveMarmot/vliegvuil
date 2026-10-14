// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Drawing code for the map badge icons (Lucide glyph on a badge). It runs
// ONLY in the build-time generator (web/scripts/gen-map-icons.ts, Node +
// @napi-rs/canvas), never in the browser: privacy browsers (Mullvad, Tor,
// Firefox resistFingerprinting) noise canvas readback, which broke the
// icons when they were drawn at runtime. The browser loads the baked RGBA
// from mapIconData.ts instead (see mapIconBaked.ts). MapLibre cannot tint
// non-SDF images, so each variant has its colour baked in at 2x.
import { ICONS } from './icons/paths';
import type { IconName } from './icons/paths';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface BadgeSpec {
  /** Badge fill (behind the glyph); the ring is always dark */
  fill: [number, number, number];
  /** Glyph colour (stroke, and fill when solid) */
  glyph: [number, number, number];
  /** Badge shape: status carried by shape, never colour alone */
  shape: 'circle' | 'diamond' | 'ring';
  /** Fill the glyph's closed paths (plane silhouette) as well as stroking */
  solid?: boolean;
}

/** Minimal 2D-context surface used here (browser and @napi-rs/canvas both fit). */
export interface Ctx2D {
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  setLineDash(segments: number[]): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(path?: Path2D): void;
  stroke(path?: Path2D): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
}

const DARK: [number, number, number] = [0x3b, 0x35, 0x2f];

/**
 * Per-icon shift in 24x24 glyph units so the silhouette sits visually
 * centred on the badge. The Lucide plane's bounding box is centred, but the
 * silhouette is lopsided along its nose axis (nose reaches +13.7, tail only
 * -10.2 from the centre, measured with stroke), so the nose touched the ring
 * while the tail floated. Shifting 1.77 units toward the tail along the
 * north-east axis (dx -1.25, dy +1.25) leaves an equal ~1.75-unit gap at both
 * ends. Re-measure if the glyph, stroke width or scale changes.
 */
const GLYPH_NUDGE: Partial<Record<IconName, [number, number]>> = {
  plane: [-1.25, 1.25],
};

/** Draw a Lucide icon on a badge into a (size*2)-px square context. */
export function drawBadgeIcon(ctx: Ctx2D, name: IconName, spec: BadgeSpec, size = 24): void {
  const res = 2; // 2x resolution, registered with pixelRatio: 2
  const px = size * res;
  const css = (c: [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;
  const center = px / 2;
  const radius = px / 2 - res;

  // Badge (shape carries status; never colour alone)
  ctx.lineWidth = 1.5 * res;
  ctx.fillStyle = css(spec.fill);
  ctx.strokeStyle = css(DARK);
  if (spec.shape === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center + radius, center);
    ctx.lineTo(center, center + radius);
    ctx.lineTo(center - radius, center);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    if (spec.shape === 'ring') ctx.setLineDash([3 * res, 2 * res]);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Glyph: the 24x24 icon scaled to ~70% of the badge
  const glyphScale = (radius / 12) * 0.85;
  const nudge = GLYPH_NUDGE[name] ?? [0, 0];
  const glyphOffsetX = center - 12 * glyphScale + nudge[0] * glyphScale;
  const glyphOffsetY = center - 12 * glyphScale + nudge[1] * glyphScale;
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(spec.glyph);
  ctx.fillStyle = css(spec.glyph);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const g of ICONS[name]) {
    if (g.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(g.cx * glyphScale + glyphOffsetX, g.cy * glyphScale + glyphOffsetY, g.r * glyphScale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(glyphOffsetX, glyphOffsetY);
      ctx.scale(glyphScale, glyphScale);
      const path = new Path2D(g.d);
      // Solid: fill the closed silhouette, keep the stroke for round joins
      if (spec.solid === true) ctx.fill(path);
      ctx.stroke(path);
      ctx.restore();
    }
  }
}
