import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { AircraftList, sortAircraft } from '../src/components/AircraftList';
import type { DisplayAircraft } from '../src/types';

function makeAircraft(overrides: Partial<DisplayAircraft>): DisplayAircraft {
  return {
    id: 'id',
    icao24: '484000',
    callsign: 'KLM123',
    registration: 'PH-BCD',
    type: 'B738',
    operator: 'KLM',
    lat: 52.0,
    lon: 4.9,
    alt: 10000,
    track: 90,
    speed: 250,
    squawk: '1000',
    timestamp: Math.floor(Date.now() / 1000),
    onGround: false,
    verticalRate: null,
    symbolRotate: 90,
    updatedAt: Date.now(),
    isStale: false,
    ...overrides,
  };
}

const list: DisplayAircraft[] = [
  makeAircraft({ id: 'a', callsign: 'KLM123', registration: 'PH-BCD', alt: 10000, speed: 250 }),
  makeAircraft({ id: 'b', callsign: 'TRA456', registration: 'D-ABCD', alt: 5000, speed: 300 }),
  makeAircraft({ id: 'c', callsign: 'EZY789', registration: 'G-EZAA', alt: 35000, speed: 450 }),
  makeAircraft({ id: 'd', callsign: null, registration: null, alt: null, speed: null }),
];

const aircraftMap = new Map<string, DisplayAircraft>(list.map((ac): [string, DisplayAircraft] => [ac.id, ac]));

describe('sortAircraft (pure function)', (): void => {
  it('sorts by callsign ascending', (): void => {
    const sorted = sortAircraft(aircraftMap, 'callsign', 'asc');
    const callsigns = sorted.map((ac): string => ac.callsign ?? '');
    expect(callsigns).toEqual(['', 'EZY789', 'KLM123', 'TRA456']);
  });

  it('sorts by callsign descending', (): void => {
    const sorted = sortAircraft(aircraftMap, 'callsign', 'desc');
    const callsigns = sorted.map((ac): string => ac.callsign ?? '');
    expect(callsigns).toEqual(['TRA456', 'KLM123', 'EZY789', '']);
  });

  it('sorts by altitude ascending with nulls last', (): void => {
    const sorted = sortAircraft(aircraftMap, 'altitude', 'asc');
    expect(sorted.map((ac): number | null => ac.alt)).toEqual([5000, 10000, 35000, null]);
  });

  it('sorts by altitude descending with nulls last', (): void => {
    const sorted = sortAircraft(aircraftMap, 'altitude', 'desc');
    expect(sorted.map((ac): number | null => ac.alt)).toEqual([35000, 10000, 5000, null]);
  });

  it('sorts by speed ascending', (): void => {
    const sorted = sortAircraft(aircraftMap, 'speed', 'asc');
    expect(sorted.map((ac): number | null => ac.speed)).toEqual([250, 300, 450, null]);
  });

  it('sorts by registration descending', (): void => {
    const sorted = sortAircraft(aircraftMap, 'registration', 'desc');
    expect(sorted.map((ac): string | null => ac.registration)).toEqual(['PH-BCD', 'G-EZAA', 'D-ABCD', null]);
  });
});

describe('AircraftList (component)', (): void => {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  beforeEach((): void => {
    onSelect.mockClear();
    onClose.mockClear();
  });

  const renderList = (): ReturnType<typeof render> =>
    render(
      <AircraftList
        aircraft={aircraftMap}
        selectedAircraftId={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

  it('renders a real table with sortable column headers', (): void => {
    renderList();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /telemetry.callsign/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /telemetry.registration/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /telemetry.altitude/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /telemetry.speed/ })).toBeInTheDocument();
  });

  it('shows all aircraft as rows', (): void => {
    renderList();
    expect(screen.getByRole('row', { name: /KLM123/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /TRA456/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /EZY789/ })).toBeInTheDocument();
  });

  it('shows count in the title', (): void => {
    renderList();
    expect(screen.getByText(/Lijstweergave \(4\)|list.title \(4\)/)).toBeInTheDocument();
  });

  it('sorts ascending on first click and descending on second', (): void => {
    renderList();
    const altHeader = screen.getByRole('button', { name: /telemetry.altitude/ });

    // First click: ascending — 5000 (TRA456) first
    fireEvent.click(altHeader);
    const firstRow = screen.getAllByRole('row')[1];
    expect(within(firstRow as HTMLElement).getByText('TRA456')).toBeInTheDocument();

    // Second click: descending — 35000 (EZY789) first
    fireEvent.click(altHeader);
    const firstRowDesc = screen.getAllByRole('row')[1];
    expect(within(firstRowDesc as HTMLElement).getByText('EZY789')).toBeInTheDocument();
  });

  it('announces sort state via aria-sort', (): void => {
    renderList();
    const callsignHeader = screen.getByRole('columnheader', { name: /telemetry.callsign/ });
    expect(callsignHeader).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByRole('button', { name: /telemetry.callsign/ }));
    expect(callsignHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('calls onSelect when a row is clicked', (): void => {
    renderList();
    fireEvent.click(screen.getByText('KLM123'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('calls onSelect when a row is focused and Enter is pressed', (): void => {
    renderList();
    const row = screen.getByRole('row', { name: /KLM123/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('calls onSelect when a row is focused and Space is pressed', (): void => {
    renderList();
    const row = screen.getByRole('row', { name: /TRA456/ });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('marks the selected row with aria-selected', (): void => {
    render(
      <AircraftList
        aircraft={aircraftMap}
        selectedAircraftId="c"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    const selectedRow = screen.getByRole('row', { name: /EZY789/ });
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onClose when the close button is clicked', (): void => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'telemetry.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an empty-state message when there are no aircraft', (): void => {
    render(
      <AircraftList
        aircraft={new Map()}
        selectedAircraftId={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('map.noData')).toBeInTheDocument();
  });

  it('falls back to ICAO24 when callsign is null', (): void => {
    renderList();
    expect(screen.getByText('484000')).toBeInTheDocument();
  });
});
