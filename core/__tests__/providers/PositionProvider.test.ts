// Tests for base PositionProvider class
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PositionProvider } from '../../src/providers/PositionProvider';
import { NETHERLANDS_BBOX } from '../../src/providers/types';
import type { AircraftPosition } from '../../src/providers/types';

// Create a concrete implementation for testing
class TestPositionProvider extends PositionProvider {
  private mockData: AircraftPosition[];
  private shouldFail: boolean = false;

  constructor(mockData: AircraftPosition[] = [], config: Partial<{ pollInterval: number; cacheTTL: number; maxRetries: number; timeout: number }> = {}) {
    super({
      pollInterval: 100,
      cacheTTL: 5,
      maxRetries: 3,
      timeout: 1000,
      ...config,
    });
    this.mockData = mockData;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async fetchFromSource(_bbox: unknown): Promise<AircraftPosition[]> {
    if (this.shouldFail) {
      throw new Error('Mock fetch failure');
    }
    return this.mockData;
  }
}

describe('PositionProvider', () => {
  let provider: TestPositionProvider;
  const mockAircraft: AircraftPosition = {
    icao24: '484001',
    callsign: 'TEST',
    registration: 'PH-TEST',
    type: 'B738',
    operator: 'Test Airline',
    latitude: 52.0,
    longitude: 4.5,
    altitude: 35000,
    speed: 450,
    heading: 270,
    verticalRate: 0,
    squawk: '1200',
    timestamp: 1700000000,
    onGround: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new TestPositionProvider([mockAircraft]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const testProvider = new TestPositionProvider();
      expect(testProvider).toBeDefined();
    });
  });

  describe('fetchPositions', () => {
    it('should return cached data if still valid', async () => {
      // First fetch to populate cache
      const positions1 = await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions1).toHaveLength(1);

      // Advance time by 4 seconds (within cache TTL of 5)
      vi.advanceTimersByTime(4000);

      const positions2 = await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions2).toHaveLength(1);
      expect(positions2[0].icao24).toBe('484001');
    });

    it('should fetch fresh data when cache is stale', async () => {
      // First fetch
      await provider.fetchPositions(NETHERLANDS_BBOX);

      // Advance time beyond cache TTL
      vi.advanceTimersByTime(6000);

      // Add new mock data
      const newAircraft: AircraftPosition = {
        ...mockAircraft,
        icao24: '484002',
      };
      provider = new TestPositionProvider([newAircraft]);

      const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions).toHaveLength(1);
      expect(positions[0].icao24).toBe('484002');
    });

    it('should return cached data on failure if cache exists', async () => {
      // Populate cache
      await provider.fetchPositions(NETHERLANDS_BBOX);

      // Make provider fail
      provider.setShouldFail(true);

      // Should return cached data
      const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions).toHaveLength(1);
      expect(positions[0].icao24).toBe('484001');
    });

    it('should return empty array on failure with no cache', async () => {
      const failingProvider = new TestPositionProvider([], { maxRetries: 1, timeout: 100 });
      failingProvider.setShouldFail(true);

      const positions = await failingProvider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions).toHaveLength(0);
    });
  });

  describe('getDataAge', () => {
    it('should return 0 for fresh data', async () => {
      await provider.fetchPositions(NETHERLANDS_BBOX);
      const age = provider.getDataAge();
      expect(age).toBe(0);
    });

    it('should return time since last update', async () => {
      await provider.fetchPositions(NETHERLANDS_BBOX);
      vi.advanceTimersByTime(10000); // 10 seconds
      const age = provider.getDataAge();
      expect(age).toBe(10);
    });
  });

  describe('isStale', () => {
    it('should return false for fresh data', async () => {
      await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(provider.isStale()).toBe(false);
    });

    it('should return true when data is stale', async () => {
      await provider.fetchPositions(NETHERLANDS_BBOX);
      vi.advanceTimersByTime(11000); // 11 seconds, cache TTL is 5, so stale after 10
      expect(provider.isStale()).toBe(true);
    });
  });

  describe('getLastError', () => {
    it('should return null when no error', () => {
      expect(provider.getLastError()).toBeNull();
    });

    it('should return error after failure', async () => {
      const failingProvider = new TestPositionProvider([], { maxRetries: 1, timeout: 100 });
      failingProvider.setShouldFail(true);
      await failingProvider.fetchPositions(NETHERLANDS_BBOX);
      expect(failingProvider.getLastError()).toBeDefined();
      expect(failingProvider.getLastError()?.message).toContain('Mock fetch failure');
    });
  });

  describe('clearCache', () => {
    it('should clear cached data', async () => {
      await provider.fetchPositions(NETHERLANDS_BBOX);
      provider.clearCache();

      // Next fetch should not use cache
      const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
      expect(positions).toHaveLength(1);
    });
  });
});
