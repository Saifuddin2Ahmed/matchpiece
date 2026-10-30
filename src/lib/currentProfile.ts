import type { Profile } from '../types';

/** Keep the stored copy of the signed-in member in step with what the app shows (e.g. a new photo). */
export function saveCurrentProfileLocally(p: Profile): void {
  try {
    const myId = localStorage.getItem('kw_me');
    if (myId && myId !== p.id) return;
    localStorage.setItem('kw_me', p.id);
    localStorage.setItem('kwegatta_current_profile', JSON.stringify(p));
  } catch {
    // Storage blocked or full: the app state already has the new profile
  }
}
