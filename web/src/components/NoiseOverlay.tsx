// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise overlay UI: toggle, legend, and contour-membership badge.
// Bands are per-airport lower bounds in dB Lden (spec §10): the EU END
// 2021 Schiphol set uses 5 dB bands (55–75, "actual traffic 2021"), while
// airport-decree contours use 48/56/70 ("permitted use"). Legend shows
// year, metric and kind per airport. Badge reads "Inside the ≥[band] dB
// [metric] contour of [airport], [year]" with an annual-average caveat.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

export interface NoiseOverlayProps {
  /** Whether the noise layer is currently shown on the map */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Contour data; when absent the toggle is disabled */
  contours: NoiseContours | null;
}

/**
 * Noise overlay controls: a toggle button (aria-pressed, announced) and a
 * legend listing every airport's bands with year, metric and kind, each
 * swatch encoded in both colour (coral-to-red ramp) and pattern
 * (colour-independent).
 */
export function NoiseOverlay({ enabled, onToggle, contours }: NoiseOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  const entries = useMemo(
    (): NoiseLegendEntry[] => (contours ? buildLegendEntries(contours) : []),
    [contours],
  );
  if (!contours) return null;
  const handleToggle = (): void => {
    onToggle(!enabled);
  };
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
      {enabled && (
        <div
          className="noise-legend"
          role="region"
          aria-label={t('noise.legendTitle', 'Noise contours legend')}
          data-testid="noise-legend"
        >
          <h3 className="noise-legend-title">{t('noise.legendTitle', 'Noise contours legend')}</h3>
          <p className="noise-legend-metric">{t('noise.metric', 'dB Lden (annual average)')}</p>
          <ul className="noise-legend-list">
            {entries.map((entry): React.ReactElement => (
              <li key={`${entry.airport}-${entry.bandLowerDb}`} className="noise-legend-item">
                <span
                  className="noise-swatch"
                  data-testid={`noise-swatch-${entry.bandLowerDb}`}
                  style={{
                    backgroundColor: noiseBandColor(entry.bandLowerDb),
                    backgroundImage: noiseBandPattern(entry.bandLowerDb),
                  }}
                  aria-hidden="true"
                />
                <span className="noise-legend-label">
                  {t('noise.bandLabel', '≥{{band}} dB {{metric}}', { band: entry.bandLowerDb, metric: entry.metric })}
                  {' — '}
                  {entry.airport} ({entry.year}
                  {entry.kind === 'permitted'
                    ? `, ${t('noise.kindPermitted', 'permitted use')}`
                    : `, ${t('noise.kindActual', 'actual traffic')}`})
                </span>
                {entry.caveat && (
                  <span className="noise-legend-caveat">{entry.caveat}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="noise-legend-source">
            {t('noise.source', 'Source: {{source}} ({{license}})', {
              source: entries[0]?.source ?? '',
              license: entries[0]?.license ?? '',
            })}
          </p>
          <p className="noise-legend-caveat">
            {t('noise.annualAverage', 'Contours show the annual average noise load, not live noise.')}
          </p>
        </div>
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
