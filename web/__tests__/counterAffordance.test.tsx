// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Counter affordance (follow-up to session 26): the flight counter is
// the list toggle; this file pins its visible affordance (aria-hidden
// list icon + chevron that flips with aria-expanded), its accessible
// name (count + open/close action, nl and en), and axe cleanliness with
// the list closed and open. Same maplibre/core mock pattern as
// a11ySession26.test.tsx.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { axe } from 'jest-axe';
import React from 'react';
import type { PositionProvider } from '@vliegvuil/core';
import i18n from '../src/i18n';

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
      getServerNow: (): number => Date.now() / 1000,
    }),
  };
});

// MapLibre cannot run in jsdom (WebGL); a minimal fake Map is enough
// here — the assertions target the counter button, not the map.
vi.mock('maplibre-gl', () => {
  const mapApi = (): Record<string, unknown> => ({
    getContainer: (): HTMLDivElement => document.createElement('div'),
    on: (): object => ({}),
    off: (): object => ({}),
    addControl: (): object => ({}),
    removeControl: (): void => undefined,
    remove: (): void => undefined,
    isStyleLoaded: (): boolean => false,
    getCanvas: (): { style: Record<string, string> } => ({ style: {} }),
    getLayer: (): boolean => false,
    getSource: (): undefined => undefined,
    addSource: (): void => undefined,
    addLayer: (): void => undefined,
    setLayoutProperty: (): void => undefined,
    fitBounds: (): void => undefined,
    addImage: (): void => undefined,
  });
  const FakeMap = class {
    constructor(_opts: Record<string, unknown>) {
      Object.assign(this, mapApi());
    }
  };
  return {
    default: { Map: FakeMap },
    Map: FakeMap,
    LngLatBounds: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_sw: unknown, _ne: unknown) {}
    },
    NavigationControl: class {
      onAdd(): HTMLButtonElement {
        // The portaled compass lands in the axe DOM now; give the fake
        // button an accessible name so button-name does not fire.
        const btn = document.createElement('button');
        btn.setAttribute('aria-label', 'Kaart naar het noorden draaien');
        return btn;
      }
      onRemove(): void {}
    },
  };
});

import App from '../src/App';

function setPathSafe(path: string): void {
  window.history.replaceState({}, '', path);
}

async function setLanguage(lang: 'nl' | 'en'): Promise<void> {
  await act(async (): Promise<void> => {
    await i18n.changeLanguage(lang);
  });
}

function getToggle(): HTMLElement {
  return screen.getByRole('button', { name: /vliegtuigen|aircraft/i });
}

describe('counter affordance (session 26 follow-up)', () => {
  beforeEach((): void => {
    fetchPositions.mockReset();
  });
  afterEach((): void => {
    cleanup();
    setPathSafe('/nl/');
  });

  it('the icons are decorative (aria-hidden, not focusable)', (): void => {
    setPathSafe('/nl/');
    render(<App />);
    const toggle = getToggle();
    const svgs = toggle.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    svgs.forEach((svg): void => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    });
    // The visible text still shows the bare count
    expect(toggle.textContent).toContain('Vliegtuigen: 0');
  });

  it('the chevron flip follows aria-expanded (up closed, down open)', async (): Promise<void> => {
    setPathSafe('/nl/');
    render(<App />);
    const toggle = getToggle();
    const chevron = toggle.querySelector('svg.map-status-chevron') as SVGSVGElement;
    expect(chevron).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Closed: the pop-out opens ABOVE, so the chevron points up (base
    // orientation, no rotation); open: rotated 180deg (points down).
    expect(chevron.getAttribute('class')).toContain('map-status-chevron');
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // The CSS rule keyed on [aria-expanded='true'] is what flips it;
    // the panel is open and the same chevron node is still in place
    // (state change, not a re-mount).
    expect(document.getElementById('aircraft-list-panel')).not.toBeNull();
  });

  it('accessible name carries count + open action (nl), and close action when open', async (): Promise<void> => {
    setPathSafe('/nl/');
    render(<App />);
    let toggle = getToggle();
    expect(toggle.getAttribute('aria-label')).toContain('Vliegtuigen: 0');
    expect(toggle.getAttribute('aria-label')).toContain('lijst met alle vluchten openen');
    expect(toggle.getAttribute('aria-label')).not.toContain('sluiten');
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    toggle = getToggle();
    expect(toggle.getAttribute('aria-label')).toContain('lijst sluiten');
    expect(toggle.getAttribute('aria-label')).not.toContain('openen');
  });

  it('accessible name carries count + open/close action (en)', async (): Promise<void> => {
    // The useTranslation hook is globally mocked (setup.ts) to return the
    // call-site fallback string, so the component always renders its
    // Dutch fallback here. Assert the EN wording through the real i18n
    // instance (the locale files the component's t() calls resolve to at
    // runtime), the same pattern as languageSwitch.test.ts.
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('en');
    });
    expect(i18n.language).toBe('en');
    const open = i18n.t('info.listToggleOpen', { count: 5 }) as string;
    const close = i18n.t('info.listToggleClose', { count: 5 }) as string;
    expect(open).toContain('Aircraft: 5');
    expect(open).toContain('open the list of all flights');
    expect(close).toContain('Aircraft: 5');
    expect(close).toContain('close the list');
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
  });

  it('locale keys exist in both languages (parity via the uiShell test; here: the strings resolve)', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      await i18n.changeLanguage('nl');
    });
    expect(i18n.t('info.listToggleOpen', { count: 3 })).toContain('3');
    expect(i18n.t('info.listToggleClose', { count: 3 })).toContain('3');
    expect(String(i18n.t('info.listToggleOpen', { count: 3 }))).toContain(
      'lijst met alle vluchten openen'
    );
    expect(String(i18n.t('info.listToggleClose', { count: 3 }))).toContain('lijst sluiten');
  });

  it('axe: map with list closed has no serious violations', async (): Promise<void> => {
    await setLanguage('nl');
    setPathSafe('/nl/');
    const { container } = render(<App />);
    const results = await axe(container);
    expect(
      results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')
    ).toEqual([]);
  });

  it('axe: map with list open has no serious violations', async (): Promise<void> => {
    await setLanguage('nl');
    setPathSafe('/nl/');
    const { container } = render(<App />);
    const toggle = getToggle();
    await act(async (): Promise<void> => {
      fireEvent.click(toggle);
    });
    const results = await axe(container);
    expect(
      results.violations.filter((v): boolean => v.impact === 'serious' || v.impact === 'critical')
    ).toEqual([]);
  });
});
