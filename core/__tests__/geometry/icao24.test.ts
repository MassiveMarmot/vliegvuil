// Tests for ICAO24 country lookup
import { describe, expect, it } from 'vitest';
import {
  getCountryFromICAO24,
  isNetherlandsICAO24,
  getRangesForCountry,
  isCountryICAO24,
  getAllCountryCodes,
} from '../../src/geometry/icao24';

describe('getCountryFromICAO24', () => {
  describe('Netherlands', () => {
    it('should identify Netherlands ICAO24 addresses at start of range', () => {
      expect(getCountryFromICAO24('484000')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should identify Netherlands ICAO24 addresses in middle of range', () => {
      expect(getCountryFromICAO24('484001')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
      expect(getCountryFromICAO24('485000')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should identify Netherlands ICAO24 addresses at end of range', () => {
      expect(getCountryFromICAO24('487777')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });
  });

  describe('Belgium', () => {
    it('should identify Belgium ICAO24 addresses', () => {
      expect(getCountryFromICAO24('488000')).toEqual({ country: 'Belgium', countryCode: 'BE' });
      expect(getCountryFromICAO24('488500')).toEqual({ country: 'Belgium', countryCode: 'BE' });
      expect(getCountryFromICAO24('488777')).toEqual({ country: 'Belgium', countryCode: 'BE' });
    });

    it('should identify Luxembourg ICAO24 addresses', () => {
      expect(getCountryFromICAO24('488800')).toEqual({ country: 'Luxembourg', countryCode: 'LU' });
      expect(getCountryFromICAO24('488FFF')).toEqual({ country: 'Luxembourg', countryCode: 'LU' });
    });
  });

  describe('Germany', () => {
    it('should identify Germany ICAO24 addresses in 3C range', () => {
      expect(getCountryFromICAO24('3C0000')).toEqual({ country: 'Germany', countryCode: 'DE' });
      expect(getCountryFromICAO24('3C7777')).toEqual({ country: 'Germany', countryCode: 'DE' });
      expect(getCountryFromICAO24('3CFFFF')).toEqual({ country: 'Germany', countryCode: 'DE' });
    });

    it('should identify Germany ICAO24 addresses in 3D range', () => {
      expect(getCountryFromICAO24('3D0000')).toEqual({ country: 'Germany', countryCode: 'DE' });
      expect(getCountryFromICAO24('3DFFFF')).toEqual({ country: 'Germany', countryCode: 'DE' });
    });
  });

  describe('France', () => {
    it('should identify France ICAO24 addresses', () => {
      expect(getCountryFromICAO24('390000')).toEqual({ country: 'France', countryCode: 'FR' });
      expect(getCountryFromICAO24('397777')).toEqual({ country: 'France', countryCode: 'FR' });
      expect(getCountryFromICAO24('398000')).toEqual({ country: 'France', countryCode: 'FR' });
    });
  });

  describe('United Kingdom', () => {
    it('should identify UK ICAO24 addresses', () => {
      expect(getCountryFromICAO24('400000')).toEqual({ country: 'United Kingdom', countryCode: 'GB' });
      expect(getCountryFromICAO24('405000')).toEqual({ country: 'United Kingdom', countryCode: 'GB' });
      expect(getCountryFromICAO24('407777')).toEqual({ country: 'United Kingdom', countryCode: 'GB' });
    });

    it('should identify Ireland ICAO24 addresses', () => {
      expect(getCountryFromICAO24('408000')).toEqual({ country: 'Ireland', countryCode: 'IE' });
      expect(getCountryFromICAO24('408777')).toEqual({ country: 'Ireland', countryCode: 'IE' });
    });
  });

  describe('Scandinavia', () => {
    it('should identify Denmark ICAO24 addresses', () => {
      expect(getCountryFromICAO24('440000')).toEqual({ country: 'Denmark', countryCode: 'DK' });
      expect(getCountryFromICAO24('447777')).toEqual({ country: 'Denmark', countryCode: 'DK' });
    });

    it('should identify Sweden ICAO24 addresses', () => {
      expect(getCountryFromICAO24('448000')).toEqual({ country: 'Sweden', countryCode: 'SE' });
      expect(getCountryFromICAO24('44FFFF')).toEqual({ country: 'Sweden', countryCode: 'SE' });
    });

    it('should identify Norway ICAO24 addresses', () => {
      expect(getCountryFromICAO24('450000')).toEqual({ country: 'Norway', countryCode: 'NO' });
      expect(getCountryFromICAO24('457777')).toEqual({ country: 'Norway', countryCode: 'NO' });
    });

    it('should identify Finland ICAO24 addresses', () => {
      expect(getCountryFromICAO24('458000')).toEqual({ country: 'Finland', countryCode: 'FI' });
      expect(getCountryFromICAO24('45FFFF')).toEqual({ country: 'Finland', countryCode: 'FI' });
    });
  });

  describe('Poland', () => {
    it('should identify Poland ICAO24 addresses', () => {
      expect(getCountryFromICAO24('480000')).toEqual({ country: 'Poland', countryCode: 'PL' });
      expect(getCountryFromICAO24('483777')).toEqual({ country: 'Poland', countryCode: 'PL' });
    });
  });

  describe('Switzerland and Austria', () => {
    it('should identify Switzerland ICAO24 addresses', () => {
      expect(getCountryFromICAO24('4B0000')).toEqual({ country: 'Switzerland', countryCode: 'CH' });
      expect(getCountryFromICAO24('4BFFFF')).toEqual({ country: 'Switzerland', countryCode: 'CH' });
    });

    it('should identify Austria ICAO24 addresses', () => {
      expect(getCountryFromICAO24('4C0000')).toEqual({ country: 'Austria', countryCode: 'AT' });
      expect(getCountryFromICAO24('4CFFFF')).toEqual({ country: 'Austria', countryCode: 'AT' });
    });

    it('should identify Czech Republic ICAO24 addresses', () => {
      expect(getCountryFromICAO24('4CA000')).toEqual({ country: 'Czech Republic', countryCode: 'CZ' });
      expect(getCountryFromICAO24('4CA777')).toEqual({ country: 'Czech Republic', countryCode: 'CZ' });
    });
  });

  describe('Southern Europe', () => {
    it('should identify Spain ICAO24 addresses', () => {
      expect(getCountryFromICAO24('340000')).toEqual({ country: 'Spain', countryCode: 'ES' });
      expect(getCountryFromICAO24('347777')).toEqual({ country: 'Spain', countryCode: 'ES' });
      expect(getCountryFromICAO24('348000')).toEqual({ country: 'Spain', countryCode: 'ES' });
    });

    it('should identify Portugal ICAO24 addresses', () => {
      expect(getCountryFromICAO24('444000')).toEqual({ country: 'Portugal', countryCode: 'PT' });
      expect(getCountryFromICAO24('444777')).toEqual({ country: 'Portugal', countryCode: 'PT' });
    });

    it('should identify Italy ICAO24 addresses', () => {
      expect(getCountryFromICAO24('344000')).toEqual({ country: 'Italy', countryCode: 'IT' });
      expect(getCountryFromICAO24('344777')).toEqual({ country: 'Italy', countryCode: 'IT' });
      expect(getCountryFromICAO24('345000')).toEqual({ country: 'Italy', countryCode: 'IT' });
      expect(getCountryFromICAO24('345777')).toEqual({ country: 'Italy', countryCode: 'IT' });
    });
  });

  describe('Russia', () => {
    it('should identify Russia ICAO24 addresses', () => {
      expect(getCountryFromICAO24('100000')).toEqual({ country: 'Russia', countryCode: 'RU' });
      expect(getCountryFromICAO24('177777')).toEqual({ country: 'Russia', countryCode: 'RU' });
    });
  });

  describe('Special ranges', () => {
    it('should identify NATO Military range', () => {
      expect(getCountryFromICAO24('300000')).toEqual({ country: 'NATO Military', countryCode: 'XX' });
      expect(getCountryFromICAO24('307777')).toEqual({ country: 'NATO Military', countryCode: 'XX' });
    });

    it('should identify reserved addresses', () => {
      expect(getCountryFromICAO24('000000')).toEqual({ country: 'Reserved', countryCode: 'XX' });
      expect(getCountryFromICAO24('FFFFFF')).toEqual({ country: 'Reserved', countryCode: 'XX' });
    });
  });

  describe('Invalid inputs', () => {
    it('should return null for empty string', () => {
      expect(getCountryFromICAO24('')).toBeNull();
    });

    it('should return null for null', () => {
      expect(getCountryFromICAO24(null as unknown as string)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(getCountryFromICAO24(undefined as unknown as string)).toBeNull();
    });

    it('should return null for short hex strings', () => {
      expect(getCountryFromICAO24('484')).toBeNull();
      expect(getCountryFromICAO24('48400')).toBeNull();
    });

    it('should return null for unknown ranges', () => {
      expect(getCountryFromICAO24('999999')).toBeNull();
      // 123456 hex falls within Russia range (100000-177777), so use 800000 instead
      expect(getCountryFromICAO24('800000')).toBeNull();
    });
  });

  describe('Case handling', () => {
    it('should handle lowercase hex', () => {
      expect(getCountryFromICAO24('484001')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
      expect(getCountryFromICAO24('484001'.toLowerCase())).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should handle mixed case hex', () => {
      expect(getCountryFromICAO24('484aBc')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
      expect(getCountryFromICAO24('484AbC')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });
  });

  describe('Non-hex character handling', () => {
    it('should strip non-hex characters from start', () => {
      // XX is not a valid hex prefix, so the cleaned result starts with 484001
      expect(getCountryFromICAO24('XX484001')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should strip non-hex characters from end', () => {
      expect(getCountryFromICAO24('484001XX')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should strip non-hex characters from both ends', () => {
      expect(getCountryFromICAO24('XX484001YY')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should handle hex with spaces', () => {
      expect(getCountryFromICAO24('48 40 01')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });

    it('should handle hex with hyphens', () => {
      expect(getCountryFromICAO24('48-40-01')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    });
  });
});

describe('isNetherlandsICAO24', () => {
  it('should return true for Netherlands ICAO24', () => {
    expect(isNetherlandsICAO24('484000')).toBe(true);
    expect(isNetherlandsICAO24('484001')).toBe(true);
    expect(isNetherlandsICAO24('487777')).toBe(true);
  });

  it('should return false for non-Netherlands ICAO24', () => {
    expect(isNetherlandsICAO24('488000')).toBe(false); // Belgium
    expect(isNetherlandsICAO24('3C0000')).toBe(false); // Germany
    expect(isNetherlandsICAO24('390000')).toBe(false); // France
    expect(isNetherlandsICAO24('400000')).toBe(false); // UK
  });

  it('should return false for unknown ICAO24', () => {
    expect(isNetherlandsICAO24('000000')).toBe(false);
    expect(isNetherlandsICAO24('999999')).toBe(false);
  });
});

describe('getRangesForCountry', () => {
  it('should return all ranges for Netherlands', () => {
    const ranges = getRangesForCountry('NL');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].country).toBe('Netherlands');
    expect(ranges[0].start).toBe('484000');
    expect(ranges[0].end).toBe('487777');
  });

  it('should return all ranges for Germany', () => {
    const ranges = getRangesForCountry('DE');
    expect(ranges).toHaveLength(2);
    expect(ranges.every(r => r.country === 'Germany')).toBe(true);
  });

  it('should return empty array for unknown country code', () => {
    const ranges = getRangesForCountry('ZZ');
    expect(ranges).toHaveLength(0);
  });

  it('should handle case-insensitive country code', () => {
    const ranges = getRangesForCountry('nl');
    expect(ranges).toHaveLength(1);
  });
});

describe('isCountryICAO24', () => {
  it('should return true for matching country', () => {
    expect(isCountryICAO24('484001', 'NL')).toBe(true);
    expect(isCountryICAO24('3C0001', 'DE')).toBe(true);
    expect(isCountryICAO24('390001', 'FR')).toBe(true);
  });

  it('should return false for non-matching country', () => {
    expect(isCountryICAO24('484001', 'DE')).toBe(false);
    expect(isCountryICAO24('3C0001', 'NL')).toBe(false);
  });

  it('should handle case-insensitive country code', () => {
    expect(isCountryICAO24('484001', 'nl')).toBe(true);
    expect(isCountryICAO24('484001', 'NL')).toBe(true);
  });
});

describe('getAllCountryCodes', () => {
  it('should return array of country codes', () => {
    const codes = getAllCountryCodes();
    expect(codes).toBeInstanceOf(Array);
    expect(codes.length).toBeGreaterThan(0);
  });

  it('should return sorted country codes', () => {
    const codes = getAllCountryCodes();
    expect(codes).toEqual([...codes].sort());
  });

  it('should include known country codes', () => {
    const codes = getAllCountryCodes();
    expect(codes).toContain('NL');
    expect(codes).toContain('BE');
    expect(codes).toContain('DE');
    expect(codes).toContain('FR');
    expect(codes).toContain('GB');
  });

  it('should not have duplicates', () => {
    const codes = getAllCountryCodes();
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});
