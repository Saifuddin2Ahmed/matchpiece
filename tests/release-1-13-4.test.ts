// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  app,
  store,
  setMailSenderForTest,
  sendEventConfirmationEmail,
  buildEmailFrom,
  messageIdDomain,
  smtpTransportOptions,
  sanitizePublicProfile,
  avatarVersion,
  avatarUrlFor,
  computeProfileOgVersionHash
} from '../server';
import { CONTACT_EMAIL } from '../src/lib/brand';
import { saveCurrentProfileLocally } from '../src/lib/currentProfile';

const ROOT = path.resolve(__dirname, '..');
const SMTP_USER = 'sender@matchpiece.test';
const savedEnv = {
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM
};
const sent: any[] = [];
let server: any;
let baseUrl: string;

const PHOTO_A = 'data:image/png;base64,' + 'A'.repeat(40) + 'QUFBQUFBQUFBQUFBQUFBQUFBQUFB';
// Same length and same last 24 characters as PHOTO_A: the old OG hash could not tell them apart
const PHOTO_B = 'data:image/png;base64,' + 'B'.repeat(40) + 'QUFBQUFBQUFBQUFBQUFBQUFBQUFB';

const event = {
  id: 'ev-1134-mail',
  kind: 'event',
  title: 'Builders Night',
  starts_at: '2026-11-14T11:00:00.000Z',
  ends_at: '2026-11-14T14:30:00.000Z',
  timezone: 'Africa/Kampala',
  format: 'in_person',
  venue: 'MUBS EIIC, Nakawa',
  author_id: 'host-1134',
  published: true,
  status: 'approved',
  attendee_ids: [],
  created_at: '2026-10-28T10:00:00.000Z'
};

function addProfile(id: string, extra: Record<string, unknown> = {}) {
  store.profiles.push({
    id,
    account_uid: id,
    name: `Person ${id}`,
    headline: 'Builder in Kampala',
    role: 'Developer',
    created_at: '2026-10-01T00:00:00.000Z',
    ...extra
  } as any);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SMTP_USER = SMTP_USER;
  process.env.SMTP_PASS = 'not-a-real-password-1134';
  delete process.env.EMAIL_FROM;
  setMailSenderForTest(async (opts: any) => {
    sent.push(opts);
  });
  addProfile('t1134-photo', { avatar: PHOTO_A });
  addProfile('t1134-none', { name: 'Zed', avatar: '' });
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  setMailSenderForTest(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  store.profiles = store.profiles.filter((p: any) => !String(p.id).startsWith('t1134-'));
  await new Promise(resolve => server.close(resolve));
});

describe('1.13.4 versioned profile photo URLs', () => {
  it('the avatar URL changes when the photo changes', () => {
    const before = avatarUrlFor({ id: 'x', avatar: PHOTO_A });
    const after = avatarUrlFor({ id: 'x', avatar: PHOTO_B });
    expect(before).toMatch(/^\/api\/avatar\/x\?v=[0-9a-f]{10}$/);
    expect(after).not.toBe(before);
    expect(avatarUrlFor({ id: 'x', avatar: PHOTO_A })).toBe(before);
  });

  it('profile payloads carry the versioned URL as avatar and avatar_url', () => {
    const p = store.profiles.find((x: any) => x.id === 't1134-photo');
    const safe = sanitizePublicProfile(p, null, false);
    expect(safe.avatar_url).toBe(`/api/avatar/t1134-photo?v=${avatarVersion(p)}`);
    expect(safe.avatar).toBe(safe.avatar_url);
    expect(JSON.stringify(safe)).not.toContain('base64');
  });

  it('saving a new photo answers with a new versioned URL', async () => {
    addProfile('t1134-save', { avatar: PHOTO_A });
    const res = await fetch(`${baseUrl}/api/data/profiles/t1134-save`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t1134-save' },
      body: JSON.stringify({ avatar: PHOTO_B })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatar_url).toBe(avatarUrlFor({ id: 't1134-save', avatar: PHOTO_B }));
    expect(body.avatar_url).not.toBe(avatarUrlFor({ id: 't1134-save', avatar: PHOTO_A }));
    expect(body.avatar).toBe(body.avatar_url);
  });

  it('the OG image version changes when the photo changes', () => {
    const base = { id: 'og', name: 'Ann', headline: 'Dev', updated_at: '2026-10-01T00:00:00.000Z' };
    expect(PHOTO_A.length).toBe(PHOTO_B.length);
    expect(PHOTO_A.slice(-24)).toBe(PHOTO_B.slice(-24));
    expect(computeProfileOgVersionHash({ ...base, avatar: PHOTO_A })).not.toBe(computeProfileOgVersionHash({ ...base, avatar: PHOTO_B }));
  });
});

describe('1.13.4 photo caching headers', () => {
  it('versioned URL is cached for a year as immutable', async () => {
    const p = store.profiles.find((x: any) => x.id === 't1134-photo');
    const res = await fetch(`${baseUrl}${avatarUrlFor(p)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('etag')).toBeTruthy();
  });

  it('unversioned URL is no-cache with an ETag, and 304 on match', async () => {
    const res = await fetch(`${baseUrl}/api/avatar/t1134-photo`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const etag = res.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await fetch(`${baseUrl}/api/avatar/t1134-photo`, { headers: { 'If-None-Match': etag! } });
    expect(again.status).toBe(304);
    expect(again.headers.get('cache-control')).toBe('no-cache');
  });

  it('a stale ?v is no-cache and the ETag changes with the photo', async () => {
    const p: any = store.profiles.find((x: any) => x.id === 't1134-photo');
    const oldUrl = avatarUrlFor(p);
    const oldEtag = (await fetch(`${baseUrl}${oldUrl}`)).headers.get('etag');
    p.avatar = PHOTO_B;
    try {
      const res = await fetch(`${baseUrl}${oldUrl}`, { headers: { 'If-None-Match': oldEtag! } });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(res.headers.get('etag')).not.toBe(oldEtag);
    } finally {
      p.avatar = PHOTO_A;
    }
  });

  it('initials picture follows the same rules', async () => {
    const p = store.profiles.find((x: any) => x.id === 't1134-none');
    const v = await fetch(`${baseUrl}${avatarUrlFor(p)}`);
    expect(v.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const u = await fetch(`${baseUrl}/api/avatar/t1134-none`);
    expect(u.headers.get('cache-control')).toBe('no-cache');
    const again = await fetch(`${baseUrl}/api/avatar/t1134-none`, { headers: { 'If-None-Match': u.headers.get('etag')! } });
    expect(again.status).toBe(304);
  });

  it('the service worker never answers /api/avatar/* from its cache', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    expect(sw).toContain("const CACHE_NAME = 'matchpiece-1.13.4';");
    const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
    const apiSkip = fetchHandler.indexOf("url.pathname.startsWith('/api/')");
    expect(apiSkip).toBeGreaterThan(-1);
    expect(apiSkip).toBeLessThan(fetchHandler.indexOf('respondWith'));
  });
});

describe('1.13.4 new photo shows without reload', () => {
  it('stores the updated profile for the signed-in member', () => {
    localStorage.setItem('kw_me', 'me-1');
    saveCurrentProfileLocally({ id: 'me-1', name: 'Me', avatar: '/api/avatar/me-1?v=abc' } as any);
    expect(JSON.parse(localStorage.getItem('kwegatta_current_profile')!).avatar).toBe('/api/avatar/me-1?v=abc');
  });

  it('does not overwrite the stored profile with someone else', () => {
    localStorage.setItem('kw_me', 'me-1');
    localStorage.setItem('kwegatta_current_profile', JSON.stringify({ id: 'me-1' }));
    saveCurrentProfileLocally({ id: 'other', name: 'Other' } as any);
    expect(JSON.parse(localStorage.getItem('kwegatta_current_profile')!).id).toBe('me-1');
    expect(localStorage.getItem('kw_me')).toBe('me-1');
  });

  it('the photo upload uses the server answer and the app saves it locally', () => {
    const view = fs.readFileSync(path.join(ROOT, 'src/components/ProfileView.tsx'), 'utf8');
    expect(view).toContain("db.updateOrThrow<Profile>('profiles', profile.id, { avatar: resized })");
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain('saveCurrentProfileLocally(updated)');
  });
});

describe('1.13.4 contact emails', () => {
  it('CONTACT_EMAIL is events@matchpiece.tech', () => {
    expect(CONTACT_EMAIL).toBe('events@matchpiece.tech');
  });

  it('no kwegatta.org address is left in tracked files', () => {
    const hits = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(f => f && !/\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|pdf)$/i.test(f))
      .filter(f => fs.existsSync(path.join(ROOT, f)))
      .filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('kwegatta' + '.org'));
    expect(hits).toEqual([]);
  });

  it('conduct, security and privacy pages use the contact address', () => {
    for (const f of ['CODE_OF_CONDUCT.md', 'SECURITY.md', 'PRIVACY.md', 'CONTRIBUTING.md', 'GOVERNANCE.md']) {
      expect(fs.readFileSync(path.join(ROOT, f), 'utf8')).toContain(CONTACT_EMAIL);
    }
    expect(fs.readFileSync(path.join(ROOT, 'src/components/PrivacyView.tsx'), 'utf8')).toContain('CONTACT_EMAIL');
  });
});

describe('1.13.4 sender address', () => {
  it('From uses EMAIL_FROM when set and SMTP_USER otherwise', () => {
    expect(buildEmailFrom(SMTP_USER, 'events@matchpiece.tech')).toBe('"Matchpiece Events" <events@matchpiece.tech>');
    expect(buildEmailFrom(SMTP_USER, '')).toBe(`"Matchpiece Events" <${SMTP_USER}>`);
    expect(buildEmailFrom(SMTP_USER, '   ')).toBe(`"Matchpiece Events" <${SMTP_USER}>`);
    expect(buildEmailFrom('', '')).toBe('');
  });

  it('sent mail uses EMAIL_FROM, its domain for Message-ID, and keeps Reply-To', async () => {
    process.env.EMAIL_FROM = 'events@matchpiece.tech';
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: any[]) => {
      logs.push(a.join(' '));
    });
    try {
      sent.length = 0;
      expect(await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', '')).toBe(true);
      expect(await sendEventConfirmationEmail({ ...event, contact_email: 'host@example.com' }, 'ann@example.com', 'Ann', '')).toBe(true);
    } finally {
      spy.mockRestore();
      delete process.env.EMAIL_FROM;
    }
    expect(sent[0].from).toBe('"Matchpiece Events" <events@matchpiece.tech>');
    expect(sent[0].messageId).toMatch(/^<[0-9a-f-]{36}@matchpiece\.tech>$/);
    expect(sent[0].replyTo).toBe(SMTP_USER);
    expect(sent[1].replyTo).toBe('host@example.com');
    expect(logs.join('\n')).not.toMatch(/@/);
  });

  it('without EMAIL_FROM, From and Message-ID follow SMTP_USER', async () => {
    sent.length = 0;
    await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', '');
    expect(sent[0].from).toBe(`"Matchpiece Events" <${SMTP_USER}>`);
    expect(sent[0].messageId).toMatch(/@matchpiece\.test>$/);
  });

  it('Message-ID domain falls back to the primary host', () => {
    expect(messageIdDomain('"Matchpiece Events" <a@Mail.Example.org>')).toBe('mail.example.org');
    expect(messageIdDomain('')).toBe('matchpiece.ai.studio');
  });

  it('port 587 uses STARTTLS, 465 uses TLS', () => {
    expect(smtpTransportOptions('smtp-relay.brevo.com', 587)).toEqual({ host: 'smtp-relay.brevo.com', port: 587, secure: false, requireTLS: true });
    expect(smtpTransportOptions('smtp.gmail.com', 465)).toEqual({ host: 'smtp.gmail.com', port: 465, secure: true, requireTLS: false });
    expect(smtpTransportOptions('', 465).host).toBe('smtp.gmail.com');
  });
});
