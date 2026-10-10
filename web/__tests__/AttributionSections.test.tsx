import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import AttributionPage from '../src/components/AttributionPage';
import { ATTRIBUTION_SECTIONS, NOISE_SECTION_ID, sectionForSource } from '../src/config/attributionSections';
import sources from '../../sources.json';

describe('attributionSections config', (): void => {
  it('maps every sources.json entry to a section', (): void => {
    const ids = sources.sources.map((s): string => s.id);
    for (const id of ids) {
      expect(sectionForSource(id)).not.toBeNull();
    }
  });

  it('has unique section ids and unique heading keys', (): void => {
    const ids = ATTRIBUTION_SECTIONS.map((s): string => s.id);
    const keys = ATTRIBUTION_SECTIONS.map((s): string => s.headingKey);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('AttributionPage layer sections', (): void => {
  it('renders a plain-language heading per map layer with a deep-link id', (): void => {
    render(<AttributionPage />);
    for (const section of ATTRIBUTION_SECTIONS) {
      const anchor = section.id === NOISE_SECTION_ID ? 'attribution-noise' : `attribution-${section.id}`;
      const el = document.getElementById(anchor);
      expect(el).not.toBeNull();
      expect(el?.textContent ?? '').toContain(section.headingDefault);
    }
  });

  it('groups each source under its layer section and shows licences from sources.json', (): void => {
    render(<AttributionPage />);
    const noise = document.getElementById('attribution-noise');
    expect(noise?.textContent).toContain('RIVM');
    expect(noise?.textContent).toContain('CLO/NLR');
    expect(noise?.textContent).toContain('Licentie');
    const basemap = document.getElementById('attribution-basemap');
    expect(basemap?.textContent).toContain('PDOK');
    expect(basemap?.textContent).toContain('Natural Earth');
  });

  it('shows years and the permitted-vs-actual note on the noise section', (): void => {
    render(<AttributionPage />);
    const noise = document.getElementById('attribution-noise');
    expect(noise?.textContent).toContain('2018');
    expect(noise?.textContent).toContain('2021');
    expect(noise?.textContent).toContain('2024');
    expect(noise?.textContent).toContain('permitted use');
    expect(noise?.textContent).toContain('actual traffic');
  });

  it('shows a translated caveat per layer section', (): void => {
    render(<AttributionPage />);
    const basemap = document.getElementById('attribution-basemap');
    expect(basemap?.textContent).toContain('Borders are indicative');
    const noise = document.getElementById('attribution-noise');
    expect(noise?.textContent).toContain('annual average noise load');
  });
});
