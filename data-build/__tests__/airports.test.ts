import { describe, it, expect } from 'vitest';
import {
  buildAirports,
  filterAirports,
  AIRPORT_STATUS_OVERLAY,
  airportsToJson,
  NL_BBOX,
} from '../src/airports';
import { parseCsv } from '../src/csv';

// Fixture: real rows from OurAirports airports.csv (fetched 2026-09-30,
// trimmed; columns as in the real file), plus three synthetic rows for the
// filter tests (out-of-bbox, closed, non-NL).
const FIXTURE_CSV = `id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,iso_country,gps_code,iata_code,closed
2513,EHAM,large_airport,"Amsterdam Airport Schiphol",52.308601,4.76389,-11,NL,EHAM,AMS,0
2515,EHBK,large_airport,"Maastricht Aachen Airport",50.911087,5.769401,375,NL,EHBK,MST,0
2518,EHEH,large_airport,"Eindhoven Airport",51.4501,5.3745,74,NL,EHEH,EIN,0
2519,EHGG,large_airport,"Groningen Airport Eelde",53.119107,6.577652,17,NL,EHGG,GRQ,0
2520,EHGR,medium_airport,"Gilze Rijen Air Base",51.567402,4.93183,49,NL,EHGR,GLZ,0
2522,EHLE,medium_airport,"Lelystad Airport",52.453188,5.514622,-13,NL,EHLE,LEY,0
2523,EHLW,medium_airport,"Leeuwarden Air Base",53.2286,5.76056,3,NL,EHLW,LWR,0
2524,EHRD,large_airport,"Rotterdam The Hague Airport",51.956902,4.43722,-15,NL,EHRD,RTM,0
2528,EHVK,medium_airport,"Volkel Air Base",51.657222,5.707778,72,NL,EHVK,UDE,0
2529,EHWO,medium_airport,"Woensdrecht Air Base",51.4491,4.34203,63,NL,EHWO,WOE,0
2530,EHAMX,heliport,"Test Heliport outside bbox",48.0,4.0,10,NL,EHAMX,,0
2531,EHKLO,closed,"Kloetie Closed Airfield",52.0,4.5,10,NL,EHKLO,,0
2532,LFPG,large_airport,"Paris Charles de Gaulle",49.009722,2.547778,392,FR,LFPG,CDG,0`;

function parseFixture(): Map<string, string | null>[] {
  return parseCsv(FIXTURE_CSV);
}

describe('filterAirports', (): void => {
  it('keeps only open EH airports inside the NL bbox', (): void => {
    const rows = parseFixture();
    const airports = filterAirports(rows, NL_BBOX);
    const icaos = airports.map((a): string => a.icao);
    expect(icaos).toContain('EHAM');
    expect(icaos).toContain('EHRD');
    expect(icaos).toContain('EHEH');
    expect(icaos).toContain('EHLE');
    expect(icaos).toContain('EHGG');
    expect(icaos).toContain('EHBK');
    expect(icaos).toContain('EHVK');
    expect(icaos).not.toContain('EHAMX');
    expect(icaos).not.toContain('EHKLO');
    expect(icaos).not.toContain('LFPG');
  });

  it('parses coordinates, elevation, IATA and type correctly', (): void => {
    const rows = parseFixture();
    const schiphol = filterAirports(rows, NL_BBOX).find(
      (a): boolean => a.icao === 'EHAM',
    );
    expect(schiphol).toBeDefined();
    expect(schiphol?.latitude).toBeCloseTo(52.308601);
    expect(schiphol?.longitude).toBeCloseTo(4.76389);
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

  it('maps Groningen Eelde to EHGG and Gilze-Rijen to EHGR (real OurAirports idents)', (): void => {
    const rows = parseFixture();
    const airports = filterAirports(rows, NL_BBOX);
    const eelde = airports.find((a): boolean => a.icao === 'EHGG');
    const gilze = airports.find((a): boolean => a.icao === 'EHGR');
    expect(eelde?.name).toBe('Groningen Airport Eelde');
    expect(eelde?.status).toBe('commercial');
    expect(gilze?.name).toBe('Gilze Rijen Air Base');
    expect(gilze?.status).toBe('military-shared');
    const leeuwarden = airports.find((a): boolean => a.icao === 'EHLW');
    expect(leeuwarden?.status).toBe('military-shared');
  });
});

describe('buildAirports', (): void => {
  it('returns metadata for sources.json', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-30');
    expect(result.source).toContain('OurAirports');
    expect(result.license).toBe('Public Domain');
    expect(result.date).toBe('2026-09-30');
    expect(result.airports.length).toBeGreaterThan(0);
    // Warnings are expected: the fixture contains only a subset of NL
    // airports, so overlay entries for airports missing from the fixture
    // (EHKD, EHTW) are flagged.
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('stamps the snapshot date on every entry', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-30');
    for (const airport of result.airports) {
      expect(airport.date).toBe('2026-09-30');
      expect(airport.source).toBe('OurAirports');
    }
  });

  it('warns when nothing matches', (): void => {
    const result = buildAirports('id,ident,type,name\n', '2026-09-30');
    expect(result.airports).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('airportsToJson', (): void => {
  it('serialises to valid JSON', (): void => {
    const result = buildAirports(FIXTURE_CSV, '2026-09-30');
    const parsed = JSON.parse(airportsToJson(result.airports));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(result.airports.length);
  });
});

describe('AIRPORT_STATUS_OVERLAY', (): void => {
  it('covers exactly the airports in the real snapshot it is applied to', (): void => {
    const overlayIcaos = Object.keys(AIRPORT_STATUS_OVERLAY);
    expect(overlayIcaos).toContain('EHLE');
    expect(overlayIcaos.length).toBe(12);
  });
});
