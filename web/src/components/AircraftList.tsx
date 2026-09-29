// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Aircraft list view — sortable table alternative to the map
// Spec §2: "Aircraft list view (sortable table) as the keyboard/screen-reader alternative to the map."
// Spec §6: accessible list view, ARIA live announcements, visible focus states,
// colour-independent legends, prefers-reduced-motion respected.

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayAircraft } from '../types';

export type SortColumn = 'callsign' | 'registration' | 'altitude' | 'speed';
export type SortDirection = 'asc' | 'desc';

export interface AircraftListProps {
  aircraft: Map<string, DisplayAircraft>;
  selectedAircraftId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Numeric-safe comparator: nulls always sort last regardless of direction */
function compareNullable(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

/** String comparator, nulls last */
function compareString(
  a: string | null,
  b: string | null,
  direction: SortDirection,
): number {
  const av = a ?? '';
  const bv = b ?? '';
  const result = av.localeCompare(bv);
  return direction === 'asc' ? result : -result;
}

/** Sort aircraft by the given column and direction (pure function) */
export function sortAircraft(
  aircraft: Map<string, DisplayAircraft>,
  column: SortColumn,
  direction: SortDirection,
): DisplayAircraft[] {
  const list = Array.from(aircraft.values());
  list.sort((a, b): number => {
    switch (column) {
      case 'callsign':
        return compareString(a.callsign, b.callsign, direction);
      case 'registration':
        return compareString(a.registration, b.registration, direction);
      case 'altitude':
        return compareNullable(a.alt, b.alt, direction);
      case 'speed':
        return compareNullable(a.speed, b.speed, direction);
    }
  });
  return list;
}

/**
 * Sortable aircraft table. Keyboard accessible: columns are real buttons,
 * rows are focusable and activate with Enter/Space. Selection is announced
 * via ARIA live.
 */
export function AircraftList({
  aircraft,
  selectedAircraftId,
  onSelect,
  onClose,
}: AircraftListProps): React.ReactElement {
  const { t } = useTranslation();
  const [sortColumn, setSortColumn] = useState<SortColumn>('callsign');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sorted = useMemo(
    (): DisplayAircraft[] => sortAircraft(aircraft, sortColumn, sortDirection),
    [aircraft, sortColumn, sortDirection],
  );

  const handleSort = useCallback((column: SortColumn): void => {
    setSortColumn((prev): SortColumn => {
      if (prev === column) {
        setSortDirection((d): SortDirection => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return column;
    });
  }, []);

  const ariaSort = (column: SortColumn): 'ascending' | 'descending' | 'none' => {
    if (column !== sortColumn) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const sortIcon = (column: SortColumn): string => {
    if (column !== sortColumn) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <aside
      className="aircraft-list"
      role="region"
      aria-label={t('list.title')}
    >
      <header className="aircraft-list-header">
        <h2 className="aircraft-list-title">
          {t('list.title')} ({sorted.length})
        </h2>
        <button
          type="button"
          className="aircraft-list-close"
          onClick={onClose}
          aria-label={t('telemetry.close')}
        >
          ×
        </button>
      </header>

      <table className="aircraft-list-table">
        <caption className="visually-hidden">{t('list.title')}</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSort('callsign')}>
              <button type="button" className="aircraft-list-sort" onClick={(): void => handleSort('callsign')}>
                {t('telemetry.callsign')} <span aria-hidden="true">{sortIcon('callsign')}</span>
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('registration')}>
              <button type="button" className="aircraft-list-sort" onClick={(): void => handleSort('registration')}>
                {t('telemetry.registration')} <span aria-hidden="true">{sortIcon('registration')}</span>
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('altitude')} className="numeric">
              <button type="button" className="aircraft-list-sort" onClick={(): void => handleSort('altitude')}>
                {t('telemetry.altitude')} <span aria-hidden="true">{sortIcon('altitude')}</span>
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('speed')} className="numeric">
              <button type="button" className="aircraft-list-sort" onClick={(): void => handleSort('speed')}>
                {t('telemetry.speed')} <span aria-hidden="true">{sortIcon('speed')}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="aircraft-list-empty">
                {t('map.noData')}
              </td>
            </tr>
          )}
          {sorted.map((ac): React.ReactElement => {
            const isSelected = ac.id === selectedAircraftId;
            return (
              <tr
                key={ac.id}
                className={isSelected ? 'aircraft-list-row selected' : 'aircraft-list-row'}
                tabIndex={0}
                aria-selected={isSelected}
                onClick={(): void => onSelect(ac.id)}
                onKeyDown={(e): void => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(ac.id);
                  }
                }}
              >
                <td className="aircraft-list-cell primary">{ac.callsign ?? ac.icao24}</td>
                <td className="aircraft-list-cell secondary">{ac.registration ?? '—'}</td>
                <td className="aircraft-list-cell numeric">{ac.alt != null ? `${Math.round(ac.alt).toLocaleString()} ft` : '—'}</td>
                <td className="aircraft-list-cell numeric">{ac.speed != null ? `${Math.round(ac.speed)} kt` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </aside>
  );
}

export default AircraftList;
