// Attribution page: sources and licences generated from sources.json
// (spec §2: "Attribution/licenses page, generated from sources.json").
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
}

export interface SourcesFile {
  sources: SourceEntry[];
}

/** Entries exposed for tests */
export function listSources(file: SourcesFile = sources as SourcesFile): SourceEntry[] {
  return file.sources;
}

export interface AttributionPageProps {
  onClose?: () => void;
}

/**
 * Attribution page — factual listing of every data source with its licence
 * (spec §6: data licences listed; whimsy stays out of the data itself).
 */
export function AttributionPage({ onClose }: AttributionPageProps): React.ReactElement {
  const { t } = useTranslation();
  const entries = listSources();
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
        {entries.map((entry): React.ReactElement => (
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
            <p className="attribution-url">
              <a href={entry.url} target="_blank" rel="noreferrer">
                {entry.url}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AttributionPage;
