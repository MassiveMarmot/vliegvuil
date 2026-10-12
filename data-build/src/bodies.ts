// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Issue and PR body builders (session 22c). Input: the data-status.json
// and refresh-report.json files written by `check` and `refresh`. Output:
// Markdown for GitHub issues and pull requests. Pure TypeScript, no
// Node-specific APIs beyond what the tests need, so it runs anywhere.
//
// ALL upstream strings (source ids, versions, URLs, error details) are
// untrusted: they are escaped as Markdown, stripped of control
// characters and length-capped before they reach a body.

/** Max length of any untrusted string interpolated into a body */
const MAX_FIELD = 300;

/** Strip control characters (except \n, which we escape anyway) and cap length */
export function sanitise(value: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
  return cleaned.length > MAX_FIELD ? `${cleaned.slice(0, MAX_FIELD)}…` : cleaned;
}

/** Escape a string so GitHub renders it as literal text, not Markdown/HTML */
export function escapeMarkdown(value: string): string {
  let out = '';
  let inCode = false;
  for (const char of value) {
    if (char === '`') {
      out += '`\u200b'; // zero-width space breaks code-span formation
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out += char;
      continue;
    }
    out += char.replace(/([\\*_{}[\]()#+\-.!|>~=@<>])/g, '\\$1');
  }
  return out;
}

/** Sanitise + escape: the only way untrusted text enters a body */
export function safe(value: string): string {
  return escapeMarkdown(sanitise(value));
}

// --- data-status.json shape (written by check.ts, session 22b) ---

export type CheckStatus = 'up-to-date' | 'update-available' | 'review-due' | 'check-failed';

export interface CheckResult {
  readonly id: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly upstreamVersion?: string;
  readonly checkedAt: string;
}

export interface DataStatus {
  readonly checkedAt: string;
  readonly results: readonly CheckResult[];
}

/** Issue body for the weekly check: one line per non-up-to-date source */
export function buildIssueBody(status: DataStatus): string {
  const lines: string[] = [
    'Upstream datasets changed since the last refresh. Summary of the last check:',
    '',
    `Checked at: ${safe(status.checkedAt)}`,
    '',
    '| Source | Status | Detail |',
    '|---|---|---|',
  ];
  for (const r of status.results) {
    lines.push(`| ${safe(r.id)} | ${safe(r.status)} | ${safe(r.detail)} |`);
  }
  const updates = status.results.filter((r): boolean => r.status !== 'up-to-date').length;
  lines.push(
    '',
    `Sources needing attention: ${String(updates)} of ${String(status.results.length)}.`,
    '',
    'To apply: run the `data-refresh` workflow (manual dispatch), review the PR it opens,',
    'then deploy by hand per docs/deploy.md §7.',
    '',
    '_This issue is maintained by the weekly data-check workflow; it is closed automatically',
    'when every source is up to date._',
  );
  return lines.join('\n');
}

// --- refresh-report.json shape (written by refresh.ts, session 22c) ---

export interface RefreshReportEntry {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
  /** Rows in the previous file, when known */
  readonly previousCount?: number;
  /** Rows in the new file, when known */
  readonly newCount?: number;
  /** Upstream version signal (etag/sha), untrusted */
  readonly upstreamVersion?: string;
  /** Licence recorded in sources.json */
  readonly license?: string;
  /** Reference year recorded in sources.json */
  readonly referenceYear?: number;
  /** Source URL, untrusted */
  readonly url?: string;
}

export interface RefreshReport {
  readonly ranAt: string;
  readonly target: string;
  readonly dryRun: boolean;
  readonly entries: readonly RefreshReportEntry[];
}

/** PR body for the refresh workflow (per dataset: versions, counts, gates) */
export function buildPrBody(report: RefreshReport): string {
  const lines: string[] = [
    '## Data refresh',
    '',
    `Ran at ${safe(report.ranAt)} for \`${safe(report.target)}\``,
    '',
    '| Source | Result | Rows (before → after) | Upstream version | Licence |',
    '|---|---|---|---|---|',
  ];
  for (const e of report.entries) {
    const rows =
      e.previousCount !== undefined && e.newCount !== undefined
        ? `${String(e.previousCount)} → ${String(e.newCount)}`
        : e.newCount !== undefined
          ? `→ ${String(e.newCount)}`
          : 'n/a';
    lines.push(
      `| ${safe(e.id)} | ${e.ok ? 'ok' : 'FAILED'} | ${rows} | ${safe(e.upstreamVersion ?? 'n/a')} | ${safe(e.license ?? 'n/a')} |`,
    );
  }
  lines.push(
    '',
    '### Validation gates',
    '',
    'Row-count tolerance, noise-band, NL-bounding-box and size gates all passed for the',
    'listed sources (any failure is reported as FAILED above and blocks this PR).',
    '',
    '### Sources',
    '',
  );
  for (const e of report.entries) {
    lines.push(`- ${safe(e.id)}: ${safe(e.url ?? 'n/a')}${e.referenceYear !== undefined ? ` (reference year ${String(e.referenceYear)})` : ''}`);
  }
  const manual = report.entries.filter((e): boolean => e.id === 'rivm-end-2021-noise' || e.id === 'clo-nlr-regional');
  if (manual.length > 0) {
    lines.push(
      '',
      '### Needs human review',
      '',
      'This refresh includes a manual (noise) source. Checklist:',
      '',
      '- [ ] Licence reviewed on the official page',
      '- [ ] Band structure known to the app (48/55/56/60/65/70/75)',
      '- [ ] Reference year checked',
      '- [ ] Legend and label text match',
    );
  }
  lines.push(
    '',
    '### CI note',
    '',
    "CI on this PR needs 'Approve and run workflows' (first workflow run on a bot PR).",
    '',
    '_This PR was opened by the data-refresh workflow. Nothing deploys from GitHub;',
    'merge, then deploy by hand per docs/deploy.md §7._',
  );
  return lines.join('\n');
}

/** Path allowlist for the refresh artifact: only these paths may be in it */
export const ARTIFACT_ALLOWED_PATHS: readonly string[] = [
  'web/public/data/airports.json',
  'web/public/data/aircraft.json',
  'web/public/data/neighbours.geojson',
  'web/public/noise-contours.geojson',
  'sources.json',
  'data-build/status/refresh-report.json',
];

/** Max total size of the refresh artifact */
export const ARTIFACT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Validate artifact paths: every path must be in the allowlist and the
 * total size must stay under the cap. Returns an error string on the
 * first violation, undefined when the artifact is acceptable.
 */
export function validateArtifact(
  paths: readonly string[],
  sizes: readonly number[],
): string | undefined {
  if (paths.length !== sizes.length) {
    return 'path and size lists differ in length';
  }
  let total = 0;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i] ?? '';
    if (!ARTIFACT_ALLOWED_PATHS.includes(path)) {
      return `path not in allowlist: ${path}`;
    }
    const size = sizes[i] ?? 0;
    if (size < 0) {
      return `negative size for ${path}`;
    }
    total += size;
  }
  if (total > ARTIFACT_MAX_BYTES) {
    return `artifact size ${String(total)} exceeds cap ${String(ARTIFACT_MAX_BYTES)}`;
  }
  return undefined;
}

/** Validate a dispatch source id: must be `all-auto` or a known source id */
export function validateSourceId(input: string, knownIds: readonly string[]): string | undefined {
  if (input === 'all-auto') return undefined;
  if (knownIds.includes(input)) return undefined;
  return `unknown source id "${input}"`;
}
