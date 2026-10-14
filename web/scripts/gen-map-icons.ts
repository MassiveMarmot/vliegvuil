// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Build-time generator: draws every map icon with @napi-rs/canvas (Node, so
// no browser fingerprinting protection in the way) and writes the raw RGBA
// as base64 to src/mapIconData.ts. Run: pnpm --filter @vliegvuil/web gen:icons
// Add --preview <dir> to also write PNGs for eyeballing.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Path2D, createCanvas } from '@napi-rs/canvas';
import { drawBadgeIcon } from '../src/mapIconDraw';
import type { Ctx2D } from '../src/mapIconDraw';
import { BAKED_ICON_SPECS } from '../src/mapIconSpecs';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');
const SIZE = 24;
const PX = SIZE * 2;

// drawBadgeIcon builds Path2D objects; Node has none, so hand it the canvas one
(globalThis as unknown as { Path2D: unknown }).Path2D = Path2D;

/** Hash of everything that affects the pixels (specs + drawing code). */
export function specKey(): string {
  const draw = readFileSync(resolve(src, 'mapIconDraw.ts'), 'utf8');
  return createHash('sha256').update(JSON.stringify(BAKED_ICON_SPECS)).update(draw).digest('hex');
}

const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx > -1 ? process.argv[previewIdx + 1] : undefined;
if (previewDir !== undefined) mkdirSync(previewDir, { recursive: true });

const entries: string[] = [];
for (const spec of BAKED_ICON_SPECS) {
  const canvas = createCanvas(PX, PX);
  const ctx = canvas.getContext('2d');
  drawBadgeIcon(ctx as unknown as Ctx2D, spec.icon, spec.badge, SIZE);
  const rgba = ctx.getImageData(0, 0, PX, PX).data;
  entries.push(`  '${spec.id}': '${Buffer.from(rgba).toString('base64')}',`);
  if (previewDir !== undefined) writeFileSync(resolve(previewDir, `${spec.id}.png`), canvas.toBuffer('image/png'));
}

const out = `// GENERATED FILE - do not edit. Run: pnpm --filter @vliegvuil/web gen:icons
// Source: src/mapIconSpecs.ts + src/mapIconDraw.ts (hash below; a test fails if stale).
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Pixel size of every baked icon (registered with pixelRatio: 2). */
export const MAP_ICON_PX = ${PX};

/** sha256 of the specs and drawing code these pixels were generated from. */
export const MAP_ICON_SPEC_KEY = '${specKey()}';

/** Raw non-premultiplied RGBA, base64, MAP_ICON_PX x MAP_ICON_PX per icon. */
export const MAP_ICON_RGBA: Record<string, string> = {
${entries.join('\n')}
};
`;
writeFileSync(resolve(src, 'mapIconData.ts'), out);
console.log(`wrote ${BAKED_ICON_SPECS.length} icons, ${(out.length / 1024).toFixed(0)} KB`);
