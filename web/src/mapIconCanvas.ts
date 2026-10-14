// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Canvas rendering of the Lucide icons as registered MapLibre images.
// MapLibre cannot tint non-SDF images, so each variant gets its colour
// baked in at 2x resolution (registered with pixelRatio: 2). Runs only
// in the browser (jsdom has no canvas); the maths is in the pure module.
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
  /** Glyph stroke colour */
  glyph: [number, number, number];
  /** Badge shape: status carried by shape, never colour alone */
  shape: 'circle' | 'diamond' | 'ring';
}

const DARK: [number, number, number] = [0x3b, 0x35, 0x2f];

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  if (canvas.getContext === undefined) {
    throw new Error('canvas unavailable');
  }
  return canvas;
}

/**
 * Render a Lucide icon as a 24x24 (at 2x: 48x48) RGBA image on a badge.
 * circle/diamond/ring = the badge; the glyph strokes on top.
 */
export function renderBadgeIcon(name: IconName, spec: BadgeSpec, size = 24): RgbaImage {
  const res = 2; // 2x resolution, registered with pixelRatio: 2
  const px = size * res;
  const canvas = requireCanvas();
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const css = (c: [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;
  const center = px / 2;
  const radius = px / 2 - res;

  // Badge (shape carries status; never colour alone)
  ctx.lineWidth = 1.5 * res;
  if (spec.shape === 'ring') {
    ctx.strokeStyle = css(DARK);
    ctx.fillStyle = css(spec.fill);
    ctx.setLineDash([3 * res, 2 * res]);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (spec.shape === 'diamond') {
    ctx.fillStyle = css(spec.fill);
    ctx.strokeStyle = css(DARK);
    ctx.beginPath();
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center + radius, center);
    ctx.lineTo(center, center + radius);
    ctx.lineTo(center - radius, center);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = css(spec.fill);
    ctx.strokeStyle = css(DARK);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Glyph: the 24x24 icon scaled to ~70% of the badge, stroked
  const glyphScale = (radius / 12) * 0.85;
  const glyphOffset = center - 12 * glyphScale;
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(spec.glyph);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const g of ICONS[name]) {
    if (g.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(g.cx * glyphScale + glyphOffset, g.cy * glyphScale + glyphOffset, g.r * glyphScale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(glyphOffset, glyphOffset);
      ctx.scale(glyphScale, glyphScale);
      ctx.beginPath();
      ctx.stroke(new Path2D(g.d));
      ctx.restore();
    }
  }

  const imageData = ctx.getImageData(0, 0, px, px);
  return { width: px, height: px, data: new Uint8Array(imageData.data) };
}
