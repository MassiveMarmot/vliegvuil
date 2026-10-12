// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 22c CLI: read refresh-report.json, write the PR body Markdown
// to a file for `gh pr create --body-file`. Also validates the artifact
// path list (first argument, one path per line, with sizes) against the
// allowlist, so the open-pr job cannot be tricked into committing
// unexpected files.
//
// Usage: tsx src/pr-body.ts <report.json> <out.md> [artifact-manifest]
import { readFile, writeFile } from 'node:fs/promises';
import { buildPrBody, validateArtifact, type RefreshReport } from './bodies';

export async function main(): Promise<number> {
  const [inPath, outPath, manifestPath] = process.argv.slice(2);
  if (inPath === undefined || outPath === undefined) {
    process.stderr.write('usage: pr-body.ts <report.json> <out.md> [manifest]\n');
    return 1;
  }
  const report = JSON.parse(await readFile(inPath, 'utf8')) as RefreshReport;
  if (manifestPath !== undefined) {
    const manifest = await readFile(manifestPath, 'utf8');
    const paths: string[] = [];
    const sizes: number[] = [];
    for (const line of manifest.split('\n')) {
      if (line.trim().length === 0) continue;
      const sep = line.lastIndexOf(' ');
      if (sep === -1) {
        process.stderr.write(`malformed manifest line: ${line}\n`);
        return 1;
      }
      paths.push(line.slice(0, sep));
      sizes.push(Number(line.slice(sep + 1)));
    }
    const error = validateArtifact(paths, sizes);
    if (error !== undefined) {
      process.stderr.write(`artifact validation failed: ${error}\n`);
      return 1;
    }
    process.stdout.write(`artifact manifest validated (${String(paths.length)} paths)\n`);
  }
  await writeFile(outPath, `${buildPrBody(report)}\n`);
  process.stdout.write(`wrote ${outPath}\n`);
  return 0;
}

if (process.argv[1]?.endsWith('pr-body.ts') === true) {
  main()
    .then((code): void => {
      process.exit(code);
    })
    .catch((error: unknown): void => {
      process.stderr.write(`pr-body failed: ${String(error)}\n`);
      process.exit(1);
    });
}
