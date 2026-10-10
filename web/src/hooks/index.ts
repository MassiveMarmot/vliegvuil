// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Export all hooks. useMap is deliberately NOT re-exported here: it
// imports maplibre-gl and must stay out of the initial bundle (session 24).
// Map.tsx imports it directly from './useMap'.
export { useAircraftData, type UseAircraftDataReturn, toDisplayAircraft, generateAircraftId } from './useAircraftData';
