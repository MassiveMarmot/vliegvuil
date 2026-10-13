// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// About page (session 25). Every privacy claim below is checked against
// the code and Caddyfile; nothing may claim analytics, cookies, logs or
// HSTS beyond what exists today (analytics arrive in session 25c; HSTS
// is not enabled — no header is sent).

import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { LanguageCode } from '../i18n';
import { pagePath } from '../hooks/useRouter';
import {
  GITHUB_ISSUES_URL,
  BLUESKY_URL,
  LICENSE_URL,
  LICENSE_NAME,
  LICENSE_HOLDER_HANDLE,
} from '../config/site';

export interface AboutPageProps {
  language: LanguageCode;
  onNavigate: (path: string) => void;
  /** Announce for screen readers (existing live region) */
  onAnnounce?: (message: string) => void;
}

export function AboutPage({ language, onNavigate }: AboutPageProps): React.ReactElement {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const attributionHref = pagePath(language, 'attribution');
  const mapHref = pagePath(language, 'map');

  return (
    <main id={'main'} className="about-page" tabIndex={-1}>
      <h1>{t('about.title', 'Over {{site}}', { site: t('app.title') })}</h1>
      <section>
        <h2>{t('about.what.title', 'Wat is deze site?')}</h2>
        <p>
          {t('about.what.body', 'Deze site toont live vliegtuigbewegingen boven Nederland samen met officiële geluidscontouren rondom Nederlandse luchthavens. Het is een onafhankelijk, niet-commercieel project. De dekking is momenteel beperkt tot Nederland.')}
        </p>
      </section>
      <section>
        <h2>{t('about.principle.title', 'Metingen, geen oorzaken')}</h2>
        <p>{t('about.principle.body', 'Deze site toont metingen: wat er in de lucht is en waar de geluidscontouren liggen. Geen medische claims en geen uitspraken over oorzaken, tenzij een officiële studie wordt aangehaald. Geluidscontouren zijn jaargemiddelden van de geluidsbelasting — geen live geluid.')}</p>
      </section>
      <section>
        <h2>{t('about.sources.title', 'Gegevensbronnen')}</h2>
        <p>
          <Trans i18nKey="about.sources.body" t={t}>
            Alle gegevens komen van openbare bronnen met een open licentie. Bekijk de
            complete lijst met bronnen, data en licenties op de
            <a href={attributionHref} onClick={(e): void => { e.preventDefault(); onNavigate(attributionHref); }}>
              bronnenpagina
            </a>.
          </Trans>
        </p>
      </section>
      <section>
        <h2>{t('about.privacy.title', 'Privacy')}</h2>
        <p>{t('about.privacy.body', 'Deze site gebruikt geen analytics, geen cookies en geen tracking. Er worden geen toegangslogs bijgehouden en je IP-adres wordt niet doorgestuurd naar de databron voor vliegtuigposities. De site vraagt je browser alleen om de app zelf, de kaartachtergrond en de vliegtuigdata — geen enkele derde partij wordt benaderd. Het enige dat lokaal wordt opgeslagen, is je voorkeur voor eenheden (in je eigen browser, nooit verstuurd).')}</p>
      </section>
      <section>
        <h2>{t('about.license.title', 'Licentie')}</h2>
        <p>
          <Trans
            i18nKey="about.license.body"
            t={t}
            values={{ license: LICENSE_NAME, year, holder: LICENSE_HOLDER_HANDLE }}
            components={[<a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{LICENSE_NAME}</a>]}
          >
            {'De code is gelicentieerd onder de {{license}}. Copyright (c) {{year}} {{holder}}.'}
          </Trans>
        </p>
      </section>
      <section>
        <h2>{t('about.contact.title', 'Contact')}</h2>
        <p>
          <Trans
            i18nKey="about.contact.body"
            t={t}
            components={[
              <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                {t('about.contact.githubIssues', 'GitHub Issues')}
              </a>,
              BLUESKY_URL ? (
                <a href={BLUESKY_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                  {t('about.contact.bluesky', 'Bluesky')}
                </a>
              ) : (
                <span />
              ),
            ]}
          >
            {t('about.contact.body', 'Meld problemen of ideeën via <1>GitHub Issues</1>.')}
          </Trans>
        </p>
      </section>
      <p>
        <a className="back-to-map" href={mapHref} onClick={(e): void => { e.preventDefault(); onNavigate(mapHref); }}>
          {t('about.backToMap', '← Naar de kaart')}
        </a>
      </p>
    </main>
  );
}

export default AboutPage;
