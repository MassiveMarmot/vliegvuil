// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Minimal path router (session 25): /{lang}/ (map), /{lang}/about,
// /{lang}/attribution. History API only, no dependency. The language
// segment is the single source of truth for the UI language.

import { useCallback, useEffect, useState } from 'react';
import { isLanguageCode, setLanguage, type LanguageCode } from '../i18n';
import { DEFAULT_LANGUAGE } from '../config/site';

export type RouteName = 'map' | 'about' | 'attribution' | 'not-found';

export interface RouteState {
  language: LanguageCode;
  route: RouteName;
  path: string;
}

interface ParsedPath {
  language: LanguageCode;
  route: RouteName;
}

/** Map a pathname to {language, route}. Unknown paths: not-found. */
export function parsePath(pathname: string): ParsedPath {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const first = segments[0] ?? '';
  if (!first || !isLanguageCode(first)) {
    return { language: DEFAULT_LANGUAGE, route: 'not-found' };
  }
  const language = first;
  const page = segments[1] ?? '';
  if (page === '' || page === undefined) return { language, route: 'map' };
  if (page === 'about') return { language, route: 'about' };
  if (page === 'attribution') return { language, route: 'attribution' };
  return { language, route: 'not-found' };
}

/** The path for a page in a language (used for links and language switch). */
export function pagePath(language: LanguageCode, route: RouteName): string {
  if (route === 'map') return `/${language}/`;
  if (route === 'about') return `/${language}/about`;
  if (route === 'attribution') return `/${language}/attribution`;
  return `/${language}/`;
}

/**
 * Router hook: tracks the current route, navigates via the History API
 * (Back/Forward work through popstate) and keeps i18n + <html lang>
 * in sync with the language segment.
 */
export function useRouter(): {
  state: RouteState;
  navigate: (path: string) => void;
} {
  const [state, setState] = useState<RouteState>(() => {
    const parsed = parsePath(window.location.pathname);
    return { ...parsed, path: window.location.pathname };
  });

  const syncFrom = useCallback((pathname: string): void => {
    const parsed = parsePath(pathname);
    setLanguage(parsed.language);
    setState({ ...parsed, path: pathname });
  }, []);

  useEffect((): (() => void) => {
    const onPopState = (): void => {
      syncFrom(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    // Sync once on mount so the language of a deep link wins over the
    // i18n module's initial guess.
    syncFrom(window.location.pathname);
    return (): void => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [syncFrom]);

  const navigate = useCallback(
    (path: string): void => {
      window.history.pushState({}, '', path);
      syncFrom(path);
    },
    [syncFrom],
  );

  return { state, navigate };
}
