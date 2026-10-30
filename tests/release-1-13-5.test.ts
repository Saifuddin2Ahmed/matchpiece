// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildDefaultOgSvg } from '../server';
import { applyBrandToHtml, BRAND_AUDIENCE, BRAND_DESCRIPTION, BRAND_ROLES } from '../src/lib/brand';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** "students" as the audience, or a place given as the audience. */
const NARROW_AUDIENCE = /\bstudents?\b|uganda|east africa|kampala tech|campus/i;

describe('1.13.5 audience wording', () => {
  it('brand audience, roles and default description', () => {
    expect(BRAND_AUDIENCE).toBe('builders, creators, professionals and students, anywhere in the world');
    expect(BRAND_ROLES).toBe('Co-founders · Teammates · Mentors · Collaborators');
    expect(BRAND_DESCRIPTION).toBe(
      'Find the people you should build and learn with: co-founders, teammates, mentors and collaborators. 1st place at Hacktoberfest Hack Day Kampala 2026. Free and open source.'
    );
  });

  it('no default meta or share text says "students" as the audience', () => {
    const head = applyBrandToHtml(read('index.html'));
    const meta = [...head.matchAll(/<meta [^>]*>|<title>[^<]*<\/title>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g)]
      .map(m => m[0])
      .join('\n');
    expect(meta).toContain(BRAND_DESCRIPTION);
    expect(meta).not.toMatch(NARROW_AUDIENCE);
    expect(meta).not.toMatch(/study partners/i);
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    expect(manifest.description).toBe(BRAND_DESCRIPTION);
    expect(JSON.parse(read('metadata.json')).description).not.toMatch(NARROW_AUDIENCE);
    expect(JSON.parse(read('package.json')).description).toContain('builders, creators, professionals and students anywhere in the world');
  });

  it('the default share image uses the roles line, not study partners', () => {
    const svg = buildDefaultOgSvg();
    expect(svg).toContain(`>${BRAND_ROLES}<`);
    expect(svg).not.toMatch(/study partners/i);
    expect(svg).not.toMatch(NARROW_AUDIENCE);
  });

  it('About page and home hero use the brand audience string', () => {
    const about = read('src/components/AboutView.tsx');
    expect(about).toContain('{BRAND_NAME} matches {BRAND_AUDIENCE} by what they need');
    expect(about).not.toMatch(/matches students/);
    const hero = read('src/components/LivingNetworkHero.tsx');
    expect(hero).toContain('co-founders, teammates, mentors and collaborators. For {BRAND_AUDIENCE}.');
  });

  it('AI prompts describe members with the brand audience, not one city or country', () => {
    const server = read('server.ts');
    expect(server).not.toMatch(/for the Kampala tech (ecosystem|community)|matchmaking engine in Kampala|for Ugandan builders/);
    expect((server.match(/\$\{BRAND_AUDIENCE\}/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('empty states do not address classmates or students only', () => {
    expect(read('src/components/MatchesView.tsx')).not.toMatch(/classmates|collaborators, students, and hackathon/);
    expect(read('src/components/LearnView.tsx')).not.toMatch(/As more attendees join/);
  });

  it('README opens with the worldwide audience', () => {
    const intro = read('README.md').split('\n').find(l => l.startsWith('Matchpiece helps'))!;
    expect(intro).toContain('builders, creators, professionals, business people and students anywhere in the world');
    expect(intro).not.toMatch(/^Matchpiece helps students/);
  });
});
