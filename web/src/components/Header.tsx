// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Header + menu (session 25): replaces the floating buttons. The header
// is a landmark; the menu is not a modal (focus moves in on open, Esc
// closes, focus returns to the hamburger — same pattern as the telemetry
// panel, spec §6; not a focus trap). The language switcher lists every
// supported language from the config, labelled in its own language.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '../i18n';
import { Logo } from './Logo';
import { pagePath, type RouteName } from '../hooks/useRouter';
import {
  SITE_NAME,
  SUPPORTED_LANGUAGES,
  BLUESKY_URL,
  DONATION_URL,
} from '../config/site';

export interface HeaderProps {
  language: LanguageCode;
  route: RouteName;
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
  onToggleList: () => void;
  /** Search box renders inside the header (icon button, expands on demand) */
  search?: React.ReactNode;
  /** Skip-link target id ("map" region or list view) */
  skipTargetId: string;
}



export function Header({ language, route, onNavigate, onOpenSettings, onToggleList, search, skipTargetId }: HeaderProps): React.ReactElement {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((): void => {
    setMenuOpen(false);
  }, []);

  // Esc closes the menu; focus returns to the hamburger (spec §6 pattern)
  useEffect((): (() => void) => {
    if (!menuOpen) return (): void => undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        menuButtonRef.current?.focus();
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Focus moves into the menu on open (not a trap; Tab can leave)
  useEffect((): void => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    }
  }, [menuOpen]);

  // Close on outside click (pointer; keyboard Esc handled above)
  useEffect((): (() => void) => {
    if (!menuOpen) return (): void => undefined;
    const onPointerDown = (event: PointerEvent): void => {
      // Ignore the Menu button itself: its onClick toggles the menu, so a
      // pointerdown on it must not close here first (close-then-reopen
      // made the button unable to close the menu). Only a pointerdown
      // outside both the panel and the button closes directly.
      const target = event.target as Node;
      const insidePanel = menuRef.current?.contains(target) ?? false;
      const insideButton = menuButtonRef.current?.contains(target) ?? false;
      if (!insidePanel && !insideButton) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  const menuId = 'site-menu';
  const link = (target: RouteName): React.ReactElement => (
    <a
      href={pagePath(language, target)}
      aria-current={route === target ? 'page' : undefined}
      onClick={(e): void => {
        e.preventDefault();
        closeMenu();
        onNavigate(pagePath(language, target));
      }}
    >
      {target === 'map' ? t('nav.map', 'Kaart') : target === 'about' ? t('nav.about', 'Over') : t('nav.attribution', 'Bronnen')}
    </a>
  );

  return (
    <>
      <a className="skip-link" href={`#${skipTargetId}`}>{t('nav.skip', 'Naar de kaart')}</a>
      <header className="app-header">
        <a
          className="brand"
          href={pagePath(language, 'map')}
          onClick={(e): void => {
            e.preventDefault();
            onNavigate(pagePath(language, 'map'));
          }}
        >
          <Logo />
          <span>{SITE_NAME}</span>
        </a>
        <div className="header-tools">
          {search}
          <button
            type="button"
            className="header-button"
            onClick={onToggleList}
          >
            {t('nav.list', 'Lijst')}
          </button>
          <button
            type="button"
            className="header-button menu-toggle"
            ref={menuButtonRef}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-haspopup="true"
            onClick={(): void => setMenuOpen((prev): boolean => !prev)}
          >
            {t('nav.menu', 'Menu')}
          </button>
        </div>
        {menuOpen && (
          <div className="site-menu" id={menuId} ref={menuRef} role="presentation">
            <nav aria-label={t('nav.menuLabel', 'Hoofdmenu')}>
              <ul>
                <li>{link('map')}</li>
                <li>{link('about')}</li>
                <li>{link('attribution')}</li>
                <li>
                  <button type="button" onClick={(): void => { closeMenu(); onOpenSettings(); }}>
                    {t('nav.settings', 'Instellingen')}
                  </button>
                </li>
                {DONATION_URL && (
                  <li>
                    <a href={DONATION_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      {t('nav.donate', 'Doneren')} <span className="visually-hidden">{t('nav.opensNewTab', 'opent in een nieuw tabblad')}</span>
                    </a>
                  </li>
                )}
              </ul>
            </nav>
            <nav className="language-switch" aria-label={t('nav.language', 'Taal')}>
              <ul>
                {SUPPORTED_LANGUAGES.map((lang): React.ReactElement => (
                  <li key={lang.code}>
                    <a
                      href={pagePath(lang.code, route === 'not-found' ? 'map' : route)}
                      hrefLang={lang.code}
                      lang={lang.code}
                      aria-current={lang.code === language ? 'true' : undefined}
                      onClick={(e): void => {
                        e.preventDefault();
                        closeMenu();
                        onNavigate(pagePath(lang.code, route === 'not-found' ? 'map' : route));
                      }}
                    >
                      {lang.selfName}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {/* Bluesky renders only when configured (currently null) */}
            {BLUESKY_URL && (
              <nav aria-label={t('nav.contact', 'Contact')}>
                <ul>
                  <li>
                    <a href={BLUESKY_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      Bluesky <span className="visually-hidden">{t('nav.opensNewTab', 'opent in een nieuw tabblad')}</span>
                    </a>
                  </li>
                </ul>
              </nav>
            )}
          </div>
        )}
      </header>
    </>
  );
}

export default Header;
