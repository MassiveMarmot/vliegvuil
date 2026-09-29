// Tests for the smooth-movement frame scheduler (fake timers)
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createFrameScheduler,
  extrapolateAircraft,
  extrapolateBatch,
  MAX_EXTRAPOLATION_SECONDS,
  MIN_FRAME_INTERVAL_MS,
  cappedElapsed,
  type ExtrapolatableAircraft,
} from '../src/movement/smoothMovement';

function aircraft(overrides: Partial<ExtrapolatableAircraft> = {}): ExtrapolatableAircraft {
  return {
    id: '484C5A_TRA16U',
    lat: 52.0,
    lon: 4.5,
    speed: 450,
    track: 90, // due east
    timestamp: 1000, // seconds
    ...overrides,
  };
}

describe('extrapolateAircraft', () => {
  it('projects eastbound aircraft east after 1 s', () => {
    const result = extrapolateAircraft(aircraft(), 1001);
    expect(result.lon).toBeGreaterThan(4.5);
    expect(result.lat).toBeCloseTo(52.0, 6);
  });

  it('caps extrapolation at ~15 s', () => {
    const capped = extrapolateAircraft(aircraft(), 1000 + MAX_EXTRAPOLATION_SECONDS + 60);
    const atCap = extrapolateAircraft(aircraft(), 1000 + MAX_EXTRAPOLATION_SECONDS);
    // 60 s beyond the fix must not move further than the 15 s cap
    expect(capped.lon).toBeCloseTo(atCap.lon, 8);
  });

  it('keeps heading 0 (north) moving north', () => {
    const result = extrapolateAircraft(aircraft({ track: 0 }), 1001);
    expect(result.lat).toBeGreaterThan(52.0);
    expect(result.lon).toBeCloseTo(4.5, 6);
  });

  it('does not move aircraft without speed or track', () => {
    expect(extrapolateAircraft(aircraft({ speed: null }), 1005).lon).toBe(4.5);
    expect(extrapolateAircraft(aircraft({ track: null }), 1005).lon).toBe(4.5);
    expect(extrapolateAircraft(aircraft({ speed: 0 }), 1005).lon).toBe(4.5);
  });

  it('does not move aircraft flagged onGroundSkip', () => {
    expect(extrapolateAircraft(aircraft({ onGroundSkip: true }), 1005).lon).toBe(4.5);
  });

  it('never moves backwards in time', () => {
    const result = extrapolateAircraft(aircraft(), 999);
    expect(result.lon).toBe(4.5);
  });
});

describe('extrapolateBatch', () => {
  it('extrapolates every aircraft, keyed by id', () => {
    const batch = extrapolateBatch(
      [aircraft(), aircraft({ id: 'A', track: 0 })],
      1002,
    );
    expect(batch.size).toBe(2);
    expect(batch.get('484C5A_TRA16U')?.lon).toBeGreaterThan(4.5);
    expect(batch.get('A')?.lat).toBeGreaterThan(52.0);
  });
});

describe('cappedElapsed', () => {
  it('caps huge gaps so backgrounded tabs do not teleport aircraft', () => {
    expect(cappedElapsed(0, 60_000)).toBeLessThanOrEqual(MIN_FRAME_INTERVAL_MS * 4);
  });
});

describe('createFrameScheduler', () => {
  let emit: ReturnType<typeof vi.fn>;
  let getAircraft: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    emit = vi.fn();
    getAircraft = vi.fn(() => [aircraft()]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits at most 10 frames per second', () => {
    vi.useFakeTimers();
    const scheduler = createFrameScheduler(getAircraft, emit);
    let emitted = 0;
    // Simulate 60 rAF callbacks (60 fps display) over 1 s
    for (let i = 0; i < 60; i++) {
      if (scheduler.step(i * (1000 / 60))) {
        emitted += 1;
      }
    }
    expect(emitted).toBeLessThanOrEqual(10);
  });

  it('emits extrapolated positions that advance with time', () => {
    vi.useFakeTimers();
    getAircraft.mockReturnValue([aircraft({ timestamp: 0 })]);
    const scheduler = createFrameScheduler(getAircraft, emit);
    scheduler.step(0);
    scheduler.step(1000);
    expect(emit).toHaveBeenCalledTimes(2);
    const first = emit.mock.calls[0]?.[0].positions.get('484C5A_TRA16U');
    const second = emit.mock.calls[1]?.[0].positions.get('484C5A_TRA16U');
    // Frame at t=0 is exactly the fix; frame at t=1000 ms projects 1 s ahead
    expect(first?.lon).toBe(4.5);
    expect(second?.lon).toBeGreaterThan(first?.lon as number);
  });

  it('uses the latest aircraft data on each frame', () => {
    vi.useFakeTimers();
    const scheduler = createFrameScheduler(getAircraft, emit);
    scheduler.step(0);
    getAircraft.mockReturnValue([aircraft({ id: 'NEW' })]);
    scheduler.step(200);
    expect(emit.mock.calls[1]?.[0].positions.has('NEW')).toBe(true);
  });
});
