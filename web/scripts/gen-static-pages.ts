// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 25b: post-build static page generator. Writes prerendered,
// crawlable per-language pages (map, about, attribution) from the built
// app shell, plus robots.txt and sitemap.xml. No new dependency: runs on
// tsx (already a devDependency) and reads locales/*.json directly.
//
// Usage: after `vite build`, from web/:
//   VITE_SITE_ORIGIN=https://vliegvuil.nl tsx scripts/gen-static-pages.ts
// The origin and site name come from the environment (same variables the
// app itself reads in src/config/site.ts), never hard-coded here.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
// Test seam: --out-dir and --locales-dir let tests generate into a temp
// directory with a fake third language, without touching dist/.
const argAfter = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};
const dist = resolve(argAfter('--out-dir') ?? join(webRoot, 'dist'));
const localesRoot = resolve(argAfter('--locales-dir') ?? join(webRoot, '..', 'locales'));

// --- Config from the environment (same contract as src/config/site.ts) ---
const SITE_NAME = process.env['VITE_SITE_NAME'] ?? 'VliegVuil.nl';
const SITE_ORIGIN = (process.env['VITE_SITE_ORIGIN'] ?? 'https://vliegvuil.nl').replace(/\/+$/, '');

// Languages and pages mirror src/config/site.ts (SUPPORTED_LANGUAGES) and
// src/hooks/useRouter.ts (routes). Kept in sync by the build test.
// Test seam: --languages nl,en,xx generates for a fake third language.
const LANGUAGES = (argAfter('--languages')?.split(',') ?? ['nl', 'en']) as string[];
const DEFAULT_LANGUAGE = 'nl';
const OG_LOCALES: Record<string, string> = { nl: 'nl_NL', en: 'en_GB', xx: 'xx_XX' };
type PageId = 'map' | 'about' | 'attribution';
const PAGES: Array<{ id: PageId; dir: string; seoKey: string }> = [
  { id: 'map', dir: '', seoKey: 'map' },
  { id: 'about', dir: 'about', seoKey: 'about' },
  { id: 'attribution', dir: 'attribution', seoKey: 'attribution' },
];

type SeoStrings = { title: string; description: string; ogTitle: string; ogDescription: string };
type LocaleFile = { seo: Record<PageId, SeoStrings>; about?: Record<string, string>; attribution?: Record<string, string> };

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found — run `vite build` first');
  process.exit(1);
}

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const locales: Record<string, LocaleFile> = {};
for (const lang of LANGUAGES) {
  locales[lang] = JSON.parse(readFileSync(join(localesRoot, `${lang}.json`), 'utf8')) as LocaleFile;
}

/** Path of a page in a language (mirror of useRouter.pagePath). */
function pagePath(lang: string, page: (typeof PAGES)[number]): string {
  return page.dir === '' ? `/${lang}/` : `/${lang}/${page.dir}`;
}

/** Absolute URL of a page (fully-qualified per Google's hreflang rules). */
function pageUrl(lang: string, page: (typeof PAGES)[number]): string {
  return `${SITE_ORIGIN}${pagePath(lang, page)}`;
}

/** One hreflang set is identical on every version of the page (Google). */
function hreflangLinks(page: (typeof PAGES)[number]): string {
  const links = LANGUAGES.map(
    (lang: string) => `<link rel="alternate" hreflang="${lang}" href="${pageUrl(lang, page)}" />`,
  );
  // x-default: the language-neutral root (Caddy redirects by Accept-Language).
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/" />`);
  return links.join('\n    ');
}

/** Escape a string for HTML text content and attribute values. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Prerendered body content per page. The About and Attribution text is real
 * HTML in the page so crawlers and link previews never depend on JS; the
 * app takes over on load (same landmarks/headings as the app, no flash:
 * React re-renders #root).
 */
function prerender(lang: string, page: (typeof PAGES)[number]): string {
  const locale = locales[lang] as LocaleFile & {
    about?: Record<string, string>;
    attribution?: Record<string, string>;
  };
  if (page.id === 'about') {
    const a = ((locale.about ?? {}) as unknown) as Record<string, Record<string, string>>;
    const sections = [
      ['about.what', a['what']?.['title'], a['what']?.['body']],
      ['about.principle', a['principle']?.['title'], a['principle']?.['body']],
      ['about.sources', a['sources']?.['title'], a['sources']?.['body']],
      ['about.privacy', a['privacy']?.['title'], a['privacy']?.['body']],
      ['about.license', a['license']?.['title'], a['license']?.['body']],
      ['about.contact', a['contact']?.['title'], a['contact']?.['body']],
    ] as const;
    const body = sections
      .filter((s) => Boolean(s[1]))
      .map(
        ([, title, text]) =>
          `      <section>\n        <h2>${esc(title ?? '')}</h2>\n        <p>${esc(text ?? '')}</p>\n      </section>`,
      )
      .join('\n');
    // The about.title key interpolates {{site}}; substitute the site name.
    const heading = ((locale.about as Record<string, string> | undefined)?.['title'] ?? 'Over {{site}}').replaceAll('{{site}}', SITE_NAME);
    return `    <main id="main" class="about-page">\n      <h1>${esc(heading)}</h1>\n${body}\n    </main>`;
  }
  if (page.id === 'attribution') {
    // Section headings and caveats (translated); the full per-source listing
    // is rendered by the app from sources.json at run time. The prerendered
    // version lists the factual one-liners so crawlers see real content.
    const attr = (locale.attribution ?? {}) as Record<string, string>;
    const headings = [
      attr['sectionAircraft'],
      attr['sectionNoise'],
      attr['sectionAirports'],
    ];
    const body = headings
      .filter(Boolean)
      .map((text) => `      <section>\n        <h2>${esc(text as string)}</h2>\n      </section>`)
      .join('\n');
    const title = attr['title'] ?? 'Bronvermelding';
    return `    <main id="main" class="about-page attribution-page">\n      <h1>${esc(title)}</h1>\n${body}\n    </main>`;
  }
  // Map page: the map itself is a canvas; the prerendered content is the
  // page's purpose (the SEO description as a visually-hidden paragraph
  // keeps the visible design identical to the app shell).
  const seo = locales[lang]?.seo?.map;
  const desc = seo?.description ?? '';
  return `    <main id="main">\n      <h1 class="visually-hidden">${esc(SITE_NAME)}</h1>\n      <p class="visually-hidden">${esc(desc)}</p>\n    </main>`;
}

/** Build one prerendered page's full HTML from the built shell. */
function buildPage(lang: string, page: (typeof PAGES)[number]): string {
  const seo = (locales[lang]?.seo as Record<string, SeoStrings | undefined> | undefined)?.[page.seoKey];
  if (!seo) {
    console.error(`locales/${lang}.json lacks seo.${page.seoKey} — every locale needs the full seo.* key set`);
    process.exit(1);
  }
  const canonical = pageUrl(lang, page);
  // SEO tags injected right after the shell's <title>, which is replaced
  // in place. Everything else in the shell head (icons, theme colour, the
  // module script, stylesheet, manifest, SW registration) is kept verbatim
  // so the app loads and takes over exactly as from the plain shell.
  const seoTags = `    <link rel="canonical" href="${esc(canonical)}" />
    ${hreflangLinks(page)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${esc(seo.ogTitle)}" />
    <meta property="og:description" content="${esc(seo.ogDescription)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${esc(`${SITE_ORIGIN}/og-image.png`)}" />
    <meta property="og:locale" content="${OG_LOCALES[lang] ?? lang}" />
    ${LANGUAGES.filter((l: string): boolean => l !== lang)
      .map((l: string) => `<meta property="og:locale:alternate" content="${OG_LOCALES[l] ?? l}" />`)
      .join('\n    ')}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(seo.ogTitle)}" />
    <meta name="twitter:description" content="${esc(seo.ogDescription)}" />
    <meta name="twitter:image" content="${esc(`${SITE_ORIGIN}/og-image.png`)}" />`;

  let html = shell;
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  // Replace the description and title; insert the SEO tags after the title.
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>\n\s*<title>[^<]*<\/title>/,
    `<meta name="description" content="${esc(seo.description)}" />\n    <title>${esc(seo.title)}</title>\n${seoTags}`,
  );
  html = html.replace(/<div id="root"><\/div>/, `<div id="root">\n${prerender(lang, page)}\n    </div>`);
  return html;
}

// --- Write the per-language pages ---
for (const lang of LANGUAGES) {
  for (const page of PAGES) {
    const outDir = join(dist, lang, page.dir);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), buildPage(lang, page));
  }
}

// --- robots.txt ---
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
);

// --- sitemap.xml (every page in every language, with xhtml:link alternates) ---
const xmlEsc = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sitemapRows = LANGUAGES.flatMap((lang: string) =>
  PAGES.map((page) => {
    const alternates = LANGUAGES.map(
      (l: string) =>
        `        <xhtml:link rel="alternate" hreflang="${l}" href="${xmlEsc(pageUrl(l, page))}" />`,
    ).join('\n');
    return `  <url>\n    <loc>${xmlEsc(pageUrl(lang, page))}</loc>\n${alternates}\n  </url>`;
  }),
);
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapRows.join('\n')}\n</urlset>\n`,
);

// --- og-image.png (1200 x 630), generated with @napi-rs/canvas ---
function generateOgImage(): void {
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  // Brand palette (styles/index.css tokens): cream background, coral accent.
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8735a';
  ctx.beginPath();
  ctx.arc(950, 315, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b352f';
  ctx.font = '700 84px sans-serif';
  ctx.fillText(SITE_NAME, 80, 250);
  ctx.font = '400 40px sans-serif';
  ctx.fillStyle = '#5c5347';
  const tagline = locales[DEFAULT_LANGUAGE]?.seo?.map?.ogTitle ?? '';
  ctx.fillText(tagline.slice(0, 42), 80, 330);
  ctx.font = '400 30px sans-serif';
  ctx.fillText(SITE_ORIGIN.replace(/^https?:\/\//, ''), 80, 540);
  canvas.encode('png').then((png: Buffer): void => {
    writeFileSync(join(dist, 'og-image.png'), png);
  });
}
generateOgImage();

// --- Service worker: add the per-language shells to the precache manifest ---
// generateSW runs inside `vite build`, before this script writes the
// per-language pages, so they are missing from sw.js. The SW must precache
// the per-language shells (session 25b) so they work offline; /api/ is not
// a file and never appears. The revision is the content hash (same rule
// workbox uses). The navigation fallback stays index.html (the language-
// neutral SPA shell that routes by URL path).
import { createHash } from 'node:crypto';
const swPath = join(dist, 'sw.js');
if (existsSync(swPath)) {
  let sw = readFileSync(swPath, 'utf8');
  const newEntries: string[] = [];
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      const fileRel = page.dir === '' ? `${lang}/index.html` : `${lang}/${page.dir}/index.html`;
      const content = readFileSync(join(dist, fileRel));
      const revision = createHash('sha256').update(content).digest('hex').slice(0, 32);
      const url = `/${fileRel}`;
      if (!sw.includes(`url:"${url}"`)) {
        newEntries.push(`{url:"${url}",revision:"${revision}"}`);
      }
    }
  }
  if (newEntries.length > 0) {
    sw = sw.replace(
      /precacheAndRoute\(\[\n?/,
      `precacheAndRoute([\n${newEntries.join(',')},`,
    );
    writeFileSync(swPath, sw);
  }
} else {
  // Test/partial builds may generate into a directory without sw.js;
  // the build-output test asserts the real dist/ has the entries.
  console.warn('gen-static-pages: no sw.js in the output directory — SW precache not updated');
}

console.log(`gen-static-pages: wrote per-language pages for [${LANGUAGES.join(', ')}] to dist/`);
console.log(`gen-static-pages: origin ${SITE_ORIGIN}, site name ${SITE_NAME}`);
console.log('gen-static-pages: wrote dist/robots.txt, dist/sitemap.xml, dist/og-image.png');
