// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 24: the service worker is an offline app shell only. Live API
// traffic (/api) and third-party tile traffic (PDOK) must never be
// precached, runtime-cached, or intercepted by the navigation fallback.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(__dirname, '..', 'dist');
const swPath = resolve(distDir, 'sw.js');

function readSw(): string {
  return readFileSync(swPath, 'utf8');
}

describe('service worker precache manifest (app shell only)', () => {
  it('is built (run `pnpm --filter @vliegvuil/web build` before this test)', () => {
    expect(existsSync(swPath), `${swPath} not found`).toBe(true);
  });

  it('contains no /api entry in the precache manifest', () => {
    if (!existsSync(swPath)) return; // covered by the guard above
    const sw = readSw();
    const manifest = /precacheAndRoute\(\[([\s\S]*?)\]/.exec(sw);
    expect(manifest, 'no precacheAndRoute manifest found in sw.js').not.toBeNull();
    if (manifest) {
      expect(manifest[1]).not.toMatch(/\/api\//);
      expect(manifest[1]).not.toMatch(/service\.pdok\.nl/);
    }
  });

  it('never references the PDOK tile host or a runtime cache route', () => {
    if (!existsSync(swPath)) return;
    const sw = readSw();
    expect(sw).not.toContain('service.pdok.nl');
    // The only permitted registerRoute is the navigation fallback.
    const routes = sw.match(/registerRoute\(([^)]*)\)/g) ?? [];
    for (const route of routes) {
      expect(route).toContain('NavigationRoute');
    }
  });

  it('navigation fallback serves the app shell and denies /api', () => {
    if (!existsSync(swPath)) return;
    const sw = readSw();
    // generateSW compiles navigateFallbackDenylist into a denylist regex
    // on the NavigationRoute; the literal /^\/api\// must appear.
    expect(sw).toContain('denylist:[/^\\/api\\//]');
    const fallback = /createHandlerBoundToURL\("([^"]+)"\)/.exec(sw);
    expect(fallback, 'no navigation fallback handler found').not.toBeNull();
    if (fallback) {
      expect(fallback[1]).toBe('index.html');
    }
  });
});
