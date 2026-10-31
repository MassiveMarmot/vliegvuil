// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Base PositionProvider interface implementation
// Pure TypeScript - no DOM, no React

import { RateLimitError } from './types';
import type {
  AircraftPosition,
  BoundingBox,
  PositionProvider as PositionProviderInterface,
  PositionProviderConfig,
} from './types';

/**
 * After a failed fetch, the cache is served only while it is younger than
 * this multiple of cacheTTL; the caller can detect the failed poll via
 * getLastError() (which stays set) and mark the data stale. An older cache
 * is never served — the error is rethrown and the caller keeps its own data.
 */
export const STALE_CACHE_MAX_AGE_MULTIPLIER = 3;

export abstract class PositionProvider implements PositionProviderInterface {
  protected lastUpdateTime: number = 0;
  protected lastError: Error | null = null;
  protected cache: AircraftPosition[] = [];
  protected cacheTimestamp: number = 0;
  protected config: PositionProviderConfig;

  constructor(config: Partial<PositionProviderConfig> = {}) {
    this.config = {
      baseUrl: 'https://opendata.adsb.fi/api/v2',
      pollInterval: 5000,
      cacheTTL: 5,
      maxRetries: 3,
      timeout: 10000,
      ...config,
    };
  }

  abstract fetchFromSource(
    bbox: BoundingBox,
    signal?: AbortSignal,
  ): Promise<AircraftPosition[]>;

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
        // Timestamps reflect when the fetch completed, not when it started:
        // a slow response must not make the cache look younger than it is.
        const completedAt = Date.now() / 1000;
        this.cache = positions;
        this.cacheTimestamp = completedAt;
        this.lastUpdateTime = completedAt;
        this.lastError = null;
        return positions;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.lastError = lastError;

        // 429: retrying only burns more of the exhausted budget. Surface it
        // so the caller can pause polling (cache is not served: it is stale
        // by definition at this point and the caller keeps its own data).
        if (error instanceof RateLimitError) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.pollInterval * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed. Never fail silently: serve the cache only while
    // it is young enough to be worth showing, with lastError kept set so
    // callers can tell this poll failed (getLastError()) and mark the data
    // stale (isStale()); otherwise rethrow so the caller's error handling
    // runs. Never return a silent empty array on failure.
    const cacheAgeAfterFailure = Date.now() / 1000 - this.cacheTimestamp;
    if (
      this.cache.length > 0 &&
      cacheAgeAfterFailure <
        this.config.cacheTTL * STALE_CACHE_MAX_AGE_MULTIPLIER
    ) {
      return this.cache;
    }

    throw lastError ?? new Error('Position fetch failed');
  }

  protected async fetchFromSourceWithTimeout(
    bbox: BoundingBox,
  ): Promise<AircraftPosition[]> {
    // Abort the underlying fetch on timeout (otherwise hung requests keep
    // holding one of the browser's limited connection slots) and always
    // clear the timer.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });

    try {
      return await Promise.race([
        this.fetchFromSource(bbox, controller.signal),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  getDataAge(): number {
    const now = Date.now() / 1000;
    return now - this.lastUpdateTime;
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Server-anchored clock (unix seconds). The base class has no response
   * `now` to anchor to, so it returns the client clock; concrete
   * providers whose upstream response carries a server timestamp override
   * this (see AdsbfiProvider).
   */
  getServerNow(): number {
    return Date.now() / 1000;
  }

  isStale(): boolean {
    return this.getDataAge() > this.config.cacheTTL * 2;
  }

  clearCache(): void {
    this.cache = [];
    this.cacheTimestamp = 0;
  }
}
