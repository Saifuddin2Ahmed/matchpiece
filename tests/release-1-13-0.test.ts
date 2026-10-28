// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { render, cleanup } from '@testing-library/react';
import {
  app,
  store,
  buildEmailFrom,
  buildEventEmail,
  buildDefaultOgSvg,
  getPublicAppUrl,
  injectEventOgIntoHtml,
  legacyRedirectTarget,
  parseLegacyHosts,
  isLegacyPassthroughPath,
  OG_BADGE_TEXT,
  EMAIL_FROM_NAME
} from '../server';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_FORMERLY,
  BRAND_TITLE,
  PRIMARY_URL,
  COPYRIGHT_LINE,
  AWARD_LINE,
  applyBrandToHtml
} from '../src/lib/brand';
import { Footer } from '../src/components/Footer';
import { BrandLogo } from '../src/components/BrandLogo';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');

let server: any;
let port: number;
const savedEnv = {
  legacy: process.env.LEGACY_HOSTS,
  primary: process.env.PRIMARY_URL,
  share: process.env.PUBLIC_SHARE_URL
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** Raw HTTP request so the Host header can be set exactly as Cloud Run passes it. */
function request(method: string, urlPath: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; location?: string; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, location: res.headers.location, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  restoreEnv('LEGACY_HOSTS', savedEnv.legacy);
  restoreEnv('PRIMARY_URL', savedEnv.primary);
  restoreEnv('PUBLIC_SHARE_URL', savedEnv.share);
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreEnv('LEGACY_HOSTS', savedEnv.legacy);
  restoreEnv('PRIMARY_URL', savedEnv.primary);
  restoreEnv('PUBLIC_SHARE_URL', savedEnv.share);
});

/* ------------------------------------------------------------------------- */

describe('Brand constants', () => {
  it('name, tagline, former name and primary URL live in src/lib/brand.ts', () => {
    expect(BRAND_NAME).toBe('Matchpiece');
    expect(BRAND_TAGLINE).toBe('Find your missing piece');
    expect(BRAND_FORMERLY).toBe('Kwegatta');
    expect(PRIMARY_URL).toBe('https://matchpiece.ai.studio');
    expect(BRAND_TITLE).toBe('Matchpiece: Find your missing piece');
    expect(COPYRIGHT_LINE).toBe('© 2026 Matchpiece · formerly Kwegatta');
    expect(AWARD_LINE).toBe('Matchpiece (formerly Kwegatta) won 1st place at Hacktoberfest 2026 Hack Day Kampala × MUBS.');
  });

  it('index.html takes its title, meta and OG tags from the brand constants', () => {
    const raw = read('index.html');
    expect(raw).not.toMatch(/\bKwegatta\b/);
    const html = applyBrandToHtml(raw);
    expect(html).not.toMatch(/__BRAND_|__PRIMARY_URL__/);
    expect(html).toContain(`<title>${BRAND_TITLE}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${BRAND_TITLE}" />`);
    expect(html).toContain(`<meta property="og:site_name" content="${BRAND_NAME}" />`);
    expect(html).toContain(`<meta property="og:image" content="${PRIMARY_URL}/og-image.png" />`);
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${BRAND_NAME}" />`);
  });

  it('the server serves index.html with the placeholders filled in', async () => {
    const r = await request('GET', '/e/no-such-event');
    expect(r.status).toBe(200);
    // Tests run before the build, so this may be an older dist/index.html; it must never leak placeholders.
    expect(r.body).not.toMatch(/__BRAND_|__PRIMARY_URL__/);
  });

  it('manifest name and short_name match the brand name', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    expect(manifest.name).toBe(BRAND_NAME);
    expect(manifest.short_name).toBe(BRAND_NAME);
  });

  it('header logo and footer use the brand name and copyright line', () => {
    const logo = render(React.createElement(BrandLogo));
    expect(logo.container.textContent).toBe(BRAND_NAME);
    expect(logo.container.querySelector('img')?.getAttribute('alt')).toBe(`${BRAND_NAME} mark`);
    cleanup();
    const footer = render(React.createElement(Footer, { onNavigate: vi.fn() } as any));
    const text = footer.container.textContent || '';
    expect(text).toContain(COPYRIGHT_LINE);
    expect(text).toContain(BRAND_TAGLINE);
    expect(text).not.toContain('© 2026 Kwegatta');
  });

  it('no name-origin text ("okwegatta", "maanyi") is left in the UI or the HTML', () => {
    const files = [
      'index.html',
      ...fs.readdirSync(path.join(root, 'src/components')).map(f => `src/components/${f}`),
      'src/App.tsx'
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/okwegatta|maanyi/i);
    }
  });

  it('the display name "Kwegatta" appears in UI code only as the former name', () => {
    const dir = path.join(root, 'src/components');
    for (const f of fs.readdirSync(dir)) {
      const lines = read(`src/components/${f}`).split('\n');
      for (const line of lines) {
        // Comments, repo URLs and file names may keep the old name; visible text may not.
        if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(line)) continue;
        const visible = line.replace(/github\.com\/Saifuddin2Ahmed\/kwegatta[^\s'"`]*/g, '').replace(/\/kwegatta-[a-z]+\.svg/g, '');
        expect(visible, `${f}: ${line.trim()}`).not.toMatch(/\bKwegatta\b(?! Team)/);
      }
    }
  });
});

describe('Emails use the new name and the primary URL', () => {
  it('From name is "Matchpiece Events"', () => {
    expect(EMAIL_FROM_NAME).toBe(`${BRAND_NAME} Events`);
    expect(buildEmailFrom('events@example.test')).toBe('"Matchpiece Events" <events@example.test>');
  });

  it('subject, body and links use the brand name and the primary URL', () => {
    delete process.env.PUBLIC_SHARE_URL;
    const item = { id: 'ev-brand-1', title: 'Builders Night', starts_at: '2027-01-10T15:00:00.000Z', timezone: 'Africa/Kampala', location: 'Kampala' };
    for (const kind of ['confirmation', 'promotion', 'cancelled', 'event_cancelled'] as const) {
      const { subject, text, html } = buildEventEmail(kind, item, 'Ann', `${PRIMARY_URL}/#/events/ev-brand-1/ticket`);
      expect(subject).not.toMatch(/Kwegatta/);
      expect(text).toContain(`on ${BRAND_NAME}`);
      expect(text).not.toMatch(/Kwegatta|kwegatta\.ai\.studio/);
      expect(html).toContain(`>${BRAND_NAME}</span>`);
      expect(html).not.toMatch(/Kwegatta|kwegatta\.ai\.studio/);
      expect(text).toContain(PRIMARY_URL);
    }
  });
});

describe('Share pages and OG images', () => {
  it('/e/:id meta uses the brand name and the primary URL', () => {
    delete process.env.PUBLIC_SHARE_URL;
    const html = injectEventOgIntoHtml('<html><head><title>x</title></head><body></body></html>', { id: 'ev-1', title: 'Demo Day' });
    expect(html).toContain(`<title>Demo Day · ${BRAND_NAME}</title>`);
    expect(html).toContain(`<meta property="og:site_name" content="${BRAND_NAME}" />`);
    expect(html).toContain(`content="${PRIMARY_URL}/e/ev-1"`);
  });

  it('event OG images carry the brand badge; the default image SVG has the name and tagline', () => {
    expect(OG_BADGE_TEXT).toBe('MATCHPIECE');
    const svg = buildDefaultOgSvg();
    expect(svg).toContain('>MATCHPIECE</text>');
    expect(svg).toContain(`>${BRAND_TAGLINE}</text>`);
    expect(svg).not.toMatch(/Kwegatta|matchmaking/i);
    expect(svg).toContain('matchpiece.ai.studio');
  });

  it('robots.txt and the /api/config URL point at the primary URL', async () => {
    delete process.env.PUBLIC_SHARE_URL;
    const robots = await request('GET', '/robots.txt');
    expect(robots.body).toContain(`Sitemap: ${PRIMARY_URL}/sitemap.xml`);
    const config = JSON.parse((await request('GET', '/api/config')).body);
    expect(config.appName).toBe(BRAND_NAME);
    expect(config.appUrl).toBe(PRIMARY_URL);
  });
});

describe('PUBLIC_SHARE_URL default', () => {
  it('defaults to https://matchpiece.ai.studio, ignoring APP_URL', () => {
    delete process.env.PUBLIC_SHARE_URL;
    const savedApp = process.env.APP_URL;
    process.env.APP_URL = 'https://kwegatta-1-359429599502.us-west1.run.app';
    try {
      expect(getPublicAppUrl()).toBe('https://matchpiece.ai.studio');
    } finally {
      restoreEnv('APP_URL', savedApp);
    }
  });

  it('an explicit PUBLIC_SHARE_URL still wins (trailing slash removed)', () => {
    process.env.PUBLIC_SHARE_URL = 'https://share.example.test/';
    expect(getPublicAppUrl()).toBe('https://share.example.test');
  });
});

describe('Legacy host redirect', () => {
  const LEGACY = 'kwegatta.ai.studio';

  it('parses LEGACY_HOSTS (comma list, case and port ignored)', () => {
    expect(parseLegacyHosts(' Kwegatta.AI.Studio:443 , old.example.test ')).toEqual(['kwegatta.ai.studio', 'old.example.test']);
    expect(parseLegacyHosts(undefined)).toEqual([]);
  });

  it('pass-through paths: API, service worker, manifest, OG images and static files', () => {
    for (const p of ['/api/events', '/api', '/sw.js', '/manifest.webmanifest', '/manifest.json', '/og/event/ev-1.jpg', '/og-image.png', '/assets/index-abc.js', '/fonts/inter.woff2', '/kwegatta-icon.svg', '/robots.txt', '/healthz']) {
      expect(isLegacyPassthroughPath(p), p).toBe(true);
    }
    for (const p of ['/', '/about', '/e/ev-1', '/events', '/u/abc']) {
      expect(isLegacyPassthroughPath(p), p).toBe(false);
    }
  });

  it('page requests on the legacy Host get a 301 with the same path and query', async () => {
    process.env.LEGACY_HOSTS = LEGACY;
    process.env.PRIMARY_URL = 'https://matchpiece.ai.studio';
    for (const [p, loc] of [
      ['/', 'https://matchpiece.ai.studio/'],
      ['/about?ref=old&x=1', 'https://matchpiece.ai.studio/about?ref=old&x=1'],
      ['/e/ev-123', 'https://matchpiece.ai.studio/e/ev-123'],
      ['/e/ev-123?utm_source=wa', 'https://matchpiece.ai.studio/e/ev-123?utm_source=wa']
    ]) {
      const get = await request('GET', p, { Host: LEGACY });
      expect(get.status, p).toBe(301);
      expect(get.location, p).toBe(loc);
      const head = await request('HEAD', p, { Host: LEGACY });
      expect(head.status, p).toBe(301);
      expect(head.location, p).toBe(loc);
    }
  });

  it('X-Forwarded-Host with the legacy host also redirects', async () => {
    process.env.LEGACY_HOSTS = LEGACY;
    const r = await request('GET', '/events?tab=past', { Host: 'kwegatta-6qhg25cs5a-uw.a.run.app', 'X-Forwarded-Host': LEGACY });
    expect(r.status).toBe(301);
    expect(r.location).toBe('https://matchpiece.ai.studio/events?tab=past');
  });

  it('/api, sw.js, the manifest and OG images are not redirected', async () => {
    process.env.LEGACY_HOSTS = LEGACY;
    const events = await request('GET', '/api/events', { Host: LEGACY });
    expect(events.status).toBe(200);
    const config = await request('GET', '/api/config', { Host: LEGACY });
    expect(config.status).toBe(200);
    for (const p of ['/sw.js', '/manifest.webmanifest', '/og/event/missing.jpg', '/og-image.png', '/robots.txt']) {
      const r = await request('GET', p, { Host: LEGACY });
      expect(r.status, p).not.toBe(301);
    }
  });

  it('POST requests and other hosts are not redirected', async () => {
    process.env.LEGACY_HOSTS = LEGACY;
    expect(legacyRedirectTarget({ method: 'POST', originalUrl: '/about', headers: { host: LEGACY } })).toBeNull();
    const primary = await request('GET', '/about', { Host: 'matchpiece.ai.studio' });
    expect(primary.status).not.toBe(301);
  });

  it('without LEGACY_HOSTS nothing is redirected', async () => {
    delete process.env.LEGACY_HOSTS;
    const r = await request('GET', '/about', { Host: LEGACY });
    expect(r.status).not.toBe(301);
  });

  it('a bad PRIMARY_URL, or one pointing at a legacy host, never redirects', () => {
    const req = { method: 'GET', originalUrl: '/about', headers: { host: LEGACY } };
    expect(legacyRedirectTarget(req, { LEGACY_HOSTS: LEGACY, PRIMARY_URL: 'javascript:alert(1)' })).toBeNull();
    expect(legacyRedirectTarget(req, { LEGACY_HOSTS: LEGACY, PRIMARY_URL: 'https://kwegatta.ai.studio' })).toBeNull();
    expect(legacyRedirectTarget(req, { LEGACY_HOSTS: LEGACY })).toBe('https://matchpiece.ai.studio/about');
  });

  it('a path like //evil.example stays on the primary host', () => {
    const target = legacyRedirectTarget(
      { method: 'GET', originalUrl: '//evil.example/x', headers: { host: LEGACY } },
      { LEGACY_HOSTS: LEGACY, PRIMARY_URL: 'https://matchpiece.ai.studio' }
    );
    expect(new URL(target!).host).toBe('matchpiece.ai.studio');
  });
});

describe('Store is untouched by the rebrand', () => {
  it('internal identifiers keep the old name', () => {
    expect(Array.isArray(store.events)).toBe(true);
    const app = read('src/App.tsx');
    expect(app).toContain("localStorage.setItem('kwegatta_current_profile'");
    expect(read('src/services/firebase.ts')).toContain('projectId: "kwegatta"');
  });
});
