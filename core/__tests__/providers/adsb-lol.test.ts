// Tests for ADS-B.lol position provider
// Fixture comes from a real response fetched from
// https://api.adsb.lol/v2/point/52.1/5.3/50 (see fixture file for details)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AdsblolProvider,
  radiusForBoundingBox,
} from '../../src/providers/adsb-lol';
import { NETHERLANDS_BBOX } from '../../src/providers/types';
import type { AdsblolAircraft } from '../../src/providers/adsb-lol';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'adsb-lol-point.json',
);
interface Fixture {
  ac: AdsblolAircraft[];
  now: number;
  fetched_from: string;
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

global.fetch = vi.fn();

describe('AdsblolProvider', () => {
  let provider: AdsblolProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AdsblolProvider();
  });

  describe('radiusForBoundingBox', () => {
    it('computes a radius large enough for the NL bbox corners', () => {
      const radius = radiusForBoundingBox(NETHERLANDS_BBOX);
      expect(radius).toBeGreaterThan(100);
      expect(radius).toBeLessThanOrEqual(250);
    });

    it('caps the radius at the API maximum of 250 nm', () => {
      const radius = radiusForBoundingBox({
        minLatitude: -60,
        maxLatitude: 60,
        minLongitude: -60,
        maxLongitude: 60,
      });
      expect(radius).toBe(250);
    });
  });

  describe('buildUrl / fetchFromSource', () => {
    it('requests the real /v2/point/{lat}/{lon}/{radius} shape', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response);
      await provider.fetchFromSource(NETHERLANDS_BBOX);
      const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;
      expect(calledUrl).toMatch(
        /\/v2\/point\/52\.25\d*\/5\.0\d*\/\d+$/,
      );
      expect(calledUrl).not.toContain('lat=');
    });

    it('parses the real fixture: airborne aircraft keep altitude, callsign, squawk', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      expect(positions.length).toBeGreaterThan(0);
      const airborne = positions.find((p) => p.callsign === 'TRA16U');
      expect(airborne).toBeDefined();
      expect(airborne?.icao24).toBe('484C5A');
      expect(airborne?.altitude).toBeGreaterThan(0);
      expect(airborne?.altitude).toBe(Math.round(
        fixture.ac.find((a) => a.hex === '484c5a')?.alt_baro as number,
      ));
      expect(airborne?.onGround).toBe(false);
      expect(airborne?.squawk).toBe('1000');
      expect(airborne?.timestamp).toBe(
        Math.round(fixture.now - (fixture.ac.find((a) => a.hex === '484c5a')?.seen_pos ?? 0)),
      );
    });

    it('handles alt_baro "ground": onGround true, altitude null', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      const ground = positions.find(
        (p) => p.icao24 === '4854CB',
      );
      expect(ground).toBeDefined();
      expect(ground?.onGround).toBe(true);
      expect(ground?.altitude).toBeNull();
    });

    it('keeps heading 0 (north) as 0, not null', async () => {
      const response = {
        ...fixture,
        ac: [
          {
            ...fixture.ac.find((a) => a.hex === '484c5a')!,
            hex: '484c5a',
            track: 0,
          },
        ],
      };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      expect(positions[0]?.heading).toBe(0);
      expect(positions[0]?.heading).not.toBeNull();
    });

    it('keeps heading undefined when the feed has no track', async () => {
      const response = {
        ...fixture,
        ac: [
          {
            ...fixture.ac.find((a) => a.hex === '484c5a')!,
            hex: '484c5a',
            track: undefined,
          },
        ],
      };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      expect(positions[0]?.heading).toBeNull();
    });

    it('filters aircraft without lat/lon', async () => {
      const response = {
        ...fixture,
        ac: [{ hex: 'deadbeef' } as AdsblolAircraft, ...fixture.ac],
      };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      expect(positions.find((p) => p.icao24 === 'DEADBEEF')).toBeUndefined();
    });

    it('handles API errors', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);
      await expect(provider.fetchFromSource(NETHERLANDS_BBOX)).rejects.toThrow(
        'ADS-B.lol API error: 500 Internal Server Error',
      );
    });

    it('throws RateLimitError with Retry-After on 429', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '42' }),
      } as Response);
      await expect(provider.fetchFromSource(NETHERLANDS_BBOX)).rejects.toMatchObject({
        name: 'RateLimitError',
        retryAfterMs: 42000,
      });
    });

    it('does not retry a 429 in fetchPositions', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
      } as Response);
      const p = new AdsblolProvider({ maxRetries: 3 });
      await expect(p.fetchPositions(NETHERLANDS_BBOX)).rejects.toMatchObject({
        name: 'RateLimitError',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('treats a missing ac array as empty', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ now: 1700000000 }),
      } as Response);
      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);
      expect(positions).toEqual([]);
    });

    it('accepts a configurable base URL', async () => {
      const custom = new AdsblolProvider({ baseUrl: 'https://proxy.example/v2' });
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response);
      await custom.fetchFromSource(NETHERLANDS_BBOX);
      const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;
      expect(calledUrl).toContain('https://proxy.example/v2/point/');
    });
    it('supports a relative base URL (production same-origin /api proxy)', async () => {
      const relative = new AdsblolProvider({ baseUrl: '/api' });
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response);
      // Regression: the URL constructor rejects relative URLs, which made
      // every production fetch throw before reaching the network. fetch
      // must receive the path as a string so the browser resolves it
      // same-origin.
      const positions = await relative.fetchFromSource(NETHERLANDS_BBOX);
      const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;
      expect(calledUrl).toMatch(/^\/api\/point\/52\.25\d*\/5\.0\d*\/\d+$/);
      expect(positions.length).toBeGreaterThan(0);
    });
  });
});
