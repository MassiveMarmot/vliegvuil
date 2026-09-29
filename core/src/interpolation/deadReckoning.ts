// Dead reckoning for aircraft position interpolation
// Pure TypeScript - no DOM, no React

import type {
  Position,
  Velocity,
  InterpolationResult,
  DeadReckoningConfig,
} from './types';
import { DEFAULT_DEAD_RECKONING_CONFIG } from './types';

const EARTH_RADIUS = 6371000; // meters
const KNOTS_TO_MPS = 0.514444; // knots to meters per second

/**
 * Calculate new position using dead reckoning (spherical Earth approximation)
 * 
 * Uses the haversine formula to calculate the new position based on:
 * - Current position (lat, lon)
 * - Velocity (speed in knots, heading in degrees)
 * - Time delta in seconds
 * 
 * @param current - Current position in degrees
 * @param velocity - Current velocity (speed in knots, heading in degrees)
 * @param timeDelta - Time delta in seconds
 * @returns New position in degrees
 */
export function deadReckoning(
  current: Position,
  velocity: Velocity,
  timeDelta: number,
): Position {
  // Handle invalid velocity (speed 0 or heading 0)
  if (velocity.speed <= 0 || velocity.heading === null || velocity.heading === 0) {
    return { ...current };
  }

  // Convert speed from knots to meters per second
  const speedMps = velocity.speed * KNOTS_TO_MPS;

  // Convert heading from degrees to radians (0 = North, 90 = East)
  // Note: ADS-B heading is typically true heading (relative to true north)
  const headingRad = (velocity.heading * Math.PI) / 180;

  // Calculate distance traveled in meters
  const distance = speedMps * timeDelta;

  if (distance <= 0) {
    return { ...current };
  }

  // Convert current position to radians
  const latRad = (current.latitude * Math.PI) / 180;
  const lonRad = (current.longitude * Math.PI) / 180;

  // Calculate change in latitude (North-South component)
  const deltaLat = (distance * Math.cos(headingRad)) / EARTH_RADIUS;

  // Calculate change in longitude (East-West component)
  // This depends on latitude - the closer to poles, the more longitude lines converge
  const deltaLon = (distance * Math.sin(headingRad)) / (EARTH_RADIUS * Math.cos(latRad));

  // Convert from radians to degrees
  const newLat = (latRad + deltaLat) * (180 / Math.PI);
  const newLon = (lonRad + deltaLon) * (180 / Math.PI);

  return {
    latitude: newLat,
    longitude: newLon,
  };
}

/**
 * Interpolate aircraft position at a specific timestamp
 * 
 * Uses dead reckoning to estimate position between two known points.
 * Handles edge cases:
 * - Missing velocity data (returns null)
 * - Stale data (beyond maxAge)
 * - Extrapolation beyond current position (limited by maxExtrapolation)
 * 
 * @param previous - Previous known position with timestamp and velocity
 * @param current - Current known position with timestamp and velocity
 * @param targetTimestamp - Target timestamp for interpolation (Unix seconds)
 * @param config - Dead reckoning configuration
 * @returns Interpolated position and timestamp, or null if interpolation not possible
 */
export function interpolatePosition(
  previous: InterpolationResult & { velocity: Velocity },
  current: InterpolationResult & { velocity: Velocity },
  targetTimestamp: number,
  config: DeadReckoningConfig = DEFAULT_DEAD_RECKONING_CONFIG,
): InterpolationResult | null {
  const timeDelta = current.timestamp - previous.timestamp;
  const targetDelta = targetTimestamp - previous.timestamp;

  // Validate inputs
  if (timeDelta <= 0) {
    return null; // Invalid time range
  }

  if (targetDelta < 0) {
    return null; // Target is before previous position
  }

  // Check if data is too stale for interpolation
  if (timeDelta > config.maxAge) {
    return null;
  }

  // Check if we're extrapolating too far beyond current position
  const extrapolationTime = targetDelta - timeDelta;
  if (extrapolationTime > config.maxExtrapolation) {
    return null;
  }

  // If target is exactly at previous or current, return those
  if (targetDelta === 0) {
    return { position: previous.position, timestamp: previous.timestamp };
  }

  if (targetDelta === timeDelta) {
    return { position: current.position, timestamp: current.timestamp };
  }

  // Calculate ratio (0 = previous, 1 = current)
  const ratio = targetDelta / timeDelta;

  // Use dead reckoning from previous position
  const interpolatedPosition = deadReckoning(
    previous.position,
    previous.velocity,
    targetDelta,
  );

  // For interpolation between two points, we blend the dead reckoning result
  // with the current position based on the ratio
  const blendedPosition = {
    latitude:
      previous.position.latitude +
      (interpolatedPosition.latitude - previous.position.latitude) * ratio,
    longitude:
      previous.position.longitude +
      (interpolatedPosition.longitude - previous.position.longitude) * ratio,
  };

  return {
    position: blendedPosition,
    timestamp: targetTimestamp,
  };
}

/**
 * Simple linear interpolation between two positions (no velocity consideration)
 * 
 * This is a fallback when velocity data is not available.
 * 
 * @param previous - Previous position with timestamp
 * @param current - Current position with timestamp
 * @param targetTimestamp - Target timestamp
 * @returns Interpolated position or null
 */
export function linearInterpolate(
  previous: InterpolationResult,
  current: InterpolationResult,
  targetTimestamp: number,
): InterpolationResult | null {
  const timeDelta = current.timestamp - previous.timestamp;
  const targetDelta = targetTimestamp - previous.timestamp;

  if (timeDelta <= 0 || targetDelta < 0 || targetDelta > timeDelta) {
    return null;
  }

  const ratio = targetDelta / timeDelta;

  return {
    position: {
      latitude:
        previous.position.latitude +
        (current.position.latitude - previous.position.latitude) * ratio,
      longitude:
        previous.position.longitude +
        (current.position.longitude - previous.position.longitude) * ratio,
    },
    timestamp: targetTimestamp,
  };
}

/**
 * Create an interpolation function with pre-configured settings
 */
export function createInterpolator(
  config: Partial<DeadReckoningConfig> = {},
): {
  deadReckoning: typeof deadReckoning;
  interpolate: typeof interpolatePosition;
  linearInterpolate: typeof linearInterpolate;
} {
  const mergedConfig: DeadReckoningConfig = {
    ...DEFAULT_DEAD_RECKONING_CONFIG,
    ...config,
  };

  return {
    deadReckoning,
    interpolate: (prev: InterpolationResult & { velocity: Velocity }, curr: InterpolationResult & { velocity: Velocity }, ts: number) =>
      interpolatePosition(prev, curr, ts, mergedConfig),
    linearInterpolate: (prev: InterpolationResult, curr: InterpolationResult, ts: number) =>
      linearInterpolate(prev, curr, ts),
  };
}
