// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Layer-to-sources mapping for the Attribution page: which sources.json
// entries belong to which map layer, plus the years and the translated
// caveat shown per layer. Licences and dates come from sources.json only.

export interface AttributionSectionConfig {
  /** DOM-anchor and deep-link id for the section */
  id: string;
  /** i18n key for the plain-language heading */
  headingKey: string;
  /** English fallback for the heading */
  headingDefault: string;
  /** sources.json ids shown in this section */
  sourceIds: string[];
  /** Reference years covered by the layer, shown when present */
  years?: number[];
  /** i18n key for the plain-words actual-vs-permitted note, when relevant */
  kindNoteKey?: string;
  /** English fallback for the kind note */
  kindNoteDefault?: string;
  /** i18n key for the one translated caveat shown for the layer */
  caveatKey: string;
  /** English fallback for the caveat */
  caveatDefault: string;
}

export const ATTRIBUTION_SECTIONS: readonly AttributionSectionConfig[] = [
  {
    id: 'aircraft',
    headingKey: 'attribution.sectionAircraft',
    headingDefault: 'Aircraft (live)',
    sourceIds: ['adsb-fi', 'adsb-lol'],
    caveatKey: 'attribution.caveatAircraft',
    caveatDefault:
      'Positions are live ADS-B reports, refreshed every few seconds; a missing aircraft is not proof it is not flying.',
  },
  {
    id: 'noise',
    headingKey: 'attribution.sectionNoise',
    headingDefault: 'Noise contours',
    sourceIds: ['rivm-end-2021-noise', 'clo-nlr-regional'],
    years: [2018, 2021, 2024],
    kindNoteKey: 'attribution.kindNote',
    kindNoteDefault:
      'Some contours show permitted use: the noise the airport is allowed to cause within its government limits. Others show actual traffic: the noise measured or calculated for real flights in that year.',
    caveatKey: 'attribution.caveatNoise',
    caveatDefault: 'Contours show the annual average noise load, not live noise.',
  },
  {
    id: 'airports',
    headingKey: 'attribution.sectionAirports',
    headingDefault: 'Airports',
    sourceIds: ['ourairports'],
    caveatKey: 'attribution.caveatAirports',
    caveatDefault: 'Airport locations and details are reference data, updated occasionally.',
  },
  {
    id: 'basemap',
    headingKey: 'attribution.sectionBasemap',
    headingDefault: 'Basemap',
    sourceIds: ['pdok-brt', 'pdok-brt-tiles', 'natural-earth-neighbours'],
    caveatKey: 'attribution.caveatBasemap',
    caveatDefault:
      'The basemap shows the Netherlands in detail; abroad only country borders are shown. Borders are indicative, not a legal boundary.',
  },
  {
    id: 'aircraft-database',
    headingKey: 'attribution.sectionAircraftDatabase',
    headingDefault: 'Aircraft database',
    sourceIds: ['tar1090-db'],
    caveatKey: 'attribution.caveatAircraftDatabase',
    caveatDefault:
      'Registration and type details come from a community database and may be incomplete or outdated. The database serves as a fallback: missing registration, type or operator is filled in from the snapshot (see the date above); live data always wins.',
  },
];

/** Section id for the noise layer, used by the legend's deep link */
export const NOISE_SECTION_ID = 'noise';

/** Map a sources.json id to its layer section id, or null when unmapped */
export function sectionForSource(sourceId: string): string | null {
  const section = ATTRIBUTION_SECTIONS.find((s): boolean => s.sourceIds.includes(sourceId));
  return section ? section.id : null;
}
