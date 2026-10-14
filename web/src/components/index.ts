// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Export all components. Map is deliberately NOT re-exported here: it
// imports maplibre-gl (~1 MB) and App lazy-loads it directly from
// './components/Map' so the initial chunk stays small (session 24).
export {
  ALTITUDE_BANDS,
  SELECTED_ICON_ID,
  getAircraftColor,
  iconIdForAircraft,
  registerAircraftIcons,
} from './aircraftIcons';
export { Banner, SimpleBanner, type BannerProps } from './Banner';
export { TelemetryPanel, type TelemetryPanelProps } from './TelemetryPanel';
export { SearchBox, searchAircraft, type SearchBoxProps } from './SearchBox';
export { AircraftList, sortAircraft, type AircraftListProps, type SortColumn, type SortDirection } from './AircraftList';
export { NoiseOverlay, NoiseBadge, buildLegendEntries, type NoiseOverlayProps, type NoiseBadgeProps, type NoiseLegendEntry } from './NoiseOverlay';
export { SettingsPanel, type SettingsPanelProps } from './SettingsPanel';
export { AttributionPage, listSources, type AttributionPageProps, type SourceEntry } from './AttributionPage';
