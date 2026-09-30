# Sessions 25 and 25b: UI shell, then SEO foundations

Rows are in `docs/BUILD.md` section 4. Session 25 depends on session 18 (i18n cleanup) and session 19 (Caddy) being merged. Light/dark theme is **deferred to a later version**.

**Why:** the site will attract non-Dutch visitors, and a separately branded sibling site (for example on a `.eu` domain) may reuse the code later. So language lives in the URL (not localStorage), the site origin and name are configuration (no hard-coded `vliegvuil.nl`), and adding a third language is a config and translation change only. No multi-domain logic is needed now.

---

# Session 25: UI shell

## Scope

**Header** (`<header>` landmark, replaces the floating ⚙ / "Lijst" / "i" buttons and the bottom-left name card):
- Logo: small inline SVG plane glyph (`aria-hidden`) plus the visible site name as a link to the map for the current language. No image files, no icon library.
- Search box moves into the header. At 320 px width it must stay reachable (second row, or a labelled button that expands it).
- A visible **List** button (the accessible alternative to the map should not be hidden in a menu) and a **Menu** (hamburger) button.

**Menu** (`<nav aria-label>` opened by the hamburger):
- Entries: Settings (units), About, Attribution, Privacy (a section of About), Donate (outbound link, only rendered if a donation URL is configured).
- **Language switcher at the bottom of the menu as real links**, one per supported language, each labelled in its own language ("Nederlands", "English") with `lang` and `hreflang` attributes and `href` to the same page in that language. `aria-current="true"` on the active one. The list comes from one config array, so a third language is a config entry plus a locale file.
- Not a modal: focus moves into the menu on open, Esc closes it, focus returns to the hamburger. Same pattern as the telemetry panel (spec §6). Not a focus trap.

**Routing** (no new dependency, real paths, no hash routes):
- URLs: `/{lang}/` (map), `/{lang}/about`, `/{lang}/attribution`. Language is the first path segment and the single source of truth for the UI language. Settings (units) stays a panel.
- Use the History API for navigation. Browser Back and Forward work. Unknown language segment or path shows a translated "page not found" view with a link to the map.
- On route change: move focus to the page's `<h1>`, update `document.title` and `<html lang>`, announce via the existing live region.
- Language is **no longer stored in localStorage** (spec §2 changes here: update `docs/SPEC.md` in this PR). Units remain in localStorage.

**About page** (translated):
- What the site is, in one short paragraph, **including that coverage is currently the Netherlands only** (visitors from elsewhere must understand this at once).
- The "measurements, not causes" principle and the noise caveat (annual average, not live noise). Match the spec wording.
- Data sources summary linking to the Attribution page.
- Privacy summary: **only state what the code and Caddy config actually do**. Verify each claim in the PR description.
- Licence: MPL-2.0 with link to the repository, and `Copyright (c) <year> <handle>`.
- **Contact**, in this order: (1) GitHub issues (URL from config), (2) Bluesky (URL from config, currently `null`: render nothing when `null`, no placeholder, no broken link). No email, no contact form.

**Config**: new `web/src/config/site.ts` with `siteName`, `siteOrigin` (from build-time env, e.g. `VITE_SITE_ORIGIN`), `supportedLanguages` (`['nl','en']`), `defaultLanguage` (`'nl'`), `githubIssuesUrl`, `githubRepoUrl`, `blueskyUrl: null`, `donationUrl: null`. Derive the GitHub URLs from the repo's git remote and list them in the PR description so I can confirm. **No hard-coded domain or site name anywhere else**, including locale files (use interpolation) and the PWA manifest source. Do not invent any other URL or handle.

**Theme**: no toggle, no `prefers-color-scheme` handling. Define all colours, spacing and radii as CSS custom properties (tokens) on `:root` and use them everywhere in the new shell, so a dark theme later is a token swap. Set `color-scheme: light`.

**Outbound links** (GitHub, Bluesky, donation): plain `<a>` with `rel="noopener noreferrer"` and `referrerpolicy="no-referrer"`. If any opens a new tab, say so in the link text for screen readers. No embeds, no widgets, no third-party scripts (spec §5).

**Service worker**: with real paths, make sure the navigation fallback still serves the app shell for `/{lang}/...` and never for `/api/`.

## Accessibility requirements

- Landmarks: `header`, `nav`, `main` (map region and page content), `aside` for panels. First focusable element is a **skip link** ("Skip to map" / "Skip to list view"), visible on focus.
- Every control has a translated accessible name; hamburger uses `aria-expanded` and `aria-controls`.
- Visible focus indicator on every interactive element, contrast ≥ 3:1. Text contrast ≥ 4.5:1.
- Touch targets ≥ 44 × 44 px for header and menu controls.
- Layout works at 320 px width and 200% zoom without horizontal scroll (excluding the map).
- No motion for menu open/close and route changes when `prefers-reduced-motion: reduce`; otherwise a short, subtle transition.
- Icon-only buttons never rely on the icon alone for meaning.
- Page title changes per view and per language.

## i18n requirements

- Every string in `locales/<lang>.json`. Dutch is the default and must read as natural Dutch. I will review the NL text.
- No string concatenation for sentences. Use `Trans` with component placeholders for sentences containing links.
- Interpolation and plurals via i18next, dates and numbers via `Intl`.
- Any text in another language (e.g. language names in the switcher) is marked with `lang`.
- Tests: **every locale file listed in `supportedLanguages` has exactly the same key set** (fails otherwise; loops over all languages so adding one is covered automatically), and no user-visible string literals in `.tsx`.

## Tests required

- axe check on header, open menu, About page, not-found view.
- Keyboard: open menu with Enter and Space, logical Tab order, Esc closes and returns focus to the hamburger, route change moves focus to the `<h1>`.
- Routing: `/nl/about` and `/en/about` render the right language, Back/Forward work, unknown path shows the not-found view, switching language keeps the same page.
- Bluesky and donation entries are hidden when `null` and correct when set.
- Outbound link attributes (`rel`, `referrerpolicy`).
- Adding a fake third language to the config (in a test) makes the switcher, routing and key-parity test pick it up.

## Prompt

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md, then docs/sessions/25-ui-shell-and-seo.md.
Task: session 25, "UI shell". Scope is only that session; do not start 25b or others.
Add no new dependencies. No theme toggle. No hard-coded domain or site name.
Do not invent URLs, handles or claims: Bluesky and donation stay null, and every
privacy statement on the About page must be checked against the code and
Caddyfile with the evidence listed in the PR description. Update docs/SPEC.md
where language storage changes. If anything is ambiguous, ask me before coding.
Run lint, typecheck, tests and build, and open a pull request with the results and
screenshots of header, open menu and About page at 320 px and 1280 px width in both
languages.
```

---

# Session 25b: SEO foundations

Depends on 25 merged. Goal: each language page is a real, crawlable, correctly labelled URL, and the origin and site name come from configuration.

## Scope

**Static per-language pages at build time.** A post-build script (no new dependency) writes `dist/{lang}/index.html`, `dist/{lang}/about/index.html`, `dist/{lang}/attribution/index.html` from the built shell. Each has, in its own language:
- `<html lang>`, `<title>` and meta description from `locales/<lang>.json` (keys under `seo.*`, present in every locale).
- `<link rel="canonical">` pointing to itself on `siteOrigin`.
- `<link rel="alternate" hreflang>` for every language plus `x-default` pointing to `/`.
- Open Graph and Twitter card tags (`og:title`, `og:description`, `og:image`, `og:locale` and `og:locale:alternate`, `og:site_name`).
- The About and Attribution text as real HTML content in the page (prerendered), so crawlers and link previews do not depend on JavaScript. The app then takes over on load.

**Root `/`.** Caddy redirects (302, `Vary: Accept-Language`) to `/{lang}/` based on `Accept-Language`, falling back to `defaultLanguage`. `/` is the `x-default` target. No cookie, no localStorage. Validate with `caddy validate` (same custom Caddy build as session 19) and add a test for the redirect logic.

**Files generated from config:**
- `robots.txt`: allow all, `Disallow: /api/`, `Sitemap: <origin>/sitemap.xml`.
- `sitemap.xml`: every page in every language with `xhtml:link` alternates.
- `web/public/og-image.png` (1200 × 630). A simple generated branded image is fine for now; I may replace it.

**Origin from config.** Everything uses `siteOrigin` and `siteName` from build-time config. Do not assume `vliegvuil.nl`. Document in `docs/deploy.md` how to build for another origin. No canonical or hreflang logic across different domains is needed.

**Caddy and service worker.** `try_files {path} {path}/index.html /index.html` so the per-language pages are served and unknown deep links still fall back to the app. Service worker precaches the per-language shells, never caches `/api/`, and never serves one language's shell for another language's URL.

**Not in scope:** JSON-LD structured data, analytics, Search Console script (verification by DNS only, later), per-country content.

## Accessibility and i18n requirements

- Prerendered pages have the same landmarks, headings and skip link as the app; the app takes over without a visible flash or focus loss.
- `seo.*` strings are written for humans first (natural Dutch, natural English), not keyword lists.
- Key-parity test covers `seo.*`; a build test fails if any supported language lacks a generated page.

## Tests required

- Build test: for every language and page, the generated HTML has exactly one `<title>`, one canonical, hreflang entries for all languages plus `x-default`, matching `<html lang>`, and og tags.
- `sitemap.xml` lists every generated URL; `robots.txt` blocks `/api/`.
- Adding a fake third language in a test generates its pages, hreflang entries and sitemap rows.
- Caddy: `/` redirects by `Accept-Language`; `/nl/about` serves the prerendered file; `/api/` is untouched.
- Origin is taken from config: building with a different `VITE_SITE_ORIGIN` changes every canonical, hreflang, og:url and sitemap entry.

## Prompt

```
Read AGENTS.md, docs/SPEC.md and docs/BUILD.md, then docs/sessions/25-ui-shell-and-seo.md.
Task: session 25b, "SEO foundations". Scope is only that session. Add no new dependencies.
Do not hard-code any domain; use siteOrigin from config. Do not claim the Caddyfile
works unless you ran `caddy validate` with a binary that includes every module used;
show the command and output. Fetch and read Google's current documentation on
hreflang and canonical URLs before writing them, and paste the URLs you used in the
PR. Run lint, typecheck, tests and build, and open a pull request with the results
and a listing of dist/.
```

## Human decisions and checkpoints

- Confirm the GitHub repo and issues URLs the agent derives from the git remote (session 25).
- Review the Dutch and English About and `seo.*` text.
- When the Bluesky account exists, set `blueskyUrl` in `site.ts` (one-line change).
- After deploy: check the pages with view-source (not the browser inspector), test a link preview in a messenger, and submit `sitemap.xml` in Search Console using DNS verification.
- Try session 25 with keyboard only and with a screen reader (VoiceOver or NVDA) before merging.
