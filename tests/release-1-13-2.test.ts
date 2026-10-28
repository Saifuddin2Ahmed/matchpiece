// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import sharp from 'sharp';
import {
  app,
  store,
  isProfileShareable,
  profileShareText,
  profileOgBadges,
  scrubContactInfo,
  setIndexHtmlTemplateForTest
} from '../server';
import { applyBrandToHtml, profileShareUrl } from '../src/lib/brand';
import { parseAppRoute } from '../src/lib/route';

let server: any;
let port: number;
const savedEnv = { share: process.env.PUBLIC_SHARE_URL, legacy: process.env.LEGACY_HOSTS };

function request(method: string, urlPath: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const metaTags = (html: string) => html.match(/<meta\s+(?:property|name)=["'](?:og|twitter):[^>]*>/gi) || [];

const PHOTO = fs.readFileSync(path.join(process.cwd(), 'public/images/team-session-800.webp')).toString('base64');

const publicProfile = {
  id: 'share-pub-1132',
  account_uid: 'share-pub-1132',
  name: 'Amina Nakato',
  headline: 'Product designer building tools for farmers',
  offers: 'UI and UX design, design systems and user research for early teams. Reach me at amina@example.com or +256 700 123 456. I also mentor students who want to learn Figma and prototyping.',
  needs: 'A backend developer',
  email: 'amina@example.com',
  whatsapp: '+256700123456',
  hide_whatsapp: false,
  avatar: `data:image/webp;base64,${PHOTO}`,
  is_organiser: true,
  role: 'Designer',
  updated_at: '2026-10-28T12:00:00.000Z',
  created_at: '2026-10-01T12:00:00.000Z'
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.PUBLIC_SHARE_URL;
  delete process.env.LEGACY_HOSTS;
  setIndexHtmlTemplateForTest(applyBrandToHtml(fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8')));
  store.profiles.push(
    { ...publicProfile },
    { id: 'share-hidden-1132', name: 'Hidden Person', headline: 'Secret headline', offers: 'Secret offers', hidden: true },
    { id: 'share-susp-1132', name: 'Suspended Person', headline: 'Suspended headline', offers: 'Suspended offers', suspended: true },
    { id: 'share-mod-1132', name: 'Moderated Person', headline: 'Moderated headline', hidden_by_moderation: true },
    { id: 'share-initials-1132', name: 'Brian Okello', headline: 'Backend developer', updated_at: '2026-10-28T12:00:00.000Z' }
  );
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  setIndexHtmlTemplateForTest(null);
  if (savedEnv.share !== undefined) process.env.PUBLIC_SHARE_URL = savedEnv.share;
  if (savedEnv.legacy !== undefined) process.env.LEGACY_HOSTS = savedEnv.legacy;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  delete process.env.LEGACY_HOSTS;
});

/* ------------------------------------------------------------------------- */

describe('/u/:id profile share page', () => {
  it('a public profile gets profile-specific OG and Twitter tags', async () => {
    const r = await request('GET', '/u/share-pub-1132');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    const html = r.body.toString();
    expect(html).toContain('<meta property="og:title" content="Amina Nakato · Product designer building tools for farmers" />');
    expect(html).toContain('<meta property="og:type" content="profile" />');
    expect(html).toContain('<meta property="og:url" content="https://matchpiece.ai.studio/u/share-pub-1132" />');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/matchpiece\.ai\.studio\/og\/profile\/share-pub-1132\.jpg\?v=[0-9a-f]{10}" \/>/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:title" content="Amina Nakato · Product designer building tools for farmers" />');
    expect(html).toContain('<link rel="canonical" href="https://matchpiece.ai.studio/u/share-pub-1132" />');
    // og:description is the start of "offers", at most about 150 characters
    const desc = html.match(/<meta property="og:description" content="([^"]*)"/)![1];
    expect(desc.startsWith('UI and UX design, design systems')).toBe(true);
    expect(desc.length).toBeLessThanOrEqual(150);
    // One of each tag, no generic leftovers
    expect((html.match(/property="og:title"/g) || []).length).toBe(1);
    expect((html.match(/<title>/g) || []).length).toBe(1);
    // The page switches to the in-app route
    expect(html).toContain("window.history.replaceState(null,'','/#/u/share-pub-1132')");
  });

  it('no WhatsApp, email or phone in the meta tags or the page head', async () => {
    const html = (await request('GET', '/u/share-pub-1132')).body.toString();
    const head = html.slice(0, html.indexOf('</head>'));
    for (const secret of ['amina@example.com', '+256700123456', '256 700 123 456', '700 123 456', 'whatsapp', 'share-pub-1132@']) {
      expect(head.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    for (const tag of metaTags(html)) {
      expect(tag).not.toMatch(/@|\d{3}\s?\d{3}\s?\d{3}/);
    }
  });

  it('hidden, suspended, moderated and unknown profiles get the generic card with 200 and no data', async () => {
    for (const id of ['share-hidden-1132', 'share-susp-1132', 'share-mod-1132', 'no-such-profile-1132']) {
      const r = await request('GET', `/u/${id}`);
      expect(r.status, id).toBe(200);
      const html = r.body.toString();
      expect(html, id).not.toMatch(/Hidden Person|Secret|Suspended|Moderated|og:type" content="profile/);
      expect(html, id).toContain('<meta property="og:title" content="Matchpiece: Find your missing piece" />');
      expect(html, id).toContain('content="https://matchpiece.ai.studio/og-image.png"');
    }
  });

  it('the share link helper and the legacy host redirect use /u/<id>', async () => {
    expect(profileShareUrl('abc 1')).toBe('https://matchpiece.ai.studio/u/abc%201');
    process.env.LEGACY_HOSTS = 'kwegatta.ai.studio';
    const r = await request('GET', '/u/share-pub-1132?ref=wa', { Host: 'kwegatta.ai.studio' });
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('https://matchpiece.ai.studio/u/share-pub-1132?ref=wa');
    const img = await request('GET', '/og/profile/share-pub-1132.jpg', { Host: 'kwegatta.ai.studio' });
    expect(img.status).toBe(200);
  });
});

describe('/og/profile/:id.jpg', () => {
  it('returns a 1200x630 JPEG with ETag and Cache-Control, and 304 on a matching ETag', async () => {
    const r = await request('GET', '/og/profile/share-pub-1132.jpg');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/jpeg');
    expect(r.headers['cache-control']).toBe('public, max-age=86400');
    const meta = await sharp(r.body).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'jpeg']);
    expect(r.body.length).toBeLessThan(300 * 1024);
    const again = await request('GET', '/og/profile/share-pub-1132.jpg', { 'If-None-Match': String(r.headers.etag) });
    expect(again.status).toBe(304);
  });

  it('a profile without a photo still gets an image (initials)', async () => {
    const r = await request('GET', '/og/profile/share-initials-1132.jpg');
    expect(r.status).toBe(200);
    const meta = await sharp(r.body).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
  });

  it('hidden or unknown profiles redirect to the generic image', async () => {
    for (const id of ['share-hidden-1132', 'share-susp-1132', 'no-such-profile-1132']) {
      const r = await request('GET', `/og/profile/${id}.jpg`);
      expect(r.status, id).toBe(302);
      expect(r.headers.location, id).toBe('/og-image.png');
    }
  });

  it('the image version changes when the profile changes', async () => {
    const html1 = (await request('GET', '/u/share-initials-1132')).body.toString();
    const p = store.profiles.find((x: any) => x.id === 'share-initials-1132');
    p.headline = 'Backend and cloud developer';
    p.updated_at = '2026-10-28T13:00:00.000Z';
    const html2 = (await request('GET', '/u/share-initials-1132')).body.toString();
    const v = (h: string) => h.match(/og\/profile\/share-initials-1132\.jpg\?v=([0-9a-f]+)/)![1];
    expect(v(html1)).not.toBe(v(html2));
  });
});

describe('Share text helpers', () => {
  it('removes emails and phone numbers but keeps years and short numbers', () => {
    expect(scrubContactInfo('Call +256 700 123 456 or mail a.b@c.co now')).toBe('Call or mail now');
    expect(scrubContactInfo('Hack Day 2026 - 10 projects')).toBe('Hack Day 2026 - 10 projects');
  });

  it('profile text has no contact details and falls back sensibly', () => {
    const t = profileShareText({ name: 'Ann', headline: 'Dev, WhatsApp +256700123456', offers: '' });
    expect(t.headline).toBe('Dev, WhatsApp');
    expect(t.description).toBe('Dev, WhatsApp');
  });

  it('only visible profiles are shareable', () => {
    expect(isProfileShareable({ id: 'a', name: 'A' })).toBe(true);
    for (const flag of ['hidden', 'suspended', 'hidden_by_moderation', 'deleted']) {
      expect(isProfileShareable({ id: 'a', name: 'A', [flag]: true }), flag).toBe(false);
    }
    expect(isProfileShareable(undefined)).toBe(false);
  });

  it('badges are earned, at most 2', () => {
    expect(profileOgBadges({ id: 'nobody' })).toEqual([]);
    expect(profileOgBadges({ id: 'x', is_organiser: true })).toEqual(['Event organiser']);
  });
});

describe('In-app routes', () => {
  it('old /#/u/<id> links still open the profile', () => {
    expect(parseAppRoute('#/u/abc123', '/')).toEqual({ main: 'u', sub: 'abc123' });
    expect(parseAppRoute('#/u/abc123', '/u/other')).toEqual({ main: 'u', sub: 'abc123' });
  });

  it('/u/<id> opens the profile and becomes /#/u/<id>', () => {
    expect(parseAppRoute('', '/u/abc123')).toEqual({ main: 'u', sub: 'abc123', replaceWith: '/#/u/abc123' });
  });

  it('other routes are unchanged', () => {
    expect(parseAppRoute('#/events/ev1', '/')).toEqual({ main: 'events', sub: 'ev1' });
    expect(parseAppRoute('', '/about')).toEqual({ main: 'about', sub: undefined });
    expect(parseAppRoute('', '/')).toEqual({ main: 'home', sub: undefined });
  });
});
