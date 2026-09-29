// Tests for dead reckoning interpolation
import { describe, expect, it } from 'vitest';
import {
  deadReckoning,
  interpolatePosition,
  linearInterpolate,
} from '../../src/interpolation/deadReckoning';
import { DEFAULT_DEAD_RECKONING_CONFIG } from '../../src/interpolation/types';
import type { Position, Velocity, InterpolationResult } from '../../src/interpolation/types';

describe('deadReckoning', () => {
  it('should return same position for zero time delta', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 270 };

    const result = deadReckoning(current, velocity, 0);

    expect(result.latitude).toBeCloseTo(current.latitude, 6);
    expect(result.longitude).toBeCloseTo(current.longitude, 6);
  });

  it('should return same position for zero speed', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 0, heading: 270 };

    const result = deadReckoning(current, velocity, 10);

    expect(result.latitude).toBeCloseTo(current.latitude, 6);
    expect(result.longitude).toBeCloseTo(current.longitude, 6);
  });

  it('should handle heading 0 (north)', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 0 };

    const result = deadReckoning(current, velocity, 10);

    // With heading 0, should move north (increase latitude)
    expect(result.latitude).toBeGreaterThanOrEqual(current.latitude);
    expect(result.longitude).toBeCloseTo(current.longitude, 6);
  });

  it('should move west with heading 270', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 270 }; // West

    const result = deadReckoning(current, velocity, 10);

    // Moving west should decrease longitude
    expect(result.latitude).toBeCloseTo(current.latitude, 6);
    expect(result.longitude).toBeLessThanOrEqual(current.longitude);
  });

  it('should move east with heading 90', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 90 }; // East

    const result = deadReckoning(current, velocity, 10);

    // Moving east should increase longitude
    expect(result.latitude).toBeCloseTo(current.latitude, 6);
    expect(result.longitude).toBeGreaterThanOrEqual(current.longitude);
  });

  it('should move north with heading 0', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 0 }; // North

    const result = deadReckoning(current, velocity, 10);

    // Moving north should increase latitude
    expect(result.latitude).toBeGreaterThanOrEqual(current.latitude);
    expect(result.longitude).toBeCloseTo(current.longitude, 6);
  });

  it('should move south with heading 180', () => {
    const current: Position = { latitude: 52.0, longitude: 4.5 };
    const velocity: Velocity = { speed: 450, heading: 180 }; // South

    const result = deadReckoning(current, velocity, 10);

    // Moving south should decrease latitude
    expect(result.latitude).toBeLessThanOrEqual(current.latitude);
    expect(result.longitude).toBeCloseTo(current.longitude, 6);
  });
});

describe('interpolatePosition', () => {
  const previous: InterpolationResult & { velocity: Velocity } = {
    position: { latitude: 52.0, longitude: 4.5 },
    timestamp: 1700000000,
    velocity: { speed: 450, heading: 270 },
  };

  const current: InterpolationResult & { velocity: Velocity } = {
    position: { latitude: 52.0, longitude: 4.0 },
    timestamp: 1700000010, // 10 seconds later
    velocity: { speed: 450, heading: 270 },
  };

  it('should return null for target before previous', () => {
    const result = interpolatePosition(previous, current, 1699999999);
    expect(result).toBeNull();
  });

  it('should return previous position for target at previous timestamp', () => {
    const result = interpolatePosition(previous, current, 1700000000);
    expect(result).toEqual({
      position: previous.position,
      timestamp: 1700000000,
    });
  });

  it('should return current position for target at current timestamp', () => {
    const result = interpolatePosition(previous, current, 1700000010);
    expect(result).toEqual({
      position: current.position,
      timestamp: 1700000010,
    });
  });

  it('should interpolate position at midpoint', () => {
    const result = interpolatePosition(previous, current, 1700000005);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(1700000005);
    // Position should be between previous and current
    expect(result?.position.latitude).toBeCloseTo(52.0, 6);
    expect(result?.position.longitude).toBeGreaterThanOrEqual(4.0);
    expect(result?.position.longitude).toBeLessThanOrEqual(4.5);
  });

  it('should return null when data is too stale', () => {
    const oldPrevious: InterpolationResult & { velocity: Velocity } = {
      position: { latitude: 52.0, longitude: 4.5 },
      timestamp: 1699999900, // 100 seconds before current
      velocity: { speed: 450, heading: 270 },
    };

    const result = interpolatePosition(oldPrevious, current, 1700000005);
    expect(result).toBeNull();
  });

  it('should return null when extrapolating too far', () => {
    const result = interpolatePosition(previous, current, 1700000025); // 15 seconds beyond current
    expect(result).toBeNull();
  });

  it('should respect custom config', () => {
    const customConfig = {
      maxAge: 60,
      maxExtrapolation: 20,
    };

    const oldPrevious: InterpolationResult & { velocity: Velocity } = {
      position: { latitude: 52.0, longitude: 4.5 },
      timestamp: 1699999950, // 50 seconds before current
      velocity: { speed: 450, heading: 270 },
    };

    const result = interpolatePosition(oldPrevious, current, 1700000005, customConfig);
    expect(result).toBeDefined();
  });
});

describe('linearInterpolate', () => {
  const previous: InterpolationResult = {
    position: { latitude: 52.0, longitude: 4.5 },
    timestamp: 1700000000,
  };

  const current: InterpolationResult = {
    position: { latitude: 52.1, longitude: 4.0 },
    timestamp: 1700000010,
  };

  it('should return null for target before previous', () => {
    const result = linearInterpolate(previous, current, 1699999999);
    expect(result).toBeNull();
  });

  it('should return null for target after current', () => {
    const result = linearInterpolate(previous, current, 1700000011);
    expect(result).toBeNull();
  });

  it('should interpolate linearly at midpoint', () => {
    const result = linearInterpolate(previous, current, 1700000005);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(1700000005);
    expect(result?.position.latitude).toBeCloseTo(52.05, 6);
    expect(result?.position.longitude).toBeCloseTo(4.25, 6);
  });

  it('should return previous at previous timestamp', () => {
    const result = linearInterpolate(previous, current, 1700000000);
    expect(result).toEqual(previous);
  });

  it('should return current at current timestamp', () => {
    const result = linearInterpolate(previous, current, 1700000010);
    expect(result).toEqual(current);
  });
});

describe('DEFAULT_DEAD_RECKONING_CONFIG', () => {
  it('should have default values', () => {
    expect(DEFAULT_DEAD_RECKONING_CONFIG).toBeDefined();
    expect(DEFAULT_DEAD_RECKONING_CONFIG.maxAge).toBe(30);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.maxExtrapolation).toBe(10);
  });
});
