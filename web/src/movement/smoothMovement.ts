// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Smooth movement: dead-reckon aircraft between polls and update the map
// source at a capped frame rate. Pure TypeScript, no DOM besides
// requestAnimationFrame/matchMedia availability checks done by the caller.
import { deadReckoning } from '@vliegvuil/core';
import type { Position, Velocity } from '@vliegvuil/core';

/** Cap extrapolation: never project further than this beyond the last fix */
export const MAX_EXTRAPOLATION_SECONDS = 15;

/** Minimum interval between map source updates (10 fps) */
export const MIN_FRAME_INTERVAL_MS = 100;

export interface ExtrapolatableAircraft {
  id: string;
  lat: number;
  lon: number;
  speed: number | null;
  track: number | null;
  /** Unix timestamp in seconds of the last position fix */
  timestamp: number;
  /** Skip extrapolation (e.g. on ground) */
  onGroundSkip?: boolean;
}

export interface ExtrapolatedPosition {
  id: string;
  lat: number;
  lon: number;
}

/** Dead-reckon a single aircraft from its fix to `nowSeconds` (capped) */
export function extrapolateAircraft(
  ac: ExtrapolatableAircraft,
  nowSeconds: number,
): ExtrapolatedPosition {
  const speed = ac.speed ?? 0;
  const heading = ac.track;
  if (speed <= 0 || heading === null || ac.onGroundSkip === true) {
    return { id: ac.id, lat: ac.lat, lon: ac.lon };
  }
  const elapsed = Math.min(
    Math.max(nowSeconds - ac.timestamp, 0),
    MAX_EXTRAPOLATION_SECONDS,
  );
  if (elapsed <= 0) {
    return { id: ac.id, lat: ac.lat, lon: ac.lon };
  }
  const current: Position = { latitude: ac.lat, longitude: ac.lon };
  const velocity: Velocity = { speed, heading };
  const projected = deadReckoning(current, velocity, elapsed);
  return { id: ac.id, lat: projected.latitude, lon: projected.longitude };
}

/**
 * Dead-reckon a batch of aircraft to `nowSeconds`, capped at
 * MAX_EXTRAPOLATION_SECONDS. Pure function so tests cover the loop body.
 */
export function extrapolateBatch(
  aircraft: Iterable<ExtrapolatableAircraft>,
  nowSeconds: number,
): Map<string, ExtrapolatedPosition> {
  const result = new Map<string, ExtrapolatedPosition>();
  for (const ac of aircraft) {
    result.set(ac.id, extrapolateAircraft(ac, nowSeconds));
  }
  return result;
}

/** Elapsed frame time, capped so a backgrounded tab doesn't teleport aircraft */
export function cappedElapsed(
  lastFrameMs: number,
  nowMs: number,
): number {
  return Math.min(nowMs - lastFrameMs, MIN_FRAME_INTERVAL_MS * 4);
}

export interface AnimationFrameStep {
  /** Millisecond timestamp for this frame */
  nowMs: number;
  /** Seconds since the aircraft's position fix */
  nowSeconds: number;
  /** Positions to write to the map source this frame */
  positions: Map<string, ExtrapolatedPosition>;
}

/**
 * Build the frame scheduler: given a provider of aircraft and a sink for
 * frames, produce a step function for the animation loop. Exposed for
 * unit testing with fake timers.
 */
export function createFrameScheduler(
  getAircraft: () => Iterable<ExtrapolatableAircraft>,
  emitFrame: (frame: AnimationFrameStep) => void,
): {
  /** Called on each animation frame; returns true when a frame was emitted */
  step: (nowMs: number) => boolean;
} {
  let lastFrameMs: number | null = null;
  return {
    step(nowMs: number): boolean {
      const elapsed =
        lastFrameMs === null ? Infinity : cappedElapsed(lastFrameMs, nowMs);
      if (elapsed < MIN_FRAME_INTERVAL_MS) {
        return false;
      }
      lastFrameMs = nowMs;
      const nowSeconds = nowMs / 1000;
      const positions = extrapolateBatch(getAircraft(), nowSeconds);
      emitFrame({ nowMs, nowSeconds, positions });
      return true;
    },
  };
}
