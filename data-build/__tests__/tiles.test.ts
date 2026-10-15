// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Tests for the self-hosted BRT-A tile downloader (scripts/vps-tiles-update.js):
// tile math for the app's own bbox, tile validation, and that the tile URL
// layout matches the web app's raster source. Imports the script as a module
// (main() only runs when executed directly).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'vps-tiles-update.js');

async function loadScript(): Promise<{
  tilesForZoom: (z: number) => Array<{ z: number; x: number; y: number }>;
  allTiles: (min: number, max: number) => Array<{ z: number; x: number; y: number }>;
  validTile: (b: Buffer) => boolean;
  swapAllowed: (o: {
    minZoom: number;
    maxZoom: number;
    outDir: string;
    failedCount: number;
  }) => { allowed: boolean; reason: string };
}> {
  return (await import(`file://${SCRIPT}`)) as never;
}

const STAGING = '/srv/vliegvuil/tiles.new';
const COMPLETE = { minZoom: 6, maxZoom: 14, outDir: STAGING, failedCount: 0 };

describe('BRT-A tile downloader', () => {
  it('covers the app bbox with the expected tile counts per zoom', async (): Promise<void> => {
    const m = await loadScript();
    expect(m.tilesForZoom(6)).toHaveLength(4);
    expect(m.tilesForZoom(8)).toHaveLength(25);
    // total z6..z14
    const all = m.allTiles(6, 14);
    expect(all.length).toBeGreaterThan(70000);
    // ordered low zoom first
    expect(all[0]?.z).toBe(6);
    expect(all[all.length - 1]?.z).toBe(14);
  });

  it('tile coordinates stay inside the bbox (spot check z8)', async (): Promise<void> => {
    const m = await loadScript();
    for (const t of m.tilesForZoom(8)) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** 8);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(2 ** 8);
    }
  });

  it('validates PNG magic, size cap and rejects error pages', async (): Promise<void> => {
    const m = await loadScript();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(m.validTile(png)).toBe(true);
    // HTML error page (a 200 with an error body must never be stored)
    expect(m.validTile(Buffer.from('<html>error</html>'))).toBe(false);
    // JSON error body
    expect(m.validTile(Buffer.from('{"error":404}'))).toBe(false);
    // empty
    expect(m.validTile(Buffer.alloc(0))).toBe(false);
    // oversized
    expect(m.validTile(Buffer.concat([png, Buffer.alloc(600 * 1024)]))).toBe(false);
  });

  it('the web app raster URL matches the layout the script downloads', (): void => {
    const types = readFileSync(resolve(__dirname, '..', '..', 'web', 'src', 'types', 'index.ts'), 'utf8');
    expect(types).toContain("'/tiles/{z}/{x}/{y}.png'");
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).toContain('wmts/v2_0/standaard/EPSG:3857');
    expect(script).toContain("'User-Agent': USER_AGENT");
    // the app bbox is the source of the tile bounds
    expect(script).toContain('minLon: 2.5, minLat: 50.5, maxLon: 7.5, maxLat: 54.0');
  });

  it('swapAllowed: a complete default-range run with no failures may swap', async (): Promise<void> => {
    const m = await loadScript();
    expect(m.swapAllowed(COMPLETE)).toEqual({ allowed: true, reason: 'complete set' });
  });

  it('swapAllowed: a custom zoom range must not swap', async (): Promise<void> => {
    const m = await loadScript();
    const minOnly = m.swapAllowed({ ...COMPLETE, minZoom: 8 });
    expect(minOnly.allowed).toBe(false);
    expect(minOnly.reason).toContain('--min-zoom 8');
    const maxOnly = m.swapAllowed({ ...COMPLETE, maxZoom: 12 });
    expect(maxOnly.allowed).toBe(false);
    expect(maxOnly.reason).toContain('--max-zoom 12');
  });

  it('swapAllowed: a custom --out dir must not swap into the live root', async (): Promise<void> => {
    const m = await loadScript();
    const r = m.swapAllowed({ ...COMPLETE, outDir: '/tmp/partial-tiles' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('--out /tmp/partial-tiles');
  });

  it('swapAllowed: any non-404 failure must not swap', async (): Promise<void> => {
    const m = await loadScript();
    const r = m.swapAllowed({ ...COMPLETE, failedCount: 3 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('3 failed tiles');
  });

  it('state and log paths are written OUTSIDE the tile directory', async (): Promise<void> => {
    // .state.json / .download.log inside OUT_DIR would be published under
    // /tiles/ after the swap; they must live in the parent directory.
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).toContain("const STATE_PATH = join(dirname(OUT_DIR), `${basename(OUT_DIR)}.state.json`)");
    expect(script).toContain("const LOG_PATH = join(dirname(OUT_DIR), `${basename(OUT_DIR)}.download.log`)");
  });

  it('Caddy restricts /api to GET/HEAD and the lat/lon/dist shape', (): void => {
    const caddy = readFileSync(resolve(__dirname, '..', '..', 'Caddyfile'), 'utf8');
    // The proxy handle is keyed on BOTH the method and the path shape;
    // everything else under /api answers 405 (right shape, wrong method)
    // or 404 (wrong shape).
    expect(caddy).toMatch(/@api_shaped \{[\s\S]*?method GET HEAD[\s\S]*?\}/);
    expect(caddy).toMatch(/path_regexp \^\/api\/lat\/-\?\[0-9\]/);
    // the 405 carries Allow: GET, HEAD
    expect(caddy).toContain('respond @api_shape_any_method 405');
    expect(caddy).toContain('Allow "GET, HEAD"');
    // the catch-all 404 for everything else under /api
    expect(caddy).toMatch(/handle \/api\/\* \{[\s\S]*?respond 404/);
  });

  it('Caddy serves /tiles with a long cache and no directory listing', (): void => {
    const caddy = readFileSync(resolve(__dirname, '..', '..', 'Caddyfile'), 'utf8');
    // handle_path (not handle) strips /tiles/ before file_server maps the
    // path onto the root; a plain handle would double the prefix and 404.
    expect(caddy).toContain('handle_path /tiles/*');
    expect(caddy).toContain('Cache-Control "public, max-age=604800"');
    // file_server without browse = no directory listing (assert no browse directive)
    const tilesBlock = caddy.slice(caddy.indexOf('handle_path /tiles/*'), caddy.indexOf('handle /fonts/*'));
    expect(tilesBlock).not.toContain('browse');
  });
});
