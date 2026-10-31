// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Single enrichment point (review finding: the snapshot was fetched but
// only ever reached <Map>, while the telemetry panel, list and search
// used the raw fleet — so /data/aircraft.json was loaded for nothing).
// The snapshot loads ONCE into state (a stale-load race is ignored via
// the unmount/ StrictMode-re-run guard), and every render enriches the
// live fleet through it with plain Map work: live values win, the
// snapshot only fills gaps (enrichWithSnapshot semantics, unchanged).
import { useEffect, useMemo, useState } from 'react';
import type { DisplayAircraft } from '../types';
import {
  loadAircraftSnapshot,
  enrichWithSnapshot,
  type AircraftSnapshotEntry,
} from '../airports/aircraftSnapshot';

export function useEnrichedAircraft(
  aircraft: ReadonlyMap<string, DisplayAircraft>,
): Map<string, DisplayAircraft> {
  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, AircraftSnapshotEntry>>(
    () => new Map(),
  );

  // Load the snapshot once, LAZILY: only once the fleet is non-empty (the
  // snapshot fills gaps in live aircraft; with no aircraft there is
  // nothing to fill, so routes without data never fetch the file at all
  // — same laziness the old enrichFleet path had). A result from an
  // unmounted/re-run effect is ignored (the loader caches, so a StrictMode
  // double-invoke shares one fetch and only the live effect's result lands).
  const hasAircraft = aircraft.size > 0;
  useEffect((): (() => void) => {
    if (!hasAircraft) {
      return (): void => {
        /* nothing to cancel */
      };
    }
    let cancelled = false;
    void loadAircraftSnapshot().then((data): void => {
      if (!cancelled) {
        setSnapshot(data);
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [hasAircraft]);

  // Enrich per render: Map lookup per aircraft against the loaded
  // snapshot. Returns the SAME map instance when nothing changed, so
  // downstream memos (smoothing, layers) keep their referential
  // stability when the snapshot fills nothing new.
  return useMemo((): Map<string, DisplayAircraft> => {
    if (snapshot.size === 0) {
      return aircraft as Map<string, DisplayAircraft>;
    }
    let changed = false;
    const fleet = new Map<string, DisplayAircraft>();
    for (const [id, ac] of aircraft) {
      const enriched = enrichWithSnapshot(ac, snapshot);
      changed ||= enriched !== ac;
      fleet.set(id, enriched);
    }
    return changed ? fleet : (aircraft as Map<string, DisplayAircraft>);
  }, [aircraft, snapshot]);
}

export default useEnrichedAircraft;
