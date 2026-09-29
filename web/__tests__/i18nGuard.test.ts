// Guard test: no user-visible string literals in .tsx components.
// Every user-facing string must go through i18next (locales/{nl,en}.json).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEB_SRC = join(__dirname, '..', 'src');

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// Matches a JSX text node containing letters, e.g. <div>Hello world</div>
const JSX_TEXT = />[A-Za-zÀ-ÿ0-9][^<>{}]*</;
// Matches string literals passed as id/label/title/placeholder/aria-* props
const LITERAL_PROP =
  /\b(id|label|title|placeholder|aria-label|aria-describedby|aria-placeholder|alt)\s*=\s*["'][A-Za-zÀ-ÿ]/;

describe('i18n guard', () => {
  it('contains no user-visible string literals in .tsx files', () => {
    const offenders: string[] = [];
    for (const file of collectTsxFiles(WEB_SRC)) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // Allow imports, type annotations, and i18n calls
        if (
          trimmed.startsWith('import') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('//') ||
          trimmed.includes("t('") ||
          trimmed.includes('t("') ||
          trimmed.includes('type:') ||
          trimmed.includes("as const")
        ) {
          return;
        }
        if (JSX_TEXT.test(line) && !/[{}]/.test(line.match(JSX_TEXT)?.[0] ?? '')) {
          offenders.push(`${file}:${i + 1}: JSX text: ${trimmed.slice(0, 80)}`);
        }
        if (LITERAL_PROP.test(line)) {
          offenders.push(`${file}:${i + 1}: literal prop: ${trimmed.slice(0, 80)}`);
        }
      });
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('keeps every key used in code present in both locales', () => {
    const nl = JSON.parse(readFileSync(join(__dirname, '..', '..', 'locales', 'nl.json'), 'utf8')) as Record<string, unknown>;
    const en = JSON.parse(readFileSync(join(__dirname, '..', '..', 'locales', 'en.json'), 'utf8')) as Record<string, unknown>;

    const used = new Set<string>();
    const keyRe = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;
    for (const file of collectTsxFiles(WEB_SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(keyRe)) {
        used.add(m[1] as string);
      }
    }

    function has(obj: Record<string, unknown>, dotted: string): boolean {
      let cur: unknown = obj;
      for (const part of dotted.split('.')) {
        if (typeof cur !== 'object' || cur === null) return false;
        cur = (cur as Record<string, unknown>)[part];
      }
      return cur !== undefined;
    }

    const missing: string[] = [];
    for (const key of used) {
      if (!has(nl, key)) missing.push(`nl missing: ${key}`);
      if (!has(en, key)) missing.push(`en missing: ${key}`);
    }
    expect(missing.join('\n')).toBe('');
  });
});
