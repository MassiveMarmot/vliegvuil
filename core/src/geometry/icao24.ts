// ICAO24 address block to country mapping
// Based on ICAO Doc 9866

interface ICAO24Range {
  start: string;
  end: string;
  country: string;
  countryCode: string;
}

// ICAO24 address blocks for Netherlands and nearby countries
const icao24Ranges: ICAO24Range[] = [
  // Netherlands
  { start: '484000', end: '487777', country: 'Netherlands', countryCode: 'NL' },
  // Belgium
  { start: '488000', end: '488777', country: 'Belgium', countryCode: 'BE' },
  // Germany
  { start: '3C0000', end: '3C7777', country: 'Germany', countryCode: 'DE' },
  { start: '3C8000', end: '3CFFFF', country: 'Germany', countryCode: 'DE' },
  // France
  { start: '390000', end: '397777', country: 'France', countryCode: 'FR' },
  // United Kingdom
  { start: '400000', end: '407777', country: 'United Kingdom', countryCode: 'GB' },
];

/**
 * Get country information from ICAO24 address
 */
export function getCountryFromICAO24(icao24: string): { country: string; countryCode: string } | null {
  const hex = icao24.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length < 6) {
    return null;
  }

  const decimal = parseInt(hex, 16);

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
 */
export function isNetherlandsICAO24(icao24: string): boolean {
  const result = getCountryFromICAO24(icao24);
  return result?.countryCode === 'NL';
}
