import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SearchBox, searchAircraft } from '../src/components/SearchBox';
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

const klm: DisplayAircraft = makeAircraft({ id: 'a', icao24: '484000', callsign: 'KLM123', registration: 'PH-BCD' });
const tra: DisplayAircraft = makeAircraft({ id: 'b', icao24: '3C4567', callsign: 'TRA456', registration: 'D-ABCD' });
const easyjet: DisplayAircraft = makeAircraft({ id: 'c', icao24: '4CA8D0', callsign: 'EZY789', registration: 'G-EZAA' });

const aircraftMap = new Map<string, DisplayAircraft>([
  [klm.id, klm],
  [tra.id, tra],
  [easyjet.id, easyjet],
]);

describe('searchAircraft (pure function)', (): void => {
  it('finds by callsign (case-insensitive)', (): void => {
    const results = searchAircraft(aircraftMap, 'klm');
    expect(results.map((r): string => r.id)).toContain('a');
  });

  it('finds by registration (case-insensitive)', (): void => {
    const results = searchAircraft(aircraftMap, 'ph-bcd');
    expect(results.map((r): string => r.id)).toContain('a');
  });

  it('finds by ICAO24 (case-insensitive)', (): void => {
    const results = searchAircraft(aircraftMap, '3c4567');
    expect(results.map((r): string => r.id)).toContain('b');
  });

  it('ranks exact ICAO24 match first', (): void => {
    const partialIcao = makeAircraft({ id: 'd', icao24: '484001', callsign: 'KLM999' });
    const map = new Map<string, DisplayAircraft>([
      [klm.id, klm],
      [partialIcao.id, partialIcao],
    ]);
    const results = searchAircraft(map, '484001');
    expect(results[0]?.id).toBe('d');
  });

  it('returns empty for empty query', (): void => {
    expect(searchAircraft(aircraftMap, '')).toEqual([]);
    expect(searchAircraft(aircraftMap, '   ')).toEqual([]);
  });

  it('returns empty when nothing matches', (): void => {
    expect(searchAircraft(aircraftMap, 'ZZZZ')).toEqual([]);
  });

  it('does not match null callsign/registration values', (): void => {
    const nullFields = makeAircraft({ id: 'e', callsign: null, registration: null });
    const map = new Map<string, DisplayAircraft>([[nullFields.id, nullFields]]);
    expect(searchAircraft(map, 'KLM')).toEqual([]);
  });
});

describe('SearchBox (component)', (): void => {
  const onSelect = vi.fn();
  beforeEach((): void => {
    onSelect.mockClear();
  });

  function expand(): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: 'search.open' }));
    return screen.getByPlaceholderText('search.placeholder');
  }

  it('is collapsed by default: an icon button with aria-expanded=false, no input', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const toggle = screen.getByRole('button', { name: 'search.open' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(screen.queryByPlaceholderText('search.placeholder')).not.toBeInTheDocument();
  });

  it('expands on click and focuses the input', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('search')).toHaveClass('expanded');
  });

  it('shows matching results when typing while expanded', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KLM' } });
    expect(screen.getByText('KLM123')).toBeInTheDocument();
  });

  it('shows no-results message when nothing matches', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ZZZZ' } });
    expect(screen.getByText('search.noResults')).toBeInTheDocument();
  });

  it('collapses on Escape and returns focus to the icon button', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KLM' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('KLM123')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('search.placeholder')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'search.open' })).toHaveFocus();
  });

  it('collapses on blur when the query is empty', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.queryByPlaceholderText('search.placeholder')).not.toBeInTheDocument();
  });

  it('stays expanded on blur when the query is not empty', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KLM' } });
    fireEvent.blur(input);
    expect(screen.getByPlaceholderText('search.placeholder')).toBeInTheDocument();
  });

  it('collapses after a result is selected and refocuses the icon button', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KLM' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(screen.queryByPlaceholderText('search.placeholder')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'search.open' })).toHaveFocus();
  });

  it('selects the first result on form submit (Enter)', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KLM' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('selects an aircraft when a result button is pressed', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'EZY' } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /EZY789/ }));
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(screen.getByRole('button', { name: 'search.open' })).toHaveFocus();
  });

  it('does not call onSelect on submit with no results', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    const input = expand();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ZZZZ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hides results before typing', (): void => {
    render(<SearchBox aircraft={aircraftMap} onSelect={onSelect} />);
    expand();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
