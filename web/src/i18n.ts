// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// i18n initialisation: NL default, EN secondary (spec §6).
// All UI strings externalised to /locales/{nl,en}.json.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import nl from '../../locales/nl.json';
import en from '../../locales/en.json';

export const STORAGE_KEY_LANGUAGE = 'vliegvuil.language';
export const DEFAULT_LANGUAGE = 'nl';

/** Read the persisted language, defaulting to NL (spec §2: NL default, EN) */
export function persistedLanguage(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (stored === 'nl' || stored === 'en') return stored;
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to default
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    nl: { translation: nl },
    en: { translation: en },
  },
  lng: persistedLanguage(),
  fallbackLng: 'nl',
  interpolation: { escapeValue: false },
});

export function setLanguage(language: 'nl' | 'en'): void {
  void i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(STORAGE_KEY_LANGUAGE, language);
  } catch {
    // Ignore persistence failures; language still applies for this session
  }
  document.documentElement.lang = language;
}

export default i18n;
