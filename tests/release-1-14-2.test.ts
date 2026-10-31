// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { INITIAL_TEAM_MEMBERS } from '../server';
import { ExampleMatches, EXAMPLE_MATCHES } from '../src/components/AboutView';
import { ContactModal } from '../src/components/ContactModal';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let reduceMotion = false;
function installMatchMedia() {
  (window as any).matchMedia = (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false
  });
}

const EXPECTED = [
  {
    a: ['Amina', 'Café Owner', 'Offers: Business & sales experience', 'Needs: An online ordering app'],
    b: ['Daniel', 'Mobile Developer', 'Offers: Mobile apps', 'Needs: Real business and customer experience'],
    score: '92% Match',
    why: 'Amina needs an ordering app that Daniel can build, and Daniel wants the real business experience Amina has.'
  },
  {
    a: ['Grace', 'Photographer', 'Offers: Photos & visual content', 'Needs: New clients'],
    b: ['Omar', 'Digital Marketer', 'Offers: Marketing & ads', 'Needs: Strong content for his campaigns'],
    score: '89% Match',
    why: 'Grace creates the content Omar needs, and Omar brings the clients Grace is looking for.'
  },
  {
    a: ['Fatima', 'Health Researcher', 'Offers: Field data & health expertise', 'Needs: Data analysis'],
    b: ['Kevin', 'Data Analyst', 'Offers: Data analysis & AI', 'Needs: A real project with impact'],
    score: '90% Match',
    why: 'Fatima has the data and the questions, and Kevin has the skills to turn them into answers.'
  }
];

beforeEach(() => {
  reduceMotion = false;
  installMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Release 1.14.2: About page example matches', () => {
  it('has exactly three examples', () => {
    expect(EXAMPLE_MATCHES).toHaveLength(3);
  });

  it('renders all three examples with the exact text when the visitor switches between them', () => {
    render(React.createElement(ExampleMatches));
    expect(screen.getByText('Example match')).toBeTruthy();
    expect(screen.queryByText(/Suggested project/)).toBeNull();

    EXPECTED.forEach((ex, i) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Example ${i + 1} of 3`) }));
      for (const text of [...ex.a, ...ex.b, ex.score, ex.why]) {
        expect(screen.getByText(text)).toBeTruthy();
      }
      expect(screen.getByText('Why they match:')).toBeTruthy();
    });
  });

  it('dots are labelled buttons and arrow keys move between examples', () => {
    render(React.createElement(ExampleMatches));
    const dots = screen.getAllByRole('button', { name: /^Example \d of 3: / });
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute('aria-label')).toBe('Example 1 of 3: Amina and Daniel');
    expect(dots[0].getAttribute('aria-current')).toBe('true');

    fireEvent.keyDown(dots[0], { key: 'ArrowRight' });
    expect(screen.getByText('Grace')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: /^Example \d of 3: / })[1]);

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.getByText('Fatima')).toBeTruthy();
  });

  it('auto-rotates every 6 seconds and pauses on hover', () => {
    vi.useFakeTimers();
    render(React.createElement(ExampleMatches));
    const region = screen.getByTestId('example-matches');
    expect(region.getAttribute('data-auto-rotate')).toBe('on');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText('Grace')).toBeTruthy();

    fireEvent.mouseEnter(region);
    expect(region.getAttribute('data-auto-rotate')).toBe('off');
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByText('Grace')).toBeTruthy();
  });

  it('does not auto-rotate when the visitor prefers reduced motion', () => {
    reduceMotion = true;
    installMatchMedia();
    vi.useFakeTimers();
    render(React.createElement(ExampleMatches));
    expect(screen.getByTestId('example-matches').getAttribute('data-auto-rotate')).toBe('off');
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('Amina')).toBeTruthy();
  });

  it('AboutView and ContactModal mention no team member names (except the Contact lead) and no old organisation name', () => {
    const about = read('src/components/AboutView.tsx');
    const contact = read('src/components/ContactModal.tsx');
    for (const src of [about, contact]) expect(src).not.toMatch(/Future\s+Stars/i);
    expect(contact).not.toMatch(/founder/i);
    for (const m of INITIAL_TEAM_MEMBERS) {
      const first = m.name.split(' ')[0];
      expect(about).not.toContain(first);
      if (m.id !== 'team-saifuddin') expect(contact).not.toContain(first);
    }
    expect(about).not.toMatch(/Sub-Saharan College|Al Neelain/);
  });
});

describe('Release 1.14.2: Contact window', () => {
  it('shows Saifuddin Ahmed as Project Lead & Developer with Hack Day Kampala × MUBS', () => {
    render(React.createElement(ContactModal, { isOpen: true, onClose: vi.fn() }));
    expect(screen.getByText('Saifuddin Ahmed')).toBeTruthy();
    expect(screen.getByText('Project Lead & Developer')).toBeTruthy();
    expect(screen.getByText('Hack Day Kampala × MUBS')).toBeTruthy();
    expect(screen.getByText(/Kampala, Uganda/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Future\s+Stars|founder/i);
  });
});

describe('Release 1.14.2: team defaults', () => {
  it('Saifuddin line2 is Al Neelain University and no default mentions the old organisation', () => {
    const s = INITIAL_TEAM_MEMBERS.find(m => m.id === 'team-saifuddin')!;
    expect(s.line2).toBe('Al Neelain University');
    expect(JSON.stringify(INITIAL_TEAM_MEMBERS)).not.toMatch(/Future\s+Stars/i);
  });

  it('release metadata is 1.14.2', () => {
    expect(JSON.parse(read('package.json')).version).toBe('1.14.2');
    expect(read('public/sw.js')).toContain("'matchpiece-1.14.2'");
  });
});
