// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// ICAO24 address block to country mapping
// Based on ICAO Doc 9866 (Mode S address assignment)
// See: https://www.icao.int/publications/DOC9866/DOC9866_PART1_EN.pdf

interface ICAO24Range {
  start: string;
  end: string;
  country: string;
  countryCode: string;
}

// ICAO24 address blocks for Netherlands and nearby European countries
// Format: hex ranges (6 hex digits = 24 bits)
// Ranges are ordered from most specific to least specific to ensure proper matching
// (e.g., Czech Republic 4CA000-4CA777 must be checked before Austria 4C0000-4CFFFF)
const icao24Ranges: ICAO24Range[] = [
  // Netherlands - 484000 to 487777
  { start: '484000', end: '487777', country: 'Netherlands', countryCode: 'NL' },
  
  // Belgium - 488000 to 488777
  { start: '488000', end: '488777', country: 'Belgium', countryCode: 'BE' },
  
  // Luxembourg - 488800 to 488FFF
  { start: '488800', end: '488FFF', country: 'Luxembourg', countryCode: 'LU' },
  
  // Poland - 480000 to 483777
  { start: '480000', end: '483777', country: 'Poland', countryCode: 'PL' },
  
  // Czech Republic - 4CA000 to 4CA777 (subset of Austria range, must come before)
  { start: '4CA000', end: '4CA777', country: 'Czech Republic', countryCode: 'CZ' },
  
  // Switzerland - 4B0000 to 4BFFFF
  { start: '4B0000', end: '4BFFFF', country: 'Switzerland', countryCode: 'CH' },
  
  // Austria - 4C0000 to 4CFFFF
  { start: '4C0000', end: '4CFFFF', country: 'Austria', countryCode: 'AT' },
  
  // Portugal - 444000 to 444777 (subset of Denmark range, must come before)
  { start: '444000', end: '444777', country: 'Portugal', countryCode: 'PT' },
  
  // Denmark - 440000 to 447777
  { start: '440000', end: '447777', country: 'Denmark', countryCode: 'DK' },
  
  // Sweden - 448000 to 44FFFF
  { start: '448000', end: '44FFFF', country: 'Sweden', countryCode: 'SE' },
  
  // Norway - 450000 to 457777
  { start: '450000', end: '457777', country: 'Norway', countryCode: 'NO' },
  
  // Finland - 458000 to 45FFFF
  { start: '458000', end: '45FFFF', country: 'Finland', countryCode: 'FI' },
  
  // Italy - 344000 to 345777 (subset of Spain range, must come before)
  { start: '344000', end: '345777', country: 'Italy', countryCode: 'IT' },
  
  // Spain - 340000 to 34FFFF
  { start: '340000', end: '347777', country: 'Spain', countryCode: 'ES' },
  { start: '348000', end: '34FFFF', country: 'Spain', countryCode: 'ES' },
  
  // Germany - multiple ranges
  { start: '3C0000', end: '3CFFFF', country: 'Germany', countryCode: 'DE' },
  { start: '3D0000', end: '3DFFFF', country: 'Germany', countryCode: 'DE' },
  
  // France - multiple ranges
  { start: '390000', end: '397777', country: 'France', countryCode: 'FR' },
  { start: '398000', end: '39FFFF', country: 'France', countryCode: 'FR' },
  
  // United Kingdom - 400000 to 407777
  { start: '400000', end: '407777', country: 'United Kingdom', countryCode: 'GB' },
  
  // Ireland - 408000 to 408777
  { start: '408000', end: '408777', country: 'Ireland', countryCode: 'IE' },
  
  // Russia (European part) - 100000 to 177777
  { start: '100000', end: '177777', country: 'Russia', countryCode: 'RU' },
  
  // Military ranges (common for NATO)
  // NATO military: 300000 to 307777
  { start: '300000', end: '307777', country: 'NATO Military', countryCode: 'XX' },
  
  // Test/Reserved ranges
  { start: '000000', end: '000000', country: 'Reserved', countryCode: 'XX' },
  { start: 'FFFFFF', end: 'FFFFFF', country: 'Reserved', countryCode: 'XX' },
];

/**
 * Get country information from ICAO24 address (hex string)
 * 
 * @param icao24 - ICAO24 address as hex string (6 characters)
 * @returns Country info or null if not found
 * 
 * @example
 * getCountryFromICAO24('484001') // { country: 'Netherlands', countryCode: 'NL' }
 * getCountryFromICAO24('3C0001') // { country: 'Germany', countryCode: 'DE' }
 */
export function getCountryFromICAO24(icao24: string): { country: string; countryCode: string } | null {
  if (!icao24) {
    return null;
  }

  // Clean the input: uppercase, remove non-hex characters
  const hex = icao24.toUpperCase().replace(/[^0-9A-F]/g, '');
  
  if (hex.length < 6) {
    return null;
  }

  // Take first 6 characters (24 bits)
  const hex6 = hex.substring(0, 6);
  const decimal = parseInt(hex6, 16);

  for (const range of icao24Ranges) {
    const start = parseInt(range.start, 16);
    const end = parseInt(range.end, 16);

    if (decimal >= start && decimal <= end) {
      return {
        country: range.country,
        countryCode: range.countryCode,
      };
    }
  }

  return null;
}

/**
 * Check if ICAO24 address belongs to Netherlands
 * 
 * @param icao24 - ICAO24 address as hex string
 * @returns true if aircraft is registered in Netherlands
 */
export function isNetherlandsICAO24(icao24: string): boolean {
  const result = getCountryFromICAO24(icao24);
  return result?.countryCode === 'NL';
}

/**
 * Get all ICAO24 ranges for a specific country
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code (case-insensitive)
 * @returns Array of ICAO24 ranges for the country
 */
export function getRangesForCountry(countryCode: string): ICAO24Range[] {
  const code = countryCode.toUpperCase();
  return icao24Ranges.filter(range => range.countryCode === code);
}

/**
 * Check if ICAO24 address belongs to a specific country
 * 
 * @param icao24 - ICAO24 address as hex string
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns true if the ICAO24 address belongs to the specified country
 */
export function isCountryICAO24(icao24: string, countryCode: string): boolean {
  const result = getCountryFromICAO24(icao24);
  return result?.countryCode === countryCode.toUpperCase();
}

/**
 * Get all supported country codes
 * 
 * @returns Array of all supported ISO 3166-1 alpha-2 country codes
 */
export function getAllCountryCodes(): string[] {
  const codes = new Set<string>();
  for (const range of icao24Ranges) {
    codes.add(range.countryCode);
  }
  return Array.from(codes).sort();
}
