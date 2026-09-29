// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Noise overlay UI: toggle, legend, and contour-membership badge.
// Spec §2: bands at 48 / 56 / 70 dB Lden, warm coral-to-red gradient
// (colour-blind-safe) with a pattern fallback, legend shows data year and
// metric per airport. Badge reads "Inside the ≥[band] dB Lden contour of
// [airport], [year]" (annual average, not live noise).
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { lookupNoiseBand } from '@vliegvuil/core';
import type { NoiseBand, NoiseContours } from '@vliegvuil/core';
import { NOISE_BAND_COLORS, NOISE_BAND_PATTERNS } from '../noiseStyle';

export interface NoiseLegendEntry {
  airport: string;
  band: NoiseBand;
  year: number;
  metric: string;
  source: string;
  license: string;
  caveat?: string;
}

/** Extract legend entries (one per airport/band/year/metric combination) */
export function buildLegendEntries(contours: NoiseContours): NoiseLegendEntry[] {
  const seen = new Set<string>();
  const entries: NoiseLegendEntry[] = [];
  for (const contour of contours.contours) {
    const key = `${contour.airport}|${contour.band}|${contour.year}|${contour.properties.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      airport: contour.airport,
      band: contour.band,
      year: contour.year,
      metric: 'Lden',
      source: contour.properties.source,
      license: contour.properties.license,
      caveat: contour.properties.caveat,
    });
  }
  return entries.sort((a, b): number =>
    a.airport.localeCompare(b.airport) || a.band - b.band,
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
 * legend listing every airport's bands with year and metric, each swatch
 * encoded in both colour (coral-to-red) and pattern (colour-independent).
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
              <li key={`${entry.airport}-${entry.band}`} className="noise-legend-item">
                <span
                  className="noise-swatch"
                  data-testid={`noise-swatch-${entry.band}`}
                  style={{
                    backgroundColor: NOISE_BAND_COLORS[entry.band],
                    backgroundImage: NOISE_BAND_PATTERNS[entry.band],
                  }}
                  aria-hidden="true"
                />
                <span className="noise-legend-label">
                  {t('noise.bandLabel', '≥{{band}} dB {{metric}}', { band: entry.band, metric: entry.metric })}
                  {' — '}
                  {entry.airport} ({entry.year})
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
 * ≥[band] dB Lden contour of [airport], [year]" with an annual-average
 * caveat (spec §2, §10: never implies live noise).
 */
export function NoiseBadge({ lat, lon, contours }: NoiseBadgeProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!contours) return null;
  const result = lookupNoiseBand({ x: lon, y: lat }, contours);
  if (!result) return null;
  return (
    <p className="noise-badge" role="status" data-testid="noise-badge">
      {t('noise.badge', 'Inside the ≥{{band}} dB Lden contour of {{airport}}, {{year}}', {
        band: result.band,
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
