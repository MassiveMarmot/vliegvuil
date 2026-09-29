import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  loadUnits,
  saveUnits,
  formatAltitude,
  formatSpeed,
  DEFAULT_UNITS,
} from '../src/units';
import { AttributionPage, listSources, type SourcesFile } from '../src/components/AttributionPage';
import { SettingsPanel } from '../src/components/SettingsPanel';

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
    expect(page?.textContent).toContain('adsb.lol');
  });

  it('exposes sources for tests via listSources', (): void => {
    expect(listSources(file)).toHaveLength(1);
    expect(listSources(file)[0]?.license).toBe('CC-BY 4.0');
  });
});
