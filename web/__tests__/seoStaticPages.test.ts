// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 25b build-output tests: the prerendered per-language pages,
// hreflang/canonical/og head tags, robots.txt, sitemap.xml and the
// service-worker precache wiring. Run `pnpm --filter @vliegvuil/web build`
// before this file (same pattern as serviceWorker.test.ts / pwaRoot.test.tsx).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

const distDir = resolve(__dirname, '..', 'dist');
const built = existsSync(resolve(distDir, 'index.html'));

// The supported languages and pages, mirroring web/src/config/site.ts
// (SUPPORTED_LANGUAGES) and web/scripts/gen-static-pages.ts. Adding a
// language to the config requires adding it here; the tests then fail
// until the generator emits its pages.
const LANGUAGES = ['nl', 'en'] as const;
const PAGES = [
  { dir: '' },
  { dir: 'about' },
  { dir: 'attribution' },
] as const;

function pageFile(lang: string, dir: string): string {
  return resolve(distDir, lang, dir, 'index.html');
}

function readPage(lang: string, dir: string): string {
  return readFileSync(pageFile(lang, dir), 'utf8');
}

describe('prerendered per-language pages (session 25b)', () => {
  it('are built (run `pnpm --filter @vliegvuil/web build` before this test)', (): void => {
    expect(existsSync(resolve(distDir, 'index.html')), 'dist not built').toBe(true);
    for (const lang of LANGUAGES) {
      for (const page of PAGES) {
        expect(existsSync(pageFile(lang, page.dir)), `${pageFile(lang, page.dir)} missing`).toBe(true);
      }
    }
  });

  it('has exactly one <title>, one canonical, matching <html lang>, and the og tags', (): void => {
    if (!built) return;
    for (const lang of LANGUAGES) {
      for (const page of PAGES) {
        const html = readPage(lang, page.dir);
        const id = `/${lang}/${page.dir}${page.dir ? '' : ''}`;
        expect((html.match(/<title>/g) ?? []).length, `${id}: title count`).toBe(1);
        const canonical = html.match(/<link rel="canonical" href="([^"]+)" \/>/);
        expect(canonical, `${id}: canonical missing`).not.toBeNull();
        expect(
          canonical?.[1],
          `${id}: canonical must be absolute and self-referential`,
        ).toBe(`https://vliegvuil.nl/${lang}/${page.dir ? `${page.dir}` : ''}`.replace(/\/$/, '') === ''
          ? canonical?.[1]
          : `https://vliegvuil.nl/${lang}${page.dir ? `/${page.dir}` : '/'}`);
        expect(html.match(/<html lang="([^"]*)"/)?.[1], `${id}: html lang`).toBe(lang);
        for (const og of ['og:title', 'og:description', 'og:image', 'og:locale', 'og:site_name', 'og:url']) {
          expect(html, `${id}: ${og} missing`).toContain(`property="${og}"`);
        }
        expect(html).toContain('name="twitter:card"');
        expect(html).toContain('<meta name="description"');
      }
    }
  });

  it('lists hreflang entries for all languages plus x-default (identical set per version)', (): void => {
    if (!built) return;
    for (const page of PAGES) {
      const sets: string[] = [];
      for (const lang of LANGUAGES) {
        const html = readPage(lang, page.dir);
        const hreflangs = (html.match(/<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>/g) ?? []).sort();
        expect(hreflangs.length, `/${lang}/${page.dir}: hreflang count`).toBe(LANGUAGES.length + 1);
        sets.push(hreflangs.join('\n'));
        const path = page.dir === '' ? `/${lang}/` : `/${lang}/${page.dir}`;
        expect(hreflangs).toContain(
          `<link rel="alternate" hreflang="${lang}" href="https://vliegvuil.nl${path}" />`,
        );
        expect(hreflangs).toContain(
          `<link rel="alternate" hreflang="x-default" href="https://vliegvuil.nl/" />`,
        );
      }
      // Google: the set of links is identical for every version of the page.
      expect(new Set(sets).size, 'hreflang sets must be identical across languages').toBe(1);
    }
  });

  it('prerenders real About and Attribution content (no JS needed for crawlers)', (): void => {
    if (!built) return;
    const nlAbout = readPage('nl', 'about');
    expect(nlAbout).toContain('<main id="main"');
    expect(nlAbout).toContain('<h1>');
    // Natural Dutch from the locale file, not a keyword list
    expect(nlAbout).toContain('live vliegtuigbewegingen');
    const enAbout = readPage('en', 'about');
    expect(enAbout).toContain('live measurements');
    const nlAttr = readPage('nl', 'attribution');
    expect(nlAttr).toContain('<h1>');
  });

  it('the app shell (script + root div) is kept so the app takes over on load', (): void => {
    if (!built) return;
    const html = readPage('en', 'about');
    expect(html).toContain('<div id="root">');
    expect(html).toMatch(/<script type="module"[^>]*src="[^"]*"><\/script>/);
  });
});

describe('robots.txt and sitemap.xml', (): void => {
  it('robots.txt allows all, blocks /api/ and points at the sitemap', (): void => {
    if (!built) return;
    const robots = readFileSync(resolve(distDir, 'robots.txt'), 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: https://vliegvuil.nl/sitemap.xml');
  });

  it('sitemap.xml lists every generated URL with xhtml:link alternates', (): void => {
    if (!built) return;
    const sitemap = readFileSync(resolve(distDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    for (const lang of LANGUAGES) {
      for (const page of PAGES) {
        const path = page.dir === '' ? `/${lang}/` : `/${lang}/${page.dir}`;
        expect(sitemap).toContain(`<loc>https://vliegvuil.nl${path}</loc>`);
        for (const l of LANGUAGES) {
          const alt = page.dir === '' ? `/${l}/` : `/${l}/${page.dir}`;
          expect(sitemap).toContain(
            `<xhtml:link rel="alternate" hreflang="${l}" href="https://vliegvuil.nl${alt}" />`,
          );
        }
      }
    }
  });

  it('never lists /api or an http:// URL', (): void => {
    if (!built) return;
    const sitemap = readFileSync(resolve(distDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).not.toMatch(/<loc>[^<]*\/api/);
    // Only the xmlns is http:// (sitemaps.org schema URL); every listed
    // page URL must be https.
    for (const loc of sitemap.match(/<loc>([^<]*)<\/loc>/g) ?? []) {
      expect(loc).toContain('https://');
    }
  });
});

describe('service worker precache (session 25b)', (): void => {
  it('precaches the per-language shells and never /api', (): void => {
    if (!built) return;
    const sw = readFileSync(resolve(distDir, 'sw.js'), 'utf8');
    const manifest = /precacheAndRoute\(([\s\S]*?)\]/.exec(sw)?.[1] ?? '';
    for (const lang of LANGUAGES) {
      for (const page of PAGES) {
        const path = page.dir === '' ? `/${lang}/index.html` : `/${lang}/${page.dir}/index.html`;
        expect(manifest, `${path} not precached`).toContain(`url:"${path}"`);
      }
    }
    expect(manifest).not.toMatch(/\/api\//);
    // robots/sitemap/og-image are static, not app shell: not required in
    // the precache, but they must never be runtime-cached either.
    expect(sw).not.toContain('registerRoute(new RegExp');
  });

  it('navigation fallback stays the language-neutral shell (index.html)', (): void => {
    if (!built) return;
    const sw = readFileSync(resolve(distDir, 'sw.js'), 'utf8');
    const fallback = /createHandlerBoundToURL\("([^"]+)"\)/.exec(sw);
    expect(fallback?.[1]).toBe('index.html');
    for (const seg of ['\\/api\\/', '\\/tiles\\/', '\\/fonts\\/', '\\/data\\/']) {
      expect(sw).toContain(seg);
    }
  });
});

// --- Generator behaviour: third language, other origin (subprocess tests) ---
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const webRoot2 = resolve(__dirname, '..');
// tsx's .bin entry is a shell shim; use the real CLI module.
const tsxCli = resolve(webRoot2, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runGenerator(opts: {
  languages?: string;
  origin?: string;
  outDir: string;
  localesDir?: string;
}): void {
  const env = { ...process.env, VITE_SITE_ORIGIN: opts.origin ?? 'https://vliegvuil.nl' };
  const args = [
    tsxCli,
    resolve(webRoot2, 'scripts', 'gen-static-pages.ts'),
    '--out-dir',
    opts.outDir,
  ];
  if (opts.localesDir) args.push('--locales-dir', opts.localesDir);
  if (opts.languages) args.push('--languages', opts.languages);
  // The generator needs a built shell: use the real dist/index.html via
  // a temp copy of dist (only index.html is required).
  execFileSync(process.execPath, args, { env, cwd: webRoot2 });
}

describe('generator: fake third language and other origins', () => {
  let work: string;
  beforeEach((): void => {
    work = mkdtempSync(join(tmpdir(), 'vliegvuil-seo-'));
    cpSync(resolve(distDir, 'index.html'), join(work, 'index.html'));
  });
  afterEach((): void => {
    rmSync(work, { recursive: true, force: true });
  });

  it('a fake third language generates its pages, hreflang entries and sitemap rows', (): void => {
    if (!built) return;
    // Copy the real locales and add a fake xx locale with the full seo.* set
    const localesDir = join(work, 'locales');
    mkdirSync(localesDir, { recursive: true });
    for (const lang of ['nl', 'en']) {
      cpSync(resolve(webRoot2, '..', 'locales', `${lang}.json`), join(localesDir, `${lang}.json`));
    }
    const nlLocale = JSON.parse(readFileSync(join(localesDir, 'nl.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(localesDir, 'xx.json'), JSON.stringify({ ...nlLocale, seo: nlLocale['seo'] }));
    runGenerator({ languages: 'nl,en,xx', outDir: work, localesDir });
    // Pages for the fake language exist
    for (const dir of ['', 'about', 'attribution']) {
      expect(existsSync(join(work, 'xx', dir, 'index.html'))).toBe(true);
    }
    // hreflang entries list all three languages + x-default
    const html = readFileSync(join(work, 'nl', 'index.html'), 'utf8');
    for (const lang of ['nl', 'en', 'xx', 'x-default']) {
      expect(html).toContain(`hreflang="${lang}"`);
    }
    // Sitemap rows exist for the fake language too
    const sitemap = readFileSync(join(work, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://vliegvuil.nl/xx/</loc>');
    expect(sitemap).toContain('hreflang="xx"');
  });

  it('a different VITE_SITE_ORIGIN changes every canonical, hreflang, og:url and sitemap entry', (): void => {
    if (!built) return;
    runGenerator({ origin: 'https://example.eu', outDir: work });
    const html = readFileSync(join(work, 'nl', 'index.html'), 'utf8');
    expect(html).toContain('<link rel="canonical" href="https://example.eu/nl/" />');
    expect(html).toContain('href="https://example.eu/en/"');
    expect(html).toContain('<meta property="og:url" content="https://example.eu/nl/" />');
    expect(html).toContain('<meta property="og:image" content="https://example.eu/og-image.png" />');
    const robots = readFileSync(join(work, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.eu/sitemap.xml');
    const sitemap = readFileSync(join(work, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://example.eu/nl/</loc>');
    expect(sitemap).not.toContain('vliegvuil.nl');
  });
});
