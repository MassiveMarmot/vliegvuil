// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// index.css is a list of @import statements (same directory); this helper
// returns the concatenated contents of those imports in order, so tests can
// assert on the full stylesheet the way they did when it was one file.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const stylesDir = resolve(__dirname, '..', '..', 'src', 'styles');

export function importedPartials(): string[] {
  const index = readFileSync(join(stylesDir, 'index.css'), 'utf8');
  const names: string[] = [];
  for (const line of index.split('\n')) {
    const m = /^@import '\.\/([^']+)';$/.exec(line.trim());
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

export function readIndexCss(): string {
  return importedPartials()
    .map((name) => readFileSync(join(stylesDir, name), 'utf8'))
    .join('');
}

export function allPartials(): string[] {
  return readdirSync(stylesDir).filter((f) => f.endsWith('.css') && f !== 'index.css');
}
