// Settings panel: language (NL/EN) and units (ft/m, kt/km/h), persisted in
// localStorage only (spec §2, §6). Managed focus, Esc to close.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, DEFAULT_LANGUAGE } from '../i18n';
import { type UnitSettings, saveUnits } from '../units';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  units: UnitSettings;
  onUnitsChange: (units: UnitSettings) => void;
}

/**
 * Settings panel — language and units. Managed focus: focus moves in on open
 * and returns on close (button or Esc), consistent with the telemetry panel.
 */
export function SettingsPanel({ open, onClose, units, onUnitsChange }: SettingsPanelProps): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [language, setLang] = useState<'nl' | 'en'>(
    (i18n.language === 'en' ? 'en' : DEFAULT_LANGUAGE) as 'nl' | 'en',
  );

  useEffect((): void => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();
  }, [open]);

  useEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    return (): void => {
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const handleLanguage = useCallback((next: 'nl' | 'en'): void => {
    setLang(next);
    setLanguage(next);
  }, []);

  const handleAltitude = useCallback(
    (altitude: UnitSettings['altitude']): void => {
      const next = { ...units, altitude };
      onUnitsChange(next);
      saveUnits(next);
    },
    [units, onUnitsChange],
  );

  const handleSpeed = useCallback(
    (speed: UnitSettings['speed']): void => {
      const next = { ...units, speed };
      onUnitsChange(next);
      saveUnits(next);
    },
    [units, onUnitsChange],
  );

  if (!open) return null;

  return (
    <aside
      ref={panelRef}
      className="settings-panel"
      role="region"
      aria-label={t('settings.title', 'Instellingen')}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="settings-header">
        <h2 className="settings-title">{t('settings.title', 'Instellingen')}</h2>
        <button
          type="button"
          className="settings-close"
          onClick={onClose}
          aria-label={t('telemetry.close', 'Sluiten')}
        >
          ×
        </button>
      </header>

      <div className="settings-group">
        <h3 className="settings-label">{t('settings.language', 'Taal')}</h3>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-language"
            value="nl"
            checked={language === 'nl'}
            onChange={(): void => handleLanguage('nl')}
          />
          Nederlands
        </label>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-language"
            value="en"
            checked={language === 'en'}
            onChange={(): void => handleLanguage('en')}
          />
          English
        </label>
      </div>

      <div className="settings-group">
        <h3 className="settings-label">{t('settings.units', 'Eenheden')}</h3>
        <h4 className="settings-sublabel">{t('settings.altitudeUnit', 'Hoogte')}</h4>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-altitude"
            value="ft"
            checked={units.altitude === 'ft'}
            onChange={(): void => handleAltitude('ft')}
          />
          {t('settings.feet', 'Feet')}
        </label>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-altitude"
            value="m"
            checked={units.altitude === 'm'}
            onChange={(): void => handleAltitude('m')}
          />
          {t('settings.meters', 'Meters')}
        </label>

        <h4 className="settings-sublabel">{t('settings.speedUnit', 'Snelheid')}</h4>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-speed"
            value="kt"
            checked={units.speed === 'kt'}
            onChange={(): void => handleSpeed('kt')}
          />
          {t('settings.knots', 'Knots')}
        </label>
        <label className="settings-option">
          <input
            type="radio"
            name="settings-speed"
            value="kmh"
            checked={units.speed === 'kmh'}
            onChange={(): void => handleSpeed('kmh')}
          />
          {t('settings.kmh', 'km/h')}
        </label>
      </div>
    </aside>
  );
}

export default SettingsPanel;
