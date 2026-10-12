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
import { checkSource, makeFetcher, sha256, USER_AGENT, type CheckOutcome, type FreshnessSource } from './freshness';
import type { RefreshReport, RefreshReportEntry } from './bodies';
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
  readonly downloadUrl?: string;
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
  readonly previousCount?: number;
  readonly newCount?: number;
  /** The check-comparable version signal (commit SHA / CKAN timestamp) */
  readonly upstreamVersion?: string;
}

/** Download a full snapshot (used only by refresh, not by check); binary-safe */
async function download(url: string, format: DownloadFormat): Promise<Download> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  validateMagic(url, buffer, format);
  const content = format === 'gzip' ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return { content, version: response.headers.get('etag') ?? '' };
}

/** Expected download format per source (drives the magic-byte gate) */
export type DownloadFormat = 'csv' | 'gzip' | 'geojson';

/**
 * Session 22c bugfix gate: the download's first bytes must match the
 * expected format. gzip magic is 1f 8b; a CSV download must not be
 * JSON (an error page or a commits-API response must never be parsed
 * as CSV); a GeoJSON download must be JSON.
 */
export function validateMagic(url: string, buffer: Buffer, format: DownloadFormat): void {
  if (buffer.length === 0) {
    throw new Error(`${url}: download is empty`);
  }
  if (format === 'gzip') {
    if (!(buffer[0] === 0x1f && buffer[1] === 0x8b)) {
      throw new Error(`${url}: expected gzip (magic 1f 8b), got first bytes ${buffer.slice(0, 2).toString('hex')}`);
    }
    return;
  }
  const head = buffer.slice(0, 64).toString('utf8').trimStart();
  const looksJson = head.startsWith('{') || head.startsWith('[');
  if (format === 'csv' && looksJson) {
    throw new Error(`${url}: download looks like JSON, not the expected CSV - wrong URL (check signal used as data?)`);
  }
  if (format === 'geojson' && !looksJson) {
    throw new Error(`${url}: expected a JSON/GeoJSON download, got first bytes ${JSON.stringify(head.slice(0, 16))}`);
  }
}

/**
 * Session 22b/22c bugfix: after refresh, upstreamVersion must hold the
 * SAME kind of value `check` compares against (GitHub commit SHA / CKAN
 * metadata_modified), or check keeps reporting "update-available" and the
 * data-updates issue never closes. The signal is fetched with check's own
 * code path (checkSource) BEFORE the download, so a commit landing
 * mid-refresh is flagged by the next check instead of being recorded.
 * Fail closed: no signal, no sources.json write for this source.
 */
async function resolveUpstreamVersionBeforeDownload(
  source: RefreshSource,
): Promise<string> {
  if (source.upstream === undefined) {
    throw new Error(
      `${source.id}: no upstream block in sources.json; cannot record the version signal check compares against`,
    );
  }
  const token = process.env['GITHUB_TOKEN'];
  const outcome: CheckOutcome | null = await checkSource(
    source as unknown as FreshnessSource,
    makeFetcher(token),
  );
  if (outcome === null) {
    throw new Error(`${source.id}: checkSource returned no outcome for method ${source.upstream.method}`);
  }
  if (outcome.status === 'check-failed') {
    throw new Error(`${source.id}: could not fetch the version signal: ${outcome.detail}`);
  }
  if (outcome.upstreamVersion === undefined || outcome.upstreamVersion.length === 0) {
    throw new Error(`${source.id}: checkSource returned no upstream version for method ${source.upstream.method}`);
  }
  return outcome.upstreamVersion;
}

/**
 * Resolve the data URL for a source. upstream.url is the CHECK signal
 * (commits API / CKAN metadata) and must never be downloaded as data;
 * a missing downloadUrl fails with a clear message.
 */
export function resolveDownloadUrl(source: RefreshSource): string {
  const url = source.downloadUrl;
  if (url === undefined || url.length === 0) {
    throw new Error(
      `${source.id}: no downloadUrl in sources.json (upstream.url is the check signal, not the data file); add the raw file URL`,
    );
  }
  return url;
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
  const parsed: unknown = JSON.parse(json);
  // Snapshot files are bare arrays (airports/aircraft); the noise file
  // is a FeatureCollection. Both must count correctly or the
  // row-drop gate is blind.
  if (Array.isArray(parsed)) {
    return parsed.length;
  }
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as { entries?: unknown[]; features?: unknown[] };
    return obj.entries?.length ?? obj.features?.length ?? 0;
  }
  return 0;
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
    // Version signal BEFORE the download (fail closed without it)
    const upstreamVersion = await resolveUpstreamVersionBeforeDownload(source);
    const url = resolveDownloadUrl(source);
    const downloadResult = await download(url, 'csv');
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
    await updateSources(id, upstreamVersion, sha256(downloadResult.content), downloadResult.version);
    return { id, ok: true, detail: `airports: ${entries} entries`, previousCount: prev ?? undefined, newCount: entries , upstreamVersion };
  }

  if (id === 'tar1090-db') {
    // Version signal BEFORE the download (fail closed without it)
    const upstreamVersion = await resolveUpstreamVersionBeforeDownload(source);
    const url = resolveDownloadUrl(source);
    const downloadResult = await download(url, 'gzip');
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
    await updateSources(id, upstreamVersion, sha256(downloadResult.content), downloadResult.version);
    return { id, ok: true, detail: `aircraft: ${entries} entries`, previousCount: prev ?? undefined, newCount: entries , upstreamVersion };
  }

  if (id === 'rivm-end-2021-noise') {
    // Version signal BEFORE the download (fail closed without it)
    const upstreamVersion = await resolveUpstreamVersionBeforeDownload(source);
    const url = resolveDownloadUrl(source);
    const downloadResult = await download(url, 'geojson');
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
    await updateSources(id, upstreamVersion, sha256(downloadResult.content), downloadResult.version);
    return { id, ok: true, detail: `noise: ${features.length} contours`, newCount: features.length, upstreamVersion };
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
  if (count === 0) {
    return `${name}: refresh produced 0 entries; refusing (upstream download likely failed)`;
  }
  if (previous !== null && previous > 0 && count < previous * ROW_DROP_TOLERANCE) {
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

async function updateSources(id: string, upstreamVersion: string, contentSha256: string, downloadEtag?: string): Promise<void> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile & { sources: (RefreshSource & Record<string, unknown>)[] };
  for (const source of data.sources) {
    if (source.id === id) {
      source['retrievedAt'] = today();
      source['upstreamVersion'] = upstreamVersion;
      // The download ETag is kept for diagnostics only; check never
      // compares against it (session 22b/22c bugfix).
      if (downloadEtag !== undefined && downloadEtag.length > 0) {
        source['downloadEtag'] = downloadEtag;
      }
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
  const entries: RefreshReportEntry[] = [];
  const sourcesForReport = await readSourcesForReport();
  for (const id of ids) {
    try {
      const result = await refreshSource(id);
      process.stdout.write(`${result.id}: ${result.ok ? 'ok' : 'FAILED'} - ${result.detail}\n`);
      if (!result.ok) {
        allOk = false;
      }
      entries.push(reportEntry(result, sourcesForReport));
    } catch (error) {
      process.stdout.write(`${id}: FAILED - ${String(error)}\n`);
      allOk = false;
      entries.push({
        id,
        ok: false,
        detail: String(error),
        ...(sourcesForReport.get(id) ?? {}),
      });
    }
  }
  await writeRefreshReport(target, entries);
  return allOk ? 0 : 1;
}

/** Sources.json fields the PR body reports (licence, reference year, url) */
async function readSourcesForReport(): Promise<Map<string, Partial<RefreshReportEntry>>> {
  const raw = await readFile(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw) as SourcesFile & {
    sources: (RefreshSource & Record<string, unknown>)[];
  };
  const map = new Map<string, Partial<RefreshReportEntry>>();
  for (const source of data.sources) {
    map.set(source.id, {
      license: typeof source['license'] === 'string' ? String(source['license']) : undefined,
      referenceYear: typeof source['referenceYear'] === 'number' ? Number(source['referenceYear']) : undefined,
      url: typeof source['url'] === 'string' ? String(source['url']) : undefined,
    });
  }
  return map;
}

function reportEntry(
  result: RefreshResult,
  sources: Map<string, Partial<RefreshReportEntry>>,
): RefreshReportEntry {
  return {
    id: result.id,
    ok: result.ok,
    detail: result.detail,
    previousCount: result.previousCount,
    newCount: result.newCount,
    // The real version signal, so the PR body shows it instead of n/a
    ...(result.upstreamVersion !== undefined ? { upstreamVersion: result.upstreamVersion } : {}),
    ...(sources.get(result.id) ?? {}),
  };
}

/** Session 22c: the workflow reads this to build the PR body */
async function writeRefreshReport(target: string, entries: RefreshReportEntry[]): Promise<void> {
  const report: RefreshReport = {
    ranAt: new Date().toISOString(),
    target,
    dryRun: process.env['DRY_RUN'] === '1',
    entries,
  };
  const reportPath = join(REPO_ROOT, 'data-build', 'status', 'refresh-report.json');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`wrote ${reportPath}\n`);
}

if (
  process.argv[1]?.endsWith('refresh.ts') === true ||
  process.argv[1]?.endsWith('refresh.js') === true
) {
  // `pnpm run refresh -- <id>` forwards the `--` separator as a literal
  // argument; skip it so the documented invocation works as written.
  const args = process.argv.slice(2).filter((a): boolean => a !== '--');
  const target = args[0] ?? 'all-auto';
  runRefresh(target)
    .then((code): void => {
      process.exit(code);
    })
    .catch((error: unknown): void => {
      process.stderr.write(`refresh failed: ${String(error)}\n`);
      process.exit(1);
    });
}
