// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Search box component — search by callsign, registration, or ICAO24
// Spec §2: "Search: callsign, registration or ICAO24."

import React, { useState, useCallback, useMemo } from 'react';
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

/**
 * Search box with results dropdown. Submitting an exact match selects it
 * directly; otherwise the first result is selected.
 */
export function SearchBox({ aircraft, onSelect }: SearchBoxProps): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const results = useMemo(
    (): DisplayAircraft[] => searchAircraft(aircraft, query).slice(0, MAX_RESULTS),
    [aircraft, query],
  );

  const showResults = isFocused && query.trim().length > 0;

  const handleSelectResult = useCallback(
    (id: string): void => {
      onSelect(id);
      setQuery('');
      setIsFocused(false);
    },
    [onSelect],
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setQuery('');
        setIsFocused(false);
      }
    },
    [],
  );

  return (
    <div className="search-box" role="search">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
          onFocus={(): void => setIsFocused(true)}
          onBlur={(): void => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          autoComplete="off"
          spellCheck={false}
        />
      </form>

      {showResults && (
        <ul className="search-results" role="listbox" aria-label={t('search.placeholder')}>
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
    </div>
  );
}

export default SearchBox;
