// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Search box component — search by callsign, registration, or ICAO24.
// Collapsed by default: a 44x44 icon button (the site's goal is the
// pollution layers, not flight tracking, so search stays out of the
// way until asked for). Expands on click/tap, collapses on Esc, on
// blur when empty, and after a selection; focus returns to the button.
// Spec §2: "Search: callsign, registration or ICAO24."
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayAircraft } from '../types';

export interface SearchBoxProps {
  aircraft: Map<string, DisplayAircraft>;
  onSelect: (id: string) => void;
}

/** Normalise a query for case-insensitive, whitespace-insensitive matching */
function normalise(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Filter aircraft by query against callsign, registration, or ICAO24.
 * An exact ICAO24 match sorts first.
 */
export function searchAircraft(
  aircraft: Map<string, DisplayAircraft>,
  query: string,
): DisplayAircraft[] {
  const q = normalise(query);
  if (q.length === 0) return [];
  const results: DisplayAircraft[] = [];
  for (const ac of aircraft.values()) {
    const callsign = ac.callsign ? ac.callsign.toUpperCase() : null;
    const registration = ac.registration ? ac.registration.toUpperCase() : null;
    const icao24 = ac.icao24.toUpperCase();
    if (callsign?.includes(q) || registration?.includes(q) || icao24.includes(q)) {
      results.push(ac);
    }
  }
  // Exact ICAO24 first, then by callsign
  results.sort((a, b): number => {
    const aExact = a.icao24.toUpperCase() === q ? 1 : 0;
    const bExact = b.icao24.toUpperCase() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (a.callsign ?? '').localeCompare(b.callsign ?? '');
  });
  return results;
}

const MAX_RESULTS = 8;
const SEARCH_INPUT_ID = 'search-input';
const SEARCH_RESULTS_ID = 'search-results';

/**
 * Search box with results dropdown. Submitting an exact match selects it
 * directly; otherwise the first result is selected.
 */
export function SearchBox({ aircraft, onSelect }: SearchBoxProps): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Focus returns to the icon button after a collapse; the button only
  // mounts on the collapse render, so the focus runs in an effect.
  const [shouldRefocusToggle, setShouldRefocusToggle] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  useEffect((): void => {
    if (!isExpanded && shouldRefocusToggle) {
      setShouldRefocusToggle(false);
      iconButtonRef.current?.focus();
    }
  }, [isExpanded, shouldRefocusToggle]);
  const results = useMemo(
    (): DisplayAircraft[] => searchAircraft(aircraft, query).slice(0, MAX_RESULTS),
    [aircraft, query],
  );
  const showResults = isExpanded && isFocused && query.trim().length > 0;

  const collapseAndRefocus = useCallback((): void => {
    setIsExpanded(false);
    setQuery('');
    setIsFocused(false);
    setShouldRefocusToggle(true);
  }, []);

  const handleExpand = useCallback((): void => {
    setIsExpanded(true);
    // Focus after the input mounts
    requestAnimationFrame((): void => {
      inputRef.current?.focus();
    });
  }, []);

  const handleSelectResult = useCallback(
    (id: string): void => {
      onSelect(id);
      collapseAndRefocus();
    },
    [onSelect, collapseAndRefocus],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();
      const first = results[0];
      if (first) {
        handleSelectResult(first.id);
      }
    },
    [results, handleSelectResult],
  );

  // Esc collapses from anywhere in the search box; blur collapses only
  // when the query is empty (a typed query stays for re-focus).
  const handleBlur = useCallback((): void => {
    setIsFocused(false);
    if (query.trim().length === 0) {
      setIsExpanded(false);
    }
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        collapseAndRefocus();
      }
    },
    [collapseAndRefocus],
  );

  return (
    <div className={isExpanded ? "search-box expanded" : "search-box"} role="search" onKeyDown={handleKeyDown}>
      {!isExpanded ? (
        <button
          ref={iconButtonRef}
          type="button"
          className="search-toggle"
          onClick={handleExpand}
          aria-label={t('search.open')}
          aria-expanded={false}
          aria-controls={SEARCH_INPUT_ID}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              id={SEARCH_INPUT_ID}
              type="text"
              className="search-input"
              value={query}
              onChange={(e): void => setQuery(e.target.value)}
              onFocus={(): void => setIsFocused(true)}
              onBlur={handleBlur}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              autoComplete="off"
              spellCheck={false}
              aria-controls={SEARCH_RESULTS_ID}
            />
          </form>
          {showResults && (
            <ul
              id={SEARCH_RESULTS_ID}
              className="search-results"
              role="listbox"
              aria-label={t('search.placeholder')}
            >
              {results.length === 0 && (
                <li className="search-no-results" role="option" aria-selected={false}>
                  {t('search.noResults')}
                </li>
              )}
              {results.map((ac): React.ReactElement => (
                <li key={ac.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="search-result-button"
                    // preventDefault keeps the input's focus/blur intact
                    onMouseDown={(e): void => {
                      e.preventDefault();
                      handleSelectResult(ac.id);
                    }}
                  >
                    <span className="search-result-primary">
                      {ac.callsign ?? ac.icao24}
                    </span>
                    <span className="search-result-secondary">
                      {ac.registration ?? ac.icao24}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default SearchBox;
