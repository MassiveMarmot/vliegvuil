// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Upstream freshness checks (session 22b).
//
// Queries metadata only (no bulk downloads) and compares against the
// state recorded in sources.json. Methods are chosen from what each
// official source actually offers (see docs/data-updates.md):
//   github        - latest commit sha of a branch (api.github.com, verified:
//                   GET /repos/wiedehopf/tar1090-db/commits/csv -> {sha, ...})
//   ckan-metadata - data.overheid.nl CKAN package_show (verified:
//                   GET https://data.overheid.nl/data/api/3/action/package_show
//                   -> result.metadata_modified)
//   http          - ETag of a raw file (verified: raw.githubusercontent.com
//                   returns a strong ETag on HEAD)
//   manual        - no machine-readable signal; reviewDueBy drives review-due
//   wfs           - accepted in the schema but not used by any current source
import { createHash } from 'node:crypto';

/** How to check a source's upstream (sources.json "upstream.method") */
export type UpstreamMethod = 'ckan-metadata' | 'http' | 'github' | 'wfs' | 'manual';

/** Expected change frequency (drives the stale note on the attribution page) */
export type Cadence = 'monthly' | 'yearly' | 'multi-year';

export interface UpstreamInfo {
  readonly method: UpstreamMethod;
  readonly url: string;
}

/** Freshness fields on a sources.json entry (session 22b) */
export interface FreshnessSource {
  readonly id: string;
  readonly cadence?: Cadence;
  readonly reviewDueBy?: string;
  readonly refresh?: 'auto' | 'manual';
  readonly retrievedAt?: string;
  readonly upstreamVersion?: string;
  readonly contentSha256?: string;
  readonly referenceYear?: number;
  readonly checkedAt?: string;
  readonly upstream?: UpstreamInfo;
}

export type SourceStatus = 'up-to-date' | 'update-available' | 'review-due' | 'check-failed';

export interface CheckOutcome {
  readonly id: string;
  readonly status: SourceStatus;
  readonly detail: string;
  readonly upstreamVersion?: string;
  readonly checkedAt: string;
}

/** Minimal response shape the checkers need; injectable for tests */
export interface FetchResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface FetcherOptions {
  readonly method?: 'GET' | 'HEAD';
}

export type Fetcher = (url: string, options?: FetcherOptions) => Promise<FetchResponse>;

/** Polite UA: project name + repo URL, no personal name or email (session 22b) */
export const USER_AGENT = 'VliegVuil-data-check/0.1 (+https://github.com/MassiveMarmot/vliegvuil)';

const TIMEOUT_MS = 15_000;

/** Real fetcher: custom UA, timeout, one retry, no parallelism (callers loop) */
export function makeFetcher(): Fetcher {
  return async (url, options): Promise<FetchResponse> => {
    const run = async (): Promise<FetchResponse> => {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key): void => {
        headers[key] = value;
      });
      return {
        status: response.status,
        headers,
        body: options?.method === 'HEAD' ? '' : await response.text(),
      };
    };
    try {
      return await run();
    } catch {
      return await run();
    }
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}

/** Check one source against its recorded state. Null when there is nothing to check. */
export async function checkSource(
  source: FreshnessSource,
  fetcher: Fetcher,
): Promise<CheckOutcome | null> {
  const upstream = source.upstream;
  if (upstream === undefined) {
    return null;
  }
  try {
    switch (upstream.method) {
      case 'manual': {
        const due = source.reviewDueBy;
        if (due !== undefined && due <= nowIso().slice(0, 10)) {
          return {
            id: source.id,
            status: 'review-due',
            detail: `manual review due since ${due}`,
            checkedAt: nowIso(),
          };
        }
        return {
          id: source.id,
          status: 'up-to-date',
          detail: due !== undefined ? `manual source, review due ${due}` : 'manual source',
          checkedAt: nowIso(),
        };
      }
      case 'github': {
        const response = await fetcher(upstream.url);
        if (response.status !== 200) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: `HTTP ${response.status} for ${upstream.url}`,
            checkedAt: nowIso(),
          };
        }
        const commit = parseJson(response.body);
        const sha = commit['sha'];
        if (typeof sha !== 'string' || sha.length === 0) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: 'no "sha" in commit response',
            checkedAt: nowIso(),
          };
        }
        return compareVersion(source, sha);
      }
      case 'ckan-metadata': {
        const response = await fetcher(upstream.url);
        if (response.status !== 200) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: `HTTP ${response.status} for ${upstream.url}`,
            checkedAt: nowIso(),
          };
        }
        const data = parseJson(response.body);
        const result = data['result'];
        if (data['success'] !== true || typeof result !== 'object' || result === null) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: 'malformed package_show response',
            checkedAt: nowIso(),
          };
        }
        const modified = (result as Record<string, unknown>)['metadata_modified'];
        if (typeof modified !== 'string' || modified.length === 0) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: 'no "metadata_modified" in package_show result',
            checkedAt: nowIso(),
          };
        }
        return compareVersion(source, modified);
      }
      case 'http': {
        const response = await fetcher(upstream.url, { method: 'HEAD' });
        if (response.status !== 200) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: `HTTP ${response.status} for ${upstream.url}`,
            checkedAt: nowIso(),
          };
        }
        const etag = response.headers['etag'] ?? '';
        if (etag.length === 0) {
          return {
            id: source.id,
            status: 'check-failed',
            detail: 'no ETag header',
            checkedAt: nowIso(),
          };
        }
        return compareVersion(source, etag);
      }
      case 'wfs': {
        return {
          id: source.id,
          status: 'check-failed',
          detail: 'wfs check not implemented; use ckan-metadata for this dataset',
          checkedAt: nowIso(),
        };
      }
      default: {
        return {
          id: source.id,
          status: 'check-failed',
          detail: `unknown upstream method ${String(upstream.method)}`,
          checkedAt: nowIso(),
        };
      }
    }
  } catch (error) {
    return {
      id: source.id,
      status: 'check-failed',
      detail: String(error),
      checkedAt: nowIso(),
    };
  }
}

function compareVersion(source: FreshnessSource, version: string): CheckOutcome {
  const recorded = source.upstreamVersion;
  if (recorded === version) {
    return {
      id: source.id,
      status: 'up-to-date',
      detail: `upstream version ${version}`,
      upstreamVersion: version,
      checkedAt: nowIso(),
    };
  }
  return {
    id: source.id,
    status: 'update-available',
    detail: `upstream ${version} != recorded ${recorded ?? '(none)'}`,
    upstreamVersion: version,
    checkedAt: nowIso(),
  };
}

/** Check all sources with an upstream block, sequentially (no host hammering) */
export async function checkAllSources(
  sources: readonly FreshnessSource[],
  fetcher: Fetcher,
): Promise<CheckOutcome[]> {
  const outcomes: CheckOutcome[] = [];
  for (const source of sources) {
    const outcome = await checkSource(source, fetcher);
    if (outcome !== null) {
      outcomes.push(outcome);
    }
  }
  return outcomes;
}

/** SHA-256 of file content (recorded state for refresh comparisons) */
export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Written to data-build/status/data-status.json by the check command */
export interface DataStatusFile {
  readonly checkedAt: string;
  readonly results: readonly CheckOutcome[];
}
