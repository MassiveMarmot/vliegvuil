#!/usr/bin/env node
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Self-hosted BRT Achtergrondkaart tiles (PDOK WMTS, EPSG:3857, standaard).
// Downloads the PNG tiles for the app's map bounds (zoom 6-14, the app's
// own NETHERLANDS_BBOX) so the browser never contacts service.pdok.nl.
//
// PDOK terms (verified 2026-10-12, see the PR): BRT-A is CC-BY 4.0
// (Kadaster); the service level is "PDOK Fair Use" — free, no
// registration, but no published numeric rate limit, so this script is
// strictly sequential, spread over --spread-hours (default 24) with
// jitter, retries with backoff, honours Retry-After, and aborts after
// repeated consecutive failures instead of hammering the server.
//
// Usage:
//   node scripts/vps-tiles-update.js --dry-run
//   sudo systemd-run --unit=vliegvuil-tiles --working-directory=/srv/vliegvuil \
//     node /srv/vliegvuil/scripts/vps-tiles-update.js --spread-hours 24
//
// Options:
//   --dry-run            print counts, estimated size (200-tile sample),
//                        per-request delay and expected duration; download
//                        only the sample, write nothing
//   --spread-hours H    target total duration in hours (default 24);
//                        delay per tile = H*3600s / tile_count (+jitter)
//   --delay-ms MS       plain per-request delay override (no spread calc)
//   --min-zoom / --max-zoom   override the zoom range (default 6/14)
//   --out DIR           tile root (default /srv/vliegvuil/tiles.new for
//                        real runs, ./tiles.dry-run-sample for dry runs)
//
// Resumable: existing valid tiles are skipped; SIGINT/SIGTERM stop cleanly
// (state file records progress); rerunning continues where it left off.

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- constants: same URL the app uses today (web/src/types) ---

const TILE_URL = 'https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/standaard/EPSG:3857';
const USER_AGENT = 'VliegVuil.nl/1.0 (+https://vliegvuil.nl)';
// The app's own map bounds (web/src/types NETHERLANDS_BBOX)
const BBOX = { minLon: 2.5, minLat: 50.5, maxLon: 7.5, maxLat: 54.0 };
const DEFAULT_MIN_ZOOM = 6;
const DEFAULT_MAX_ZOOM = 14;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const TILE_SIZE_CAP = 512 * 1024; // no valid BRT tile is anywhere near this
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_RETRIES = 4;

// --- Web Mercator tile math ---

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}
function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

/** All tiles covering the bbox at a zoom, ordered row-major */
export function tilesForZoom(zoom) {
  const x0 = lonToTileX(BBOX.minLon, zoom);
  const x1 = lonToTileX(BBOX.maxLon, zoom);
  const y0 = latToTileY(BBOX.maxLat, zoom); // y grows southward
  const y1 = latToTileY(BBOX.minLat, zoom);
  const tiles = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/** All tiles z6..z14 ordered low zoom first (map usable early) */
export function allTiles(minZoom, maxZoom) {
  const out = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    out.push(...tilesForZoom(z));
  }
  return out;
}

function tilePath(root, t) {
  return join(root, String(t.z), String(t.x), `${t.y}.png`);
}

// --- tile validation ---

export function validTile(buffer) {
  return (
    buffer.length > 0 &&
    buffer.length <= TILE_SIZE_CAP &&
    buffer.subarray(0, 4).equals(PNG_MAGIC)
  );
}

// --- CLI ---

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : undefined ?? fallback;
}
const DRY_RUN = args.includes('--dry-run');
const SPREAD_HOURS = Number(argValue('--spread-hours', '24'));
const DELAY_MS_OVERRIDE = argValue('--delay-ms', undefined);
const MIN_ZOOM = Number(argValue('--min-zoom', String(DEFAULT_MIN_ZOOM)));
const MAX_ZOOM = Number(argValue('--max-zoom', String(DEFAULT_MAX_ZOOM)));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = argValue('--out', DRY_RUN ? join(REPO_ROOT, 'tiles.dry-run-sample') : '/srv/vliegvuil/tiles.new');
const LIVE_DIR = '/srv/vliegvuil/tiles';
const STATE_PATH = join(OUT_DIR, '.state.json');
const LOG_PATH = join(OUT_DIR, '.download.log');
const SAMPLE_SIZE = 200;

function log(line) {
  const stamp = new Date().toISOString();
  process.stdout.write(`[${stamp}] ${line}\n`);
  if (!DRY_RUN) {
    // best-effort log file; failures to log never stop the download
    writeFile(LOG_PATH, `[${stamp}] ${line}\n`, { flag: 'a' }).catch(() => {});
  }
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// --- downloader with backoff ---

let slowdownFactor = 1; // persistent for the whole run after a 429/503

async function fetchTile(t) {
  const url = `${TILE_URL}/${t.z}/${t.x}/${t.y}.png`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
      });
      if (response.status === 429 || response.status === 503) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '5');
        const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5) * 1000;
        slowdownFactor = Math.min(4, slowdownFactor * 1.5); // slow the rest of the run
        log(`HTTP ${response.status} for z${t.z}/${t.x}/${t.y}; honouring Retry-After ${waitMs}ms and slowing down (factor ${slowdownFactor.toFixed(2)})`);
        await sleep(waitMs);
        continue;
      }
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok) {
        // 404 etc: a genuine hole in the coverage; do not retry forever
        return { ok: false, fatal: false, bytes: Buffer.alloc(0), status: response.status };
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return { ok: validTile(bytes), fatal: false, bytes, status: response.status };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return { ok: false, fatal: true, bytes: Buffer.alloc(0), status: 0, error: String(error) };
      }
      const backoff = 1000 * 2 ** attempt + Math.random() * 500;
      log(`z${t.z}/${t.x}/${t.y}: ${String(error).slice(0, 80)}; retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
  return { ok: false, fatal: true, bytes: Buffer.alloc(0), status: 0 };
}

// --- main ---

async function main() {
  const tiles = allTiles(MIN_ZOOM, MAX_ZOOM);
  const perZoom = {};
  for (const t of tiles) perZoom[t.z] = (perZoom[t.z] ?? 0) + 1;
  const tileCount = tiles.length;

  // delay per request
  let delayMs;
  if (DELAY_MS_OVERRIDE !== undefined) {
    delayMs = Number(DELAY_MS_OVERRIDE);
  } else {
    delayMs = Math.max(50, Math.round((SPREAD_HOURS * 3600 * 1000) / tileCount));
  }
  const rate = 1000 / delayMs;

  log(`BRT-A tile download: zoom ${MIN_ZOOM}-${MAX_ZOOM}, bbox ${JSON.stringify(BBOX)}`);
  for (const z of Object.keys(perZoom).sort((a, b) => Number(a) - Number(b))) {
    log(`  z${z}: ${perZoom[z]} tiles`);
  }
  log(`total tiles: ${tileCount}`);
  log(`per-request delay: ${delayMs}ms (+ up to 10% jitter${slowdownFactor > 1 ? `, slowdown factor ${slowdownFactor.toFixed(2)}` : ''}) -> ~${rate.toFixed(2)} requests/s`);
  const expectedMinutes = (tileCount * delayMs) / 60000;
  const finishAt = new Date(Date.now() + tileCount * delayMs * 1.05);
  log(`expected duration: ~${expectedMinutes.toFixed(0)} minutes (${(expectedMinutes / 60).toFixed(1)} hours); expected finish: ${finishAt.toISOString()}`);

  if (DRY_RUN) {
    // size estimate from a real sample of ~200 tiles, evenly spread
    // over the tile list (not clustered in one zoom)
    log(`dry run: fetching a spread sample of ${SAMPLE_SIZE} real tiles for the size estimate (no full download)`);
    const step = Math.max(1, Math.floor(tileCount / SAMPLE_SIZE));
    const sample = [];
    for (let i = 0; i < tileCount && sample.length < SAMPLE_SIZE; i += step) {
      sample.push(tiles[i]);
    }
    let bytes = 0;
    let ok = 0;
    for (const t of sample) {
      const r = await fetchTile(t);
      if (r.ok) { bytes += r.bytes.length; ok++; }
      await sleep(delayMs);
    }
    const avg = ok > 0 ? bytes / ok : 0;
    log(`sample: ${ok}/${sample.length} tiles ok, avg ${Math.round(avg)} bytes`);
    log(`estimated total size: ${(avg * tileCount / 1024 / 1024).toFixed(0)} MB (of which downloaded now: ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    log(`for a real run:  sudo systemd-run --unit=vliegvuil-tiles node /srv/vliegvuil/scripts/vps-tiles-update.js --spread-hours ${SPREAD_HOURS}`);
    return 0;
  }

  // real run: resumable state
  await mkdir(OUT_DIR, { recursive: true });
  let state = { done: 0, skipped: 0, failed: [], startedAt: new Date().toISOString() };
  if (existsSync(STATE_PATH)) {
    try { state = JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch { /* fresh state */ }
  }
  const saveState = async () => {
    await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  };

  let consecutiveFailures = 0;
  let stopping = false;
  const stop = (sig) => {
    if (stopping) return;
    stopping = true;
    log(`received ${sig}; stopping cleanly (state saved; rerun to resume)`);
    setTimeout(() => process.exit(0), 100); // let the state write land
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  let missing = 0;
  let index = 0;
  for (const t of tiles) {
    if (stopping) break;
    index++;
    const out = tilePath(OUT_DIR, t);
    // resumable: skip tiles that already exist and validate
    if (existsSync(out)) {
      try {
        const existing = await readFile(out);
        if (validTile(existing)) { state.skipped++; continue; }
        log(`z${t.z}/${t.x}/${t.y}: existing file invalid; re-downloading`);
      } catch { /* re-download */ }
    }
    const r = await fetchTile(t);
    if (r.ok) {
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, r.bytes);
      state.done++;
      consecutiveFailures = 0;
    } else if (!r.fatal && r.status === 404) {
      // genuine upstream hole; count as missing, not a failure
      missing++;
      log(`z${t.z}/${t.x}/${t.y}: 404 (not in upstream coverage); counted as missing`);
      consecutiveFailures = 0;
    } else {
      state.failed.push(`z${t.z}/${t.x}/${t.y} (status ${r.status})`);
      missing++;
      consecutiveFailures++;
      log(`z${t.z}/${t.x}/${t.y}: FAILED (status ${r.status || 'network'}); consecutive failures: ${consecutiveFailures}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures; not hammering the server. Rerun to resume.`);
        await saveState();
        return 1;
      }
    }
    if (index % 50 === 0 || stopping) {
      await saveState();
      log(`progress: ${index}/${tileCount} (downloaded ${state.done}, skipped ${state.skipped}, missing so far ${missing})`);
    }
    const jitter = 1 + Math.random() * 0.1;
    await sleep(delayMs * jitter * slowdownFactor);
  }
  await saveState();
  log(`done: downloaded ${state.done}, skipped ${state.skipped}, missing ${missing}`);
  if (state.failed.length > 0) {
    log(`failed tiles: ${state.failed.slice(0, 20).join(', ')}${state.failed.length > 20 ? ' …' : ''}`);
  }
  log(`missing tiles total: ${missing} (a 404 is a genuine upstream hole; everything else was retried)`);

  // atomic swap: tiles.new -> tiles, keep the previous set as tiles.old
  if (existsSync(LIVE_DIR)) {
    const old = `${LIVE_DIR}.old`;
    if (existsSync(old)) await rm(old, { recursive: true, force: true });
    await rename(LIVE_DIR, old);
    log(`previous set kept at ${old} for rollback`);
  }
  await rename(OUT_DIR, LIVE_DIR);
  log(`swapped: ${OUT_DIR} -> ${LIVE_DIR}`);
  log(`next: reload Caddy (sudo systemctl reload caddy) and check https://vliegvuil.nl/tiles/8/132/84.png`);
  return missing > 0 && state.failed.length > 0 ? 1 : 0;
}

// Only run main when executed directly (not when imported by tests)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => { process.exit(code); })
    .catch((error) => { log(`fatal: ${String(error)}`); process.exit(1); });
}
