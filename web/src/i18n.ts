// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// i18n initialisation: NL default, EN secondary (spec §6).
// All UI strings externalised to /locales/{nl,en}.json.
// Session 25: the UI language comes from the URL path (/{lang}/...),
// not from localStorage; the storage key is gone (spec §2).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import nl from '../../locales/nl.json';
import en from '../../locales/en.json';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config/site';

export type LanguageCode = 'nl' | 'en';

export const DEFAULT_LANGUAGE_EXPORT = DEFAULT_LANGUAGE;

/** The language codes from the config (single source of truth) */
export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l): LanguageCode => l.code);

export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_CODES as string[]).includes(value);
}

/** Read the initial language from the URL path (/{lang}/...). */
export function languageFromLocation(pathname: string): LanguageCode {
  const first = pathname.split('/')[1];
  if (first && isLanguageCode(first)) return first;
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    nl: { translation: nl },
    en: { translation: en },
  },
  lng: languageFromLocation(window.location.pathname),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export function setLanguage(language: LanguageCode): void {
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
}

export default i18n;
