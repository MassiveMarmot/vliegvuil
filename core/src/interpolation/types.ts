// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Interpolation types

export interface Position {
  latitude: number;
  longitude: number;
}

export interface Velocity {
  speed: number; // knots
  heading: number; // degrees, 0-360
}

export interface InterpolationResult {
  position: Position;
  timestamp: number; // Unix timestamp in seconds
}

export interface DeadReckoningConfig {
  maxAge: number; // seconds - maximum age of data for interpolation
  maxExtrapolation: number; // seconds - maximum time to extrapolate beyond last known position
}

// Default configuration for dead reckoning
export const DEFAULT_DEAD_RECKONING_CONFIG: DeadReckoningConfig = {
  maxAge: 30, // Don't interpolate if data is older than 30 seconds
  maxExtrapolation: 10, // Don't extrapolate more than 10 seconds beyond last known position
};
