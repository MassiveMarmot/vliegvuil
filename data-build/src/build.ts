// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Data build runner (BUILD.md session 21).
//
// Downloads (from URLs recorded in sources.json), transforms and writes:
//   web/public/data/airports.json   — OurAirports NL bbox + status overlay
//   web/public/data/aircraft.json   — tar1090-db NL-registered aircraft
// Updates lastUpdated in sources.json and swaps outputs atomically.
// Downloads are cached in data-build/cache/ (git-ignored).
//
// Usage: pnpm --filter @vliegvuil/data-build run build
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAirports, airportsToJson } from './airports';
import { buildAircraft, aircraftToJson } from './aircraft';
import { endWfsToRawContours, buildNoiseGeoJson, noiseGeoJsonToJson } from './noise';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SOURCES_PATH = join(REPO_ROOT, 'sources.json');
const CACHE_DIR = join(REPO_ROOT, 'data-build', 'cache');
const OUT_DIR = join(REPO_ROOT, 'web', 'public', 'data');

/** Download URLs from sources.json notes (kept machine-readable there) */
const AIRPORTS_URL =
  'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const AIRCRAFT_URL =
  'https://github.com/wiedehopf/tar1090-db/raw/refs/heads/csv/aircraft.csv.gz';
/** EU END 2021 Schiphol Lden contours (data.overheid.nl bc7703a1-..., CC-0) */
const NOISE_END_WFS_URL =
  'https://haleconnect.com/ows/services/org.1251.31fc0cfb-352e-4e97-8311-eab4fcd6c36b_wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=gpkg%3ANoiseContours_majorAirportsIncludingAgglomeration_Lden&OUTPUTFORMAT=application%2Fjson';
const NOISE_SOURCE_NAME = 'RIVM/CVGG — EU END 2021 noise contours (major airports), via data.overheid.nl';
const NOISE_LICENSE = 'CC0-1.0';

interface Source {
  readonly id: string;
  readonly lastUpdated?: string;
}

interface SourcesFile {
  readonly sources: readonly Source[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch a URL to a cache file. If the cache file exists and --no-cache /
 * VLIEGVUIL_NO_CACHE is not set, reuse it. Returns the file contents
 * (decompressed if gzip).
 */
async function fetchCached(
  url: string,
  cacheFile: string,
  isGzip: boolean,
  noCache: boolean,
): Promise<string> {
  let buffer: Buffer;
  if (!noCache) {
    try {
      buffer = await readFile(cacheFile);
      process.stdout.write(`cache hit: ${cacheFile}\n`);
    } catch {
      process.stdout.write(`downloading: ${url}\n`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, buffer);
    }
  } else {
    process.stdout.write(`downloading: ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, buffer);
  }
  if (isGzip) {
    return gunzipSync(buffer).toString('utf8');
  }
  return buffer.toString('utf8');
}

/** Write a file atomically: tmp file in the same directory, then rename. */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpPath, content);
  await rename(tmpPath, filePath);
}

/** Update lastUpdated for the given source ids in sources.json (atomically). */
async function updateSourcesLastUpdated(ids: readonly string[]): Promise<void> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile & Record<string, unknown>;
  const date = today();
  for (const source of data.sources) {
    if (ids.includes(source.id)) {
      (source as { lastUpdated?: string }).lastUpdated = date;
    }
  }
  await writeFileAtomic(SOURCES_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

/** Exit code + error printing for the CLI wrapper */
export async function runBuild(noCache: boolean): Promise<void> {
  const date = today();

  process.stdout.write('== VliegVuil data build ==\n');
  await mkdir(CACHE_DIR, { recursive: true });

  // 1. Airports
  process.stdout.write('\n-- airports (OurAirports, Public Domain) --\n');
  const airportsCsv = await fetchCached(
    AIRPORTS_URL,
    join(CACHE_DIR, 'airports.csv'),
    false,
    noCache,
  );
  const airportsResult = buildAirports(airportsCsv, date);
  for (const warning of airportsResult.warnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  const airportsJson = airportsToJson(airportsResult.airports);
  process.stdout.write(`airports: ${airportsResult.airports.length} entries\n`);

  // 2. Aircraft database
  process.stdout.write('\n-- aircraft (tar1090-db, see sources.json) --\n');
  const aircraftCsv = await fetchCached(
    AIRCRAFT_URL,
    join(CACHE_DIR, 'aircraft.csv.gz'),
    true,
    noCache,
  );
  const aircraftResult = buildAircraft(aircraftCsv, date, true);
  for (const warning of aircraftResult.warnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  const aircraftJson = aircraftToJson(aircraftResult.aircraft);
  process.stdout.write(`aircraft: ${aircraftResult.aircraft.length} entries\n`);

  // 3. Noise contours (session 22)
  process.stdout.write('\n-- noise (EU END 2021 Schiphol Lden contours, CC-0) --\n');
  const noiseWfs = await fetchCached(
    NOISE_END_WFS_URL,
    join(CACHE_DIR, 'noise-end-2021-lden.json'),
    false,
    noCache,
  );
  const noiseWfsJson = JSON.parse(noiseWfs) as Parameters<typeof endWfsToRawContours>[0];
  const { contours: rawContours, warnings: endWarnings } = endWfsToRawContours(
    noiseWfsJson,
    NOISE_SOURCE_NAME,
    NOISE_LICENSE,
    2021,
    'Schiphol',
  );
  for (const warning of endWarnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  const noiseResult = buildNoiseGeoJson(rawContours);
  for (const warning of noiseResult.warnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  const noiseJson = noiseGeoJsonToJson(noiseResult.features);
  process.stdout.write(`noise: ${noiseResult.features.length} contours\n`);

  // 4. Size guard (AGENTS.md: commit only small generated files, < ~2 MB)
  const airportsBytes = Buffer.byteLength(airportsJson);
  const aircraftBytes = Buffer.byteLength(aircraftJson);
  const noiseBytes = Buffer.byteLength(noiseJson);
  process.stdout.write(
    `\nsizes: airports.json ${airportsBytes} B, aircraft.json ${aircraftBytes} B, noise-contours.geojson ${noiseBytes} B\n`,
  );
  if (Math.max(airportsBytes, aircraftBytes, noiseBytes) > 2 * 1024 * 1024) {
    throw new Error('an output file exceeds the ~2 MB commit limit (AGENTS.md)');
  }

  // 5. Atomic writes
  await mkdir(OUT_DIR, { recursive: true });
  await writeFileAtomic(join(OUT_DIR, 'airports.json'), airportsJson);
  await writeFileAtomic(join(OUT_DIR, 'aircraft.json'), aircraftJson);
  await writeFileAtomic(join(REPO_ROOT, 'web', 'public', 'noise-contours.geojson'), noiseJson);
  process.stdout.write(`wrote ${join(OUT_DIR, 'airports.json')}\n`);
  process.stdout.write(`wrote ${join(OUT_DIR, 'aircraft.json')}\n`);
  process.stdout.write(`wrote ${join(REPO_ROOT, 'web', 'public', 'noise-contours.geojson')}\n`);

  // 6. sources.json lastUpdated
  await updateSourcesLastUpdated(['ourairports', 'tar1090-db', 'rivm-end-2021-noise']);
  process.stdout.write(`updated lastUpdated in sources.json (${date})\n`);

  process.stdout.write('\ndone.\n');
}

// CLI entry (skip when imported by tests)
if (process.argv[1]?.endsWith('build.ts') === true || process.argv[1]?.endsWith('build.js') === true) {
  const noCache = process.argv.includes('--no-cache') || process.env['VLIEGVUIL_NO_CACHE'] === '1';
  runBuild(noCache).catch((error: unknown): void => {
    process.stderr.write(`data build failed: ${String(error)}\n`);
    process.exit(1);
  });
}
