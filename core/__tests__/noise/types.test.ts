// Tests for noise contour types
import { describe, expect, it } from 'vitest';
import type { NoiseContour, NoiseContours, NoiseLookupResult, NoiseKind } from '../../src/noise/types';

describe('Noise types', () => {
  describe('NoiseKind type', () => {
    it('should only accept actual or permitted', () => {
      const kinds: NoiseKind[] = ['actual', 'permitted'];
      expect(kinds).toContain('actual');
      expect(kinds).toContain('permitted');
    });
  });

  describe('NoiseContour interface', () => {
    it('should have required properties', () => {
      const contour: NoiseContour = {
        airport: 'Schiphol',
        year: 2021,
        bandLowerDb: 55,
        metric: 'Lden',
        kind: 'actual',
        geometry: {
          type: 'Polygon',
          coordinates: [[[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1]]],
        },
        properties: {
          source: 'Test',
          license: 'CC0-1.0',
          date: '2021-01-01',
        },
      };
      expect(contour.airport).toBe('Schiphol');
      expect(contour.year).toBe(2021);
      expect(contour.bandLowerDb).toBe(55);
      expect(contour.kind).toBe('actual');
      expect(contour.geometry.type).toBe('Polygon');
      expect(contour.properties.source).toBe('Test');
    });

    it('should accept MultiPolygon geometry', () => {
      const contour: NoiseContour = {
        airport: 'Test',
        year: 2024,
        bandLowerDb: 70,
        metric: 'Lden',
        kind: 'permitted',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1]],
            [[5.0, 52.0], [5.1, 52.0], [5.1, 52.1], [5.0, 52.1]],
          ],
        },
        properties: {},
      };
      expect(contour.geometry.type).toBe('MultiPolygon');
    });
  });

  describe('NoiseContours interface', () => {
    it('should have contours array', () => {
      const contours: NoiseContours = {
        contours: [],
      };
      expect(contours.contours).toBeInstanceOf(Array);
    });

    it('should accept multiple contours with different band sets', () => {
      const contours: NoiseContours = {
        contours: [
          {
            airport: 'Schiphol',
            year: 2021,
            bandLowerDb: 55,
            metric: 'Lden',
            kind: 'actual',
            geometry: {
              type: 'Polygon',
              coordinates: [[[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1]]],
            },
            properties: {},
          },
          {
            airport: 'Eindhoven',
            year: 2024,
            bandLowerDb: 56,
            metric: 'Lden',
            kind: 'permitted',
            geometry: {
              type: 'Polygon',
              coordinates: [[[4.05, 52.05], [4.08, 52.05], [4.08, 52.08], [4.05, 52.08]]],
            },
            properties: {},
          },
        ],
      };
      expect(contours.contours).toHaveLength(2);
    });
  });

  describe('NoiseLookupResult interface', () => {
    it('should have required properties', () => {
      const result: NoiseLookupResult = {
        airport: 'Schiphol',
        bandLowerDb: 55,
        metric: 'Lden',
        kind: 'actual',
        year: 2021,
        inside: true,
      };
      expect(result.airport).toBe('Schiphol');
      expect(result.bandLowerDb).toBe(55);
      expect(result.kind).toBe('actual');
      expect(result.year).toBe(2021);
      expect(result.inside).toBe(true);
    });
  });
});
