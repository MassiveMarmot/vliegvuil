// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Airport info popup (session 23): plain-language name, codes and
// status; translated NL/EN; no claims about noise or health. Managed
// focus like the telemetry panel: focus moves in on open, returns on
// close, Esc closes. Map symbol layers are not focusable, so this popup
// is the keyboard/screen-reader path for airport info.
import React, { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import type { AirportStatus } from '../airports/airports';

export interface AirportPopupProps {
  icao: string;
  iata?: string | null;
  name: string;
  status: AirportStatus | null;
  onClose: () => void;
}

/**
 * Airport popup card: a friendly info card (spec §3), not a radar HUD.
 * Status is plain language, translated; unknown status shows nothing
 * rather than a guess (the status overlay is unreliable for types we
 * do not show — see the data caveat in the session 23 PR).
 */
export function AirportPopup({ icao, iata, name, status, onClose }: AirportPopupProps): React.ReactElement {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect((): (() => void) => {
    previouslyFocusedRef.current = document.activeElement;
    closeRef.current?.focus();
    return (): void => {
      const previous = previouslyFocusedRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  const statusText =
    status === 'commercial'
      ? t('airport.statusCommercial', 'Commercieel')
      : status === 'military-shared'
        ? t('airport.statusMilitaryShared', 'Militair, deels burgerluchtvaart')
        : status === 'planned'
          ? t('airport.statusPlanned', 'In aanbouw / gepland')
          : null;

  return (
    <div
      className="airport-popup"
      role="dialog"
      aria-label={t('airport.title', 'Luchthaveninformatie')}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        bottom: '4.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        maxWidth: '20rem',
        zIndex: 25,
      }}
      data-testid="airport-popup"
    >
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{name}</h3>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>
        {icao}
        {iata ? ` · ${iata}` : ''}
      </p>
      {statusText !== null && (
        <p
          style={{ margin: '0 0 0.5rem', fontSize: '0.875rem' }}
          data-testid="airport-status"
        >
          {statusText}
        </p>
      )}
      <button
        ref={closeRef}
        type="button"
        className="airport-popup-close"
        onClick={onClose}
        aria-label={t('telemetry.close', 'Sluiten')}
        style={{ fontSize: '0.875rem' }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

export default AirportPopup;
