// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Attribution page: sources and licences generated from sources.json
// (spec §2: "Attribution/licenses page, generated from sources.json").
// Session 22b: each dataset shows retrieval date (Intl-formatted), and a
// stale note when older than its cadence allows (text + icon, never colour).
// Compact-legend follow-up: entries are grouped per map layer, with a
// plain-language heading, years, an actual-vs-permitted note and one
// translated caveat per layer. Licences come only from sources.json.
import React from 'react';
import { useTranslation } from 'react-i18next';
import sources from '../../../sources.json';
import { ATTRIBUTION_SECTIONS, NOISE_SECTION_ID } from '../config/attributionSections';
import type { AttributionSectionConfig } from '../config/attributionSections';

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

/** Section anchor id used for deep links (e.g. the noise legend) */
export const NOISE_SECTION_ANCHOR = 'attribution-noise';

function sectionAnchor(sectionId: string): string {
  return sectionId === NOISE_SECTION_ID ? NOISE_SECTION_ANCHOR : `attribution-${sectionId}`;
}

function SourceItem({ entry, language }: { entry: SourceEntry; language: string }): React.ReactElement {
  const { t } = useTranslation();
  const stale = isStale(entry);
  return (
    <li className="attribution-item">
      <h4 className="attribution-name">
        {entry.licenseUrl ? (
          <a href={entry.licenseUrl} target="_blank" rel="noreferrer">
            {entry.name}
          </a>
        ) : (
          entry.name
        )}
      </h4>
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
}

function LayerSection({
  section,
  entries,
  language,
}: {
  section: AttributionSectionConfig;
  entries: SourceEntry[];
  language: string;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section
      id={sectionAnchor(section.id)}
      className="attribution-layer"
      aria-labelledby={`attribution-${section.id}-heading`}
    >
      <h3 className="attribution-layer-heading" id={`attribution-${section.id}-heading`}>
        {t(section.headingKey, section.headingDefault)}
      </h3>
      {section.years !== undefined && section.years.length > 0 && (
        <p className="attribution-years">
          {t('attribution.referenceYears', 'Years: {{years}}', {
            years: section.years.join(', '),
          })}
        </p>
      )}
      {section.kindNoteKey !== undefined && section.kindNoteDefault !== undefined && (
        <p className="attribution-kindnote">{t(section.kindNoteKey, section.kindNoteDefault)}</p>
      )}
      <p className="attribution-caveat">{t(section.caveatKey, section.caveatDefault)}</p>
      <ul className="attribution-list">
        {entries.map((entry): React.ReactElement => (
          <SourceItem key={entry.id} entry={entry} language={language} />
        ))}
      </ul>
    </section>
  );
}

export interface AttributionPageProps {
  sourcesFile?: SourcesFile;
  /** When set, the page scrolls the section with this id into view */
  focusSectionId?: string;
}

/**
 * Attribution page — factual listing of every data source with its licence
 * (spec §6: data licences listed; whimsy stays out of the data itself),
 * grouped per map layer for deep links from legends and badges.
 */
export function AttributionPage({
  sourcesFile,
  focusSectionId,
}: AttributionPageProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const entries = listSources(sourcesFile);
  const bySection = new Map<string, SourceEntry[]>();
  const unmapped: SourceEntry[] = [];
  for (const entry of entries) {
    const section = ATTRIBUTION_SECTIONS.find((s): boolean => s.sourceIds.includes(entry.id));
    if (section === undefined) {
      unmapped.push(entry);
      continue;
    }
    const list = bySection.get(section.id) ?? [];
    list.push(entry);
    bySection.set(section.id, list);
  }
  const checkDates = entries
    .map((entry): number => new Date(entry.checkedAt ?? 0).getTime())
    .filter((value): boolean => !Number.isNaN(value));
  const lastChecked = checkDates.length > 0 ? new Date(Math.max(...checkDates)) : null;

  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect((): void => {
    if (focusSectionId !== undefined) {
      sectionRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [focusSectionId]);

  return (
    <main id={'main'} className="about-page attribution-page" tabIndex={-1}>
      <h1>{t('attribution.title', 'Bronvermelding')}</h1>
      {ATTRIBUTION_SECTIONS.map((section): React.ReactElement | null => {
        const sectionEntries = bySection.get(section.id) ?? [];
        if (sectionEntries.length === 0) return null;
        return (
          <div
            key={section.id}
            ref={section.id === focusSectionId ? sectionRef : undefined}
          >
            <LayerSection section={section} entries={sectionEntries} language={language} />
          </div>
        );
      })}
      {unmapped.length > 0 && (
        <ul className="attribution-list">
          {unmapped.map((entry): React.ReactElement => (
            <SourceItem key={entry.id} entry={entry} language={language} />
          ))}
        </ul>
      )}
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
    </main>
  );
}

export default AttributionPage;
