// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import {
  app,
  store,
  setMailSenderForTest,
  sendEventConfirmationEmail,
  sendRegistrationCancelledEmail,
  sendEventCancelledEmail,
  buildEventEmail,
  generateEventIcsContent,
  googleCalendarUrl,
  eventCalendarIcsUrl
} from '../server';
import { REPO_URL } from '../src/lib/brand';

const SMTP_USER = 'sender@matchpiece.test';
const savedEnv = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, share: process.env.PUBLIC_SHARE_URL };
const sent: any[] = [];
let server: any;
let port: number;

function get(urlPath: string) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    }).on('error', reject);
  });
}

const event = {
  id: 'ev-1133-cal',
  kind: 'event',
  title: 'Builders Night; Kampala, Uganda',
  description: 'Bring a laptop.\nPizza from 7pm.',
  starts_at: '2026-11-14T11:00:00.000Z',
  ends_at: '2026-11-14T14:30:00.000Z',
  timezone: 'Africa/Kampala',
  format: 'in_person',
  venue: 'MUBS EIIC, Nakawa',
  author_id: 'host-1133',
  author_name: 'Host Person',
  published: true,
  status: 'approved',
  attendee_ids: [],
  created_at: '2026-10-28T10:00:00.000Z'
};
const online = { ...event, id: 'ev-1133-online', title: 'Online Call', format: 'online', join_link: 'https://meet.example.com/secret-room' };
const hiddenEv = { ...event, id: 'ev-1133-hidden', hidden_by_moderation: true };
const pendingEv = { ...event, id: 'ev-1133-pending', status: 'pending' };

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SMTP_USER = SMTP_USER;
  process.env.SMTP_PASS = 'not-a-real-password-1133';
  delete process.env.PUBLIC_SHARE_URL;
  setMailSenderForTest(async (opts: any) => {
    sent.push(opts);
  });
  store.events.push({ ...event } as any, { ...online } as any, { ...hiddenEv } as any, { ...pendingEv } as any);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  setMailSenderForTest(null);
  for (const [k, v] of [['SMTP_USER', savedEnv.user], ['SMTP_PASS', savedEnv.pass], ['PUBLIC_SHARE_URL', savedEnv.share]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  store.events = store.events.filter((e: any) => !String(e.id).startsWith('ev-1133-'));
  await new Promise(resolve => server.close(resolve));
});

describe('1.13.3 confirmation emails without attachments', () => {
  it('confirmation and promotion emails have no attachments and keep html and text parts', async () => {
    sent.length = 0;
    expect(await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', 'https://matchpiece.ai.studio/#/events/ev-1133-cal/ticket')).toBe(true);
    expect(await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', 'https://matchpiece.ai.studio/#/events/ev-1133-cal/ticket', true)).toBe(true);
    for (const m of sent) {
      expect(m.attachments).toBeUndefined();
      expect(m.icalEvent).toBeUndefined();
      expect(m.html).toContain('<!doctype html>');
      expect(m.text).toContain('Hi Ann,');
    }
    expect(sent[0].subject).toBe('Confirmation: Builders Night; Kampala, Uganda');
  });

  it('From is "Matchpiece Events <SMTP_USER>" and Reply-To is the event contact, else SMTP_USER', async () => {
    sent.length = 0;
    await sendEventConfirmationEmail({ ...event, contact_email: 'host@example.com' }, 'ann@example.com', 'Ann', '');
    await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', '');
    await sendRegistrationCancelledEmail(event, 'ann@example.com', 'Ann');
    await sendEventCancelledEmail(event, 'ann@example.com', 'Ann');
    for (const m of sent) expect(m.from).toBe(`"Matchpiece Events" <${SMTP_USER}>`);
    expect(sent[0].replyTo).toBe('host@example.com');
    expect(sent.slice(1).map(m => m.replyTo)).toEqual([SMTP_USER, SMTP_USER, SMTP_USER]);
    expect(sent.map(m => m.subject)).toEqual([
      'Confirmation: Builders Night; Kampala, Uganda',
      'Confirmation: Builders Night; Kampala, Uganda',
      'Registration cancelled: Builders Night; Kampala, Uganda',
      'Event cancelled: Builders Night; Kampala, Uganda'
    ]);
  });

  it('every email has a unique Message-ID on the matchpiece.ai.studio domain', async () => {
    sent.length = 0;
    await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', '');
    await sendEventConfirmationEmail(event, 'ann@example.com', 'Ann', '');
    for (const m of sent) expect(m.messageId).toMatch(/^<[0-9a-f-]{36}@matchpiece\.ai\.studio>$/);
    expect(sent[0].messageId).not.toBe(sent[1].messageId);
  });

  it('confirmation has at most the ticket, event page and calendar links, a preheader, logo alt text and the footer', () => {
    const { html, text } = buildEventEmail('confirmation', event, 'Ann', 'https://matchpiece.ai.studio/#/events/ev-1133-cal/ticket');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
    expect(hrefs).toEqual([
      'https://matchpiece.ai.studio/#/events/ev-1133-cal/ticket',
      googleCalendarUrl(event),
      eventCalendarIcsUrl(event),
      'https://matchpiece.ai.studio/e/ev-1133-cal'
    ]);
    expect(html).toMatch(/<div style="display:none;[^"]*">[^<]+Your ticket and calendar links are inside\.<\/div>/);
    expect(html).toMatch(/<img [^>]*alt="Matchpiece logo"/);
    expect(html).toContain('You received this because you registered on Matchpiece. Reply to this email if you have questions.');
    expect(text).toContain('You received this because you registered on Matchpiece. Reply to this email if you have questions.');
    expect(text).toContain(`Add to Google Calendar: ${googleCalendarUrl(event)}`);
    expect(text).toContain(`Add to other calendars (.ics): ${eventCalendarIcsUrl(event)}`);
    expect(text).not.toMatch(/attached/i);
  });

  it('no link shorteners, no tracking pixels and no all-caps words in the template text', () => {
    for (const kind of ['confirmation', 'promotion', 'cancelled', 'event_cancelled'] as const) {
      const { html, text } = buildEventEmail(kind, { ...event, title: 'Night', venue: 'Hall', description: '' }, 'Ann', 'https://matchpiece.ai.studio/t');
      expect(html).not.toMatch(/bit\.ly|tinyurl|goo\.gl|t\.co\/|ow\.ly|is\.gd/i);
      const imgs = html.match(/<img [^>]*>/g) || [];
      expect(imgs).toHaveLength(1);
      expect(imgs[0]).toContain('width="28"');
      expect(imgs[0]).not.toMatch(/\?|width="1"/);
      expect(text.replace(/https?:\/\/\S+/g, '')).not.toMatch(/\b[A-Z]{4,}\b/);
    }
  });

  it('cancelled emails do not carry calendar links', () => {
    for (const kind of ['cancelled', 'event_cancelled'] as const) {
      const { html, text } = buildEventEmail(kind, event, 'Ann', '');
      expect(html).not.toContain('calendar.google.com');
      expect(text).not.toContain('calendar.ics');
    }
  });
});

describe('1.13.3 Google Calendar link', () => {
  it('builds the TEMPLATE link with title, UTC dates, details and location', () => {
    const u = new URL(googleCalendarUrl(event));
    expect(`${u.origin}${u.pathname}`).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Builders Night; Kampala, Uganda');
    expect(u.searchParams.get('dates')).toBe('20261114T110000Z/20261114T143000Z');
    expect(u.searchParams.get('location')).toBe('MUBS EIIC, Nakawa');
    expect(u.searchParams.get('details')).toContain('Bring a laptop.');
    expect(u.searchParams.get('details')).toContain('https://matchpiece.ai.studio/e/ev-1133-cal');
  });

  it('defaults to a two-hour event when there is no end time', () => {
    const u = new URL(googleCalendarUrl({ ...event, ends_at: undefined }));
    expect(u.searchParams.get('dates')).toBe('20261114T110000Z/20261114T130000Z');
  });

  it('never includes the online join link', () => {
    expect(googleCalendarUrl(online)).not.toContain('secret-room');
    expect(new URL(googleCalendarUrl(online)).searchParams.get('location')).toBe('Online (link on the event page)');
  });
});

describe('1.13.3 GET /api/events/:id/calendar.ics', () => {
  it('returns a valid VEVENT as a text/calendar download', async () => {
    const r = await get('/api/events/ev-1133-cal/calendar.ics');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/calendar/);
    expect(r.headers['content-disposition']).toBe('attachment; filename="builders-night-kampala-uganda.ics"');
    const lines = r.body.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
    expect(lines.filter(Boolean).pop()).toBe('END:VCALENDAR');
    expect(lines).toContain('DTSTART:20261114T110000Z');
    expect(lines).toContain('DTEND:20261114T143000Z');
    expect(lines).toContain('SUMMARY:Builders Night\\; Kampala\\, Uganda');
    expect(lines).toContain('DESCRIPTION:Bring a laptop.\\nPizza from 7pm.');
    expect(lines).toContain('URL:https://matchpiece.ai.studio/e/ev-1133-cal');
    expect(lines.some(l => /^UID:.+@.+/.test(l))).toBe(true);
    expect(lines.some(l => /^DTSTAMP:\d{8}T\d{6}Z$/.test(l))).toBe(true);
    for (const l of lines) expect(Buffer.byteLength(l, 'utf-8')).toBeLessThanOrEqual(75);
    expect(r.body).toBe(generateEventIcsContent(event).replace(/DTSTAMP:\d{8}T\d{6}Z/, lines.find(l => l.startsWith('DTSTAMP:'))!));
  });

  it('folds long lines and keeps the online join link out of the public file', async () => {
    const long = { ...online, description: 'Long text '.repeat(30) };
    const ics = generateEventIcsContent(long);
    expect(ics).toMatch(/\r\n /);
    expect(ics).not.toContain('secret-room');
    const r = await get('/api/events/ev-1133-online/calendar.ics');
    expect(r.status).toBe(200);
    expect(r.body).not.toContain('secret-room');
    expect(r.body).toContain('LOCATION:Online (link on the event page)');
  });

  it('404 for unknown, moderated or unpublished events', async () => {
    for (const id of ['does-not-exist-1133', 'ev-1133-hidden', 'ev-1133-pending']) {
      expect((await get(`/api/events/${id}/calendar.ics`)).status).toBe(404);
    }
  });
});

describe('1.13.3 repository links', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const srcFiles = walk(path.join(process.cwd(), 'src')).concat(path.join(process.cwd(), 'server.ts'));

  it('brand.REPO_URL is the renamed repository', () => {
    expect(REPO_URL).toBe('https://github.com/Saifuddin2Ahmed/matchpiece');
  });

  it('no github.com/Saifuddin2Ahmed/kwegatta link is left in src or server.ts', () => {
    for (const f of srcFiles) expect(fs.readFileSync(f, 'utf-8'), f).not.toMatch(/github\.com\/Saifuddin2Ahmed\/kwegatta/i);
  });

  it('components link to the repository only through REPO_URL', () => {
    const users = srcFiles.filter(f => f.endsWith('.tsx') && /REPO_URL/.test(fs.readFileSync(f, 'utf-8')));
    expect(users.map(f => path.basename(f)).sort()).toEqual(
      ['AboutView.tsx', 'ContactModal.tsx', 'Footer.tsx', 'LicenseView.tsx', 'LivingNetworkHero.tsx', 'PrivacyView.tsx']
    );
    for (const f of srcFiles.filter(f => !f.endsWith('brand.ts'))) {
      expect(fs.readFileSync(f, 'utf-8'), f).not.toMatch(/github\.com\/Saifuddin2Ahmed\/matchpiece/);
    }
  });

  it('package.json points at the renamed repository', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.name).toBe('matchpiece');
    expect(pkg.repository.url).toBe('https://github.com/Saifuddin2Ahmed/matchpiece.git');
    expect(pkg.homepage).toBe('https://matchpiece.ai.studio');
    expect(pkg.bugs.url).toBe('https://github.com/Saifuddin2Ahmed/matchpiece/issues');
  });
});
