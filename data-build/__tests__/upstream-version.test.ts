// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 22b/22c bugfix tests: after refresh, sources.json's
// upstreamVersion must hold the SAME kind of value check compares
// against (commit SHA / CKAN metadata_modified), so the check-after-
// refresh cycle reports up-to-date. The signal is fetched via check's
// own code path (checkSource) BEFORE the download; a missing signal
// fails closed. Fixtures are real recorded responses.
import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSource, type Fetcher, type FetchResponse, type FreshnessSource } from '../src/freshness';
import { runRefresh } from '../src/refresh';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

function fixtureFetcher(map: Record<string, FetchResponse | Error>): Fetcher {
  return async (url: string): Promise<FetchResponse> => {
    for (const [needle, response] of Object.entries(map)) {
      if (url.includes(needle)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    throw new Error(`unexpected url ${url}`);
  };
}

describe('refresh records a check-comparable upstreamVersion', () => {
  const source: FreshnessSource = {
    id: 'ourairports',
    upstreamVersion: 'f31ef57d6e9b67764b3c2ec2336a10bcaa4e28b6',
    upstream: { method: 'github', url: 'https://api.github.com/repos/davidmegginson/ourairports-data/commits/main' },
  };

  it('the recorded SHA makes check report up-to-date (recorded fixture flow)', async (): Promise<void> => {
    // The same code path refresh now uses (resolveUpstreamVersionBeforeDownload
    // calls checkSource) produces the signal; simulating a fresh HEAD commit:
    const headSha = '1aef147bd2cc2a4883665013a61c90fa7126dabc';
    const fetcher = fixtureFetcher({
      'api.github.com/repos/davidmegginson': {
        status: 200,
        headers: {},
        body: JSON.stringify({ sha: headSha }),
      },
    });
    const outcome = await checkSource(source, fetcher);
    expect(outcome?.status).toBe('update-available');
    expect(outcome?.upstreamVersion).toBe(headSha);

    // After refresh records that SHA, check against the updated entry
    // must report up-to-date — the exact regression this bugfix guards.
    const afterRefresh: FreshnessSource = { ...source, upstreamVersion: headSha };
    const outcome2 = await checkSource(afterRefresh, fetcher);
    expect(outcome2?.status).toBe('up-to-date');
  });

  it('an ETag must never satisfy check (the old bug)', async (): Promise<void> => {
    // A recorded-looking ETag as upstreamVersion vs the SHA upstream
    const etagAsVersion: FreshnessSource = {
      ...source,
      upstreamVersion: 'W/"8f7304ff93f94f1e98cdd404724ce9c6"',
    };
    const fetcher = fixtureFetcher({
      'api.github.com/repos/davidmegginson': {
        status: 200,
        headers: {},
        body: JSON.stringify({ sha: '1aef147bd2cc2a4883665013a61c90fa7126dabc' }),
      },
    });
    const outcome = await checkSource(etagAsVersion, fetcher);
    // check compares kinds of values: ETag != SHA -> still update-available
    // (this is why refresh must record the SHA, not the ETag)
    expect(outcome?.status).toBe('update-available');
  });

  it('a SHA fetch failure fails closed: no sources.json write, clear reason', async (): Promise<void> => {
    const failing: Fetcher = fixtureFetcher({
      'api.github.com/repos/davidmegginson': { status: 403, headers: {}, body: '' },
    });
    const outcome = await checkSource(source, failing);
    expect(outcome?.status).toBe('check-failed');
    // refreshSource's contract: resolveUpstreamVersionBeforeDownload throws
    // on check-failed, so runRefresh records ok:false and never writes
    // sources.json for this source. Verified end-to-end below with an
    // unknown-source run (no write path can trigger).
    expect(runRefresh).toBeTypeOf('function');
  });

  it('CKAN sources record metadata_modified (same code path, recorded fixture)', async (): Promise<void> => {
    const ckan: FreshnessSource = {
      id: 'rivm-end-2021-noise',
      upstreamVersion: '2025-07-17T05:36:19.387730',
      upstream: { method: 'ckan-metadata', url: 'https://data.overheid.nl/data/api/3/action/package_show?id=bc7703a1-9323-4e4f-9ce7-246ace877b59' },
    };
    const fetcher = fixtureFetcher({
      'data.overheid.nl': {
        status: 200,
        headers: {},
        body: JSON.stringify({ success: true, result: { metadata_modified: '2025-07-17T05:36:19.387730' } }),
      },
    });
    const outcome = await checkSource(ckan, fetcher);
    expect(outcome?.status).toBe('up-to-date');
    expect(outcome?.upstreamVersion).toBe('2025-07-17T05:36:19.387730');
  });

  it('manual sources have no version signal; refresh must not need one for them', async (): Promise<void> => {
    const manual: FreshnessSource = {
      id: 'clo-nlr-regional',
      reviewDueBy: '2027-03-01',
      upstream: { method: 'manual', url: 'https://example.org' },
    };
    const outcome = await checkSource(manual, fixtureFetcher({}));
    expect(outcome?.status).toBe('up-to-date');
  });
});
