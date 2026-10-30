// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Error boundary for the lazy-loaded MapLibre chunk (session 24).
// After a deploy the old hashed chunk 404s for visitors still on the old
// service worker; this boundary offers a reload instead of a blank map.

import React from 'react';
import type { TFunction } from 'i18next';

export interface MapErrorBoundaryProps {
  children: React.ReactNode;
  /** i18next translate function, passed from the parent (class component) */
  t: TFunction;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, State> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Map chunk failed to load:', error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="map-container map-error-fallback" role="alert">
          <p>{t('map.loadError', 'The map failed to load. Reload the page to get the latest version.')}</p>
          <button type="button" onClick={this.handleReload} autoFocus>
            {t('map.reload', 'Reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default MapErrorBoundary;
