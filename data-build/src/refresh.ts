// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// `refresh` command (session 22b): download to a temp dir, transform,
// validate (gates), then atomically swap into web/public/data/ and update
// sources.json. Keeps the previous version for rollback in data-build/previous/.
// Never touches `manual` sources unless named explicitly.
//
// Usage: pnpm --filter @vliegvuil/data-build run refresh -- <source-id|all-auto>
import { gunzipSync } from 'node:zlib';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAirports, airportsToJson } from './airports';
import { buildAircraft, aircraftToJson } from './aircraft';
import {
  endWfsToRawContours,
  buildNoiseGeoJson,
  noiseGeoJsonToJson,
} from './noise';
import { sha256, USER_AGENT } from './freshness';
import type { NoiseContourFeature } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SOURCES_PATH = join(REPO_ROOT, 'sources.json');
const OUT_DIR = join(REPO_ROOT, 'web', 'public', 'data');
const NOISE_PATH = join(REPO_ROOT, 'web', 'public', 'noise-contours.geojson');
const PREVIOUS_DIR = join(REPO_ROOT, 'data-build', 'previous');
const TMP_DIR = join(REPO_ROOT, 'data-build', 'tmp');

const SIZE_CAP_BYTES = 2 * 1024 * 1024;

/** Netherlands bounding box (spec §2; same as airports.ts NL_BBOX) */
const NL_BBOX = { west: 3.2, south: 50.75, east: 7.22, north: 53.7 };

/** Band lower bounds the app knows (must stay in sync with web noiseStyle) */
export const KNOWN_NOISE_BANDS: readonly number[] = [48, 55, 56, 60, 65, 70, 75];

/** Row-count tolerance vs previous version; a sudden drop > 50% fails */
export const ROW_DROP_TOLERANCE = 0.5;

interface RefreshSource {
  readonly id: string;
  readonly refresh?: 'auto' | 'manual';
  readonly upstream?: { readonly method: string; readonly url: string };
}

interface SourcesFile {
  readonly sources: readonly RefreshSource[];
}

interface Download {
  readonly content: string;
  readonly version: string;
}

export interface RefreshResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Download a full snapshot (used only by refresh, not by check); binary-safe */
async function download(url: string, isGzip: boolean): Promise<Download> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const content = isGzip ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return { content, version: response.headers.get('etag') ?? '' };
}

async function writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpPath, content);
  await rename(tmpPath, filePath);
}

async function keepRollbackCopy(outputPath: string): Promise<void> {
  await mkdir(PREVIOUS_DIR, { recursive: true });
  try {
    await copyFile(outputPath, join(PREVIOUS_DIR, outputPath.split('/').pop() ?? 'unknown'));
  } catch {
    // No previous version yet; nothing to keep.
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function countEntries(json: string): number {
  const parsed = JSON.parse(json) as { entries?: unknown[]; features?: unknown[] };
  return parsed.entries?.length ?? parsed.features?.length ?? 0;
}

/** Validate and refresh one source; returns ok=false on any gate failure */
async function refreshSource(id: string): Promise<RefreshResult> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile & { sources: (RefreshSource & Record<string, unknown>)[] };
  const source = data.sources.find((s): boolean => s.id === id);
  if (source === undefined) {
    return { id, ok: false, detail: 'unknown source id' };
  }
  const date = today();
  await mkdir(TMP_DIR, { recursive: true });

  if (id === 'ourairports') {
    const url = source.upstream?.url ?? '';
    const downloadResult = await download(url, false);
    const result = buildAirports(downloadResult.content, date);
    const json = airportsToJson(result.airports);
    const prev = await readPreviousCount(join(OUT_DIR, 'airports.json'));
    const entries = countEntries(json);
    const gate = validateRowCount('airports', entries, prev) ?? validateSize('airports.json', json);
    if (gate !== undefined) {
      return { id, ok: false, detail: gate };
    }
    await keepRollbackCopy(join(OUT_DIR, 'airports.json'));
    await writeFileAtomic(join(OUT_DIR, 'airports.json'), json);
    await updateSources(id, downloadResult.version, sha256(downloadResult.content));
    return { id, ok: true, detail: `airports: ${entries} entries` };
  }

  if (id === 'tar1090-db') {
    const url = source.upstream?.url ?? '';
    const downloadResult = await download(url, true);
    const result = buildAircraft(downloadResult.content, date, true);
    const json = aircraftToJson(result.aircraft);
    const prev = await readPreviousCount(join(OUT_DIR, 'aircraft.json'));
    const entries = countEntries(json);
    const gate = validateRowCount('aircraft', entries, prev) ?? validateSize('aircraft.json', json);
    if (gate !== undefined) {
      return { id, ok: false, detail: gate };
    }
    await keepRollbackCopy(join(OUT_DIR, 'aircraft.json'));
    await writeFileAtomic(join(OUT_DIR, 'aircraft.json'), json);
    await updateSources(id, downloadResult.version, sha256(downloadResult.content));
    return { id, ok: true, detail: `aircraft: ${entries} entries` };
  }

  if (id === 'rivm-end-2021-noise') {
    const url = source.upstream?.url ?? '';
    const downloadResult = await download(url, false);
    const { contours, warnings } = endWfsToRawContours(
      JSON.parse(downloadResult.content) as Parameters<typeof endWfsToRawContours>[0],
      'RIVM/CVGG — EU END 2021 noise contours (major airports), via data.overheid.nl',
      'CC0-1.0',
      2021,
      'Schiphol',
    );
    for (const warning of warnings) {
      process.stdout.write(`warning: ${warning}\n`);
    }
    const noiseResult = buildNoiseGeoJson(contours);
    for (const warning of noiseResult.warnings) {
      process.stdout.write(`warning: ${warning}\n`);
    }
    const features = noiseResult.features;
    let gate: string | undefined =
      validateRowCount('noise', features.length, await readPreviousCount(NOISE_PATH)) ??
      validateSize('noise-contours.geojson', noiseGeoJsonToJson(features)) ??
      validateNoiseBands(features);
    if (gate === undefined) {
      for (const feature of features) {
        gate = validateGeometryInNl(feature);
        if (gate !== undefined) break;
      }
    }
    if (gate !== undefined) {
      return { id, ok: false, detail: gate };
    }
    const json = noiseGeoJsonToJson(features);
    await keepRollbackCopy(NOISE_PATH);
    await writeFileAtomic(NOISE_PATH, json);
    await updateSources(id, downloadResult.version, sha256(downloadResult.content));
    return { id, ok: true, detail: `noise: ${features.length} contours` };
  }

  return { id, ok: false, detail: `no refresh procedure for source "${id}"` };
}

/** Read the entry count of the currently deployed file, or null if absent */
async function readPreviousCount(outputPath: string): Promise<number | null> {
  try {
    return countEntries(await readFile(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

export function validateRowCount(name: string, count: number, previous: number | null): string | undefined {
  if (previous !== null && count < previous * ROW_DROP_TOLERANCE) {
    return `${name}: row count ${count} is a >50% drop from previous ${previous}; refusing`;
  }
  return undefined;
}

export function validateSize(file: string, content: string): string | undefined {
  if (Buffer.byteLength(content) > SIZE_CAP_BYTES) {
    return `${file}: ${Buffer.byteLength(content)} B exceeds the ~2 MB cap`;
  }
  return undefined;
}

export function validateNoiseBands(features: readonly NoiseContourFeature[]): string | undefined {
  for (const feature of features) {
    if (!KNOWN_NOISE_BANDS.includes(feature.properties.bandLowerDb)) {
      return `noise: unknown band lower bound ${String(feature.properties.bandLowerDb)}; a human must review the new release`;
    }
  }
  return undefined;
}

export function validateGeometryInNl(feature: NoiseContourFeature): string | undefined {
  const polygons =
    feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const point of ring) {
        const [lon, lat] = point;
        if (
          typeof lon !== 'number' ||
          typeof lat !== 'number' ||
          lon < NL_BBOX.west ||
          lon > NL_BBOX.east ||
          lat < NL_BBOX.south ||
          lat > NL_BBOX.north
        ) {
          return `noise: geometry outside the Netherlands bounding box (${String(lon)}, ${String(lat)})`;
        }
      }
    }
  }
  return undefined;
}

async function updateSources(id: string, upstreamVersion: string, contentSha256: string): Promise<void> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile & { sources: (RefreshSource & Record<string, unknown>)[] };
  for (const source of data.sources) {
    if (source.id === id) {
      source['retrievedAt'] = today();
      source['upstreamVersion'] = upstreamVersion;
      source['contentSha256'] = contentSha256;
      source['checkedAt'] = new Date().toISOString();
      if (id === 'rivm-end-2021-noise') {
        source['referenceYear'] = 2021;
      }
    }
  }
  await writeFileAtomic(SOURCES_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

/** Refresh `all-auto` or one named source. Manual sources need explicit naming. */
export async function runRefresh(target: string): Promise<number> {
  process.stdout.write(`== VliegVuil data refresh (${target}) ==\n`);
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile;
  let ids: string[];
  if (target === 'all-auto') {
    ids = data.sources
      .filter((s): boolean => s.refresh === 'auto')
      .map((s): string => s.id);
    if (ids.length === 0) {
      process.stdout.write('no auto sources\n');
      return 0;
    }
  } else {
    const source = data.sources.find((s): boolean => s.id === target);
    if (source === undefined) {
      process.stderr.write(`unknown source id "${target}"\n`);
      return 1;
    }
    ids = [target];
  }
  let allOk = true;
  for (const id of ids) {
    try {
      const result = await refreshSource(id);
      process.stdout.write(`${result.id}: ${result.ok ? 'ok' : 'FAILED'} - ${result.detail}\n`);
      if (!result.ok) {
        allOk = false;
      }
    } catch (error) {
      process.stdout.write(`${id}: FAILED - ${String(error)}\n`);
      allOk = false;
    }
  }
  return allOk ? 0 : 1;
}

if (
  process.argv[1]?.endsWith('refresh.ts') === true ||
  process.argv[1]?.endsWith('refresh.js') === true
) {
  const target = process.argv[2] ?? 'all-auto';
  runRefresh(target)
    .then((code): void => {
      process.exit(code);
    })
    .catch((error: unknown): void => {
      process.stderr.write(`refresh failed: ${String(error)}\n`);
      process.exit(1);
    });
}
