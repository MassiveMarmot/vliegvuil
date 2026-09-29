// Test fixtures for aircraft positions
// Used for testing position providers and interpolation

import type { AircraftPosition } from '../../src/providers/types';

// Sample aircraft data from ADS-B.lol API
// These are realistic values for aircraft over the Netherlands

export const SAMPLE_AIRCRAFT: AircraftPosition[] = [
  {
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
    verticalRate: 0,
    squawk: '4201',
    timestamp: 1700000000,
    onGround: false,
  },
  {
    icao24: '484002',
    callsign: 'EZY456',
    registration: 'PH-EZA',
    type: 'A320',
    operator: 'EasyJet',
    latitude: 51.965,
    longitude: 4.479,
    altitude: 28000,
    speed: 420,
    heading: 180,
    verticalRate: -500,
    squawk: '6201',
    timestamp: 1700000000,
    onGround: false,
  },
  {
    icao24: '484003',
    callsign: 'TUI789',
    registration: 'PH-TFB',
    type: 'B789',
    operator: 'TUI',
    latitude: 52.0,
    longitude: 5.0,
    altitude: 32000,
    speed: 480,
    heading: 90,
    verticalRate: 100,
    squawk: '2000',
    timestamp: 1700000000,
    onGround: false,
  },
  {
    icao24: '484004',
    callsign: 'RYR001',
    registration: 'EI-DWA',
    type: 'B738',
    operator: 'Ryanair',
    latitude: 51.5,
    longitude: 3.5,
    altitude: 25000,
    speed: 400,
    heading: 315,
    verticalRate: -200,
    squawk: '1000',
    timestamp: 1700000000,
    onGround: false,
  },
];

// Aircraft with missing velocity data (common scenario)
export const AIRCRAFT_MISSING_VELOCITY: AircraftPosition[] = [
  {
    icao24: '484005',
    callsign: 'TEST01',
    registration: 'PH-TEST',
    type: 'C172',
    operator: 'Private',
    latitude: 52.0,
    longitude: 4.5,
    altitude: 1500,
    speed: null,
    heading: null,
    verticalRate: null,
    squawk: '1200',
    timestamp: 1700000000,
    onGround: false,
  },
];

// Aircraft on ground (at airport)
export const AIRCRAFT_ON_GROUND: AircraftPosition[] = [
  {
    icao24: '484006',
    callsign: 'KLM001',
    registration: 'PH-BFB',
    type: 'B77W',
    operator: 'KLM',
    latitude: 52.3086,
    longitude: 4.7639,
    altitude: 0,
    speed: 0,
    heading: 0,
    verticalRate: 0,
    squawk: '1000',
    timestamp: 1700000000,
    onGround: true,
  },
];

// Sequence of positions for the same aircraft over time (for interpolation testing)
export const AIRCRAFT_POSITION_SEQUENCE: AircraftPosition[] = [
  {
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
    verticalRate: 0,
    squawk: '4201',
    timestamp: 1700000000,
    onGround: false,
  },
  {
    icao24: '484001',
    callsign: 'KLM123',
    registration: 'PH-BFA',
    type: 'B738',
    operator: 'KLM',
    latitude: 52.305,
    longitude: 4.700,
    altitude: 35000,
    speed: 450,
    heading: 270,
    verticalRate: 0,
    squawk: '4201',
    timestamp: 1700000005, // 5 seconds later
    onGround: false,
  },
  {
    icao24: '484001',
    callsign: 'KLM123',
    registration: 'PH-BFA',
    type: 'B738',
    operator: 'KLM',
    latitude: 52.301,
    longitude: 4.636,
    altitude: 35000,
    speed: 450,
    heading: 270,
    verticalRate: 0,
    squawk: '4201',
    timestamp: 1700000010, // 10 seconds later
    onGround: false,
  },
];

// Empty response (for error testing)
export const EMPTY_AIRCRAFT: AircraftPosition[] = [];
