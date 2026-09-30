// Tests for noise contour lookup
import { describe, expect, it } from 'vitest';
import {
  lookupNoiseBand,
  getNoiseBadgeText,
} from '../../src/noise/lookup';
import {
  createSchipholNoiseContours,
  createRotterdamNoiseContours,
  createAllNoiseContours,
  createMultiPolygonTestContours,
  TEST_POINTS,
} from '../fixtures/noise/contours';
import type { Point } from '../../src/geometry/types';

describe('lookupNoiseBand', () => {
  describe('Schiphol contours', () => {
    const schipholContours = createSchipholNoiseContours();

    it('should return null for points outside all contours', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_OUTSIDE, schipholContours);
      expect(result).toBeNull();
    });

    it('should detect 70 dB contour', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_INSIDE_70DB, schipholContours);
      expect(result).toEqual({
        airport: 'Schiphol',
        bandLowerDb: 70,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should detect 56 dB contour', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_INSIDE_56DB, schipholContours);
      expect(result).toEqual({
        airport: 'Schiphol',
        bandLowerDb: 60,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should detect 48 dB contour', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_INSIDE_48DB, schipholContours);
      expect(result).toEqual({
        airport: 'Schiphol',
        bandLowerDb: 55,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should return highest band when point is in multiple contours', () => {
      // Point at Schiphol center should be in all three contours
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_CENTER, schipholContours);
      expect(result?.bandLowerDb).toBe(70); // Highest band
    });
  });

  describe('Rotterdam contours', () => {
    const rotterdamContours = createRotterdamNoiseContours();

    it('should detect 56 dB contour', () => {
      const result = lookupNoiseBand(TEST_POINTS.ROTTERDAM_INSIDE_56DB, rotterdamContours);
      expect(result).toEqual({
        airport: 'Rotterdam The Hague',
        bandLowerDb: 60,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should return null for points outside contours', () => {
      const result = lookupNoiseBand(TEST_POINTS.ROTTERDAM_OUTSIDE, rotterdamContours);
      expect(result).toBeNull();
    });
  });

  describe('All contours combined', () => {
    const allContours = createAllNoiseContours();

    it('should detect Schiphol 70 dB', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_INSIDE_70DB, allContours);
      expect(result?.airport).toBe('Schiphol');
      expect(result?.bandLowerDb).toBe(70);
    });

    it('should detect Rotterdam 56 dB', () => {
      const result = lookupNoiseBand(TEST_POINTS.ROTTERDAM_INSIDE_56DB, allContours);
      expect(result?.airport).toBe('Rotterdam The Hague');
      expect(result?.bandLowerDb).toBe(60);
    });

    it('should detect Eindhoven 48 dB', () => {
      const result = lookupNoiseBand(TEST_POINTS.EINDHOVEN_INSIDE_48DB, allContours);
      expect(result?.airport).toBe('Eindhoven');
      expect(result?.bandLowerDb).toBe(56);
    });

    it('should return null for points outside all airport contours', () => {
      const result = lookupNoiseBand({ x: 0, y: 0 }, allContours);
      expect(result).toBeNull();
    });
  });

  describe('Multi-polygon contours', () => {
    const multiContours = createMultiPolygonTestContours();

    it('should detect point inside first polygon', () => {
      const result = lookupNoiseBand(TEST_POINTS.MULTI_POLY_INSIDE_FIRST, multiContours);
      expect(result).toEqual({
        airport: 'Test Airport',
        bandLowerDb: 60,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should detect point inside second polygon', () => {
      const result = lookupNoiseBand(TEST_POINTS.MULTI_POLY_INSIDE_SECOND, multiContours);
      expect(result).toEqual({
        airport: 'Test Airport',
        bandLowerDb: 60,
        metric: 'Lden',
        kind: 'actual',
        year: 2024,
        inside: true,
      });
    });

    it('should return null for point outside both polygons', () => {
      const result = lookupNoiseBand(TEST_POINTS.MULTI_POLY_OUTSIDE, multiContours);
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty contours', () => {
      const result = lookupNoiseBand(TEST_POINTS.SCHIPHOL_CENTER, { contours: [] });
      expect(result).toBeNull();
    });

    it('should handle point on contour edge', () => {
      const schipholContours = createSchipholNoiseContours();
      // Point on the edge of the 70 dB contour
      const result = lookupNoiseBand({ x: 4.7, y: 52.28 }, schipholContours);
      // Should be detected as inside (ray casting includes edges)
      expect(result).not.toBeNull();
    });
  });
});

describe('getNoiseBadgeText', () => {
  const schipholContours = createSchipholNoiseContours();

  it('should return badge text for point inside contour', () => {
    const text = getNoiseBadgeText(TEST_POINTS.SCHIPHOL_INSIDE_70DB, schipholContours);
    expect(text).toBe('Inside the >=70 dB Lden contour of Schiphol, 2024');
  });

  it('should return badge text for 56 dB contour', () => {
    const text = getNoiseBadgeText(TEST_POINTS.SCHIPHOL_INSIDE_56DB, schipholContours);
    expect(text).toBe('Inside the >=60 dB Lden contour of Schiphol, 2024');
  });

  it('should return null for point outside contours', () => {
    const text = getNoiseBadgeText(TEST_POINTS.SCHIPHOL_OUTSIDE, schipholContours);
    expect(text).toBeNull();
  });

  it('should return highest band badge when in multiple contours', () => {
    const text = getNoiseBadgeText(TEST_POINTS.SCHIPHOL_CENTER, schipholContours);
    expect(text).toBe('Inside the >=70 dB Lden contour of Schiphol, 2024');
  });
});
