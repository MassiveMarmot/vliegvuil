// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Dev-only mock aircraft generator. Imported exclusively behind
// import.meta.env.VITE_MOCK === '1' (off by default); never used in a
// production code path. AGENTS.md forbids Math.random elsewhere in src/.
import type { AircraftPosition } from '@vliegvuil/core';

/** Generate a batch of plausible aircraft positions around the Netherlands */
export function generateMockAircraft(): AircraftPosition[] {
  const mockData: AircraftPosition[] = [];
  const now = Math.floor(Date.now() / 1000);
  const baseLat = 52.3086;
  const baseLon = 4.7639;
  for (let i = 0; i < 500; i++) {
    const lat = baseLat + (Math.random() * 2 - 1) * 0.5;
    const lon = baseLon + (Math.random() * 2 - 1) * 0.5;
    const alt = Math.floor(Math.random() * 12000) + 1000;
    const heading = Math.floor(Math.random() * 360);
    const speed = Math.random() * 500 + 100;
    const callsign = `KLM${Math.floor(1000 + Math.random() * 9000)}`;
    const icao24 = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')
      .toUpperCase();
    const onGround = Math.random() > 0.9;
    mockData.push({
      icao24,
      callsign,
      registration: `PH-${icao24.substring(0, 4)}`,
      type: Math.random() > 0.5 ? 'B737' : 'A320',
      operator: 'KLM',
      latitude: lat,
      longitude: lon,
      altitude: alt,
      speed,
      heading,
      verticalRate:
        Math.random() > 0.5 ? Math.floor(Math.random() * 2000 - 1000) : null,
      squawk:
        Math.random() > 0.5
          ? (Math.floor(1000 + Math.random() * 7000)).toString()
          : null,
      timestamp: now - Math.floor(Math.random() * 30),
      onGround,
    });
  }
  return mockData;
}

/** Simulated flaky fetch used only in the dev mock mode */
export async function fetchMockAircraft(): Promise<AircraftPosition[]> {
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  if (Math.random() < 0.01) {
    throw new Error('Failed to fetch aircraft data');
  }
  return generateMockAircraft();
}
