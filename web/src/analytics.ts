// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 25c: privacy-first analytics. Self-hosted GoatCounter, proxied
// from our own origin (Caddyfile: /count.js and /count -> 127.0.0.1), so
// the browser makes NO third-party request and the CSP stays 'self'.
//
// - Only active in production builds: VITE_ANALYTICS=1 at build time
//   (vite define below). Off in dev and in every test (import.meta.env
//   is stubbed in tests).
// - No cookies, no localStorage, no event tracking; the count is a
//   same-origin GET /count?p=<path> request (GoatCounter v2.7.0 count.js
//   protocol, verified in the release source: window.goatcounter.count
//   builds /count with p/r/t/s/b/q parameters via navigator.sendBeacon
//   with an image fallback).
// - We do NOT load GoatCounter's count.js at all: it adds screen size
//   (s=) and query (q=) parameters we do not want to send, and its own
//   onload/visibility logic would double-count SPA route changes. This
//   module sends the minimal /count?p= request itself — the same
//   endpoint, same first-party origin, fewer fields.

/** Minimal window.goatcounter shape we interact with (none: we build the
 *  request ourselves; typed for clarity and future maintenance). */
interface GoatCounterGlobals {
  no_onload?: boolean;
  no_events?: boolean;
  count?: (vars?: { path?: string }) => void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounterGlobals;
  }
}

/** Production build only (set in vite.config.ts via define). */
export const ANALYTICS_ENABLED: boolean = import.meta.env.VITE_ANALYTICS === '1';

/** Count one page view for a path (e.g. /nl/about). Same-origin request;
 *  referrer, screen size and query string are deliberately NOT sent. */
export function countPageView(path: string): void {
  if (!ANALYTICS_ENABLED) {
    return;
  }
  // Same shape GoatCounter's count.js uses for the image fallback: a
  // 1x1 GIF response; /count is GET/POST (verified in v2.7.0 source,
  // handlers/backend.go:108-109).
  const img = new Image();
  img.src = `/count?p=${encodeURIComponent(path)}${imgCacheBuster()}`;
}

/** The browser caches the 1x1 GIF; a unique query makes each count fire. */
function imgCacheBuster(): string {
  return `&cb=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Count a route change (session 25c spec: /{lang}/, about, attribution,
 *  404). Called by App on every route change; the path is the URL path so
 *  the dashboard shows per-page views. */
export function countRouteChange(pathname: string): void {
  countPageView(pathname);
}
