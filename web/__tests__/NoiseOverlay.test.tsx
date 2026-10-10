import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NoiseOverlay, NoiseBadge, buildLegendEntries, buildBandRows } from '../src/components/NoiseOverlay';
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

describe('buildBandRows', (): void => {
  it('groups entries into one row per band, sorted by dB', (): void => {
    const rows = buildBandRows(buildLegendEntries(makeContours()));
    expect(rows.map((r): number => r.bandLowerDb)).toEqual([55, 56, 70]);
    expect(rows.every((r): boolean => r.metric === 'Lden')).toBe(true);
  });

  it('merges kinds per band', (): void => {
    const entries = [
      ...buildLegendEntries(makeContours()),
      {
        airport: 'EHGR',
        year: 2024,
        bandLowerDb: 55,
        metric: 'Lden',
        kind: 'permitted' as const,
        source: 'CLO/NLR',
        license: 'CC-BY',
      },
    ];
    const rows = buildBandRows(entries);
    const band55 = rows.find((r): boolean => r.bandLowerDb === 55);
    expect(band55?.kinds).toContain('actual');
    expect(band55?.kinds).toContain('permitted');
  });
});

describe('NoiseOverlay (compact legend)', (): void => {
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

  it('shows compact legend with essential line, year and grouped band rows when enabled', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const legend = screen.getByTestId('noise-legend');
    expect(legend.textContent).toContain('Annual average, not live');
    expect(legend.textContent).toContain('2024');
    expect(legend.textContent).toContain('Lden');
    expect(screen.getByTestId('noise-swatch-70')).toBeDefined();
    expect(screen.getByTestId('noise-swatch-55')).toBeDefined();
    expect(screen.getByTestId('noise-swatch-56')).toBeDefined();
  });

  it('fires the sources callback from the legend link', (): void => {
    const onOpenSources = vi.fn();
    render(
      <NoiseOverlay
        enabled={true}
        onToggle={(): void => {}}
        contours={makeContours()}
        onOpenSources={onOpenSources}
      />,
    );
    fireEvent.click(screen.getByTestId('noise-legend-sources'));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
  });
});

describe('NoiseOverlay (narrow viewport chip + sheet)', (): void => {
  let matchMediaSpy: ReturnType<typeof vi.fn>;

  beforeEach((): void => {
    matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaSpy);
  });

  it('starts collapsed as a chip with aria-expanded=false on narrow viewports', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const chip = screen.getByTestId('noise-legend-chip');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('noise-legend-sheet')).toBeNull();
  });

  it('expands the sheet on chip click and toggles aria-expanded', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const chip = screen.getByTestId('noise-legend-chip');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('noise-legend-sheet')).toBeDefined();
    expect(screen.getByTestId('noise-swatch-55')).toBeDefined();
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('noise-legend-sheet')).toBeNull();
  });

  it('closes the sheet with the close button and returns focus to the chip', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const chip = screen.getByTestId('noise-legend-chip');
    fireEvent.click(chip);
    const close = screen.getByTestId('noise-legend-close');
    fireEvent.click(close);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('noise-legend-sheet')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it('closes the sheet on Esc and returns focus to the chip', (): void => {
    render(<NoiseOverlay enabled={true} onToggle={(): void => {}} contours={makeContours()} />);
    const chip = screen.getByTestId('noise-legend-chip');
    fireEvent.click(chip);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('noise-legend-sheet')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it('fires the sources callback from the sheet link', (): void => {
    const onOpenSources = vi.fn();
    render(
      <NoiseOverlay
        enabled={true}
        onToggle={(): void => {}}
        contours={makeContours()}
        onOpenSources={onOpenSources}
      />,
    );
    fireEvent.click(screen.getByTestId('noise-legend-chip'));
    fireEvent.click(screen.getByTestId('noise-legend-sources'));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
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
