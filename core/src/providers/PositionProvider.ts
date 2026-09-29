// Base PositionProvider interface implementation
// Pure TypeScript - no DOM, no React

import type {
  AircraftPosition,
  BoundingBox,
  PositionProvider as PositionProviderInterface,
  PositionProviderConfig,
} from './types';

export abstract class PositionProvider implements PositionProviderInterface {
  protected lastUpdateTime: number = 0;
  protected lastError: Error | null = null;
  protected cache: AircraftPosition[] = [];
  protected cacheTimestamp: number = 0;
  protected config: PositionProviderConfig;

  constructor(config: Partial<PositionProviderConfig> = {}) {
    this.config = {
      baseUrl: 'https://api.adsb.lol/v2',
      pollInterval: 5000,
      cacheTTL: 5,
      maxRetries: 3,
      timeout: 10000,
      ...config,
    };
  }

  abstract fetchFromSource(bbox: BoundingBox): Promise<AircraftPosition[]>;

  async fetchPositions(bbox: BoundingBox): Promise<AircraftPosition[]> {
    const now = Date.now() / 1000;
    const cacheAge = now - this.cacheTimestamp;

    // Return cached data if still valid
    if (this.cache.length > 0 && cacheAge < this.config.cacheTTL) {
      return this.cache;
    }

    // Fetch fresh data with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const positions = await this.fetchFromSourceWithTimeout(bbox);
        this.cache = positions;
        this.cacheTimestamp = now;
        this.lastUpdateTime = now;
        this.lastError = null;
        return positions;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.lastError = lastError;
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.pollInterval * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, return cached data if available
    if (this.cache.length > 0) {
      return this.cache;
    }

    this.lastError = lastError;
    return [];
  }

  protected async fetchFromSourceWithTimeout(
    bbox: BoundingBox,
  ): Promise<AircraftPosition[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });

    const fetchPromise = this.fetchFromSource(bbox);
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  getDataAge(): number {
    const now = Date.now() / 1000;
    return now - this.lastUpdateTime;
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  isStale(): boolean {
    return this.getDataAge() > this.config.cacheTTL * 2;
  }

  clearCache(): void {
    this.cache = [];
    this.cacheTimestamp = 0;
  }
}
