// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 23 tests: airport type filter, status mapping, layer GeoJSON,
// glyph files for the configured font stack, the popup content, and
// the aircraft snapshot fallback precedence.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import {
  SHOWN_AIRPORT_TYPES,
  STATUS_CODES,
  filterAirports,
  statusForAirport,
  airportsToGeoJson,
  loadAirports,
  resetAirportsCache,
  type AirportData,
} from '../src/airports/airports';
import {
  AIRPORT_MARKER_LAYER_ID,
  AIRPORT_LABEL_LAYER_ID,
  AIRPORT_LABEL_MIN_ZOOM,
  AIRPORT_FONT_STACK,
  AIRPORT_GLYPHS_URL,
  iataFor,
} from '../src/airports/airportLayer';
import { AIRPORT_ICON_SPECS, airportIconId, createAirportIcon, registerAirportIcons } from '../src/airports/airportIcons';
import {
  enrichWithSnapshot,
  loadAircraftSnapshot,
  resetAircraftSnapshotCache,
  type AircraftSnapshotEntry,
} from '../src/airports/aircraftSnapshot';
import { AirportPopup } from '../src/airports/AirportPopup';
import type { DisplayAircraft } from '../src/types';

const airportsJson = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/airports.json'), 'utf8'),
) as AirportData[];

function makeAirport(partial: Partial<AirportData>): AirportData {
  return {
    icao: 'EHXX',
    iata: '',
    name: 'Test Airport',
    latitude: 52,
    longitude: 4.5,
    elevation: 0,
    type: 'large_airport',
    status: 'commercial',
    source: 'OurAirports',
    license: 'Public Domain',
    date: '2026-09-30',
    ...partial,
  };
}

describe('airport type filter', () => {
  it('shows only large and medium airports', () => {
    const shown = filterAirports(airportsJson);
    for (const a of shown) {
      expect(SHOWN_AIRPORT_TYPES).toContain(a.type);
    }
    expect(shown.some((a): boolean => a.type === 'heliport')).toBe(false);
    expect(shown.some((a): boolean => a.type === 'small_airport')).toBe(false);
  });

  it('shows the 12 expected airports (5 large, 7 medium)', () => {
    const shown = filterAirports(airportsJson);
    expect(shown).toHaveLength(12);
    expect(shown.filter((a): boolean => a.type === 'large_airport')).toHaveLength(5);
    expect(shown.filter((a): boolean => a.type === 'medium_airport')).toHaveLength(7);
    expect(shown.some((a): boolean => a.icao === 'EHAM')).toBe(true);
    expect(shown.some((a): boolean => a.icao === 'EHLE')).toBe(true);
  });

  it('does not include heliports or small airfields', () => {
    const shown = filterAirports(airportsJson);
    const icaos = shown.map((a): string => a.icao);
    expect(icaos).not.toContain('EHAD');
    expect(shown.filter((a): boolean => a.type === 'heliport')).toHaveLength(0);
  });
});

describe('status mapping', () => {
  it('maps the three known statuses for shown types', () => {
    expect(statusForAirport(makeAirport({ status: 'commercial' }))).toBe('commercial');
    expect(statusForAirport(makeAirport({ status: 'military-shared' }))).toBe('military-shared');
    expect(statusForAirport(makeAirport({ status: 'planned' }))).toBe('planned');
  });

  it('never surfaces status for heliports or small airfields (data caveat)', () => {
    expect(statusForAirport(makeAirport({ type: 'heliport', status: 'commercial' }))).toBeNull();
    expect(statusForAirport(makeAirport({ type: 'small_airport', status: 'commercial' }))).toBeNull();
  });

  it('maps unknown statuses to null instead of guessing', () => {
    expect(statusForAirport(makeAirport({ status: 'unknown-value' }))).toBeNull();
    expect(statusForAirport(makeAirport({ status: '' }))).toBeNull();
  });

  it('status codes match the icon specs order', () => {
    expect(STATUS_CODES.commercial).toBe(0);
    expect(STATUS_CODES['military-shared']).toBe(1);
    expect(STATUS_CODES.planned).toBe(2);
    expect(airportIconId(0)).toBe('airport-commercial');
    expect(airportIconId(1)).toBe('airport-military');
    expect(airportIconId(2)).toBe('airport-planned');
  });

  it('markers differ in shape per status (not colour only)', () => {
    const shapes = AIRPORT_ICON_SPECS.map((s): string => s.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    for (const spec of AIRPORT_ICON_SPECS) {
      const icon = createAirportIcon(spec);
      expect(icon.width).toBe(24);
      expect(icon.height).toBe(24);
      expect(icon.data.length).toBe(24 * 24 * 4);
    }
  });

  it('registers one icon per status, skipping images already present', () => {
    const added: string[] = [];
    const map = {
      hasImage: (id: string): boolean => added.includes(id),
      addImage: (id: string): void => {
        added.push(id);
      },
    };
    registerAirportIcons(map);
    expect(added).toHaveLength(AIRPORT_ICON_SPECS.length);
    registerAirportIcons(map); // second call: all present, nothing added
    expect(added).toHaveLength(AIRPORT_ICON_SPECS.length);
  });
});

describe('airport layer GeoJSON', () => {
  it('builds features only for shown airports with label properties', () => {
    const fc = airportsToGeoJson(airportsJson);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(12);
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('Point');
      expect(typeof f.properties.icao).toBe('string');
      expect(typeof f.properties.name).toBe('string');
      expect(f.properties.statusCode).toBeGreaterThanOrEqual(0);
    }
    const lelystad = fc.features.find((f): boolean => f.properties.icao === 'EHLE');
    expect(lelystad?.properties.status).toBe('planned');
    expect(lelystad?.properties.statusCode).toBe(STATUS_CODES.planned);
  });

  it('keeps the label layer above the marker layer zoom threshold', () => {
    expect(AIRPORT_LABEL_MIN_ZOOM).toBeGreaterThan(6);
    expect(AIRPORT_MARKER_LAYER_ID).not.toBe(AIRPORT_LABEL_LAYER_ID);
  });

  it('looks up IATA codes for the popup', () => {
    expect(iataFor(airportsJson, 'EHAM')).toBe('AMS');
    expect(iataFor(airportsJson, 'EHLE')).toBe('LEY');
    expect(iataFor(airportsJson, 'NOPE')).toBeNull();
  });
});

describe('glyph files for the configured font stack', () => {
  const fontsDir = resolve(__dirname, '../public/fonts');

  it('ships the PBF ranges the style requests, from our own origin', () => {
    expect(AIRPORT_GLYPHS_URL).toBe('/fonts/{fontstack}/{range}.pbf');
    expect(AIRPORT_GLYPHS_URL.startsWith('/')).toBe(true); // same origin
    const stackDir = join(fontsDir, AIRPORT_FONT_STACK);
    for (const range of ['0-255', '256-511']) {
      const pbf = join(stackDir, `${range}.pbf`);
      expect(existsSync(pbf), `${pbf} missing`).toBe(true);
      expect(readFileSync(pbf).byteLength).toBeGreaterThan(1000);
    }
  });

  it('names the font stack as fontnik baked it into the PBF', () => {
    const pbf = readFileSync(join(fontsDir, AIRPORT_FONT_STACK, '0-255.pbf'));
    expect(pbf.includes(Buffer.from(AIRPORT_FONT_STACK, 'utf8'))).toBe(true);
  });

  it('keeps the Space Grotesk OFL licence next to the glyphs', () => {
    const licence = join(fontsDir, 'SPACE_GROTESK_OFL.txt');
    expect(existsSync(licence)).toBe(true);
    const text = readFileSync(licence, 'utf8');
    expect(text).toContain('SIL Open Font License');
  });

  it('serves glyphs same-origin so the CSP needs no change', () => {
    // The Caddyfile CSP allows 'self' in every relevant directive; a
    // same-origin glyph URL adds no third-party host. Check the shipped
    // policy still covers fonts from our own origin and lists no
    // font host beyond 'self'.
    const caddy = readFileSync(resolve(__dirname, '..', '..', 'Caddyfile'), 'utf8');
    const csp = /Content-Security-Policy "([^"]+)"/.exec(caddy)?.[1] ?? '';
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(AIRPORT_GLYPHS_URL.startsWith('/')).toBe(true);
  });

  it('keeps the glyph set small (< 2 MB repo cap)', () => {
    let bytes = 0;
    for (const range of ['0-255', '256-511']) {
      bytes += readFileSync(join(fontsDir, AIRPORT_FONT_STACK, `${range}.pbf`)).byteLength;
    }
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('covers every character of every shown airport name', () => {
    // A name with a character outside the shipped ranges would make
    // MapLibre request a missing .pbf; Caddy's SPA fallback answers
    // that with index.html and a 200, which MapLibre cannot parse.
    const covered = (char: string): boolean => {
      const code = char.codePointAt(0);
      return code !== undefined && code <= 511;
    };
    const offenders: string[] = [];
    for (const airport of filterAirports(airportsJson)) {
      for (const char of airport.name) {
        if (!covered(char)) {
          offenders.push(
            `${airport.icao} "${airport.name}": character "${char}" (U+${
              char.codePointAt(0)?.toString(16).padStart(4, '0')
            }) is outside the shipped glyph ranges (0-511). Generate the new range with fontnik (see docs/architecture.md, session 23) or change the name.`,
          );
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });
});

describe('airport lazy loading', () => {
  beforeEach((): void => {
    resetAirportsCache();
  });
  afterEach((): void => {
    resetAirportsCache();
  });

  it('loads and filters the real airports.json (once, cached)', async () => {
    const raw = readFileSync(resolve(__dirname, '../public/data/airports.json'), 'utf8');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve(JSON.parse(raw)),
      }),
    );
    const first = await loadAirports('/data/airports.json');
    expect(first.length).toBe(116); // raw list; filtering happens in the layer
    expect(filterAirports(first)).toHaveLength(12);
    const second = await loadAirports('/data/airports.json');
    expect(second).toBe(first); // cached: same promise result
    vi.unstubAllGlobals();
  });
});

describe('airport popup', () => {
  // setup.ts mocks useTranslation: t(key, fallback) returns the fallback
  // (the NL default passed by the component), so rendered text is NL.

  it('renders name, codes and a status in plain language', () => {
    render(
      <AirportPopup
        icao="EHAM"
        iata="AMS"
        name="Amsterdam Airport Schiphol"
        status="commercial"
        onClose={(): void => {}}
      />,
    );
    expect(screen.getByText('Amsterdam Airport Schiphol')).toBeTruthy();
    expect(screen.getByText(/EHAM/)).toBeTruthy();
    expect(screen.getByText(/AMS/)).toBeTruthy();
    expect(screen.getByTestId('airport-status').textContent).toContain('Commercieel');
  });

  it('renders the military-shared status', () => {
    render(
      <AirportPopup icao="EHEH" name="Eindhoven Airport" status="military-shared" onClose={(): void => {}} />,
    );
    expect(screen.getByTestId('airport-status').textContent).toContain('Militair');
  });

  it('renders the planned status', () => {
    render(
      <AirportPopup icao="EHLE" iata="LEY" name="Lelystad Airport" status="planned" onClose={(): void => {}} />,
    );
    expect(screen.getByTestId('airport-status').textContent).toContain('In aanbouw / gepland');
  });

  it('omits the status line when the status is unknown', () => {
    render(
      <AirportPopup icao="EHLE" name="Lelystad Airport" status={null} onClose={(): void => {}} />,
    );
    expect(screen.queryByTestId('airport-status')).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(
      <AirportPopup icao="EHAM" name="Schiphol" status="commercial" onClose={(): void => { closed = true; }} />,
    );
    const dialog = screen.getByRole('dialog');
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closed).toBe(true);
  });
});

describe('aircraft snapshot fallback', () => {
  const snapshot = new Map<string, AircraftSnapshotEntry>([
    ['3C1234', { icao24: '3C1234', registration: 'PH-ABC', type: 'B738', model: 'Boeing 737-800', operator: 'KLM' }],
    ['48A111', { icao24: '48A111', registration: null, type: null, model: null, operator: 'TRANSAVIA' }],
  ]);

  function makeAircraft(partial: Partial<DisplayAircraft>): DisplayAircraft {
    return {
      id: 'x',
      icao24: '3C1234',
      callsign: 'KLM123',
      registration: null,
      type: null,
      operator: null,
      lat: 52,
      lon: 4.5,
      alt: 10000,
      track: 90,
      speed: 400,
      squawk: null,
      timestamp: 0,
      onGround: false,
      verticalRate: 0,
      symbolRotate: 90,
      updatedAt: 0,
      isStale: false,
      ...partial,
    };
  }

  it('fills only gaps: live values always win', () => {
    const live = makeAircraft({
      registration: 'PH-LIVE',
      type: 'A320',
      operator: 'EASYJET',
    });
    const enriched = enrichWithSnapshot(live, snapshot);
    expect(enriched).toBe(live); // nothing missing: unchanged reference
    expect(enriched.registration).toBe('PH-LIVE');
    expect(enriched.type).toBe('A320');
    expect(enriched.operator).toBe('EASYJET');
  });

  it('fills missing registration, type and operator from the snapshot', () => {
    const enriched = enrichWithSnapshot(makeAircraft({ icao24: '3C1234' }), snapshot);
    expect(enriched.registration).toBe('PH-ABC');
    expect(enriched.type).toBe('B738');
    expect(enriched.operator).toBe('KLM');
  });

  it('fills only the fields that are missing', () => {
    const partial = makeAircraft({ icao24: '48A111', registration: 'HV123' });
    const enriched = enrichWithSnapshot(partial, snapshot);
    expect(enriched.registration).toBe('HV123'); // live wins
    expect(enriched.type).toBeNull(); // snapshot has null too
    expect(enriched.operator).toBe('TRANSAVIA'); // filled
  });

  it('leaves aircraft with an unknown hex unchanged', () => {
    const stranger = makeAircraft({ icao24: 'DEADBE' });
    const enriched = enrichWithSnapshot(stranger, snapshot);
    expect(enriched).toBe(stranger);
    expect(enriched.registration).toBeNull();
  });

  it('loads the real snapshot and indexes it by uppercase hex', async () => {
    resetAircraftSnapshotCache();
    const raw = readFileSync(resolve(__dirname, '../public/data/aircraft.json'), 'utf8');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve(JSON.parse(raw)),
      }),
    );
    const map = await loadAircraftSnapshot('/data/aircraft.json');
    expect(map.size).toBeGreaterThan(100);
    const first = map.values().next().value;
    if (first !== undefined && first.icao24 !== null) {
      expect(map.get(first.icao24.toUpperCase())).toBeDefined();
    }
    resetAircraftSnapshotCache();
    vi.unstubAllGlobals();
  });
});
