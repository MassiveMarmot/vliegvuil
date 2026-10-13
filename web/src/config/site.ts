// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Site configuration (session 25). The site name and origin are
// configuration, never hard-coded elsewhere (spec: a sibling site may
// reuse the code). GitHub URLs derive from the repository remote; the
// repo is MassiveMarmot/vliegvuil. Bluesky and donation stay null until
// they exist (no placeholder, no broken link).

export const SITE_NAME = import.meta.env.VITE_SITE_NAME ?? 'VliegVuil.nl';
export const SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN ?? 'https://vliegvuil.nl';

export interface LanguageConfig {
  code: 'nl' | 'en';
  /** The language's own name, rendered in its own language (lang attr) */
  selfName: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageConfig[] = [
  { code: 'nl', selfName: 'Nederlands' },
  { code: 'en', selfName: 'English' },
];

export const DEFAULT_LANGUAGE = 'nl';

export const GITHUB_REPO_URL = 'https://github.com/MassiveMarmot/vliegvuil';
export const GITHUB_ISSUES_URL = 'https://github.com/MassiveMarmot/vliegvuil/issues';

export const BLUESKY_URL: string | null = null;
export const DONATION_URL: string | null = null;

/** Licence line: MPL-2.0 (repo licence, decided in session 13) */
export const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;
export const LICENSE_NAME = 'MPL-2.0';
export const LICENSE_HOLDER_HANDLE = 'MassiveMarmot';
