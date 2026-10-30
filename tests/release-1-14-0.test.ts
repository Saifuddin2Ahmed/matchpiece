// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, cleanup } from '@testing-library/react';
import {
  app,
  store,
  getPublicTeamList,
  setTestStorageWriter,
  setupFirestoreListeners,
  setMockFirestoreDbForTest,
  TEAM_SETTINGS_COLLECTION,
  TEAM_SETTINGS_DOC,
  PERSISTED_COLLECTIONS
} from '../server';
import { TeamGrid } from '../src/components/TeamGrid';

let server: any;
let baseUrl: string;

const ADMIN = { Authorization: 'Bearer t1140-admin' };
const MEMBER = { Authorization: 'Bearer t1140-member' };
const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

async function api(method: string, p: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

beforeAll(async () => {
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
  if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
  store.admin_emails.push('t1140-admin@kwegatta.test');
  if (!store.profiles.some((p: any) => p.id === 't1140-linked')) {
    store.profiles.push({ id: 't1140-linked', account_uid: 't1140-linked', name: 'Linked Person', role: 'Developer', created_at: new Date().toISOString() });
  }
});

afterAll(async () => {
  setTestStorageWriter(null);
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  cleanup();
  setTestStorageWriter(null);
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */
describe('1.14.0 Team details setting storage', () => {
  it('is saved to settings/team, never to a reserved __name__ id', async () => {
    const writes: Array<{ col: string; id: string; data: any }> = [];
    setTestStorageWriter((col, id, data) => {
      writes.push({ col, id, data });
    });
    const r = await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: false });
    expect(r.status).toBe(200);
    expect(r.json.team_details_enabled).toBe(false);

    const settingWrite = writes.find(w => w.col !== 'audit_log')!;
    expect(settingWrite).toEqual({
      col: 'settings',
      id: 'team',
      data: { team_details_enabled: false, updated_at: expect.any(String) }
    });
    expect([TEAM_SETTINGS_COLLECTION, TEAM_SETTINGS_DOC]).toEqual(['settings', 'team']);
    expect(PERSISTED_COLLECTIONS).toContain('settings');
  });

  it('regression: no document id written by the server matches the reserved __.*__ pattern', async () => {
    const ids: string[] = [];
    setTestStorageWriter((_col, id) => {
      ids.push(id);
    });
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    await api('POST', '/api/admin/settings', ADMIN, { team_details_enabled: true });
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).not.toMatch(/^__.*__$/);
    // No persistDoc call in the source uses a literal reserved id.
    expect(read('server.ts')).not.toMatch(/persistDoc\([^)]*'__[A-Za-z0-9_]*__'/);
  });

  it('admins get 200; members and anonymous callers get 403 or 401 and the value does not change', async () => {
    expect((await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true })).status).toBe(200);
    const member = await api('PATCH', '/api/admin/team/settings', MEMBER, { team_details_enabled: false });
    expect(member.status).toBe(403);
    const anon = await api('PATCH', '/api/admin/team/settings', {}, { team_details_enabled: false });
    expect([401, 403]).toContain(anon.status);
    expect(store.team_details_enabled).toBe(true);
    expect((await api('GET', '/api/admin/team/settings', MEMBER)).status).toBe(403);
  });

  it('a failed write returns a clear error, keeps the old value and logs the real reason', async () => {
    store.team_details_enabled = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTestStorageWriter(col => {
      if (col === 'settings') throw new Error('3 INVALID_ARGUMENT: simulated');
    });
    const r = await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: false });
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('The Team details setting could not be saved. Please try again in a minute.');
    expect(r.json.error).not.toMatch(/Something went wrong/);
    expect(store.team_details_enabled).toBe(true);
    expect(logged.mock.calls.some(c => String(c[0]).includes('settings/team') && String(c[1]).includes('INVALID_ARGUMENT'))).toBe(true);
  });

  it('a failed audit log write never makes the request fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setTestStorageWriter(col => {
      if (col === 'audit_log') throw new Error('audit store down');
    });
    const r = await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: false });
    expect(r.status).toBe(200);
    expect(store.team_details_enabled).toBe(false);
  });

  it('is read from settings/team on startup, and a legacy settings doc in team is never a member', async () => {
    const snap = (docs: any[]) => ({ docs, forEach: (cb: (d: any) => void) => docs.forEach(cb) });
    const collections: Record<string, any[]> = {
      settings: [{ id: 'team', data: () => ({ team_details_enabled: false, updated_at: '2026-10-30T00:00:00.000Z' }) }],
      team: [
        { id: '__team_settings__', data: () => ({ id: '__team_settings__', is_settings: true, team_details_enabled: true }) },
        { id: 'team-startup', data: () => ({ id: 'team-startup', name: 'Startup Person', line2: 'MUBS', order: 0, hidden: false }) }
      ]
    };
    const mockDb = {
      collection: (name: string) => ({
        onSnapshot: (onNext: (s: any) => void) => {
          onNext(snap(collections[name] || []));
          return () => {};
        }
      })
    };
    const saved = { ...store };
    store.team_details_enabled = true;
    try {
      await setupFirestoreListeners(mockDb);
      expect(store.team_details_enabled).toBe(false);
      expect(store.team.map((m: any) => m.id)).toEqual(['team-startup']);
    } finally {
      setMockFirestoreDbForTest(null);
      Object.assign(store, saved);
    }
  });
});

/* ------------------------------------------------------------------------- */
describe('1.14.0 public team fields', () => {
  let id: string;

  beforeAll(async () => {
    const r = await api('POST', '/api/admin/team', ADMIN, {
      name: 'Field Person',
      title: 'QA & Testing Lead',
      line2: 'Sub-Saharan College',
      github: 'field-person',
      linkedin: 'https://www.linkedin.com/in/field-person',
      linked_profile_id: 't1140-linked',
      show_title: true,
      show_linkedin: true
    });
    expect(r.status).toBe(201);
    id = r.json.member.id;
  });

  it('the role set in the admin editor saves and shows', async () => {
    const r = await api('PATCH', `/api/admin/team/${id}`, ADMIN, { title: 'Project Lead & Developer' });
    expect(r.status).toBe(200);
    expect(r.json.member.title).toBe('Project Lead & Developer');
    const admin = await api('GET', '/api/admin/team', ADMIN);
    expect(admin.json.find((m: any) => m.id === id).title).toBe('Project Lead & Developer');
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    expect(getPublicTeamList().find(m => m.id === id)!.title).toBe('Project Lead & Developer');
  });

  it('details on: role, university, GitHub, LinkedIn and profile link are public', async () => {
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    const card = (await api('GET', '/api/team')).json.find((m: any) => m.id === id);
    expect(card.title).toBe('Project Lead & Developer');
    expect(card.line2).toBe('Sub-Saharan College');
    expect(card.github).toBe('field-person');
    expect(card.linkedin).toBe('https://www.linkedin.com/in/field-person');
    expect(card.linked_profile_id).toBe('t1140-linked');
  });

  it('details on: each field still follows its own "show publicly" flag', async () => {
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    await api('PATCH', `/api/admin/team/${id}`, ADMIN, { show_title: false, show_linkedin: false });
    const card = getPublicTeamList().find(m => m.id === id)!;
    expect(card.title).toBeUndefined();
    expect(card.linkedin).toBeUndefined();
    expect(card.github).toBe('field-person');
    for (const k of ['show_title', 'show_linkedin', 'team_since', 'whatsapp']) expect(card[k]).toBeUndefined();
    await api('PATCH', `/api/admin/team/${id}`, ADMIN, { show_title: true, show_linkedin: true });
  });

  it('details off: only name, photo and university', async () => {
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: false });
    const card = (await api('GET', '/api/team')).json.find((m: any) => m.id === id);
    expect(Object.keys(card).sort()).toEqual(['id', 'line2', 'linked_avatar', 'name', 'order', 'photo_url']);
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
  });

  it('defaults to on when nothing is stored', () => {
    expect(read('server.ts')).toContain('team_details_enabled: true,');
    expect(read('server.ts')).toContain('const detailsEnabled = store.team_details_enabled !== false;');
  });
});

/* ------------------------------------------------------------------------- */
describe('1.14.0 team cards', () => {
  const full = {
    id: 'c1',
    name: 'Amina Nakato',
    title: 'Marketing & Communications',
    line2: 'Makerere University Business School',
    github: 'amina',
    linkedin: 'https://www.linkedin.com/in/amina',
    linked_profile_id: 'p-amina',
    bio: 'Should not be on the card',
    line1: 'Should not be on the card either',
    order: 0,
    hidden: false
  };
  const bare = { id: 'c2', name: 'Brian Okello', line2: '', order: 1, hidden: false };

  it('every member gets the same card with role pill, university and icon links', () => {
    render(React.createElement(TeamGrid, { team: [full, { ...bare, line2: 'Kyambogo University' }] as any, loading: false }));
    const cards = screen.getAllByTestId('team-card');
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map(c => c.className)).size).toBe(1);
    expect(screen.getByText('Marketing & Communications').className).toContain('rounded-full');
    expect(screen.getByRole('link', { name: 'Amina Nakato on GitHub' }).getAttribute('href')).toBe('https://github.com/amina');
    expect(screen.getByRole('link', { name: 'Amina Nakato on LinkedIn' }).getAttribute('href')).toBe('https://www.linkedin.com/in/amina');
    const profile = screen.getByRole('link', { name: 'Amina Nakato on Matchpiece' });
    expect(profile.getAttribute('href')).toBe('/#/u/p-amina');
    expect(profile.getAttribute('target')).toBeNull();
    expect(screen.queryByText('Should not be on the card')).toBeNull();
    expect(screen.queryByText('Should not be on the card either')).toBeNull();
  });

  it('empty fields leave nothing behind: no pill, no blank line, no link row, no N/A', () => {
    render(React.createElement(TeamGrid, { team: [{ ...bare, title: '   ' }] as any, loading: false }));
    const card = screen.getByTestId('team-card');
    expect(card.querySelectorAll('p')).toHaveLength(0);
    expect(card.querySelectorAll('a')).toHaveLength(0);
    expect(card.querySelector('.rounded-full.px-2\\.5')).toBeNull();
    expect(card.textContent).toBe('BOBrian Okello');
    expect(card.textContent).not.toMatch(/N\/A|undefined|null/);
  });

  it('all cards share one height and links sit at the bottom', () => {
    render(React.createElement(TeamGrid, { team: [full] as any, loading: false }));
    expect(screen.getByRole('list').className).toContain('items-stretch');
    expect(screen.getByRole('list').className).toContain('auto-rows-fr');
    const card = screen.getByTestId('team-card');
    expect(card.className).toContain('h-full');
    expect(card.lastElementChild!.className).toContain('mt-auto');
  });

  it('team code and copy never use the word "founder"', () => {
    for (const f of ['src/components/TeamGrid.tsx', 'src/components/TeamView.tsx', 'src/components/TeamManager.tsx']) {
      expect(read(f)).not.toMatch(/founder/i);
    }
  });
});

/* ------------------------------------------------------------------------- */
describe('1.14.0 README', () => {
  const readme = read('README.md');

  it('opens with the title, tagline and live link', () => {
    expect(readme.startsWith('# Matchpiece\n\n*Find your missing piece.*')).toBe(true);
    expect(readme).toContain('https://matchpiece.ai.studio');
  });

  it('has exactly the five badges: CI, award, Gemma 4, MIT and DOI', () => {
    const badges = [...readme.matchAll(/\[!\[([^\]]+)\]/g)].map(m => m[1]);
    expect(badges).toEqual(['CI', 'Award: 1st place Hack Day Kampala', 'Model: Gemma 4', 'License: MIT', 'DOI']);
    expect(readme).toContain('10.5281/zenodo.23737410');
    expect(readme).not.toMatch(/Primer/);
  });

  it('tells the story once and has the team table with roles', () => {
    expect(readme.match(/67 participants/g)).toHaveLength(1);
    expect(readme.match(/Best Open-Source AI Project/g)).toHaveLength(1);
    expect(readme.match(/formerly Kwegatta/g)).toHaveLength(1);
    expect(readme).toContain('| Name | Role | University | GitHub |');
    expect(readme).toContain('| Saifuddin Ahmed | Project Lead & Developer | Al Neelain University |');
    expect(readme).toContain('| Ojambo Emmanuel | Finance & Operations | Makerere University Business School | — |');
    expect(readme).not.toMatch(/founder\b/i);
  });

  it('deployment is generic and safe', () => {
    expect(readme).toContain('--region us-west1');
    expect(readme).not.toMatch(/--set-env-vars|us-east1|kwegatta-1|--project/);
    expect(readme).toContain('--update-secrets');
  });

  it('every relative link points to a file that exists', () => {
    const links = [...readme.matchAll(/\]\(([^)#]+)\)/g)].map(m => m[1]).filter(l => !/^https?:/.test(l));
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) expect(fs.existsSync(path.join(ROOT, l)), l).toBe(true);
  });
});
