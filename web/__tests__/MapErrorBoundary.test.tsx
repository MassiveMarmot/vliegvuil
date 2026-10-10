// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Session 24: the lazy MapLibre chunk can 404 after a deploy when a
// visitor still runs the old service worker. The boundary must render a
// reload affordance instead of a blank map.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import MapErrorBoundary from '../src/components/MapErrorBoundary';
import type { TFunction } from 'i18next';

const Boom = (): React.ReactElement => {
  throw new Error('chunk load failed');
};

describe('MapErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    const t = ((key: string) => key) as unknown as TFunction;
    render(
      <MapErrorBoundary t={t}>
        <div>map content</div>
      </MapErrorBoundary>,
    );
    expect(screen.getByText('map content')).toBeInTheDocument();
  });

  it('shows a reload fallback when the lazy chunk fails to load', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;
    render(
      <MapErrorBoundary t={t}>
        <Boom />
      </MapErrorBoundary>,
    );
    expect(
      screen.getByText('The map failed to load. Reload the page to get the latest version.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
