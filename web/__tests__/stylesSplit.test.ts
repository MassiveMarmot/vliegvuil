// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Wiring test for the index.css split: index.css must import every CSS
// partial in web/src/styles/ exactly once (in original cascade order),
// and no partial may be orphaned.
import { describe, it, expect } from 'vitest';
import { importedPartials, allPartials } from './helpers/readIndexCss';

describe('index.css partial wiring', (): void => {
  it('imports every partial in src/styles exactly once, with none orphaned', (): void => {
    const imports = importedPartials();
    const partials = allPartials();

    expect(new Set(imports).size).toBe(imports.length);
    expect(new Set(imports)).toEqual(new Set(partials));
  });
});
