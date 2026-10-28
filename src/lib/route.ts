// Turns the browser address into the app's route. Most routes live in the hash
// (#/events/<id>); a few work as plain paths, including /u/<id>, the shareable
// profile link (crawlers never see a #fragment, so share previews need a path).

export interface AppRoute {
  main: string;
  sub?: string;
  /** Set when the address should be rewritten to its hash form (e.g. /u/<id> -> /#/u/<id>). */
  replaceWith?: string;
}

const DIRECT_PATHS = ['privacy', 'license', 'about', 'wall'];

export function parseAppRoute(hash: string, pathname: string): AppRoute {
  let rawHash = hash.replace(/^#\/?/, '');
  const rawPath = pathname.replace(/^\//, '');
  let replaceWith: string | undefined;
  if (!rawHash && /^u\/[^/]+$/.test(rawPath)) {
    replaceWith = `/#/${rawPath}`;
    rawHash = rawPath;
  }
  const directPath = DIRECT_PATHS.includes(rawPath) ? rawPath : '';
  const effective = rawHash || directPath || 'home';
  const parts = effective.split('/');
  return { main: parts[0] || 'home', sub: parts[1], ...(replaceWith ? { replaceWith } : {}) };
}
