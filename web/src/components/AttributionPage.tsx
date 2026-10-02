// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Attribution page: sources and licences generated from sources.json
// (spec §2: "Attribution/licenses page, generated from sources.json").
// Session 22b: each dataset shows retrieval date (Intl-formatted), and a
// stale note when older than its cadence allows (text + icon, never colour).
import React from 'react';
import { useTranslation } from 'react-i18next';
import sources from '../../../sources.json';

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  dataType: string;
  notes?: string;
  cadence?: 'monthly' | 'yearly' | 'multi-year';
  retrievedAt?: string;
  checkedAt?: string;
  referenceYear?: number;
}

export interface SourcesFile {
  sources: SourceEntry[];
}

/** Entries exposed for tests */
export function listSources(file: SourcesFile = sources as SourcesFile): SourceEntry[] {
  return file.sources;
}

/** Days after retrieval beyond which a dataset counts as stale, per cadence */
export const CADENCE_STALE_DAYS: Record<NonNullable<SourceEntry['cadence']>, number> = {
  monthly: 45,
  yearly: 400,
  'multi-year': 400,
};

export function isStale(entry: SourceEntry, now: Date = new Date()): boolean {
  if (entry.cadence === undefined || entry.retrievedAt === undefined) {
    return false;
  }
  const retrieved = new Date(entry.retrievedAt);
  if (Number.isNaN(retrieved.getTime())) {
    return false;
  }
  const ageDays = (now.getTime() - retrieved.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > CADENCE_STALE_DAYS[entry.cadence];
}

/** Locale-aware date formatting via Intl (session 22b) */
export function formatDate(isoDate: string, language: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(parsed);
}

export interface AttributionPageProps {
  onClose?: () => void;
  sourcesFile?: SourcesFile;
}

/**
 * Attribution page — factual listing of every data source with its licence
 * (spec §6: data licences listed; whimsy stays out of the data itself).
 */
export function AttributionPage({
  onClose,
  sourcesFile,
}: AttributionPageProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const entries = listSources(sourcesFile);
  const checkDates = entries
    .map((entry): number => new Date(entry.checkedAt ?? 0).getTime())
    .filter((value): boolean => !Number.isNaN(value));
  const lastChecked = checkDates.length > 0 ? new Date(Math.max(...checkDates)) : null;
  return (
    <section
      className="attribution-page"
      role="region"
      aria-label={t('attribution.title', 'Bronvermelding')}
    >
      <header className="attribution-header">
        <h2 className="attribution-title">{t('attribution.title', 'Bronvermelding')}</h2>
        {onClose && (
          <button
            type="button"
            className="attribution-close"
            onClick={onClose}
            aria-label={t('telemetry.close', 'Sluiten')}
          >
            ×
          </button>
        )}
      </header>
      <ul className="attribution-list">
        {entries.map((entry): React.ReactElement => {
          const stale = isStale(entry);
          return (
            <li key={entry.id} className="attribution-item">
              <h3 className="attribution-name">
                {entry.licenseUrl ? (
                  <a href={entry.licenseUrl} target="_blank" rel="noreferrer">
                    {entry.name}
                  </a>
                ) : (
                  entry.name
                )}
              </h3>
              <p className="attribution-dataType">{entry.dataType}</p>
              <p className="attribution-license">
                {t('attribution.license', 'Licentie')}: {entry.license}
              </p>
              {entry.retrievedAt !== undefined && (
                <p className="attribution-retrieved">
                  {t('attribution.dataAge', 'Opgehaald op {{date}}', {
                    date: formatDate(entry.retrievedAt, language),
                  })}
                </p>
              )}
              {entry.referenceYear !== undefined && (
                <p className="attribution-referenceYear">
                  {t('attribution.referenceYear', 'Referentiejaar: {{year}}', {
                    year: entry.referenceYear,
                  })}
                </p>
              )}
              {stale && entry.retrievedAt !== undefined && (
                <p className="attribution-stale">
                  <span
                    role="img"
                    aria-label={t('attribution.dataAgeStaleIcon', 'Waarschuwing: dataset is mogelijk verouderd')}
                  >
                    ⚠
                  </span>
                  {t(
                    'attribution.dataAgeStale',
                    'Nieuwere data is mogelijk beschikbaar; deze dataset is voor het laatst bijgewerkt op {{date}}.',
                    { date: formatDate(entry.retrievedAt, language) },
                  )}
                </p>
              )}
              <p className="attribution-url">
                <a href={entry.url} target="_blank" rel="noreferrer">
                  {entry.url}
                </a>
              </p>
            </li>
          );
        })}
      </ul>
      {lastChecked !== null && (
        <p className="attribution-lastchecked">
          {t('attribution.lastChecked', 'Data voor het laatst gecontroleerd op {{date}}', {
            date: formatDate(lastChecked.toISOString(), language),
          })}
        </p>
      )}
      <p className="attribution-live">
        {t('attribution.liveData', 'Live aircraft data from adsb.fi — adsb.fi open-data API, reused under its published API terms.')}
      </p>
    </section>
  );
}

export default AttributionPage;
