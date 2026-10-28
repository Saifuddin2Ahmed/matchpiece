// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { app, store } from '../server';
import { ProfileView } from '../src/components/ProfileView';
import { LINK_ERROR, checkLink, withHttps } from '../src/lib/links';
import { LICENSE_HOLDER } from '../src/lib/brand';

let server: any;
let baseUrl: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */

const baseProfile = (extra: Record<string, unknown> = {}): any => ({
  id: 'p-1131',
  name: 'Ann Builder',
  headline: 'Saved headline',
  bio: 'Saved bio',
  needs: 'Saved needs',
  offers: 'Saved offers',
  website: 'https://old.example.com',
  role: 'Developer',
  roles: ['Developer'],
  updated_at: '2026-10-28T10:00:00.000Z',
  ...extra
});

/** Renders the member's own profile; returns a function that re-renders with a new profile object. */
async function renderOwnProfile(profile: any, props: Record<string, unknown> = {}) {
  const onUpdateProfile = vi.fn();
  const onToast = vi.fn();
  const element = (p: any) =>
    React.createElement(ProfileView, {
      profile: p,
      currentProfile: p,
      followersCount: 0,
      followingCount: 0,
      isFollowing: false,
      onToggleFollow: vi.fn(),
      onUpdateProfile,
      onToast,
      ...props
    });
  let utils: any;
  await act(async () => {
    utils = render(element(profile));
  });
  const rerender = async (p: any) => {
    await act(async () => {
      utils.rerender(element(p));
    });
  };
  return { onUpdateProfile, onToast, rerender };
}

async function openEditor() {
  const buttons = screen.getAllByRole('button', { name: /edit profile/i });
  await act(async () => {
    fireEvent.click(buttons[buttons.length - 1]);
  });
}

async function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  expect(input, id).toBeTruthy();
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  return input;
}

const field = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

async function save() {
  const buttons = screen.getAllByRole('button', { name: /save changes/i });
  await act(async () => {
    fireEvent.click(buttons[buttons.length - 1]);
  });
}

/** Mocks the PATCH to /api/data/profiles/:id; returns the bodies sent. */
function mockProfilePatch(respond: (body: any) => Response) {
  const bodies: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith('/api/data/profiles/') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return respond(body);
    }
    return new Response('[]', { status: 200 });
  });
  return bodies;
}

const ok = (json: any) => new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });

/* ------------------------------------------------------------------------- */

describe('Profile form keeps what the member types', () => {
  it('typing is not overwritten when the profile prop changes (background sync)', async () => {
    const { rerender } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-headline', 'Half-typed new head');
    await type('profile-website', 'https://mine.example.com');

    // Realtime sync delivers a new object for the same profile
    await rerender(baseProfile({ headline: 'Saved headline', updated_at: '2026-10-28T10:00:05.000Z' }));
    await rerender(baseProfile({ headline: 'Changed elsewhere', bio: 'Changed elsewhere', updated_at: '2026-10-28T10:00:09.000Z' }));

    expect(field('profile-headline')).toBe('Half-typed new head');
    expect(field('profile-website')).toBe('https://mine.example.com');
  });

  it('every changed field survives a background update', async () => {
    const { rerender } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-bio', 'My new bio');
    await type('profile-needs', 'A designer');
    await type('profile-offers', 'Backend work');
    await rerender(baseProfile({ bio: 'Server bio', needs: 'Server needs', offers: 'Server offers', updated_at: '2026-10-28T10:01:00.000Z' }));
    expect(field('profile-bio')).toBe('My new bio');
    expect(field('profile-needs')).toBe('A designer');
    expect(field('profile-offers')).toBe('Backend work');
  });

  it('while the form is closed it follows updates, so opening it shows the latest saved values', async () => {
    const { rerender } = await renderOwnProfile(baseProfile());
    await rerender(baseProfile({ headline: 'Newer headline', website: 'https://newer.example.com' }));
    await openEditor();
    expect(field('profile-headline')).toBe('Newer headline');
    expect(field('profile-website')).toBe('https://newer.example.com');
  });

  it('cancel drops unsaved edits; opening again starts from the saved profile', async () => {
    await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-headline', 'Draft I will cancel');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    await openEditor();
    expect(field('profile-headline')).toBe('Saved headline');
  });

  it('after a successful save the form shows the saved result', async () => {
    mockProfilePatch(body => ok({ ...baseProfile(), ...body, headline: `${body.headline} (saved)` }));
    const { onUpdateProfile, onToast, rerender } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-headline', 'Fresh headline');
    await save();

    expect(onToast).toHaveBeenCalledWith('Profile updated successfully');
    const saved = onUpdateProfile.mock.calls.at(-1)![0];
    expect(saved.headline).toBe('Fresh headline (saved)');
    // Parent passes the saved profile back down; the reopened form shows it
    await rerender(saved);
    await openEditor();
    expect(field('profile-headline')).toBe('Fresh headline (saved)');
  });

  it('a failed save is not reported as success and keeps the typed text', async () => {
    mockProfilePatch(() => new Response('{"error":"nope"}', { status: 500 }));
    const { onUpdateProfile, onToast } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-headline', 'Keep me');
    await save();
    expect(onToast).not.toHaveBeenCalledWith('Profile updated successfully');
    expect(onToast).toHaveBeenCalledWith('Failed to save profile changes. Your edits are still in the form.');
    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(field('profile-headline')).toBe('Keep me');
  });
});

describe('Link fields', () => {
  it('a bare domain gets https:// when the field loses focus and saves as https://...', async () => {
    const bodies = mockProfilePatch(body => ok({ ...baseProfile(), ...body }));
    const { onToast } = await renderOwnProfile(baseProfile());
    await openEditor();
    const input = await type('profile-website', 'otwox.com');
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(field('profile-website')).toBe('https://otwox.com');
    await save();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].website).toBe('https://otwox.com');
    expect(onToast).toHaveBeenCalledWith('Profile updated successfully');
  });

  it('a bare domain typed and saved without leaving the field is still saved as https://...', async () => {
    const bodies = mockProfilePatch(body => ok({ ...baseProfile(), ...body }));
    await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-linkedin', 'linkedin.com/in/ann');
    await save();
    expect(bodies[0].linkedin).toBe('https://linkedin.com/in/ann');
  });

  it('an invalid link shows the inline error and nothing is saved', async () => {
    const bodies = mockProfilePatch(body => ok({ ...baseProfile(), ...body }));
    const { onToast, onUpdateProfile } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-website', 'my site');
    await save();
    expect(bodies).toHaveLength(0);
    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalledWith('Profile updated successfully');
    expect(onToast).toHaveBeenCalledWith('Check the highlighted links. Nothing was saved.');
    const input = document.getElementById('profile-website')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(input.getAttribute('aria-describedby')!)!;
    expect(error.textContent).toBe('Enter a full link, e.g. https://example.com');
    expect(field('profile-website')).toBe('my site');

    // Fixing the field clears the error and the save goes through
    await type('profile-website', 'otwox.com');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    await save();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].website).toBe('https://otwox.com');
  });

  it('a link for the wrong site on a site-specific field shows an error', async () => {
    const bodies = mockProfilePatch(body => ok({ ...baseProfile(), ...body }));
    await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-kaggle', 'github.com/ann');
    await save();
    expect(bodies).toHaveLength(0);
    expect(screen.getByText('Enter a kaggle.com link, e.g. https://kaggle.com/your-name')).toBeTruthy();
  });

  it('if the server still drops a link, the form says so instead of reporting success', async () => {
    mockProfilePatch(body => ok({ ...baseProfile(), ...body, website: '' }));
    const { onToast } = await renderOwnProfile(baseProfile());
    await openEditor();
    await type('profile-website', 'https://otwox.com');
    await save();
    expect(onToast).not.toHaveBeenCalledWith('Profile updated successfully');
    expect(onToast).toHaveBeenCalledWith('Some links were not saved. Check the highlighted links.');
    expect(screen.getByText(LINK_ERROR)).toBeTruthy();
  });

  it('checkLink and withHttps rules', () => {
    expect(withHttps(' otwox.com ')).toBe('https://otwox.com');
    expect(withHttps('www.otwox.com/about?x=1')).toBe('https://www.otwox.com/about?x=1');
    expect(withHttps('https://otwox.com')).toBe('https://otwox.com');
    expect(withHttps('my site')).toBe('my site');
    expect(checkLink('')).toEqual({ value: '', error: '' });
    expect(checkLink('otwox.com')).toEqual({ value: 'https://otwox.com', error: '' });
    expect(checkLink('http://otwox.com').error).toBe('');
    expect(checkLink('http://otwox.com', { httpsOnly: true }).error).toBe('Use a link that starts with https://');
    expect(checkLink('javascript:alert(1)').error).toBe(LINK_ERROR);
    expect(checkLink('https://').error).toBe(LINK_ERROR);
    expect(checkLink('localhost').error).toBe(LINK_ERROR);
    expect(checkLink('https://huggingface.co/ann', { domains: ['huggingface.co'] }).error).toBe('');
    expect(checkLink('evilhuggingface.co/ann', { domains: ['huggingface.co'] }).error).not.toBe('');
  });
});

describe('Server accepts bare domains on profile links', () => {
  const uid = 'p-1131-server';
  const auth = { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' };

  it('PATCH saves "otwox.com" as https://otwox.com and keeps full links as they are', async () => {
    if (!store.profiles.some((p: any) => p.id === uid)) {
      store.profiles.push({ id: uid, account_uid: uid, name: 'Server Ann', role: 'Developer', created_at: new Date().toISOString() });
    }
    const res = await realFetch(`${baseUrl}/api/data/profiles/${uid}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({
        website: 'otwox.com',
        linkedin: 'https://www.linkedin.com/in/ann',
        twitter: 'x.com/ann',
        kaggle: 'kaggle.com/ann',
        custom_links: [{ label: 'Blog', url: 'blog.otwox.com' }]
      })
    });
    expect(res.status).toBe(200);
    const stored = store.profiles.find((p: any) => p.id === uid);
    expect(stored.website).toBe('https://otwox.com');
    expect(stored.linkedin).toBe('https://www.linkedin.com/in/ann');
    expect(stored.twitter).toBe('https://x.com/ann');
    expect(stored.kaggle).toBe('https://kaggle.com/ann');
    expect(stored.custom_links).toEqual([{ label: 'Blog', url: 'https://blog.otwox.com' }]);
  });

  it('text that is not a link is still refused', async () => {
    const res = await realFetch(`${baseUrl}/api/data/profiles/${uid}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ website: 'javascript:alert(1)' })
    });
    expect(res.status).toBe(200);
    expect(store.profiles.find((p: any) => p.id === uid).website).toBe('');
  });
});

describe('Licence', () => {
  it('LICENSE and the licence page name "The Matchpiece Team (formerly Kwegatta)"', () => {
    expect(LICENSE_HOLDER).toBe('The Matchpiece Team (formerly Kwegatta)');
    expect(fs.readFileSync('LICENSE', 'utf-8')).toContain(`Copyright (c) 2026 ${LICENSE_HOLDER}`);
    expect(fs.readFileSync('src/components/LicenseView.tsx', 'utf-8')).toContain('Copyright (c) 2026 {LICENSE_HOLDER}');
  });
});
