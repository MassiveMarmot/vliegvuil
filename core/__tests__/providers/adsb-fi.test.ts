// Tests for adsb.fi open-data position provider
// Fixture comes from a real response fetched from
// https://opendata.adsb.fi/api/v2/lat/52.25/lon/5.0/dist/194
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AdsbfiProvider,
  radiusKmForBoundingBox,
} from '../../src/providers/adsb-fi';
import { NETHERLANDS_BBOX } from '../../src/providers/types';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'adsb-fi-point.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  aircraft: unknown[];
  now: number;
  fetched_from: string;
};

global.fetch = vi.fn();

describe('AdsbfiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the lat/lon/dist URL with km radius and filters the bbox', async () => {
    const provider = new AdsbfiProvider();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve(fixture),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(url).toMatch(/\/lat\/[\d.]+\/lon\/[\d.]+\/dist\/\d+$/);
    const dist = Number(url.split('/dist/')[1]);
    expect(dist).toBeLessThanOrEqual(250);
    // Both fixture aircraft fall inside the NL bbox
    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({
      icao24: '484507',
      callsign: 'KLM1035',
      registration: 'PH-BHA',
      type: 'B789',
      altitude: 36000,
      onGround: false,
    });
    expect(positions[1]).toMatchObject({
      icao24: '404462',
      onGround: true,
      altitude: null,
    });
  });

  it('reads the aircraft array key (not ac)', async () => {
    const provider = new AdsbfiProvider();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: 100, aircraft: fixture.aircraft }),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(positions).toHaveLength(2);
  });

  it('treats a missing aircraft array as empty', async () => {
    const provider = new AdsbfiProvider();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: 100 }),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(positions).toEqual([]);
  });

  it('excludes aircraft outside the bbox', async () => {
    const provider = new AdsbfiProvider();
    const farAway = [
      { ...fixture.aircraft[0] as object, lat: 60.0, lon: 24.9 },
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: 100, aircraft: farAway }),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(positions).toEqual([]);
  });

  it('throws RateLimitError with Retry-After on 429', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Retry-After': '42' }),
    } as Response);
    const provider = new AdsbfiProvider();
    await expect(
      provider.fetchFromSource(NETHERLANDS_BBOX),
    ).rejects.toMatchObject({
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
    const p = new AdsbfiProvider({ maxRetries: 3 });
    await expect(p.fetchPositions(NETHERLANDS_BBOX)).rejects.toMatchObject({
      name: 'RateLimitError',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws a plain error on other HTTP failures', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
    } as Response);
    const provider = new AdsbfiProvider();
    await expect(
      provider.fetchFromSource(NETHERLANDS_BBOX),
    ).rejects.toThrow('adsb.fi API error: 500');
  });

  it('caps the radius at 250 km', () => {
    const huge = {
      minLatitude: -60,
      maxLatitude: 60,
      minLongitude: -60,
      maxLongitude: 60,
    };
    expect(radiusKmForBoundingBox(huge)).toBe(250);
  });
});
