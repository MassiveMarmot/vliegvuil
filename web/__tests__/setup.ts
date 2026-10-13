
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
import React from 'react';
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
  // Minimal Trans: children may be a single string containing <1>...</1>
  // index markers; substitute components[N-1] for each marker.
  Trans: ({ children, values, components }: { children?: React.ReactNode; values?: Record<string, unknown>; components?: React.ReactNode[] }) => {
    let text = typeof children === 'string' ? children : String(children ?? '');
    if (values) {
      text = text.replace(/\{\{(\w+)\}\}/g, (m, k: string): string =>
        values[k] !== undefined ? String(values[k]) : m,
      );
    }
    if (components && components.length > 0) {
      // Replace each <N>...</N> span with components[N-1]; markers arrive
      // escaped as &lt;1&gt; in some i18next paths, handle the raw form.
      text = text.replace(/<(\d+)>([\s\S]*?)<\/\1>/g, (_m, idx: string): string =>
        `\u0000COMP${Number(idx) - 1}\u0000`,
      );
      const parts = text.split(/\u0000COMP(\d+)\u0000/);
      const out: React.ReactNode[] = [];
      for (let i = 0; i < parts.length; i += 1) {
        if (i % 2 === 0) {
          if (parts[i]) out.push(parts[i]);
        } else {
          out.push(components[Number(parts[i])] ?? null);
        }
      }
      return React.createElement(React.Fragment, null, ...out);
    }
    return React.createElement(React.Fragment, null, text);
  },
}));

afterEach(() => {
  cleanup();
});
