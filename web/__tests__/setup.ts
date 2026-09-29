import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('react-i18next', () => ({
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
