// Acceptance test: switching to EN leaves no Dutch text.
// The react-i18next useTranslation hook is globally mocked in setup.ts
// (it always returns the defaultValue), so this test verifies the real
// i18next instance directly: every UI key used by the components must
// resolve to English (no Dutch) when the language is 'en', and <html
// lang> must follow the switch.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import i18n, { setLanguage } from '../src/i18n';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      keys.push(...flatten(v as Record<string, unknown>, key));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

// Dutch words that must never appear in EN strings
const DUTCH_MARKERS = [
  'Vliegtuigen',
  'Laatste update',
  'Laden',
  'Lijstweergave',
  'Geluidscontouren',
  'geselecteerd',
  'Sluiten',
  'zoeken',
  'verouderd',
];

describe('language switch', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    return i18n.changeLanguage('en');
  });
  afterEach(() => {
    setLanguage('nl');
    return i18n.changeLanguage('nl');
  });

  it('resolves every UI key to English with no Dutch markers', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    const nl = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'locales', 'nl.json'), 'utf8'),
    ) as Record<string, unknown>;
    const offenders: string[] = [];
    for (const key of flatten(nl)) {
      const en = i18n.t(key, { defaultValue: '', count: 3, seconds: 4, callsign: 'TRA16U', band: 56, airport: 'EHAM', year: 2024, metric: 'Lden', source: 'src', license: 'CC-BY', time: '12:00' }) as string;
      const found = DUTCH_MARKERS.filter((m) => en.includes(m));
      if (found.length > 0) {
        offenders.push(`${key}: "${en}" contains ${found.join(',')}`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('switching language updates <html lang> and strings', async () => {
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('info.aircraftCount', { count: 3 })).toBe('Aircraft: 3');
    setLanguage('nl');
    await i18n.changeLanguage('nl');
    expect(document.documentElement.lang).toBe('nl');
    expect(i18n.t('info.aircraftCount', { count: 3 })).toBe('Vliegtuigen: 3');
  });
});
