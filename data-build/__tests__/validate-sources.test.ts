// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest';
import { validateSources, validateSourcesFile } from '../src/validate-sources';

const validEntry = {
  id: 'test',
  name: 'Test Source',
  url: 'https://example.com',
  license: 'CC-BY 4.0',
  licenseUrl: 'https://example.com/license',
  dataType: 'Test data',
  updateFrequency: 'n/a',
  lastUpdated: '2026-09-29',
};

describe('validateSources', (): void => {
  it('accepts a valid file', (): void => {
    const result = validateSources({ sources: [validEntry] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts the real sources.json from the repo root', (): void => {
    const result = validateSourcesFile('../sources.json');
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('fails on a bad entry: missing licence, bad date, TODO licence', (): void => {
    const result = validateSources({
      sources: [
        {
          ...validEntry,
          license: 'TODO: verify',
          licenseUrl: '',
          lastUpdated: '29-09-2026',
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e): boolean => e.includes('TODO'))).toBe(true);
    expect(result.errors.some((e): boolean => e.includes('lastUpdated'))).toBe(true);
  });

  it('fails on a non-URL url', (): void => {
    const result = validateSources({
      sources: [{ ...validEntry, url: 'not-a-url' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e): boolean => e.includes('"url" is not an HTTP(S) URL'))).toBe(true);
  });

  it('fails on duplicate ids', (): void => {
    const result = validateSources({ sources: [validEntry, { ...validEntry }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e): boolean => e.includes('duplicate id'))).toBe(true);
  });

  it('fails when the root is not an object or sources is not an array', (): void => {
    expect(validateSources(null).valid).toBe(false);
    expect(validateSources({ sources: 'nope' }).valid).toBe(false);
    expect(validateSources({ sources: [] }).valid).toBe(false);
  });

  it('fails on unreadable or unparseable files', (): void => {
    const result = validateSourcesFile('/nonexistent/sources.json');
    expect(result.valid).toBe(false);
  });
});
