// Tests for ICAO24 country lookup
import { describe, expect, it } from 'vitest';
import { getCountryFromICAO24, isNetherlandsICAO24 } from '../../src/geometry/icao24';

describe('getCountryFromICAO24', () => {
  it('should identify Netherlands ICAO24 addresses', () => {
    // Netherlands range: 484000 - 487777
    expect(getCountryFromICAO24('484000')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    expect(getCountryFromICAO24('484001')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    expect(getCountryFromICAO24('487777')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    expect(getCountryFromICAO24('487776')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
  });

  it('should identify Belgium ICAO24 addresses', () => {
    // Belgium range: 488000 - 488777
    expect(getCountryFromICAO24('488000')).toEqual({ country: 'Belgium', countryCode: 'BE' });
    expect(getCountryFromICAO24('488500')).toEqual({ country: 'Belgium', countryCode: 'BE' });
  });

  it('should identify Germany ICAO24 addresses', () => {
    // Germany ranges
    expect(getCountryFromICAO24('3C0000')).toEqual({ country: 'Germany', countryCode: 'DE' });
    expect(getCountryFromICAO24('3C7777')).toEqual({ country: 'Germany', countryCode: 'DE' });
    expect(getCountryFromICAO24('3C8000')).toEqual({ country: 'Germany', countryCode: 'DE' });
  });

  it('should identify France ICAO24 addresses', () => {
    // France range: 390000 - 397777
    expect(getCountryFromICAO24('390000')).toEqual({ country: 'France', countryCode: 'FR' });
    expect(getCountryFromICAO24('395000')).toEqual({ country: 'France', countryCode: 'FR' });
  });

  it('should identify United Kingdom ICAO24 addresses', () => {
    // UK range: 400000 - 407777
    expect(getCountryFromICAO24('400000')).toEqual({ country: 'United Kingdom', countryCode: 'GB' });
    expect(getCountryFromICAO24('405000')).toEqual({ country: 'United Kingdom', countryCode: 'GB' });
  });

  it('should return null for unknown ICAO24 addresses', () => {
    expect(getCountryFromICAO24('000000')).toBeNull();
    expect(getCountryFromICAO24('999999')).toBeNull();
    expect(getCountryFromICAO24('123456')).toBeNull();
  });

  it('should handle lowercase ICAO24 addresses', () => {
    expect(getCountryFromICAO24('484001')).toEqual({ country: 'Netherlands', countryCode: 'NL' });
    expect(getCountryFromICAO24('484001'.toLowerCase())).toEqual({ country: 'Netherlands', countryCode: 'NL' });
  });

  it('should return null for short ICAO24 addresses', () => {
    expect(getCountryFromICAO24('484')).toBeNull();
    expect(getCountryFromICAO24('48400')).toBeNull();
    expect(getCountryFromICAO24('48400')).toBeNull();
  });
});

describe('isNetherlandsICAO24', () => {
  it('should return true for Netherlands ICAO24 addresses', () => {
    expect(isNetherlandsICAO24('484000')).toBe(true);
    expect(isNetherlandsICAO24('484001')).toBe(true);
    expect(isNetherlandsICAO24('487777')).toBe(true);
  });

  it('should return false for non-Netherlands ICAO24 addresses', () => {
    expect(isNetherlandsICAO24('488000')).toBe(false); // Belgium
    expect(isNetherlandsICAO24('3C0000')).toBe(false); // Germany
    expect(isNetherlandsICAO24('390000')).toBe(false); // France
    expect(isNetherlandsICAO24('400000')).toBe(false); // UK
  });

  it('should return false for unknown ICAO24 addresses', () => {
    expect(isNetherlandsICAO24('000000')).toBe(false);
    expect(isNetherlandsICAO24('999999')).toBe(false);
  });
});
