// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Small matchMedia hook (session 25 follow-up). The search box uses it to
// pick between the expanding icon button (narrow viewports) and an
// always-expanded input (wide viewports). No dependency; re-renders on
// media-query changes.
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect((): (() => void) => {
    if (typeof window.matchMedia !== 'function') return (): void => undefined;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return (): void => {
      mql.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}
