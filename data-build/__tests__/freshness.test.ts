// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Tests for the freshness check (session 22b). Fixtures are trimmed real
// responses fetched on 2026-10-08 (see data-updates.md).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSource,
  sha256,
  type Fetcher,
  type FetchResponse,
  type FreshnessSource,
} from '../src/freshness';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf8');
}

/** Fetcher that serves fixture bodies per URL substring */
function fixtureFetcher(map: Record<string, FetchResponse | Error>): Fetcher {
  return async (url: string): Promise<FetchResponse> => {
    for (const [needle, response] of Object.entries(map)) {
      if (url.includes(needle)) {
        if (response instanceof Error) {
          throw response;
        }
        return response;
      }
    }
    throw new Error(`unexpected url ${url}`);
  };
}

const GH_URL = 'https://api.github.com/repos/wiedehopf/tar1090-db/commits/csv';
const CKAN_URL =
  'https://data.overheid.nl/data/api/3/action/package_show?id=bc7703a1-9323-4e4f-9ce7-246ace877b59';

function githubSource(upstreamVersion?: string): FreshnessSource {
  return {
    id: 'tar1090-db',
    upstream: { method: 'github', url: GH_URL },
    upstreamVersion,
  };
}

describe('checkSource (github)', () => {
  it('reports up-to-date when the commit sha matches the real fixture', async (): Promise<void> => {
    const body = await readFixture('gh-commit-tar1090-csv.json');
    const outcome = await checkSource(
      githubSource('655afe27950658a4124d15d75766538b1ae9ea3b'),
      fixtureFetcher({ 'commits/csv': { status: 200, headers: {}, body } }),
    );
    expect(outcome?.status).toBe('up-to-date');
  });

  it('reports update-available when upstream has a new commit', async (): Promise<void> => {
    const body = await readFixture('gh-commit-tar1090-csv.json');
    const outcome = await checkSource(
      githubSource('0000000000000000000000000000000000000000'),
      fixtureFetcher({ 'commits/csv': { status: 200, headers: {}, body } }),
    );
    expect(outcome?.status).toBe('update-available');
    expect(outcome?.upstreamVersion).toBe('655afe27950658a4124d15d75766538b1ae9ea3b');
  });

  it('reports check-failed on HTTP 404', async (): Promise<void> => {
    const outcome = await checkSource(
      githubSource(),
      fixtureFetcher({ 'commits/csv': { status: 404, headers: {}, body: '' } }),
    );
    expect(outcome?.status).toBe('check-failed');
    expect(outcome?.detail).toContain('404');
  });

  it('reports check-failed on malformed response (no sha)', async (): Promise<void> => {
    const outcome = await checkSource(
      githubSource(),
      fixtureFetcher({ 'commits/csv': { status: 200, headers: {}, body: '{"nope":1}' } }),
    );
    expect(outcome?.status).toBe('check-failed');
  });

  it('reports check-failed on timeout (fetch throws twice)', async (): Promise<void> => {
    const outcome = await checkSource(
      githubSource(),
      fixtureFetcher({ 'commits/csv': new Error('timeout') }),
    );
    expect(outcome?.status).toBe('check-failed');
    expect(outcome?.detail).toContain('timeout');
  });
});

describe('checkSource (ckan-metadata)', () => {
  function ckanSource(upstreamVersion?: string): FreshnessSource {
    return {
      id: 'rivm-end-2021-noise',
      upstream: { method: 'ckan-metadata', url: CKAN_URL },
      upstreamVersion,
    };
  }

  it('reports up-to-date against the real CKAN fixture', async (): Promise<void> => {
    const body = await readFixture('ckan-package-show-end.json');
    const outcome = await checkSource(
      ckanSource('2025-07-17T05:36:19.387730'),
      fixtureFetcher({ 'package_show': { status: 200, headers: {}, body } }),
    );
    expect(outcome?.status).toBe('up-to-date');
  });

  it('reports update-available when metadata_modified differs', async (): Promise<void> => {
    const body = await readFixture('ckan-package-show-end.json');
    const outcome = await checkSource(
      ckanSource('2023-01-26T06:27:46.003658'),
      fixtureFetcher({ 'package_show': { status: 200, headers: {}, body } }),
    );
    expect(outcome?.status).toBe('update-available');
  });

  it('reports check-failed when package_show is not successful', async (): Promise<void> => {
    const outcome = await checkSource(
      ckanSource(),
      fixtureFetcher({ 'package_show': { status: 200, headers: {}, body: '{"success":false}' } }),
    );
    expect(outcome?.status).toBe('check-failed');
  });
});

describe('checkSource (manual)', () => {
  it('reports review-due past reviewDueBy', async (): Promise<void> => {
    const outcome = await checkSource(
      {
        id: 'clo-nlr-regional',
        upstream: { method: 'manual', url: 'https://www.clo.nl/indicatoren/nl0588' },
        reviewDueBy: '2020-01-01',
      },
      fixtureFetcher({}),
    );
    expect(outcome?.status).toBe('review-due');
  });

  it('reports up-to-date before reviewDueBy', async (): Promise<void> => {
    const outcome = await checkSource(
      {
        id: 'clo-nlr-regional',
        upstream: { method: 'manual', url: 'https://www.clo.nl/indicatoren/nl0588' },
        reviewDueBy: '2099-01-01',
      },
      fixtureFetcher({}),
    );
    expect(outcome?.status).toBe('up-to-date');
  });

  it('reports up-to-date without reviewDueBy', async (): Promise<void> => {
    const outcome = await checkSource(
      { id: 'x', upstream: { method: 'manual', url: 'https://example.com/' } },
      fixtureFetcher({}),
    );
    expect(outcome?.status).toBe('up-to-date');
  });
});

describe('checkSource (http ETag)', () => {
  const head = JSON.parse(
    readFileSync(join(FIXTURES, 'http-head-headers.json'), 'utf8'),
  ) as { 'ourairports-airports.csv': { etag: string } };
  const etag = head['ourairports-airports.csv']?.etag;

  it('reports up-to-date when the real ETag matches', async (): Promise<void> => {
    const outcome = await checkSource(
      {
        id: 'ourairports-http',
        upstream: { method: 'http', url: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv' },
        upstreamVersion: etag,
      },
      fixtureFetcher({
        'airports.csv': { status: 200, headers: { etag: etag ?? '' }, body: '' },
      }),
    );
    expect(outcome?.status).toBe('up-to-date');
  });

  it('reports update-available when the ETag differs', async (): Promise<void> => {
    const outcome = await checkSource(
      {
        id: 'ourairports-http',
        upstream: { method: 'http', url: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv' },
        upstreamVersion: '"old"',
      },
      fixtureFetcher({
        'airports.csv': { status: 200, headers: { etag: etag ?? '' }, body: '' },
      }),
    );
    expect(outcome?.status).toBe('update-available');
  });

  it('reports check-failed when no ETag is present', async (): Promise<void> => {
    const outcome = await checkSource(
      {
        id: 'ourairports-http',
        upstream: { method: 'http', url: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv' },
      },
      fixtureFetcher({ 'airports.csv': { status: 200, headers: {}, body: '' } }),
    );
    expect(outcome?.status).toBe('check-failed');
  });
});

describe('sha256', () => {
  it('produces the known digest for "abc"', (): void => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
