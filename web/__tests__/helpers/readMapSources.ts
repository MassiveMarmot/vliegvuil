// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// The map hook's source is split across web/src/map/mapStyle.ts,
// web/src/map/mapSetup.ts and web/src/hooks/useMap.ts (session 29); source
// assertions read the concatenation in that order.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readMapSources(): string {
  return ['map/mapStyle.ts', 'map/mapSetup.ts', 'hooks/useMap.ts']
    .map((rel) => readFileSync(resolve(__dirname, '..', '..', 'src', rel), 'utf8'))
    .join('\n');
}
