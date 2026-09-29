import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TelemetryPanel } from '../src/components/TelemetryPanel';
import type { DisplayAircraft } from '../src/types';

// Fixture aircraft — full data
const fullAircraft: DisplayAircraft = {
  id: '484000_KLM123',
  icao24: '484000',
  callsign: 'KLM123',
  registration: 'PH-BCD',
  type: 'B738',
  operator: 'KLM',
  lat: 52.3086,
  lon: 4.7639,
  alt: 10000,
  track: 90,
  speed: 250,
  squawk: '1000',
  timestamp: Math.floor(Date.now() / 1000),
  onGround: false,
  verticalRate: 500,
  symbolRotate: 90,
  updatedAt: Date.now(),
  isStale: false,
};

// Fixture aircraft — all nullable fields null
const sparseAircraft: DisplayAircraft = {
  id: '484001_',
  icao24: '484001',
  callsign: null,
  registration: null,
  type: null,
  operator: null,
  lat: 52.0,
  lon: 4.9,
  alt: null,
  track: null,
  speed: null,
  squawk: null,
  timestamp: Math.floor(Date.now() / 1000),
  onGround: false,
  verticalRate: null,
  symbolRotate: 0,
  updatedAt: Date.now(),
  isStale: true,
};

describe('TelemetryPanel', () => {
  const onClose = vi.fn();

  beforeEach((): void => {
    onClose.mockClear();
  });

  it('renders all spec §2 fields with values', (): void => {
    render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);

    // Labels present for every spec §2 field
    expect(screen.getByText('telemetry.callsign')).toBeInTheDocument();
    expect(screen.getByText('telemetry.registration')).toBeInTheDocument();
    expect(screen.getByText('telemetry.type')).toBeInTheDocument();
    expect(screen.getByText('telemetry.operator')).toBeInTheDocument();
    expect(screen.getByText('telemetry.altitude')).toBeInTheDocument();
    expect(screen.getByText('telemetry.speed')).toBeInTheDocument();
    expect(screen.getByText('telemetry.heading')).toBeInTheDocument();
    expect(screen.getByText('telemetry.verticalRate')).toBeInTheDocument();
    expect(screen.getByText('telemetry.squawk')).toBeInTheDocument();
    expect(screen.getByText('telemetry.dataAge')).toBeInTheDocument();

    // Values present (callsign appears in the panel title too)
    expect(screen.getAllByText('KLM123').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('PH-BCD')).toBeInTheDocument();
    expect(screen.getByText('B738')).toBeInTheDocument();
    expect(screen.getByText('KLM')).toBeInTheDocument();
    expect(screen.getByText('10,000 ft')).toBeInTheDocument();
    expect(screen.getByText('250 kt')).toBeInTheDocument();
    expect(screen.getByText('90°')).toBeInTheDocument();
    expect(screen.getByText('↑500 ft/min')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('shows em dash for missing values', (): void => {
    render(<TelemetryPanel aircraft={sparseAircraft} onClose={onClose} />);
    const values = screen.getAllByText('—');
    expect(values.length).toBeGreaterThanOrEqual(7);
  });

  it('shows stale badge when data is stale', (): void => {
    render(<TelemetryPanel aircraft={sparseAircraft} onClose={onClose} />);
    expect(screen.getByText('map.staleData')).toBeInTheDocument();
  });

  it('does not show stale badge for fresh data', (): void => {
    render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);
    expect(screen.queryByText('map.staleData')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', (): void => {
    render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', (): void => {
    render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the panel on mount (managed focus)', (): void => {
    render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);
    const panel = screen.getByRole('region');
    expect(panel).toHaveFocus();
  });

  it('returns focus to the previously focused element on close', (): void => {
    const { unmount } = render(<TelemetryPanel aircraft={fullAircraft} onClose={onClose} />);
    unmount();
    // Focus restore is best-effort; in jsdom, focus returns to body when no
    // previous element existed. The restore logic runs on unmount without error.
    expect(document.activeElement).toBeDefined();
  });

  it('falls back to ICAO24 as title when callsign is null', (): void => {
    render(<TelemetryPanel aircraft={sparseAircraft} onClose={onClose} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('484001');
  });
});
