import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import React from 'react';
import { NoiseOverlay, NoiseBadge, buildLegendEntries } from '../src/components/NoiseOverlay';
import type { NoiseContours } from '@vliegvuil/core';

function makeContours(): NoiseContours {
  return {
    contours: [
      {
        airport: 'EHAM',
        year: 2024,
        bandLowerDb: 55,
        metric: 'Lden',
        kind: 'actual',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [4.6, 52.2],
              [5.0, 52.2],
              [5.0, 52.5],
              [4.6, 52.5],
              [4.6, 52.2],
            ],
          ],
        },
        properties: { source: 'RIVM/Atlas Leefomgeving', license: 'CC-BY 4.0', date: '2024' },
      },
      {
        airport: 'EHAM',
        year: 2024,
        bandLowerDb: 70,
        metric: 'Lden',
        kind: 'actual',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [4.75, 52.28],
              [4.85, 52.28],
              [4.85, 52.34],
              [4.75, 52.34],
              [4.75, 52.28],
            ],
          ],
        },
        properties: { source: 'RIVM/Atlas Leefomgeving', license: 'CC-BY 4.0', date: '2024' },
      },
      {
        airport: 'EHEH',
        year: 2024,
        bandLowerDb: 56,
        metric: 'Lden',
        kind: 'permitted',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [5.3, 51.42],
              [5.5, 51.42],
              [5.5, 51.5],
              [5.3, 51.5],
              [5.3, 51.42],
            ],
          ],
        },
        properties: {
          source: 'CLO/NLR',
          license: 'CC-BY',
          date: '2024',
          caveat: 'civil traffic only',
        },
      },
    ],
  };
}

describe('buildLegendEntries', (): void => {
  it('builds one entry per contour with year and metric', (): void => {
    const entries = buildLegendEntries(makeContours());
    expect(entries).toHaveLength(3);
    expect(entries[0]?.airport).toBe('EHAM');
    expect(entries.some((e): boolean => e.bandLowerDb === 70 && e.year === 2024 && e.kind === 'actual')).toBe(true);
    expect(entries.every((e): boolean => e.metric === 'Lden')).toBe(true);
  });
});

describe('NoiseOverlay', (): void => {
  it('renders nothing without contour data', (): void => {
    const { container } = render(
      <NoiseOverlay enabled={false} onToggle={(): void => {}} contours={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('toggles the legend and announces state via aria-pressed', (): void => {
    const onToggle = vi.fn();
    render(<NoiseOverlay enabled={false} onToggle={onToggle} contours={makeContours()} />);
    const toggle = screen.getByTestId('noise-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('noise-legend')).toBeNull();

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows legend with band, airport and year when enabled', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const legend = screen.getByTestId('noise-legend');
    expect(legend.textContent).toContain('EHAM');
    expect(legend.textContent).toContain('2024');
    expect(legend.textContent).toContain('Lden');
    expect(legend.textContent).toContain('annual average');
    expect(screen.getByTestId('noise-swatch-70')).toBeDefined();
    expect(screen.getByTestId('noise-swatch-55')).toBeDefined();
  });

  it('shows the Eindhoven civil caveat', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    expect(screen.getByTestId('noise-legend').textContent).toContain('civil traffic only');
  });
});

describe('NoiseBadge', (): void => {
  it('renders the contour-membership text with band, airport and year', (): void => {
    render(<NoiseBadge lat={52.3} lon={4.8} contours={makeContours()} />);
    const badge = screen.getByTestId('noise-badge');
    expect(badge.textContent).toContain('70');
    expect(badge.textContent).toContain('EHAM');
    expect(badge.textContent).toContain('2024');
    expect(badge.textContent).toContain('annual average');
  });

  it('returns the highest band containing the point', (): void => {
    render(<NoiseBadge lat={52.45} lon={4.8} contours={makeContours()} />);
    const badge = screen.getByTestId('noise-badge');
    expect(badge.textContent).toContain('55');
  });

  it('renders nothing outside all contours', (): void => {
    const { container } = render(
      <NoiseBadge lat={51.9} lon={4.4} contours={makeContours()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
