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
      icao24: '406A92',
      callsign: 'EZY87EW',
      registration: 'G-EZWR',
      type: 'A320',
      altitude: 24000,
      onGround: false,
    });
    expect(positions[1]).toMatchObject({
      icao24: '4841A9',
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

  it('getServerNow anchors to the response `now` (client clock offset)', async () => {
    // A response whose `now` is 600 s AHEAD of the client clock must move
    // getServerNow() by the same +600 s, so consumers comparing upstream
    // timestamps are immune to client clock skew.
    const realNow = Date.now() / 1000;
    const provider = new AdsbfiProvider();
    // Before any fetch: the client clock (offset 0)
    expect(provider.getServerNow()).toBeCloseTo(realNow, 0);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: realNow + 600, aircraft: [] }),
    } as Response);
    await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(provider.getServerNow()).toBeCloseTo(realNow + 600, 0);
  });

  it("refuses a 'now' in milliseconds (real API sends unix seconds)", async () => {
    const provider = new AdsbfiProvider({ maxRetries: 1 });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () =>
        Promise.resolve({ now: 1792079276001, aircraft: fixture.aircraft }),
    } as Response);
    await expect(
      provider.fetchPositions(NETHERLANDS_BBOX),
    ).rejects.toThrow(/not unix seconds/);
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

  it('treats a non-array aircraft value as empty instead of throwing', async () => {
    const provider = new AdsbfiProvider();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: 100, aircraft: { not: 'an array' } }),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(positions).toEqual([]);
  });

  it('skips a single malformed aircraft instead of failing the batch', async () => {
    const provider = new AdsbfiProvider();
    // Real fixture entries plus malformed ones: missing hex, non-string
    // hex, empty hex. The two fixture aircraft must still come through.
    const batch = [
      fixture.aircraft[0],
      { ...fixture.aircraft[1] as object, hex: undefined },
      fixture.aircraft[1],
      { ...fixture.aircraft[0] as object, hex: 12345 },
      { ...fixture.aircraft[1] as object, hex: '   ' },
      fixture.aircraft[0],
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({ now: fixture.now, aircraft: batch }),
    } as Response);
    const positions = await provider.fetchPositions(NETHERLANDS_BBOX);
    expect(positions).toHaveLength(3);
    expect(positions.map((p) => p.icao24)).toEqual([
      '406A92',
      '4841A9',
      '406A92',
    ]);
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
