// Dead reckoning for aircraft position interpolation

import type { Position, Velocity, InterpolationResult, DeadReckoningConfig } from './types';

const EARTH_RADIUS = 6371000; // meters
const KNOTS_TO_MPS = 0.514444; // knots to meters per second

/**
 * Calculate new position using dead reckoning
 * 
 * @param current - Current position
 * @param velocity - Current velocity (speed in knots, heading in degrees)
 * @param timeDelta - Time delta in seconds
 * @returns New position
 */
export function deadReckoning(
  current: Position,
  velocity: Velocity,
  timeDelta: number,
): Position {
  // Convert speed from knots to meters per second
  const speedMps = velocity.speed * KNOTS_TO_MPS;
  
  // Convert heading from degrees to radians
  const headingRad = (velocity.heading * Math.PI) / 180;
  
  // Calculate distance traveled
  const distance = speedMps * timeDelta;
  
  // Calculate change in latitude and longitude
  const deltaLat = (distance * Math.cos(headingRad)) / EARTH_RADIUS;
  const deltaLon = (distance * Math.sin(headingRad)) / (EARTH_RADIUS * Math.cos((current.latitude * Math.PI) / 180));
  
  // Convert from radians to degrees
  const deltaLatDeg = (deltaLat * 180) / Math.PI;
  const deltaLonDeg = (deltaLon * 180) / Math.PI;
  
  return {
    latitude: current.latitude + deltaLatDeg,
    longitude: current.longitude + deltaLonDeg,
  };
}

/**
 * Interpolate aircraft position at a specific timestamp
 * 
 * @param previous - Previous known position with timestamp
 * @param current - Current known position with timestamp
 * @param targetTimestamp - Target timestamp for interpolation
 * @param config - Dead reckoning configuration
 * @returns Interpolated position and timestamp
 */
export function interpolatePosition(
  previous: InterpolationResult & { velocity: Velocity },
  current: InterpolationResult & { velocity: Velocity },
  targetTimestamp: number,
  config: DeadReckoningConfig = { maxAge: 30 },
): InterpolationResult | null {
  const timeDelta = current.timestamp - previous.timestamp;
  const targetDelta = targetTimestamp - previous.timestamp;
  
  // Check if target timestamp is within valid range
  if (targetDelta < 0 || targetDelta > timeDelta || timeDelta > config.maxAge) {
    return null;
  }
  
  const ratio = targetDelta / timeDelta;
  
  // Use dead reckoning from previous position
  const interpolatedPosition = deadReckoning(
    previous.position,
    previous.velocity,
    targetDelta,
  );
  
  // Blend with current position based on ratio
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
