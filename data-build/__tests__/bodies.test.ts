// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 22c tests: issue/PR body builders with normal and hostile
// input, the artifact path allowlist, source id validation, and that the
// GITHUB_TOKEN goes only to api.github.com and is never logged.
import { describe, expect, it, vi } from 'vitest';
import {
  ARTIFACT_ALLOWED_PATHS,
  buildIssueBody,
  buildPrBody,
  escapeMarkdown,
  sanitise,
  validateArtifact,
  validateSourceId,
  type DataStatus,
  type RefreshReport,
} from '../src/bodies';
import { makeFetcher, USER_AGENT } from '../src/freshness';

// --- sanitising ---

describe('sanitise', () => {
  it('strips control characters', (): void => {
    expect(sanitise('a\u0000b\u0007c\u007Fd')).toBe('abcd');
  });
  it('keeps newlines and tabs', (): void => {
    expect(sanitise('a\nb\tc')).toBe('a\nb\tc');
  });
  it('caps length at 300 plus ellipsis', (): void => {
    expect(sanitise('x'.repeat(400)).length).toBe(301);
  });
});

describe('escapeMarkdown', () => {
  it('escapes markdown-significant characters', (): void => {
    expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
    expect(escapeMarkdown('# heading')).toBe('\\# heading');
    expect(escapeMarkdown('a | b')).toBe('a \\| b');
  });
  it('breaks code-span and expression injection', (): void => {
    // backticks get a zero-width space so no code span can form
    expect(escapeMarkdown('```${{ secrets.GITHUB_TOKEN }}}```')).not.toContain('```');
    expect(escapeMarkdown('${{ env.SOMETHING }}')).not.toMatch(/^\$\{\{/);
  });
  it('neutralises @mentions', (): void => {
    expect(escapeMarkdown('@someone')).toBe('\\@someone');
  });
  it('neutralises HTML/script payloads textually', (): void => {
    expect(escapeMarkdown('<script>alert(1)</script>')).toBe(
      '\\<script\\>alert\\(1\\)\\</script\\>',
    );
  });
});

// --- issue body ---

describe('buildIssueBody', () => {
  const status: DataStatus = {
    checkedAt: '2026-10-12T10:00:00.000Z',
    results: [
      { id: 'tar1090-db', status: 'update-available', detail: 'upstream abc != recorded def', checkedAt: '2026-10-12T10:00:00.000Z' },
      { id: 'ourairports', status: 'up-to-date', detail: 'upstream version f31ef57', checkedAt: '2026-10-12T10:00:00.000Z' },
    ],
  };
  it('renders a table with every source', (): void => {
    const body = buildIssueBody(status);
    expect(body).toContain('| Source | Status | Detail |');
    expect(body).toContain('tar1090\\-db');
    expect(body).toContain('update\\-available');
    expect(body).toContain('Sources needing attention: 1 of 2.');
  });
  it('survives hostile input without forming markdown', (): void => {
    const hostile: DataStatus = {
      checkedAt: '2026-10-12T10:00:00.000Z',
      results: [
        {
          id: 'x`; gh api /user #',
          status: 'check-failed',
          detail: '${{ secrets.GITHUB_TOKEN }} @owner <img src=x onerror=alert(1)> ' + 'A'.repeat(500),
          checkedAt: '2026-10-12T10:00:00.000Z',
        },
      ],
    };
    const body = buildIssueBody(hostile);
    expect(body).not.toContain('${{');
    expect(body).not.toMatch(/(^|[^\\])@owner/);
    expect(body).not.toMatch(/(^|[^\\])<img/);
    expect(body).not.toContain('```');
    expect(body).toContain('…'); // length cap applied
  });
});

// --- PR body ---

describe('buildPrBody', () => {
  const report: RefreshReport = {
    ranAt: '2026-10-12T10:00:00.000Z',
    target: 'all-auto',
    dryRun: false,
    entries: [
      {
        id: 'ourairports',
        ok: true,
        detail: 'airports: 116 entries',
        previousCount: 116,
        newCount: 118,
        upstreamVersion: '"f31ef57"',
        license: 'Public Domain',
        url: 'https://ourairports.com/data/',
      },
      {
        id: 'tar1090-db',
        ok: false,
        detail: 'aircraft: row count 10 is a >50% drop from previous 10333; refusing',
        license: 'ODC-By-1.0',
        url: 'https://github.com/wiedehopf/tar1090-db',
      },
    ],
  };
  it('renders per-dataset rows with counts and versions', (): void => {
    const body = buildPrBody(report);
    expect(body).toContain('116 → 118');
    expect(body).toContain('FAILED');
    expect(body).toContain('Public Domain');
    expect(body).toContain('https://ourairports\\.com/data/');
    expect(body).toContain("needs 'Approve and run workflows'");
  });
  it('adds the human-review checklist for manual noise sources', (): void => {
    const manual: RefreshReport = {
      ...report,
      entries: [
        { id: 'rivm-end-2021-noise', ok: true, detail: 'noise: 40 contours', newCount: 40, license: 'CC0-1.0', referenceYear: 2021, url: 'https://data.overheid.nl/' },
      ],
    };
    const body = buildPrBody(manual);
    expect(body).toContain('### Needs human review');
    expect(body).toContain('- [ ] Licence reviewed on the official page');
    expect(body).toContain('reference year 2021');
  });
  it('survives hostile input', (): void => {
    const hostile: RefreshReport = {
      ranAt: '2026-10-12T10:00:00.000Z',
      target: '`rm -rf /`',
      dryRun: false,
      entries: [
        { id: 'x${{ env.X }}', ok: true, detail: '@maintainer ```', upstreamVersion: '<b>etag</b>', url: 'javascript:alert(1)' },
      ],
    };
    const body = buildPrBody(hostile);
    expect(body).not.toContain('${{');
    expect(body).not.toContain('```');
    expect(body).not.toContain('@maintainer');
    expect(body).not.toContain('<b>');
  });
});

// --- artifact allowlist ---

describe('validateArtifact', () => {
  it('accepts the allowed paths under the cap', (): void => {
    expect(
      validateArtifact(
        ['web/public/data/airports.json', 'sources.json'],
        [40_000, 20_000],
      ),
    ).toBeUndefined();
  });
  it('rejects a path outside the allowlist', (): void => {
    expect(
      validateArtifact(['web/public/data/evil.sh'], [10]),
    ).toMatch(/not in allowlist/);
  });
  it('rejects an oversize artifact', (): void => {
    expect(
      validateArtifact(['web/public/data/aircraft.json'], [30 * 1024 * 1024]),
    ).toMatch(/exceeds cap/);
  });
  it('rejects mismatched lists', (): void => {
    expect(validateArtifact(['sources.json'], [])).toMatch(/differ in length/);
  });
  it('allowlist contains exactly the workflow artifacts', (): void => {
    expect(ARTIFACT_ALLOWED_PATHS).toContain('data-build/status/refresh-report.json');
    expect(ARTIFACT_ALLOWED_PATHS).not.toContain('.github/workflows/ci.yml');
  });
});

// --- dispatch source id ---

describe('validateSourceId', () => {
  const known = ['tar1090-db', 'ourairports', 'rivm-end-2021-noise', 'clo-nlr-regional'];
  it('accepts all-auto', (): void => {
    expect(validateSourceId('all-auto', known)).toBeUndefined();
  });
  it('accepts a known id', (): void => {
    expect(validateSourceId('ourairports', known)).toBeUndefined();
  });
  it('rejects an unknown id', (): void => {
    expect(validateSourceId('evil; rm -rf', known)).toMatch(/unknown source id/);
  });
});

// --- token safety ---

describe('makeFetcher token handling', () => {
  it('sends the Authorization header only to api.github.com', async (): Promise<void> => {
    const seen = new Map<string, Record<string, string>>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init: { headers: Record<string, string> }) => {
        seen.set(url, init.headers);
        return {
          status: 200,
          headers: new Map([['etag', '"x"']]),
          text: async (): Promise<string> => '{}',
        };
      }),
    );
    const token = 'ghs:secret-token-value';
    const fetcher = makeFetcher(token);
    await fetcher('https://api.github.com/repos/x/y/commits/main');
    await fetcher('https://data.overheid.nl/data/api/3/action/package_show?id=x');
    await fetcher('https://raw.githubusercontent.com/x/y/main/z.csv', { method: 'HEAD' });

    const ghHeaders = seen.get('https://api.github.com/repos/x/y/commits/main');
    expect(ghHeaders?.['Authorization']).toBe(`Bearer ${token}`);
    expect(ghHeaders?.['User-Agent']).toBe(USER_AGENT);
    for (const other of [
      'https://data.overheid.nl/data/api/3/action/package_show?id=x',
      'https://raw.githubusercontent.com/x/y/main/z.csv',
    ]) {
      const headers = seen.get(other);
      expect(headers?.['Authorization']).toBeUndefined();
    }
    vi.unstubAllGlobals();
  });
  it('sends no Authorization header without a token', async (): Promise<void> => {
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: { headers: Record<string, string> }) => {
        seen.push(init.headers);
        return {
          status: 200,
          headers: new Map(),
          text: async (): Promise<string> => '{}',
        };
      }),
    );
    const fetcher = makeFetcher();
    await fetcher('https://api.github.com/repos/x/y/commits/main');
    expect(seen[0]?.['Authorization']).toBeUndefined();
    vi.unstubAllGlobals();
  });
  it('the token never appears in the logged output of a failed request', async (): Promise<void> => {
    const token = 'ghs:never-log-me';
    let logged = '';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      logged += String(chunk);
      return true;
    });
    const fetcher = makeFetcher(token);
    // Both retries fail; the fetcher must reject without logging headers
    await expect(fetcher('https://api.github.com/repos/x/y/commits/main')).rejects.toThrow();
    expect(logged).not.toContain(token);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
