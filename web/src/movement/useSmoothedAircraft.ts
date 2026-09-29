// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// React hook wrapping the movement frame scheduler. With
// prefers-reduced-motion the loop never runs: positions jump on each
// data update instead.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayAircraft } from '../types';
import {
  createFrameScheduler,
  extrapolateBatch,
  type ExtrapolatableAircraft,
  type ExtrapolatedPosition,
} from './smoothMovement';

export interface UseSmoothedAircraftReturn {
  /** Extrapolated positions keyed by aircraft id (last emitted frame) */
  smoothed: Map<string, ExtrapolatedPosition>;
  /** True when the animation loop is running */
  isAnimating: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Dead-reckon aircraft between polls and cap the map update rate at 10 fps.
 * With prefers-reduced-motion (or no rAF), returns the raw positions only.
 */
export function useSmoothedAircraft(
  aircraft: Map<string, DisplayAircraft>,
): UseSmoothedAircraftReturn {
  const reducedMotion = prefersReducedMotion();
  const [smoothed, setSmoothed] = useState<
    Map<string, ExtrapolatedPosition>
  >(() => extrapolateBatch([], 0));
  const [isAnimating, setIsAnimating] = useState(false);
  const aircraftRef = useRef(aircraft);
  aircraftRef.current = aircraft;

  // Snapshot of extrapolatable aircraft, recomputed when data changes
  const snapshot = useMemo<ExtrapolatableAircraft[]>(() => {
    const out: ExtrapolatableAircraft[] = [];
    for (const ac of aircraft.values()) {
      out.push({
        id: ac.id,
        lat: ac.lat,
        lon: ac.lon,
        speed: ac.speed,
        track: ac.track,
        timestamp: ac.timestamp,
        onGroundSkip: ac.onGround,
      });
    }
    return out;
  }, [aircraft]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (reducedMotion || typeof requestAnimationFrame !== 'function') {
      // Reduced motion: no loop; positions jump to the latest fix on each
      // data update instead of being extrapolated.
      const raw = new Map<string, ExtrapolatedPosition>();
      for (const ac of snapshotRef.current) {
        raw.set(ac.id, { id: ac.id, lat: ac.lat, lon: ac.lon });
      }
      setSmoothed(raw);
      setIsAnimating(false);
      return;
    }

    const scheduler = createFrameScheduler(
      () => snapshotRef.current,
      (frame) => {
        setSmoothed(frame.positions);
      },
    );

    let rafId = 0;
    let cancelled = false;
    const tick = (): void => {
      if (cancelled) {
        return;
      }
      scheduler.step(Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    setIsAnimating(true);

    return (): void => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      setIsAnimating(false);
    };
    // The snapshot ref carries the data; the effect only reacts to the
    // reduced-motion decision.
  }, [reducedMotion]);

  return { smoothed, isAnimating };
}

export default useSmoothedAircraft;
