// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 22b: attribution page data-age display — retrieval date,
// stale note when older than cadence allows (text + icon), NL and EN.
// The i18n test mock passes the NL fallback strings through, so the
// stale note text matches the nl.json wording.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  AttributionPage,
  formatDate,
  isStale,
  type SourceEntry,
  type SourcesFile,
} from '../src/components/AttributionPage';

const baseEntry: SourceEntry = {
  id: 'test-source',
  name: 'Test Source',
  url: 'https://example.com',
  license: 'CC0-1.0',
  licenseUrl: 'https://example.com/license',
  dataType: 'Test data',
  cadence: 'monthly',
};

const staleFile: SourcesFile = {
  sources: [
    { ...baseEntry, retrievedAt: '2026-01-01', referenceYear: 2021, checkedAt: '2026-01-02T00:00:00.000Z' },
  ],
};

const freshFile: SourcesFile = {
  sources: [{ ...baseEntry, retrievedAt: '2026-10-01' }],
};

describe('isStale', (): void => {
  const now = new Date('2026-10-08T00:00:00.000Z');
  it('flags a monthly dataset retrieved long ago', (): void => {
    expect(isStale(staleFile.sources[0] as SourceEntry, now)).toBe(true);
  });
  it('does not flag a fresh dataset', (): void => {
    expect(isStale(freshFile.sources[0] as SourceEntry, now)).toBe(false);
  });
  it('does not flag entries without cadence or retrievedAt', (): void => {
    expect(isStale({ ...baseEntry, cadence: undefined }, now)).toBe(false);
    expect(isStale({ ...baseEntry, retrievedAt: undefined }, now)).toBe(false);
  });
});

describe('formatDate', (): void => {
  it('formats an ISO date per language via Intl', (): void => {
    const nl = formatDate('2026-09-30', 'nl');
    const en = formatDate('2026-09-30', 'en');
    expect(nl).not.toContain('2026-09-30');
    expect(en).not.toContain('2026-09-30');
    expect(nl).not.toBe(en);
    expect(nl).toContain('2026');
    expect(en).toContain('2026');
  });
  it('returns the input when it is not a date', (): void => {
    expect(formatDate('not-a-date', 'nl')).toBe('not-a-date');
  });
});

describe('AttributionPage data-age display', (): void => {
  it('shows retrieval date and the NL stale note for an old dataset', (): void => {
    const { container } = render(<AttributionPage sourcesFile={staleFile} />);
    const staleNote = container.querySelector('.attribution-stale');
    expect(staleNote).not.toBeNull();
    expect(staleNote?.textContent).toContain(
      'Nieuwere data is mogelijk beschikbaar',
    );
    expect(staleNote?.textContent).toContain('laatst bijgewerkt');
    expect(staleNote?.getAttribute('class')).not.toContain('color');
    const retrieved = container.querySelector('.attribution-retrieved');
    expect(retrieved?.textContent).toContain('Opgehaald');
    expect(container.querySelector('.attribution-referenceYear')?.textContent).toContain(
      '2021',
    );
    expect(container.querySelector('.attribution-lastchecked')?.textContent).toContain(
      'gecontroleerd',
    );
  });

  it('shows no stale note when the dataset is fresh', (): void => {
    const { container } = render(<AttributionPage sourcesFile={freshFile} />);
    expect(container.querySelector('.attribution-stale')).toBeNull();
    expect(container.querySelector('.attribution-retrieved')?.textContent).toContain(
      'Opgehaald',
    );
  });

  it('renders the stale icon with a text alternative', (): void => {
    const { container } = render(<AttributionPage sourcesFile={staleFile} />);
    const icon = container.querySelector('.attribution-stale [role="img"]');
    expect(icon?.getAttribute('aria-label')).toContain('Waarschuwing');
  });
});
