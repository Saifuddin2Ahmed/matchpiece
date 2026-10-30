// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  store,
  setMailSenderForTest,
  sendEventConfirmationEmail,
  sendRegistrationCancelledEmail,
  sendEventCancelledEmail,
  promoteFromWaitlist,
  resolveReplyTo,
  isUsableReplyTo
} from '../server';

const ROOT = path.resolve(__dirname, '..');
const BREVO_LOGIN = 'c0a4ee001@smtp-brevo.com';
const ENV_KEYS = ['SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_REPLY_TO'] as const;
const savedEnv: Record<string, string | undefined> = {};
const sent: any[] = [];

const event = {
  id: 'ev-1141-mail',
  kind: 'event',
  title: 'Builders Night',
  starts_at: '2026-11-14T11:00:00.000Z',
  ends_at: '2026-11-14T14:30:00.000Z',
  timezone: 'Africa/Kampala',
  format: 'in_person',
  venue: 'MUBS EIIC, Nakawa',
  author_id: 'host-1141',
  published: true,
  status: 'approved',
  attendee_ids: [],
  created_at: '2026-10-28T10:00:00.000Z'
};

/** Sends one of every event email type and returns the messages that went out. */
async function sendEveryType(item: any) {
  sent.length = 0;
  await sendEventConfirmationEmail(item, 'ann@example.com', 'Ann', '');
  await sendRegistrationCancelledEmail(item, 'ann@example.com', 'Ann');
  await sendEventCancelledEmail(item, 'ann@example.com', 'Ann');

  const waitEvent = { ...item, id: 'ev-1141-wait', capacity: 1, attendee_ids: [], waitlist_ids: [] };
  store.events.push(waitEvent);
  store.event_guests.push({
    id: 'g-1141-wait',
    event_id: waitEvent.id,
    name: 'Wendy',
    email: 'wendy@example.com',
    status: 'waitlist',
    created_at: '2026-10-29T10:00:00.000Z'
  } as any);
  try {
    expect(await promoteFromWaitlist(waitEvent)).toBe(1);
  } finally {
    store.events = store.events.filter((e: any) => e.id !== waitEvent.id);
    store.event_guests = store.event_guests.filter((g: any) => g.id !== 'g-1141-wait');
  }
  return [...sent];
}

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  setMailSenderForTest(async (opts: any) => {
    sent.push(opts);
  });
});

beforeEach(() => {
  process.env.SMTP_USER = BREVO_LOGIN;
  process.env.SMTP_PASS = 'not-a-real-password-1141';
  process.env.EMAIL_FROM = 'events@matchpiece.tech';
  delete process.env.EMAIL_REPLY_TO;
});

afterAll(() => {
  setMailSenderForTest(null);
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('1.14.1 Reply-To order', () => {
  it('event contact email comes first when it is valid', () => {
    expect(resolveReplyTo('host@example.com', BREVO_LOGIN, 'team@matchpiece.tech', 'events@matchpiece.tech')).toBe('host@example.com');
    expect(resolveReplyTo('  host@example.com ', BREVO_LOGIN, '', '')).toBe('host@example.com');
  });

  it('an invalid contact email falls through to EMAIL_REPLY_TO', () => {
    expect(resolveReplyTo('not-an-address', BREVO_LOGIN, 'team@matchpiece.tech', 'events@matchpiece.tech')).toBe('team@matchpiece.tech');
    expect(resolveReplyTo('', BREVO_LOGIN, 'team@matchpiece.tech', 'events@matchpiece.tech')).toBe('team@matchpiece.tech');
  });

  it('without EMAIL_REPLY_TO the EMAIL_FROM address is used', () => {
    expect(resolveReplyTo(undefined, BREVO_LOGIN, '', 'events@matchpiece.tech')).toBe('events@matchpiece.tech');
    expect(resolveReplyTo(undefined, BREVO_LOGIN, '', 'Matchpiece Events <events@matchpiece.tech>')).toBe('events@matchpiece.tech');
  });

  it('SMTP_USER is the last fallback, but never a Brevo login', () => {
    expect(resolveReplyTo(undefined, 'sender@matchpiece.test', '', '')).toBe('sender@matchpiece.test');
    expect(resolveReplyTo(undefined, BREVO_LOGIN, '', '')).toBe('');
    expect(resolveReplyTo('x@SMTP-BREVO.COM', BREVO_LOGIN, 'y@smtp-brevo.com', 'events@matchpiece.tech')).toBe('events@matchpiece.tech');
    expect(isUsableReplyTo(BREVO_LOGIN)).toBe(false);
    expect(isUsableReplyTo('a@b.co, c@d.co')).toBe(false);
  });
});

describe('1.14.1 every event email uses the Reply-To order', () => {
  const SUBJECT_PREFIXES = ['Confirmation:', 'Registration cancelled:', 'Event cancelled:', ''];

  it('sends four types: confirmation, registration cancelled, event cancelled, waitlist promotion', async () => {
    const msgs = await sendEveryType(event);
    expect(msgs).toHaveLength(4);
    for (let i = 0; i < 3; i++) expect(msgs[i].subject.startsWith(SUBJECT_PREFIXES[i])).toBe(true);
    expect(msgs[3].to).toBe('wendy@example.com');
  });

  it('event contact email is Reply-To on every type', async () => {
    process.env.EMAIL_REPLY_TO = 'team@matchpiece.tech';
    const msgs = await sendEveryType({ ...event, contact_email: 'host@example.com' });
    expect(msgs.map(m => m.replyTo)).toEqual(Array(4).fill('host@example.com'));
  });

  it('EMAIL_REPLY_TO is Reply-To on every type when the event has no contact email', async () => {
    process.env.EMAIL_REPLY_TO = 'team@matchpiece.tech';
    const msgs = await sendEveryType(event);
    expect(msgs.map(m => m.replyTo)).toEqual(Array(4).fill('team@matchpiece.tech'));
  });

  it('EMAIL_FROM is Reply-To on every type when nothing else is set', async () => {
    const msgs = await sendEveryType(event);
    expect(msgs.map(m => m.replyTo)).toEqual(Array(4).fill('events@matchpiece.tech'));
  });

  it('no email ever has a smtp-brevo.com Reply-To, From or Message-ID', async () => {
    const all = [
      ...(await sendEveryType(event)),
      ...(await sendEveryType({ ...event, contact_email: BREVO_LOGIN }))
    ];
    delete process.env.EMAIL_FROM;
    all.push(...(await sendEveryType(event)));
    expect(all).toHaveLength(12);
    for (const m of all.slice(0, 8)) {
      expect(m.replyTo).toBe('events@matchpiece.tech');
      expect(m.from).toBe('"Matchpiece Events" <events@matchpiece.tech>');
      expect(m.messageId).toMatch(/^<[0-9a-f-]{36}@matchpiece\.tech>$/);
    }
    for (const m of all) expect(String(m.replyTo || '')).not.toMatch(/smtp-brevo\.com/i);
    for (const m of all.slice(8)) expect(m.replyTo).toBeUndefined();
  });

  it('only deliverEventEmail sends mail, and every send function goes through it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(src.match(/createTransport\(/g)).toHaveLength(1);
    expect(src.match(/\.sendMail\(/g)).toHaveLength(1);
    const deliver = src.indexOf('async function deliverEventEmail(');
    const nextFn = src.indexOf('\nexport async function', deliver);
    expect(src.indexOf('createTransport(')).toBeGreaterThan(deliver);
    expect(src.indexOf('createTransport(')).toBeLessThan(nextFn);
    for (const fn of ['sendEventConfirmationEmail', 'sendRegistrationCancelledEmail', 'sendEventCancelledEmail']) {
      const start = src.indexOf(`export async function ${fn}(`);
      const end = src.indexOf('\n}\n', start);
      expect(src.slice(start, end)).toContain('return deliverEventEmail(');
    }
  });
});

describe('1.14.1 docs', () => {
  it('.env.example lists EMAIL_REPLY_TO as optional and commented', () => {
    expect(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')).toMatch(/^# EMAIL_REPLY_TO=""$/m);
  });

  it('README Deployment explains the reply address', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const deploy = readme.slice(readme.indexOf('## Deployment'));
    expect(deploy).toContain('EMAIL_REPLY_TO');
    expect(deploy).toContain('smtp-brevo.com');
  });
});
