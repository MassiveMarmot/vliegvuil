// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Invisible-compass fix: maplibre-gl's own stylesheet must be part of the
// built bundle. Without it the NavigationControl renders an empty,
// size-less button (no .maplibregl-ctrl-icon background, no 29x29 size,
// no corner positioning) — the compass was invisible. This pins the
// bundler output: the CSS asset exists in dist/, carries the compass
// icon rule, and index.html references it (own-origin, CSP style-src
// 'self' compatible).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const distDir = resolve(__dirname, '..', 'dist');
const assetsDir = join(distDir, 'assets');
const indexPath = join(distDir, 'index.html');

function cssFiles(): string[] {
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir).filter((f): boolean => f.endsWith('.css'));
}

function readAllCss(): string {
  return cssFiles()
    .map((f): string => readFileSync(join(assetsDir, f), 'utf8'))
    .join('\n');
}

describe('maplibre-gl stylesheet ships in the bundle', () => {
  it('is built (run `pnpm --filter @vliegvuil/web build` before this test)', () => {
    expect(existsSync(indexPath), `${indexPath} not found`).toBe(true);
  });

  it('a CSS asset exists in dist/assets', () => {
    if (!existsSync(indexPath)) return; // covered by the guard above
    expect(cssFiles().length).toBeGreaterThan(0);
  });

  it('contains the compass icon rule (the data-URI background)', () => {
    if (!existsSync(indexPath)) return;
    const css = readAllCss();
    // The exact selector maplibre-gl.css uses for the compass icon. The
    // minified CSS drops the quotes around the data URI, so allow both.
    expect(css).toMatch(/maplibregl-ctrl-compass\s+\.maplibregl-ctrl-icon/);
    // The icon is a data: URI SVG background (allowed: img-src data:)
    expect(css).toMatch(
      /maplibregl-ctrl-compass\s+\.maplibregl-ctrl-icon\{[^}]*background-image:url\(("data:image\/svg\+xml|data:image\/svg\+xml)/
    );
  });

  it('contains the 29x29 control button sizing and the corner positioning', () => {
    if (!existsSync(indexPath)) return;
    const css = readAllCss();
    expect(css).toMatch(/maplibregl-ctrl-group button\{[^}]*width:29px[^}]*height:29px/);
    expect(css).toMatch(/maplibregl-ctrl-top-right\{top:0;right:0\}/);
  });

  it('index.html links the CSS from our own origin (relative URL)', () => {
    if (!existsSync(indexPath)) return;
    const html = readFileSync(indexPath, 'utf8');
    const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m): string => m[0]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = /href="([^"]+)"/.exec(link)?.[1] ?? '';
      expect(href.startsWith('./') || href.startsWith('/'), `non-relative stylesheet href: ${href}`).toBe(true);
    }
  });
});
