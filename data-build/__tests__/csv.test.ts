import { describe, it, expect } from 'vitest';
import { parseCsvLine, csvHeaderMap, parseCsv, getField } from '../src/csv';

describe('parseCsvLine', (): void => {
  it('parses simple comma-separated fields', (): void => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with embedded commas', (): void => {
    expect(parseCsvLine('"Amsterdam Schiphol",EHAM,52.3')).toEqual([
      'Amsterdam Schiphol',
      'EHAM',
      '52.3',
    ]);
  });

  it('handles escaped double quotes inside quoted fields', (): void => {
    expect(parseCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
  });

  it('handles empty fields', (): void => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('handles trailing empty field', (): void => {
    expect(parseCsvLine('a,')).toEqual(['a', '']);
  });
});

describe('csvHeaderMap', (): void => {
  it('maps header names to indices', (): void => {
    const map = csvHeaderMap('icao,name,lat');
    expect(map.get('icao')).toBe(0);
    expect(map.get('name')).toBe(1);
    expect(map.get('lat')).toBe(2);
  });
});

describe('getField', (): void => {
  it('returns field value by header name', (): void => {
    const header = csvHeaderMap('icao,name');
    const fields = ['EHAM', 'Schiphol'];
    expect(getField(fields, header, 'icao')).toBe('EHAM');
  });

  it('returns null for missing header', (): void => {
    const header = csvHeaderMap('icao');
    expect(getField(['EHAM'], header, 'name')).toBeNull();
  });

  it('returns null for empty value', (): void => {
    const header = csvHeaderMap('icao,name');
    expect(getField(['EHAM', ''], header, 'name')).toBeNull();
  });
});

describe('parseCsv', (): void => {
  it('parses a full document into row maps', (): void => {
    const doc = 'icao,name\nEHAM,Schiphol\nEHRD,Rotterdam';
    const rows = parseCsv(doc);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.get('icao')).toBe('EHAM');
    expect(rows[1]?.get('name')).toBe('Rotterdam');
  });

  it('returns empty array for empty input', (): void => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });

  it('pads missing trailing fields as null', (): void => {
    const doc = 'icao,name\nEHAM';
    const rows = parseCsv(doc);
    expect(rows[0]?.get('icao')).toBe('EHAM');
    expect(rows[0]?.get('name')).toBeNull();
  });
});
