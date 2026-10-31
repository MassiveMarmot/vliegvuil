// Session 25 tests: UI shell. Routing (History API, language from the
// path), header/menu (keyboard, focus return, language switcher), About
// page (content, outbound links, null-config entries hidden), and locale
// key parity across every supported language.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PositionProvider } from '@vliegvuil/core';

const fetchPositions = vi.fn();
vi.mock('@vliegvuil/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vliegvuil/core')>();
  return {
    ...actual,
    createAdsbfiProvider: (_config: unknown): PositionProvider => ({
      fetchPositions: (...args: unknown[]): Promise<never[]> => {
        fetchPositions(...(args as Parameters<PositionProvider['fetchPositions']>));
        return Promise.resolve([]);
      },
      getDataAge: (): number => 0,
      getLastError: (): null => null,
      isStale: (): boolean => false,
    }),
  };
});
// MapLibre cannot run in jsdom (WebGL); stub the heavy chunks.
vi.mock('maplibre-gl', () => ({
  default: { Map: class {} },
  Map: class {},
  LngLatBounds: class {},
}));
vi.mock('../src/components/Map', () => ({
  Map: (): null => null,
  default: (): null => null,
}));

import App from '../src/App';

function setPath(path: string): void {
  window.history.replaceState({}, '', path);
}

describe('routing', () => {
  beforeEach((): void => {
    fetchPositions.mockClear();
    setPath('/nl/');
  });
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
  });

  it('renders the map view (no page heading) on /{lang}/', (): void => {
    setPath('/nl/');
    render(<App />);
    expect(document.querySelector('.app-header')).not.toBeNull();
    expect(document.querySelector('h1')).toBeNull();
    expect(fetchPositions).toHaveBeenCalled();
  });

  it('renders the About page in NL on /nl/about', (): void => {
    setPath('/nl/about');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /over/i })).not.toBeNull();
    expect(document.documentElement.lang).toBe('nl');
  });

  it('renders the About page in EN on /en/about and sets <html lang>', (): void => {
    setPath('/en/about');
    render(<App />);
    // The mocked t() in tests returns the call-site fallback (Dutch), so
    // assert on the route effect, not the rendered language.
    expect(document.querySelector('main.about-page')).not.toBeNull();
    expect(window.location.pathname).toBe('/en/about');
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows the not-found view for unknown paths', (): void => {
    setPath('/nl/whargarbl');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /niet gevonden/i })).not.toBeNull();
  });

  it('shows the not-found view for unknown language segments', (): void => {
    setPath('/xx/about');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /niet gevonden/i })).not.toBeNull();
  });

  it('navigates with the History API (menu link) and Back works', async (): Promise<void> => {
    setPath('/nl/');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const aboutLink = screen.getByRole('link', { name: /^over$/i });
    fireEvent.click(aboutLink);
    expect(window.location.pathname).toBe('/nl/about');
    expect(screen.getByRole('heading', { level: 1, name: /over/i })).not.toBeNull();
    act((): void => {
      window.history.back();
    });
    // popstate fires asynchronously; wait for the route to settle. A
    // single setTimeout(0) tick is not enough under suite load (the flake
    // this replace fixed: the pathname assert ran before the popstate
    // handler). waitFor polls until the route actually settles.
    await waitFor((): void => {
      expect(window.location.pathname).toBe('/nl/');
    });

  });

  it('switching language in the menu keeps the same page', (): void => {
    setPath('/nl/about');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const enLink = screen.getByRole('link', { name: 'English' });
    expect(enLink.getAttribute('hreflang')).toBe('en');
    expect(enLink.getAttribute('lang')).toBe('en');
    fireEvent.click(enLink);
    expect(window.location.pathname).toBe('/en/about');
    expect(document.querySelector('main.about-page')).not.toBeNull();
  });

  it('marks the active language with aria-current', (): void => {
    setPath('/nl/about');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const nlLink = screen.getByRole('link', { name: 'Nederlands' });
    expect(nlLink.getAttribute('aria-current')).toBe('true');
    const enLink = screen.getByRole('link', { name: 'English' });
    expect(enLink.getAttribute('aria-current')).toBeNull();
  });
});

describe('menu keyboard behaviour', () => {
  beforeEach((): void => {
    setPath('/nl/');
  });
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
  });

  it('opens the menu with Enter and Esc closes it, returning focus to the hamburger', (): void => {
    render(<App />);
    const menuButton = screen.getByRole('button', { name: /menu/i });
    menuButton.focus();
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).not.toBe(menuButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menuButton);
  });

  it('clicking the Menu button while open closes it (pointerdown then click)', (): void => {
    // Regression: the outside-pointerdown handler used to close the menu
    // on the button's own pointerdown, and the onClick toggle then
    // reopened it — the button could never close the menu.
    render(<App />);
    const menuButton = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    // Real browsers fire pointerdown before click on the same target
    fireEvent.pointerDown(menuButton);
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: /hoofdmenu/i })).toBeNull();
  });

  it('a pointerdown outside both the button and the panel still closes the menu', (): void => {
    render(<App />);
    const menuButton = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    // pointerdown on the document body (outside panel and button)
    fireEvent.pointerDown(document.body);
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: /hoofdmenu/i })).toBeNull();
  });
});

describe('About page content and links', () => {
  beforeEach((): void => {
    setPath('/nl/about');
  });
  afterEach((): void => {
    cleanup();
    setPath('/nl/');
  });

  it('states Netherlands-only coverage', (): void => {
    render(<App />);
    const text = screen.getByRole('heading', { level: 1 }).parentElement?.textContent ?? '';
    expect(text).toMatch(/Nederland/);
  });

  it('renders outbound links with rel and referrerpolicy', (): void => {
    render(<App />);
    const issuesLink = screen.getByRole('link', { name: /github issues/i });
    expect(issuesLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(issuesLink.getAttribute('referrerPolicy')).toBe('no-referrer');
    expect(issuesLink.getAttribute('href')).toBe('https://github.com/MassiveMarmot/vliegvuil/issues');
  });

  it('hides the Bluesky entry while it is null', (): void => {
    render(<App />);
    expect(screen.queryByText(/bluesky/i)).toBeNull();
  });

  it('does not mention HSTS (not enabled)', (): void => {
    render(<App />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/hsts|strict-transport/i);
  });
});

describe('locale key parity', () => {
  it('every supported language has exactly the same key set', (): void => {
    const localesDir = join(__dirname, '..', '..');
    const nl = JSON.parse(readFileSync(join(localesDir, 'locales', 'nl.json'), 'utf8')) as Record<string, unknown>;
    const en = JSON.parse(readFileSync(join(localesDir, 'locales', 'en.json'), 'utf8')) as Record<string, unknown>;
    const keys = (obj: Record<string, unknown>, prefix = ''): string[] => {
      const out: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const dotted = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          out.push(...keys(v as Record<string, unknown>, dotted));
        } else {
          out.push(dotted);
        }
      }
      return out.sort();
    };
    const nlKeys = keys(nl);
    const enKeys = keys(en);
    expect(enKeys).toEqual(nlKeys);
  });

  it('the language storage key is gone from the code', (): void => {
    const i18nSrc = readFileSync(join(__dirname, '..', 'src', 'i18n.ts'), 'utf8')
      .split('\n').filter((l): boolean => !l.trim().startsWith('//')).join('\n');
    expect(i18nSrc).not.toMatch(/localStorage|STORAGE_KEY/);
    const settingsSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'SettingsPanel.tsx'), 'utf8');
    expect(settingsSrc).not.toMatch(/vliegvuil\.language/);
  });
});

describe('service worker navigation fallback denylist (vite config)', () => {
  it('blocks /api/, /tiles/, /fonts/, /data/ and asset-like paths', (): void => {
    const vite = readFileSync(join(__dirname, '..', 'vite.config.ts'), 'utf8');
    expect(vite).toContain('navigateFallbackDenylist');
    for (const seg of ['api', 'tiles', 'fonts', 'data']) {
      expect(vite).toContain(`\\/${seg}\\/`);
    }
    expect(vite).toContain('noise-contours');
  });
});
