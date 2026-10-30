import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  loadUnits,
  saveUnits,
  formatAltitude,
  formatSpeed,
  defaultUnitsForLanguages,
  DEFAULT_UNITS,
} from '../src/units';
import { AttributionPage, listSources, type SourcesFile } from '../src/components/AttributionPage';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { AircraftList } from '../src/components/AircraftList';
import type { DisplayAircraft as ImportDisplayAircraft } from '../src/types';

const AircraftListForTest = AircraftList;

/** Temporarily override navigator.languages (+ navigator.language), run fn, restore. */
function withNavigatorLanguages(
  languages: readonly string[],
  languageOrFn: string | (() => void),
  maybeFn?: () => void,
): void {
  const fn = typeof languageOrFn === 'function' ? languageOrFn : maybeFn;
  const language = typeof languageOrFn === 'string' ? languageOrFn : undefined;
  const nav = window.navigator as Navigator & { languages?: readonly string[] };
  const savedLangs = nav.languages;
  const savedLang = nav.language;
  Object.defineProperty(nav, 'languages', {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(nav, 'language', {
    value: language ?? languages[0] ?? 'en',
    configurable: true,
  });
  if (!fn) throw new Error('withNavigatorLanguages: missing callback');
  try {
    fn();
  } finally {
    Object.defineProperty(nav, 'languages', { value: savedLangs, configurable: true });
    Object.defineProperty(nav, 'language', { value: savedLang, configurable: true });
  }
}

/** Make localStorage throw (as when blocked): run fn, restore. */
function withUnavailableLocalStorage(fn: () => void): void {
  const saved = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    get(): Storage {
      throw new DOMException('denied', 'SecurityError');
    },
    configurable: true,
  });
  try {
    fn();
  } finally {
    if (saved) Object.defineProperty(window, 'localStorage', saved);
  }
}

describe('units (pure functions)', (): void => {
  it('formats altitude in feet by default', (): void => {
    expect(formatAltitude(10000, 'ft')).toBe('10,000 ft');
  });

  it('formats altitude in meters', (): void => {
    expect(formatAltitude(3280.84, 'm')).toBe('1,000 m');
  });

  it('formats null values as an em dash', (): void => {
    expect(formatAltitude(null, 'ft')).toBe('—');
    expect(formatSpeed(null, 'kt')).toBe('—');
  });

  it('formats speed in knots and km/h', (): void => {
    expect(formatSpeed(250, 'kt')).toBe('250 kt');
    expect(formatSpeed(250, 'kmh')).toBe('463 km/h');
  });
});

describe('units persistence', (): void => {
  beforeEach((): void => {
    window.localStorage.clear();
  });

  it('returns defaults when nothing is stored', (): void => {
    // jsdom defaults to en-US: ft/kt
    expect(loadUnits()).toEqual(DEFAULT_UNITS);
  });

  it('round-trips saved units', (): void => {
    saveUnits({ altitude: 'm', speed: 'kmh' });
    expect(loadUnits()).toEqual({ altitude: 'm', speed: 'kmh' });
  });

  it('ignores invalid stored values', (): void => {
    window.localStorage.setItem('vliegvuil.units', JSON.stringify({ altitude: 'furlongs', speed: 42 }));
    expect(loadUnits()).toEqual(DEFAULT_UNITS);
  });
});

describe('unit defaults by language (session 25d)', (): void => {
  beforeEach((): void => {
    window.localStorage.clear();
  });

  it('nl, nl-NL, nl-BE give metric', (): void => {
    for (const langs of [['nl'], ['nl-NL'], ['nl-BE']]) {
      expect(defaultUnitsForLanguages(langs)).toEqual({ altitude: 'm', speed: 'kmh' });
    }
  });

  it('en, en-US, de, empty and undefined give ft/kt', (): void => {
    for (const langs of [['en'], ['en-US'], ['de'], [], undefined]) {
      expect(defaultUnitsForLanguages(langs)).toEqual(DEFAULT_UNITS);
    }
  });

  it('falls back to the second language when the first has no entry', (): void => {
    expect(defaultUnitsForLanguages(['de', 'nl'])).toEqual({ altitude: 'm', speed: 'kmh' });
  });

  it('saved choice beats the derived default (both directions)', (): void => {
    window.localStorage.setItem(
      'vliegvuil.units',
      JSON.stringify({ altitude: 'ft', speed: 'kt' }),
    );
    withNavigatorLanguages(['nl'], (): void => {
      expect(loadUnits()).toEqual({ altitude: 'ft', speed: 'kt' });
    });
    window.localStorage.setItem(
      'vliegvuil.units',
      JSON.stringify({ altitude: 'm', speed: 'kmh' }),
    );
    withNavigatorLanguages(['en'], (): void => {
      expect(loadUnits()).toEqual({ altitude: 'm', speed: 'kmh' });
    });
  });

  it('loadUnits derives from navigator.languages when nothing is saved', (): void => {
    withNavigatorLanguages(['nl-NL', 'en'], (): void => {
      expect(loadUnits()).toEqual({ altitude: 'm', speed: 'kmh' });
    });
    // and does NOT persist the derived default
    expect(window.localStorage.getItem('vliegvuil.units')).toBeNull();
  });

  it('loadUnits falls back to navigator.language when languages is empty', (): void => {
    withNavigatorLanguages([], 'nl', (): void => {
      expect(loadUnits()).toEqual({ altitude: 'm', speed: 'kmh' });
    });
  });

  it('unavailable localStorage still returns the derived default', (): void => {
    withUnavailableLocalStorage((): void => {
      withNavigatorLanguages(['nl'], (): void => {
        expect(loadUnits()).toEqual({ altitude: 'm', speed: 'kmh' });
      });
    });
  });

  it('SettingsPanel shows the effective units as selected', (): void => {
    render(
      <SettingsPanel
        open={true}
        onClose={(): void => {}}
        units={{ altitude: 'm', speed: 'kmh' }}
        onUnitsChange={(): void => {}}
      />,
    );
    expect((screen.getByDisplayValue('m') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByDisplayValue('kmh') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByDisplayValue('ft') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByDisplayValue('kt') as HTMLInputElement).checked).toBe(false);
  });

  it('AircraftList uses the loaded units (metric shows m and km/h)', (): void => {
    const aircraft = new Map<string, ImportDisplayAircraft>([
      [
        'a1',
        {
          id: 'a1',
          icao24: '484011',
          callsign: 'KLM123',
          registration: 'PH-KLM',
          type: 'B738',
          operator: 'KLM',
          lat: 52.3,
          lon: 4.9,
          alt: 10000,
          speed: 250,
          track: 90,
          squawk: '1000',
          timestamp: Date.now() / 1000,
          onGround: false,
          verticalRate: 0,
          symbolRotate: 90,
          isStale: false,
          updatedAt: Date.now(),
        },
      ],
    ]);
    const { rerender } = render(
      <AircraftListForTest aircraft={aircraft} selectedAircraftId={null} onSelect={(): void => undefined} onClose={(): void => undefined} units={{ altitude: 'm', speed: 'kmh' }} />,
    );
    expect(screen.getByText(/m$/)).not.toBeNull();
    expect(screen.getByText(/km\/h$/)).not.toBeNull();
    rerender(
      <AircraftListForTest aircraft={aircraft} selectedAircraftId={null} onSelect={(): void => undefined} onClose={(): void => undefined} units={{ altitude: 'ft', speed: 'kt' }} />,
    );
    expect(screen.getByText(/ft$/)).not.toBeNull();
    expect(screen.getByText(/kt$/)).not.toBeNull();
  });
});

describe('SettingsPanel', (): void => {
  it('is hidden when closed', (): void => {
    const { container } = render(
      <SettingsPanel open={false} onClose={(): void => {}} units={DEFAULT_UNITS} onUnitsChange={(): void => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('changes altitude and speed units and persists them', (): void => {
    window.localStorage.clear();
    const onChange = vi.fn();
    render(
      <SettingsPanel open={true} onClose={(): void => {}} units={DEFAULT_UNITS} onUnitsChange={onChange} />,
    );
    fireEvent.click(screen.getByDisplayValue('m'));
    expect(onChange).toHaveBeenCalledWith({ altitude: 'm', speed: 'kt' });
    expect(JSON.parse(window.localStorage.getItem('vliegvuil.units') ?? '{}')).toEqual({
      altitude: 'm',
      speed: 'kt',
    });
    fireEvent.click(screen.getByDisplayValue('kmh'));
    expect(onChange).toHaveBeenCalledWith({ altitude: 'ft', speed: 'kmh' });
    expect(JSON.parse(window.localStorage.getItem('vliegvuil.units') ?? '{}')).toEqual({
      altitude: 'ft',
      speed: 'kmh',
    });
  });
});

describe('AttributionPage', (): void => {
  const file: SourcesFile = {
    sources: [
      {
        id: 'test',
        name: 'Test Source',
        url: 'https://example.com',
        license: 'CC-BY 4.0',
        licenseUrl: 'https://example.com/license',
        dataType: 'Test data',
      },
    ],
  };

  it('lists sources with name, licence and URL', (): void => {
    render(<AttributionPage />);
    // Real sources.json content
    const page = document.querySelector('.attribution-page');
    expect(page).not.toBeNull();
    expect(page?.textContent).toContain('adsb.fi');
  });

  it('exposes sources for tests via listSources', (): void => {
    expect(listSources(file)).toHaveLength(1);
    expect(listSources(file)[0]?.license).toBe('CC-BY 4.0');
  });
});
