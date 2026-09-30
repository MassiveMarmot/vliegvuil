import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAircraft, filterAircraft, parseTar1090Csv, aircraftToJson } from '../src/aircraft';

// Fixture: real rows from the tar1090-db aircraft.csv (csv branch), fetched
// 2026-09-30 and trimmed; format per the repo's toJson.py writer:
// icao24;reg;typeCode;flags;longType;year;ownOp;
const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tar1090-aircraft.csv'),
  'utf8',
);

describe('parseTar1090Csv', (): void => {
  it('parses the semicolon-separated, headerless format', (): void => {
    const rows = parseTar1090Csv(FIXTURE);
    expect(rows.length).toBe(6);
    const first = rows[0];
    expect(first?.get('icao24')).toBe('480000');
    expect(first?.get('reg')).toBe('PH-KZH');
    expect(first?.get('typeCode')).toBe('F70');
    expect(first?.get('longType')).toBe('FOKKER 70');
  });

  it('maps empty fields to null', (): void => {
    const rows = parseTar1090Csv(FIXTURE);
    const noLongType = rows[1];
    expect(noLongType?.get('longType')).toBeNull();
    const miscode = rows[5];
    expect(miscode?.get('reg')).toBeNull();
  });
});

describe('filterAircraft (nlOnly: true)', (): void => {
  it('keeps only NL-registered aircraft', (): void => {
    const rows = parseTar1090Csv(FIXTURE);
    const aircraft = filterAircraft(rows, { nlOnly: true });
    const registrations = aircraft.map((a): string | null => a.registration);
    expect(registrations).toContain('PH-KZH');
    expect(registrations).toContain('PH-BFA');
    expect(registrations).not.toContain('D-APGS');
  });

  it('excludes rows without an ICAO24 identifier', (): void => {
    const rows = parseTar1090Csv(';;;10;;;Miscode - VARIOUS;\n');
    const aircraft = filterAircraft(rows, { nlOnly: true });
    expect(aircraft).toEqual([]);
  });

  it('uppercases the ICAO24 identifier', (): void => {
    const rows = parseTar1090Csv(FIXTURE);
    for (const ac of filterAircraft(rows, { nlOnly: true })) {
      expect(ac.icao24).toBe(ac.icao24.toUpperCase());
    }
  });
});

describe('buildAircraft', (): void => {
  it('returns metadata for sources.json', (): void => {
    const result = buildAircraft(FIXTURE, '2026-09-30');
    expect(result.source).toContain('tar1090-db');
    expect(result.license).toBe('ODC-By-1.0');
    expect(result.date).toBe('2026-09-30');
    expect(result.aircraft.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('stamps the snapshot date on every entry', (): void => {
    const result = buildAircraft(FIXTURE, '2026-09-30');
    for (const ac of result.aircraft) {
      expect(ac.date).toBe('2026-09-30');
      expect(ac.source).toBe('tar1090-db');
    }
  });

  it('warns when nothing matches', (): void => {
    const result = buildAircraft('3C00AF;D-APGS;A319;0001;AIRBUS A-319;;;\n', '2026-09-30');
    expect(result.aircraft).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });
});

describe('aircraftToJson', (): void => {
  it('serialises to valid JSON', (): void => {
    const result = buildAircraft(FIXTURE, '2026-09-30');
    const parsed = JSON.parse(aircraftToJson(result.aircraft));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(result.aircraft.length);
  });
});
