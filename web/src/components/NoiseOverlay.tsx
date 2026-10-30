// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise overlay UI: toggle, compact legend, and contour-membership badge.
// Bands are per-airport lower bounds in dB Lden (spec §10): the EU END
// 2021 Schiphol set uses 5 dB bands (55–75, "actual traffic 2021"), while
// airport-decree contours use 48/56/70 ("permitted use").
// Compact legend (mobile follow-up): layer name, one-line essential, year
// and one row per band (colour + pattern swatch). A "sources and details"
// link opens the Attribution page section for this layer via a callback
// prop. On narrow viewports the legend starts collapsed as a chip; the
// expanded bottom sheet closes on Esc and returns focus to the chip.

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { lookupNoiseBand } from '@vliegvuil/core';
import type { NoiseContours } from '@vliegvuil/core';
import { noiseBandColor, noiseBandPattern } from '../noiseStyle';

export interface NoiseLegendEntry {
  airport: string;
  bandLowerDb: number;
  year: number;
  metric: string;
  kind: 'actual' | 'permitted';
  source: string;
  license: string;
  caveat?: string;
}

/** Extract legend entries (one per airport/band/year/kind combination) */
export function buildLegendEntries(contours: NoiseContours): NoiseLegendEntry[] {
  const seen = new Set<string>();
  const entries: NoiseLegendEntry[] = [];
  for (const contour of contours.contours) {
    const key = `${contour.airport}|${contour.bandLowerDb}|${contour.year}|${contour.kind}|${contour.properties.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      airport: contour.airport,
      bandLowerDb: contour.bandLowerDb,
      year: contour.year,
      metric: contour.metric,
      kind: contour.kind,
      source: contour.properties.source,
      license: contour.properties.license,
      caveat: contour.properties.caveat,
    });
  }
  return entries.sort((a, b): number =>
    a.airport.localeCompare(b.airport) || a.bandLowerDb - b.bandLowerDb,
  );
}

/** One row per band: swatch colour/pattern plus the dB value */
export interface NoiseBandRow {
  bandLowerDb: number;
  metric: string;
  kinds: Array<'actual' | 'permitted'>;
}

/** Group entries by band, one swatch per band (compact legend) */
export function buildBandRows(entries: NoiseLegendEntry[]): NoiseBandRow[] {
  const byBand = new Map<number, NoiseBandRow>();
  for (const entry of entries) {
    const row = byBand.get(entry.bandLowerDb);
    if (row === undefined) {
      byBand.set(entry.bandLowerDb, {
        bandLowerDb: entry.bandLowerDb,
        metric: entry.metric,
        kinds: [entry.kind],
      });
      continue;
    }
    if (!row.kinds.includes(entry.kind)) row.kinds.push(entry.kind);
  }
  return [...byBand.values()].sort((a, b): number => a.bandLowerDb - b.bandLowerDb);
}

/** Narrow viewport threshold matching the CSS media query (40rem) */
export const NARROW_MEDIA_QUERY = '(max-width: 40rem)';

/** DOM id of the mobile legend sheet (referenced by the chip's aria-controls) */
const LEGEND_SHEET_ID = 'noise-legend-sheet';

/** useSyncExternalStore-free narrow-viewport hook (matchMedia may be absent in tests) */
export function useNarrowViewport(query: string = NARROW_MEDIA_QUERY): boolean {
  const [narrow, setNarrow] = useState((): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });
  useEffect((): (() => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return (): void => {};
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches);
    setNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return (): void => mql.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

export interface NoiseOverlayProps {
  /** Whether the noise layer is currently shown on the map */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Contour data; when absent the toggle is disabled */
  contours: NoiseContours | null;
  /** Opens the Attribution page at the noise layer section (App owns navigation) */
  onOpenSources?: () => void;
}

/** Compact legend content, shared by the desktop card and mobile sheet */
function LegendContent({
  year,
  rows,
  onOpenSources,
}: {
  year: number | null;
  rows: NoiseBandRow[];
  onOpenSources?: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <p className="noise-legend-essential" data-testid="noise-legend-essential">
        {t('noise.essential', 'Annual average, not live')}
      </p>
      {year !== null && (
        <p className="noise-legend-year" data-testid="noise-legend-year">
          {t('noise.year', 'Year: {{year}}', { year })}
        </p>
      )}
      <ul className="noise-legend-list">
        {rows.map((row): React.ReactElement => (
          <li key={row.bandLowerDb} className="noise-legend-item">
            <span
              className="noise-swatch"
              data-testid={`noise-swatch-${row.bandLowerDb}`}
              /* Dynamic values computed from the band data: passed as CSS
                 custom properties (session 26), consumed in index.css */
              style={{
                '--noise-swatch-color': noiseBandColor(row.bandLowerDb),
                '--noise-swatch-pattern': noiseBandPattern(row.bandLowerDb),
              } as React.CSSProperties}
              aria-hidden="true"
            />
            <span className="noise-legend-label">
              {t('noise.bandLabel', '≥{{band}} dB {{metric}}', {
                band: row.bandLowerDb,
                metric: row.metric,
              })}
              {row.kinds.length === 2
                ? ` (${t('noise.kindActual', 'actual traffic')}, ${t('noise.kindPermitted', 'permitted use')})`
                : row.kinds[0] === 'permitted'
                  ? ` (${t('noise.kindPermitted', 'permitted use')})`
                  : ` (${t('noise.kindActual', 'actual traffic')})`}
            </span>
          </li>
        ))}
      </ul>
      {onOpenSources && (
        <button
          type="button"
          className="noise-legend-sources"
          onClick={onOpenSources}
          data-testid="noise-legend-sources"
        >
          {t('noise.sourcesLink', 'Sources and details')}
        </button>
      )}
    </>
  );
}

/**
 * Noise overlay controls: a toggle button (aria-pressed, announced) and a
 * compact legend. Desktop shows the legend card directly; narrow viewports
 * start collapsed as a chip (aria-expanded) that opens a scrollable bottom
 * sheet (max-height 40vh). Esc closes the sheet and returns focus to the
 * chip. The map keeps receiving touch events outside chip and sheet.
 */
export function NoiseOverlay({
  enabled,
  onToggle,
  contours,
  onOpenSources,
}: NoiseOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  const entries = useMemo(
    (): NoiseLegendEntry[] => (contours ? buildLegendEntries(contours) : []),
    [contours],
  );
  const rows = useMemo((): NoiseBandRow[] => buildBandRows(entries), [entries]);
  const year = entries.length > 0 ? (entries[0]?.year ?? null) : null;
  const narrow = useNarrowViewport();
  const [legendExpanded, setLegendExpanded] = useState(false);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect((): void => {
    if (narrow) setLegendExpanded(false);
  }, [narrow]);

  useEffect((): void => {
    if (legendExpanded && sheetCloseRef.current !== null) {
      sheetCloseRef.current.focus();
    }
  }, [legendExpanded]);

  const closeSheet = useCallback((): void => {
    setLegendExpanded(false);
    chipRef.current?.focus();
  }, []);

  useEffect((): (() => void) => {
    if (!legendExpanded) return (): void => {};
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [legendExpanded, closeSheet]);

  if (!contours) return null;
  const handleToggle = (): void => {
    onToggle(!enabled);
  };
  const legendTitle = t('noise.layerName', 'Noise contours');
  return (
    <div className="noise-overlay" data-testid="noise-overlay">
      <button
        type="button"
        className="noise-toggle"
        aria-pressed={enabled}
        onClick={handleToggle}
        data-testid="noise-toggle"
      >
        {enabled ? t('map.hideNoise', 'Hide noise contours') : t('map.toggleNoise', 'Show noise contours')}
      </button>
      {enabled && !narrow && (
        <div
          className="noise-legend"
          role="region"
          aria-label={legendTitle}
          data-testid="noise-legend"
        >
          <h3 className="noise-legend-title">{legendTitle}</h3>
          <LegendContent year={year} rows={rows} onOpenSources={onOpenSources} />
        </div>
      )}
      {enabled && narrow && (
        <>
          <button
            ref={chipRef}
            type="button"
            className="noise-legend-chip"
            aria-expanded={legendExpanded}
            aria-controls={LEGEND_SHEET_ID}
            onClick={(): void => setLegendExpanded((prev): boolean => !prev)}
            data-testid="noise-legend-chip"
          >
            {legendTitle}
          </button>
          {legendExpanded && (
            <div
              id={LEGEND_SHEET_ID}
              className="noise-legend-sheet"
              role="region"
              aria-label={legendTitle}
              data-testid="noise-legend-sheet"
            >
              <div className="noise-legend-sheet-header">
                <h3 className="noise-legend-title">{legendTitle}</h3>
                <button
                  ref={sheetCloseRef}
                  type="button"
                  className="noise-legend-close"
                  onClick={closeSheet}
                  aria-label={t('telemetry.close', 'Close')}
                  data-testid="noise-legend-close"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>
              <LegendContent year={year} rows={rows} onOpenSources={onOpenSources} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface NoiseBadgeProps {
  lat: number;
  lon: number;
  contours: NoiseContours | null;
}

/**
 * Contour-membership badge for the telemetry panel. Reads "Inside the
 * ≥[band] dB [metric] contour of [airport], [year]" with an annual-average
 * caveat (spec §2, §10: never implies live noise).
 */
export function NoiseBadge({ lat, lon, contours }: NoiseBadgeProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!contours) return null;
  const result = lookupNoiseBand({ x: lon, y: lat }, contours);
  if (!result) return null;
  return (
    <p className="noise-badge" role="status" data-testid="noise-badge">
      {t('noise.badge', 'Inside the ≥{{band}} dB {{metric}} contour of {{airport}}, {{year}}', {
        band: result.bandLowerDb,
        metric: result.metric,
        airport: result.airport,
        year: result.year,
      })}
      {' '}
      <span className="noise-badge-caveat">
        ({t('noise.annualAverageShort', 'annual average, not live noise')})
      </span>
    </p>
  );
}

export default NoiseOverlay;
