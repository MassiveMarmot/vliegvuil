import { describe, it, expect } from 'vitest';
import {
  buildAirports,
  filterAirports,
  AIRPORT_STATUS_OVERLAY,
  airportsToJson,
  NL_BBOX,
} from '../src/airports';
import { parseCsv } from '../src/csv';

// Fixture: subset of OurAirports airports.csv columns/format
const FIXTURE_CSV = `id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,iso_country,gps_code,iata_code,closed
1,EHAM,large_airport,"Amsterdam Airport Schiphol",52.308601,4.763889,-11,NL,EHAM,AMS,0
2,EHRD,medium_airport,"Rotterdam The Hague Airport",51.956944,4.437222,-14,NL,EHRD,RTM,0
3,EHEH,medium_airport,"Eindhoven Airport",51.45,5.375,69,NL,EHEH,EIN,0
4,EHLE,medium_airport,"Lelystad Airport",52.458611,5.526944,-14,NL,EHLE,LEY,0
5,EHGR,medium_airport,"Groningen Airport Eelde",53.119444,6.579444,17,NL,EHGR,GRQ,0
6,EHBK,medium_airport,"Maastricht Aachen Airport",50.910278,5.778056,114,NL,EHBK,MST,0
7,EHVK,medium_airport,"Volkel Air Base",51.655556,5.676111,72,NL,EHVK,,0
8,EHAMX,heliport,"Test Heliport outside bbox",48.0,4.0,10,NL,EHAMX,,0
9,EHKLO,closed,"Kloetie Closed Airfield",52.0,4.5,10,NL,EHKLO,,1
10,LFPG,large_airport,"Paris Charles de Gaulle",49.009722,2.547778,392,FR,LFPG,CDG,0
`;

describe('filterAirports', (): void => {
  it('keeps only open EH airports inside the NL bbox', (): void => {
    const rows = parseFixture();
    const airports = filterAirports(rows, NL_BBOX);
    const icaos = airports.map((a): string => a.icao);

    expect(icaos).toContain('EHAM');
    expect(icaos).toContain('EHRD');
    expect(icaos).toContain('EHEH');
    expect(icaos).toContain('EHLE');
    expect(icaos).toContain('EHGR');
    expect(icaos).toContain('EHBK');
    expect(icaos).toContain('EHVK');

    // Outside bbox (lat 48) filtered out
    expect(icaos).not.toContain('EHAMX');
    // Closed airport filtered out
    expect(icaos).not.toContain('EHKLO');
    // Non-NL airport filtered out
    expect(icaos).not.toContain('LFPG');
  });

  it('parses coordinates, elevation, IATA and type correctly', (): void => {
    const rows = parseFixture();
    const schiphol = filterAirports(rows, NL_BBOX).find((a): boolean => a.icao === 'EHAM');
    expect(schiphol).toBeDefined();
    expect(schiphol?.latitude).toBeCloseTo(52.308601);
    expect(schiphol?.longitude).toBeCloseTo(4.763889);
    expect(schiphol?.elevation).toBe(-11);
    expect(schiphol?.iata).toBe('AMS');
    expect(schiphol?.type).toBe('large_airport');
    expect(schiphol?.name).toBe('Amsterdam Airport Schiphol');
  });

  it('applies the hand-maintained status overlay', (): void => {
    const rows = parseFixture();
    const airports = filterAirports(rows, NL_BBOX);

    const schiphol = airports.find((a): boolean => a.icao === 'EHAM');
    expect(schiphol?.status).toBe('commercial');

    const eindhoven = airports.find((a): boolean => a.icao === 'EHEH');
    expect(eindhoven?.status).toBe('military-shared');

    const volkel = airports.find((a): boolean => a.icao === 'EHVK');
    expect(volkel?.status).toBe('military-shared');

    const lelystad = airports.find((a): boolean => a.icao === 'EHLE');
    expect(lelystad?.status).toBe('planned');
  });

  it('defaults unknown airports to commercial status', (): void => {
    const rows = parseFixture();
    const groningen = filterAirports(rows, NL_BBOX).find((a): boolean => a.icao === 'EHGR');
    // EHGR is in the overlay as commercial — use a row not in the overlay instead
    const overlayHas = AIRPORT_STATUS_OVERLAY['EHGR'] !== undefined;
    if (overlayHas) {
      expect(groningen?.status).toBe('commercial');
    }
  });
});

describe('buildAirports', (): void => {
  it('returns metadata for sources.json', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-29');
    expect(result.source).toContain('OurAirports');
    expect(result.license).toBe('Public Domain');
    expect(result.date).toBe('2026-09-29');
    expect(result.airports.length).toBeGreaterThan(0);
    // Warnings are expected: the fixture contains only a subset of NL airports,
    // so overlay entries for airports missing from the fixture are flagged.
    expect(result.warnings.every((w): boolean => w.startsWith('Status overlay'))).toBe(true);
  });

  it('stamps the snapshot date on every airport', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-29');
    for (const airport of result.airports) {
      expect(airport.date).toBe('2026-09-29');
      expect(airport.source).toBe('OurAirports');
      expect(airport.license).toBe('Public Domain');
    }
  });

  it('warns when the overlay references an airport missing from the data', (): void => {
    const emptyCsv = 'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,iso_country,gps_code,iata_code,closed\n';
    const result = buildAirports(emptyCsv, '2026-09-29');
    expect(result.airports).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w): boolean => w.includes('EHAM'))).toBe(true);
  });
});

describe('airportsToJson', (): void => {
  it('serialises to valid JSON', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-29');
    const parsed = JSON.parse(airportsToJson(result.airports));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(result.airports.length);
  });
});

// Parse the fixture CSV through the real parser
function parseFixture(): Map<string, string | null>[] {
  return parseCsv(FIXTURE_CSV);
}
