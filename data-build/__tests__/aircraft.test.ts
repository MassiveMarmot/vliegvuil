import { describe, it, expect } from 'vitest';
import { buildAircraft, filterAircraft, aircraftToJson } from '../src/aircraft';
import { parseCsv } from '../src/csv';

// Fixture: subset of tar1090-db aircraft.csv columns (icao24, r, t, desc, ownOp)
const FIXTURE_CSV = `icao24,r,t,desc,ownOp,callSign
484000,PH-BHA,B738,"Boeing 737-800 KLM",KLM,KLM
484501,PH-KHA,B788,"Boeing 787-8 KLM",KLM,KLM
3C6666,D-ABCD,A320,"Airbus A320 Lufthansa",Lufthansa,DLH
400101,G-EUAA,A320,"Airbus A320 British Airways",British Airways,BAW
484102,PH-MXA,B77W,"Boeing 777-300ER KLM",KLM,KLM
400102,PH-NOE,B738,"Boeing 737-800 Transavia",Transavia,TRA
484103,,A320,"Airbus A320 no registration",
`;

describe('filterAircraft (nlOnly: true)', (): void => {
  it('keeps only NL-registered aircraft', (): void => {
    const rows = parseCsv(FIXTURE_CSV);
    const aircraft = filterAircraft(rows, { nlOnly: true });
    const registrations = aircraft.map((a): string | null => a.registration);

    expect(registrations).toContain('PH-BHA');
    expect(registrations).toContain('PH-KHA');
    expect(registrations).toContain('PH-MXA');
    expect(registrations).toContain('PH-NOE');
    expect(registrations).not.toContain('D-ABCD');
    expect(registrations).not.toContain('G-EUAA');
  });

  it('excludes rows without an ICAO24 identifier', (): void => {
    const csvWithBlank = `icao24,r
,PH-XXX
`;
    const aircraft = filterAircraft(parseCsv(csvWithBlank), { nlOnly: true });
    expect(aircraft).toEqual([]);
  });

  it('uppercases the ICAO24 identifier', (): void => {
    const rows = parseCsv(FIXTURE_CSV);
    const aircraft = filterAircraft(rows, { nlOnly: true });
    for (const ac of aircraft) {
      expect(ac.icao24).toBe(ac.icao24.toUpperCase());
    }
  });
});

describe('buildAircraft', (): void => {
  it('returns metadata for sources.json with a TODO licence marker', (): void => {
    const result = buildAircraft(FIXTURE_CSV, '2026-09-29');
    expect(result.source).toContain('tar1090-db');
    expect(result.license).toContain('TODO');
    expect(result.date).toBe('2026-09-29');
    expect(result.aircraft.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('stamps the snapshot date on every entry', (): void => {
    const result = buildAircraft(FIXTURE_CSV, '2026-09-29');
    for (const ac of result.aircraft) {
      expect(ac.date).toBe('2026-09-29');
      expect(ac.source).toBe('tar1090-db');
    }
  });

  it('warns when nothing matches', (): void => {
    const result = buildAircraft('icao24,r\n', '2026-09-29');
    expect(result.aircraft).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });
});

describe('aircraftToJson', (): void => {
  it('serialises to valid JSON', (): void => {
    const result = buildAircraft(FIXTURE_CSV, '2026-09-29');
    const parsed = JSON.parse(aircraftToJson(result.aircraft));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(result.aircraft.length);
  });
});

function parseCsvRows(content: string): Map<string, string | null>[] {
  return parseCsv(content);
}
void parseCsvRows;
