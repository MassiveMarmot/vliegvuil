// Tests for the baked map icons: pixels exist for every spec, decode to the
// right size, are not blank, and are not stale against specs + drawing code.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_ICON_PX, MAP_ICON_RGBA, MAP_ICON_SPEC_KEY } from '../src/mapIconData';
import { bakedIcon, registerBakedIcons } from '../src/mapIconBaked';
import { ALTITUDE_BANDS, BAKED_ICON_SPECS } from '../src/mapIconSpecs';

/** WCAG relative luminance of an sRGB triple (0-255). */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('baked map icons', () => {
  it('has pixels for every spec and nothing else', () => {
    expect(Object.keys(MAP_ICON_RGBA).sort()).toEqual(BAKED_ICON_SPECS.map((s) => s.id).sort());
  });

  it('decodes each icon to a square RGBA buffer that is not blank', () => {
    for (const spec of BAKED_ICON_SPECS) {
      const img = bakedIcon(spec.id);
      expect(img.width).toBe(MAP_ICON_PX);
      expect(img.height).toBe(MAP_ICON_PX);
      expect(img.data).toHaveLength(MAP_ICON_PX * MAP_ICON_PX * 4);
      // corner is transparent (outside the badge), centre area has ink
      expect(img.data[3]).toBe(0);
      expect(img.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
  });

  it('throws a pointed error for an id that was never generated', () => {
    expect(() => bakedIcon('nope')).toThrow(/gen:icons/);
  });

  it('registers at pixelRatio 2 and skips ids already present', () => {
    const added: Array<[string, number | undefined]> = [];
    const map = {
      hasImage: (id: string): boolean => added.some(([a]) => a === id),
      addImage: (id: string, _img: unknown, o?: { pixelRatio: number }): void => {
        added.push([id, o?.pixelRatio]);
      },
    };
    registerBakedIcons(map, ['airplane-low']);
    registerBakedIcons(map, ['airplane-low']);
    expect(added).toEqual([['airplane-low', 2]]);
  });

  // Drift guard: change a colour/shape or the drawing code without running
  // `pnpm --filter @vliegvuil/web gen:icons` and this fails.
  it('is not stale against the specs and drawing code', () => {
    const draw = readFileSync(resolve(__dirname, '../src/mapIconDraw.ts'), 'utf8');
    const key = createHash('sha256').update(JSON.stringify(BAKED_ICON_SPECS)).update(draw).digest('hex');
    expect(MAP_ICON_SPEC_KEY).toBe(key);
  });

  // WCAG 2.x 1.4.11: the glyph must be >= 3:1 against the white badge
  it('keeps every altitude-band glyph at >= 3:1 against the white badge', () => {
    const white = luminance([255, 255, 255]);
    for (const band of ALTITUDE_BANDS) {
      const ratio = (white + 0.05) / (luminance(band.color) + 0.05);
      expect(ratio, band.id).toBeGreaterThanOrEqual(3);
    }
  });

  // The plane silhouette must sit centred on the badge along its nose axis:
  // equal ring-to-nose and ring-to-tail gaps (nose used to touch the ring).
  it('centres the plane glyph along its nose axis', () => {
    const img = bakedIcon('airplane-low'); // green glyph on white, dark ring
    const c = img.width / 2;
    let nose = -Infinity;
    let tail = Infinity;
    for (let i = 0; i < img.width * img.height; i++) {
      const r = img.data[i * 4] ?? 0;
      const g = img.data[i * 4 + 1] ?? 0;
      const a = img.data[i * 4 + 3] ?? 0;
      if (a < 200 || g < r + 60) continue; // glyph pixels only (green)
      const x = (i % img.width) + 0.5 - c;
      const y = Math.floor(i / img.width) + 0.5 - c;
      const proj = (x - y) / Math.SQRT2; // along the north-east nose axis
      nose = Math.max(nose, proj);
      tail = Math.min(tail, proj);
    }
    expect(Math.abs(nose + tail)).toBeLessThanOrEqual(1.5); // px at 2x
  });
});
