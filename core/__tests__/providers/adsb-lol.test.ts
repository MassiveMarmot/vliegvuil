// Tests for ADS-B.lol position provider
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdsblolProvider } from '../../src/providers/adsb-lol';
import { NETHERLANDS_BBOX, DEFAULT_PROVIDER_CONFIG } from '../../src/providers/types';

// Mock global fetch
global.fetch = vi.fn();

describe('AdsblolProvider', () => {
  let provider: AdsblolProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AdsblolProvider();
  });

  describe('constructor', () => {
    it('should use default configuration', () => {
      expect(provider).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        baseUrl: 'https://custom.api',
        pollInterval: 10000,
      };
      const customProvider = new AdsblolProvider(customConfig);
      expect(customProvider).toBeDefined();
    });
  });

  describe('fetchFromSource', () => {
    it('should fetch and filter aircraft within bounding box', async () => {
      const mockResponse: { acList: unknown[] } = {
        acList: [
          {
            Icao: '484001',
            Call: 'KLM123',
            Reg: 'PH-BFA',
            Type: 'B738',
            Op: 'KLM',
            Lat: 52.3086,
            Long: 4.7639,
            Alt: 35000,
            Spd: 450,
            Hdg: 270,
            VerRate: 0,
            Squawk: '4201',
            Ts: 1700000000,
            Gnd: false,
          },
          {
            Icao: '484002',
            Call: 'EZY456',
            Reg: 'PH-EZA',
            Type: 'A320',
            Op: 'EasyJet',
            Lat: 51.965,
            Long: 4.479,
            Alt: 28000,
            Spd: 420,
            Hdg: 180,
            VerRate: -500,
            Squawk: '6201',
            Ts: 1700000000,
            Gnd: false,
          },
          // Outside bbox
          {
            Icao: '484003',
            Call: 'OUTSIDE',
            Reg: 'PH-OUT',
            Type: 'B789',
            Op: 'Other',
            Lat: 60.0,
            Long: 10.0,
            Alt: 32000,
            Spd: 480,
            Hdg: 90,
            VerRate: 100,
            Squawk: '2000',
            Ts: 1700000000,
            Gnd: false,
          },
        ],
      };

      (fetch as typeof global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);

      expect(positions).toHaveLength(2);
      expect(positions[0].icao24).toBe('484001');
      expect(positions[1].icao24).toBe('484002');
    });

    it('should handle API errors', async () => {
      (fetch as typeof global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(provider.fetchFromSource(NETHERLANDS_BBOX)).rejects.toThrow(
        'ADS-B.lol API error: 500 Internal Server Error',
      );
    });

    it('should filter out aircraft with zero coordinates', async () => {
      const mockResponse = {
        acList: [
          {
            Icao: '484001',
            Call: 'VALID',
            Reg: 'PH-VAL',
            Type: 'B738',
            Op: 'KLM',
            Lat: 52.3086,
            Long: 4.7639,
            Alt: 35000,
            Spd: 450,
            Hdg: 270,
            VerRate: 0,
            Squawk: '4201',
            Ts: 1700000000,
            Gnd: false,
          },
          {
            Icao: '484002',
            Call: 'INVALID',
            Reg: '',
            Type: '',
            Op: '',
            Lat: 0,
            Long: 0,
            Alt: 0,
            Spd: 0,
            Hdg: 0,
            VerRate: 0,
            Squawk: '',
            Ts: 0,
            Gnd: false,
          },
        ],
      };

      (fetch as typeof global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const positions = await provider.fetchFromSource(NETHERLANDS_BBOX);

      expect(positions).toHaveLength(1);
      expect(positions[0].icao24).toBe('484001');
    });
  });

  describe('convertAircraft', () => {
    it('should convert ADS-B.lol aircraft to AircraftPosition', () => {
      const adsbAircraft = {
        Icao: '484001',
        Call: 'KLM123',
        Reg: 'PH-BFA',
        Type: 'B738',
        Op: 'KLM',
        Lat: 52.3086,
        Long: 4.7639,
        Alt: 35000,
        Spd: 450,
        Hdg: 270,
        VerRate: -100,
        Squawk: '4201',
        Ts: 1700000000,
        Gnd: false,
      };

      const converted = (provider as unknown as { convertAircraft: (ac: typeof adsbAircraft) => unknown }).convertAircraft(adsbAircraft);

      expect(converted).toMatchObject({
        icao24: '484001',
        callsign: 'KLM123',
        registration: 'PH-BFA',
        type: 'B738',
        operator: 'KLM',
        latitude: 52.3086,
        longitude: 4.7639,
        altitude: 35000,
        speed: 450,
        heading: 270,
        verticalRate: -100,
        squawk: '4201',
        timestamp: 1700000000,
        onGround: false,
      });
    });

    it('should handle empty string values', () => {
      const adsbAircraft = {
        Icao: '484001',
        Call: '',
        Reg: '',
        Type: '',
        Op: '',
        Lat: 52.3086,
        Long: 4.7639,
        Alt: 0,
        Spd: 0,
        Hdg: 0,
        VerRate: 0,
        Squawk: '',
        Ts: 1700000000,
        Gnd: true,
      };

      const converted = (provider as unknown as { convertAircraft: (ac: typeof adsbAircraft) => unknown }).convertAircraft(adsbAircraft);

      expect(converted).toMatchObject({
        callsign: null,
        registration: null,
        type: null,
        operator: null,
        altitude: null,
        speed: null,
        heading: null,
        verticalRate: null,
        squawk: null,
        onGround: true,
      });
    });
  });
});
