// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// `check` command (session 22b): query upstream metadata only, compare to
// the recorded state in sources.json, write data-build/status/data-status.json.
// Exit 0 even when updates exist; non-zero only if every source failed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAllSources,
  makeFetcher,
  type CheckOutcome,
  type DataStatusFile,
  type FreshnessSource,
} from './freshness';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SOURCES_PATH = join(REPO_ROOT, 'sources.json');
const STATUS_DIR = join(REPO_ROOT, 'data-build', 'status');
const STATUS_PATH = join(STATUS_DIR, 'data-status.json');

interface SourcesFile {
  readonly sources: readonly FreshnessSource[];
}

function printTable(outcomes: readonly CheckOutcome[]): void {
  process.stdout.write('\nid                    status              detail\n');
  for (const outcome of outcomes) {
    process.stdout.write(
      `${outcome.id.padEnd(22)}${outcome.status.padEnd(20)}${outcome.detail}\n`,
    );
  }
}

export async function runCheck(): Promise<number> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile;
  const outcomes = await checkAllSources(data.sources, makeFetcher());
  process.stdout.write(`checked ${outcomes.length} sources\n`);
  printTable(outcomes);
  const file: DataStatusFile = {
    checkedAt: new Date().toISOString(),
    results: outcomes,
  };
  await mkdir(STATUS_DIR, { recursive: true });
  await writeFile(STATUS_PATH, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`\nwrote ${STATUS_PATH}\n`);
  const failed = outcomes.filter((o): boolean => o.status === 'check-failed').length;
  if (outcomes.length > 0 && failed === outcomes.length) {
    process.stderr.write('every source failed to check\n');
    return 1;
  }
  return 0;
}

if (
  process.argv[1]?.endsWith('check.ts') === true ||
  process.argv[1]?.endsWith('check.js') === true
) {
  runCheck()
    .then((code): void => {
      process.exit(code);
    })
    .catch((error: unknown): void => {
      process.stderr.write(`check failed: ${String(error)}\n`);
      process.exit(1);
    });
}
