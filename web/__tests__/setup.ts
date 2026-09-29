
// jsdom lacks matchMedia; useSmoothedAircraft queries prefers-reduced-motion
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  })) as unknown as typeof window.matchMedia;
}

// maplibre-gl creates a worker blob URL at import time; jsdom lacks it
if (typeof window !== 'undefined' && typeof window.URL.createObjectURL !== 'function') {
  window.URL.createObjectURL = (): string => 'blob:mock';
  window.URL.revokeObjectURL = (): void => undefined;
}
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: (): void => {},
  },
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) => {
      const options = (maybeOptions ?? {}) as Record<string, unknown>;
      let template: string = key;
      if (typeof fallbackOrOptions === 'string') {
        template = fallbackOrOptions;
      } else if (fallbackOrOptions !== undefined && typeof fallbackOrOptions === 'object') {
        const o = fallbackOrOptions as Record<string, unknown>;
        template = typeof o['defaultValue'] === 'string' ? o['defaultValue'] : key;
      }
      // Interpolate {{placeholders}} from options if present
      return template.replace(/\{\{(\w+)\}\}/g, (m, k: string): string =>
        options[k] !== undefined ? String(options[k]) : m,
      );
    },
    i18n: { changeLanguage: () => undefined },
  }),
}));

afterEach(() => {
  cleanup();
});
