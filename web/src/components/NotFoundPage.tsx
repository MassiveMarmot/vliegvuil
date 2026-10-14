// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Not-found view (session 25): unknown language segment or path.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import type { LanguageCode } from '../i18n';
import { pagePath } from '../hooks/useRouter';

export interface NotFoundPageProps {
  language: LanguageCode;
  onNavigate: (path: string) => void;
}

export function NotFoundPage({ language, onNavigate }: NotFoundPageProps): React.ReactElement {
  const { t } = useTranslation();
  const mapHref = pagePath(language, 'map');
  return (
    <main id={'main'} className="not-found-page" tabIndex={-1}>
      <h1>{t('notFound.title', 'Pagina niet gevonden')}</h1>
      <p>{t('notFound.body', 'Deze pagina bestaat niet. Misschien is de link verouderd of verkeerd getypt.')}</p>
      <p>
        <a className="back-to-map" href={mapHref} onClick={(e): void => { e.preventDefault(); onNavigate(mapHref); }}>
          <Icon name="arrow-left" size={16} /> {t('notFound.backToMap', 'Naar de kaart')}
        </a>
      </p>
    </main>
  );
}

export default NotFoundPage;
