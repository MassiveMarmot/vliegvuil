// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 22c CLI: read data-status.json, write the issue body Markdown
// to a file. The workflow passes the file to `gh --body-file`, so no
// untrusted string ever appears in a run: script or a command line.
//
// Usage: tsx src/issue-body.ts <status.json> <out.md>
import { readFile, writeFile } from 'node:fs/promises';
import { buildIssueBody, type DataStatus } from './bodies';

export async function main(): Promise<number> {
  const [inPath, outPath] = process.argv.slice(2);
  if (inPath === undefined || outPath === undefined) {
    process.stderr.write('usage: issue-body.ts <status.json> <out.md>\n');
    return 1;
  }
  const status = JSON.parse(await readFile(inPath, 'utf8')) as DataStatus;
  await writeFile(outPath, `${buildIssueBody(status)}\n`);
  process.stdout.write(`wrote ${outPath}\n`);
  return 0;
}

if (process.argv[1]?.endsWith('issue-body.ts') === true) {
  main()
    .then((code): void => {
      process.exit(code);
    })
    .catch((error: unknown): void => {
      process.stderr.write(`issue-body failed: ${String(error)}\n`);
      process.exit(1);
    });
}
