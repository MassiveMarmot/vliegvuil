// Telemetry panel component with managed focus
// Spec §2: callsign, registration, type, operator, altitude, speed, heading,
// vertical rate, squawk, data age.
// Spec §6: managed focus (moves in on select, returns on close, Esc to close) — not a focus trap.

import React, { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayAircraft } from '../types';
import type { NoiseContours } from '@vliegvuil/core';
import { NoiseBadge } from './NoiseOverlay';

export interface TelemetryPanelProps {
  aircraft: DisplayAircraft;
  onClose: () => void;
  /** Noise contours for the membership badge (session 10) */
  noiseContours?: NoiseContours | null;
}

/** Format a nullable value, falling back to an em dash */
function formatValue(value: string | null): string {
  return value ?? '—';
}

/** Format altitude in feet */
function formatAltitude(alt: number | null): string {
  return alt != null ? `${Math.round(alt).toLocaleString()} ft` : '—';
}

/** Format speed in knots */
function formatSpeed(speed: number | null): string {
  return speed != null ? `${Math.round(speed)} kt` : '—';
}

/** Format heading in degrees */
function formatHeading(track: number | null): string {
  return track != null ? `${Math.round(track)}°` : '—';
}

/** Format vertical rate in ft/min with direction indicator */
function formatVerticalRate(rate: number | null): string {
  if (rate == null) return '—';
  const arrow = rate > 0 ? '↑' : rate < 0 ? '↓' : '';
  return `${arrow}${Math.abs(Math.round(rate)).toLocaleString()} ft/min`;
}

/** Format data age from a Unix-seconds timestamp */
function formatDataAge(timestamp: number): string {
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (ageSeconds < 60) return `${ageSeconds}s`;
  const minutes = Math.floor(ageSeconds / 60);
  const seconds = ageSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Telemetry panel — friendly info card for a selected aircraft.
 * Managed focus: on mount focus moves to the panel; on close (button or Esc)
 * focus returns to the previously focused element.
 */
export function TelemetryPanel({ aircraft, onClose, noiseContours }: TelemetryPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Capture the previously focused element so we can restore it on close
  useEffect((): void => {
    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();
  }, []);

  // Restore focus on unmount (covers all close paths)
  useEffect((): (() => void) => {
    return (): void => {
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  // Esc to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <aside
      ref={panelRef}
      className="telemetry-panel"
      role="region"
      aria-label={t('telemetry.title', 'Vliegtuigdetails')}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      aria-live="polite"
    >
      <header className="telemetry-header">
        <h2 className="telemetry-title">
          {aircraft.callsign ?? aircraft.icao24}
        </h2>
        <button
          type="button"
          className="telemetry-close"
          onClick={onClose}
          aria-label={t('telemetry.close', 'Sluiten')}
        >
          ×
        </button>
      </header>

      <dl className="telemetry-fields">
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.callsign')}</dt>
          <dd className="telemetry-value">{formatValue(aircraft.callsign)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.registration')}</dt>
          <dd className="telemetry-value">{formatValue(aircraft.registration)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.type')}</dt>
          <dd className="telemetry-value">{formatValue(aircraft.type)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.operator')}</dt>
          <dd className="telemetry-value">{formatValue(aircraft.operator)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.altitude')}</dt>
          <dd className="telemetry-value">{formatAltitude(aircraft.alt)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.speed')}</dt>
          <dd className="telemetry-value">{formatSpeed(aircraft.speed)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.heading')}</dt>
          <dd className="telemetry-value">{formatHeading(aircraft.track)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.verticalRate')}</dt>
          <dd className="telemetry-value">{formatVerticalRate(aircraft.verticalRate)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.squawk')}</dt>
          <dd className="telemetry-value">{formatValue(aircraft.squawk)}</dd>
        </div>
        <div className="telemetry-row">
          <dt className="telemetry-label">{t('telemetry.dataAge')}</dt>
          <dd className="telemetry-value">{formatDataAge(aircraft.timestamp)}</dd>
        </div>
      </dl>

      {noiseContours && (
        <NoiseBadge lat={aircraft.lat} lon={aircraft.lon} contours={noiseContours} />
      )}
      {aircraft.isStale && (
        <p className="telemetry-badge" role="status">
          {t('map.staleData')}
        </p>
      )}
    </aside>
  );
}

export default TelemetryPanel;
