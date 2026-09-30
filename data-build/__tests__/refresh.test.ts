// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Validation-gate tests for refresh (session 22b): a bad refresh must
// leave old data untouched and exit non-zero.
import { describe, expect, it } from 'vitest';
import {
  KNOWN_NOISE_BANDS,
  ROW_DROP_TOLERANCE,
  validateGeometryInNl,
  validateNoiseBands,
  validateRowCount,
  validateSize,
} from '../src/refresh';
import type { NoiseContourFeature } from '../src/types';

function noiseFeature(
  bandLowerDb: number,
  coords: number[][] = [
    [4.6, 52.3],
    [5.0, 52.3],
    [5.0, 52.5],
    [4.6, 52.5],
    [4.6, 52.3],
  ],
): NoiseContourFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {
      airport: 'Schiphol',
      bandLowerDb,
      year: 2021,
      metric: 'Lden',
      kind: 'actual',
      source: 'test',
      license: 'CC0-1.0',
    },
  };
}

describe('validateRowCount', () => {
  it('passes a normal update', (): void => {
    expect(validateRowCount('aircraft', 900, 1000)).toBeUndefined();
  });
  it('passes when there is no previous version', (): void => {
    expect(validateRowCount('aircraft', 5, null)).toBeUndefined();
  });
  it('fails a sudden >50% drop', (): void => {
    const detail = validateRowCount('aircraft', 400, 1000);
    expect(detail).toContain('>50% drop');
  });
  it('tolerates exactly the boundary', (): void => {
    expect(validateRowCount('aircraft', 500, 1000)).toBeUndefined();
    expect(ROW_DROP_TOLERANCE).toBe(0.5);
  });
});

describe('validateSize', () => {
  it('fails content over the ~2 MB cap', (): void => {
    const detail = validateSize('airports.json', 'x'.repeat(2 * 1024 * 1024 + 1));
    expect(detail).toContain('cap');
  });
  it('passes content under the cap', (): void => {
    expect(validateSize('airports.json', 'x'.repeat(1024))).toBeUndefined();
  });
});

describe('validateNoiseBands', () => {
  it('accepts the known END bands', (): void => {
    const features = [55, 60, 65, 70, 75].map((b): NoiseContourFeature => noiseFeature(b));
    expect(validateNoiseBands(features)).toBeUndefined();
  });
  it('rejects an unknown band lower bound', (): void => {
    const detail = validateNoiseBands([noiseFeature(63)]);
    expect(detail).toContain('unknown band lower bound 63');
  });
  it('knows the decree bands too', (): void => {
    expect(KNOWN_NOISE_BANDS).toContain(48);
    expect(KNOWN_NOISE_BANDS).toContain(56);
  });
});

describe('validateGeometryInNl', () => {
  it('accepts a polygon inside the NL bbox', (): void => {
    expect(validateGeometryInNl(noiseFeature(55))).toBeUndefined();
  });
  it('rejects a polygon outside the NL bbox', (): void => {
    const detail = validateGeometryInNl(
      noiseFeature(55, [
        [10.6, 52.3],
        [11.0, 52.3],
        [11.0, 52.5],
        [10.6, 52.5],
        [10.6, 52.3],
      ]),
    );
    expect(detail).toContain('outside the Netherlands bounding box');
  });
  it('rejects non-numeric coordinates', (): void => {
    const detail = validateGeometryInNl(
      noiseFeature(55, [
        ['x' as unknown as number, 52.3],
        [5.0, 52.3],
        [5.0, 52.5],
        [4.6, 52.5],
        [4.6, 52.3],
      ]),
    );
    expect(detail).toContain('outside the Netherlands bounding box');
  });
});
