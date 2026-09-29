// Tests for noise contour types
import { describe, expect, it } from 'vitest';
import type { NoiseBand, NoiseContour, NoiseContours, NoiseLookupResult } from '../../src/noise/types';

describe('Noise types', () => {
  describe('NoiseBand type', () => {
    it('should only accept 48, 56, or 70', () => {
      const validBands: NoiseBand[] = [48, 56, 70];
      expect(validBands).toContain(48);
      expect(validBands).toContain(56);
      expect(validBands).toContain(70);
    });
  });

  describe('NoiseContour interface', () => {
    it('should have required properties', () => {
      const contour: NoiseContour = {
        airport: 'Schiphol',
        year: 2024,
        band: 48,
        geometry: {
          type: 'Polygon',
          coordinates: [[[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1]]],
        },
        properties: {
          source: 'Test',
          license: 'CC-BY-4.0',
          date: '2024-01-01',
        },
      };

      expect(contour.airport).toBe('Schiphol');
      expect(contour.year).toBe(2024);
      expect(contour.band).toBe(48);
      expect(contour.geometry.type).toBe('Polygon');
      expect(contour.properties.source).toBe('Test');
    });

    it('should accept MultiPolygon geometry', () => {
      const contour: NoiseContour = {
        airport: 'Test',
        year: 2024,
        band: 56,
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

    it('should accept multiple contours', () => {
      const contours: NoiseContours = {
        contours: [
          {
            airport: 'Schiphol',
            year: 2024,
            band: 48,
            geometry: {
              type: 'Polygon',
              coordinates: [[[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1]]],
            },
            properties: {},
          },
          {
            airport: 'Schiphol',
            year: 2024,
            band: 56,
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
        band: 48,
        year: 2024,
        inside: true,
      };

      expect(result.airport).toBe('Schiphol');
      expect(result.band).toBe(48);
      expect(result.year).toBe(2024);
      expect(result.inside).toBe(true);
    });
  });
});
