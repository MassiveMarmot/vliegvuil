// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// sources.json validator — checks the file against sources.schema.json's
// required shape without external dependencies. Fails loudly on any bad
// entry so CI catches typos and missing licence fields.
import { readFileSync } from 'node:fs';

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  dataType: string;
  updateFrequency: string;
  lastUpdated: string;
  notes?: string;
}

export interface SourcesFile {
  sources: SourceEntry[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const HTTP_URL = /^https?:\/\/.+/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TODO = /todo/i;

/** Validate parsed sources.json content */
export function validateSources(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['root is not an object'] };
  }
  const sources = (data as Record<string, unknown>)['sources'];
  if (!Array.isArray(sources)) {
    return { valid: false, errors: ['"sources" must be an array'] };
  }
  if (sources.length === 0) {
    errors.push('"sources" is empty');
  }
  const seenIds = new Set<string>();
  sources.forEach((entry: unknown, i: number): void => {
    const label = `sources[${i}]`;
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${label}: not an object`);
      return;
    }
    const e = entry as Record<string, unknown>;
    for (const field of ['id', 'name', 'url', 'license', 'licenseUrl', 'dataType', 'updateFrequency', 'lastUpdated']) {
      if (typeof e[field] !== 'string' || (e[field] as string).length === 0) {
        errors.push(`${label}: missing or empty "${field}"`);
      }
    }
    const id = e['id'];
    if (typeof id === 'string') {
      if (seenIds.has(id)) errors.push(`${label}: duplicate id "${id}"`);
      seenIds.add(id);
    }
    const url = e['url'];
    if (typeof url === 'string' && !HTTP_URL.test(url)) {
      errors.push(`${label}: "url" is not an HTTP(S) URL: ${url}`);
    }
    const licenseUrl = e['licenseUrl'];
    if (typeof licenseUrl === 'string' && licenseUrl.length > 0 && !HTTP_URL.test(licenseUrl)) {
      errors.push(`${label}: "licenseUrl" is not an HTTP(S) URL: ${licenseUrl}`);
    }
    const lastUpdated = e['lastUpdated'];
    if (typeof lastUpdated === 'string' && !ISO_DATE.test(lastUpdated)) {
      errors.push(`${label}: "lastUpdated" is not an ISO date: ${String(lastUpdated)}`);
    }
    const license = e['license'];
    if (typeof license === 'string' && TODO.test(license)) {
      errors.push(`${label}: licence still marked TODO: ${license}`);
    }
    if (typeof license === 'string' && license.length > 0 && (typeof licenseUrl !== 'string' || licenseUrl.length === 0)) {
      errors.push(`${label}: licence set but "licenseUrl" is empty`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/** Load and validate sources.json from disk; throws on invalid */
export function validateSourcesFile(path: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { valid: false, errors: [`cannot read/parse ${path}: ${(err as Error).message}`] };
  }
  return validateSources(data);
}

if (process.argv[1]?.endsWith('validate-sources.ts') === true) {
  const path = process.argv[2] ?? 'sources.json';
  const result = validateSourcesFile(path);
  if (!result.valid) {
    for (const err of result.errors) console.error(`sources.json: ${err}`);
    process.exit(1);
  }
  console.log(`sources.json: valid (${path})`);
}
