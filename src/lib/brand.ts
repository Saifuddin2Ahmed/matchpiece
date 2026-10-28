// Product name, tagline and public URLs. The client, the server, index.html
// (via vite.config.ts) and the tests all read them from here.
// Internal identifiers (Firestore collections, localStorage keys, the Firebase
// project, the GitHub repo) keep the old "kwegatta" name on purpose.

export const BRAND_NAME = 'Matchpiece';
export const BRAND_TAGLINE = 'Find your missing piece';
export const BRAND_FORMERLY = 'Kwegatta';
/** Default description for search results and share previews. */
export const BRAND_DESCRIPTION =
  'Find teammates, mentors and study partners. 1st place at Hacktoberfest Hack Day Kampala 2026. Free and open source.';
/** Who you meet here; replaces "matchmaking" in share text so it is not read as a dating app. */
export const BRAND_AUDIENCE = 'Teammates · Mentors · Study partners';
export const BRAND_AWARD_SHORT = '1st place · Hacktoberfest Hack Day Kampala 2026';

/** "Matchpiece: Find your missing piece" */
export const BRAND_TITLE = `${BRAND_NAME}: ${BRAND_TAGLINE}`;
/** "Matchpiece (formerly Kwegatta)" */
export const BRAND_WITH_FORMERLY = `${BRAND_NAME} (formerly ${BRAND_FORMERLY})`;
/** Hackathon history: the team won under the old name. */
export const BRAND_TEAM_THEN = `the ${BRAND_NAME} team (then ${BRAND_FORMERLY})`;

export const PRIMARY_HOST = 'matchpiece.ai.studio';
export const PRIMARY_URL = `https://${PRIMARY_HOST}`;
export const LEGACY_HOST = 'kwegatta.ai.studio';

export const EMAIL_FROM_NAME = `${BRAND_NAME} Events`;
export const AWARD_LINE = `${BRAND_WITH_FORMERLY} won 1st place at Hacktoberfest 2026 Hack Day Kampala × MUBS.`;
export const COPYRIGHT_LINE = `© 2026 ${BRAND_NAME} · formerly ${BRAND_FORMERLY}`;
/** Copyright holder in LICENSE. */
export const LICENSE_HOLDER = `The ${BRAND_NAME} Team (formerly ${BRAND_FORMERLY})`;

/** Share link for a profile. /u/<id> (not /#/u/<id>) so link previews can show the profile. */
export function profileShareUrl(id: string): string {
  return `${PRIMARY_URL}/u/${encodeURIComponent(id)}`;
}

/** Lowercase slug for downloaded file names. */
export const BRAND_SLUG = BRAND_NAME.toLowerCase();

/** Fills the __BRAND_*__ and __PRIMARY_URL__ placeholders in index.html. */
export function applyBrandToHtml(html: string): string {
  return html
    .replace(/__BRAND_TITLE__/g, BRAND_TITLE)
    .replace(/__BRAND_NAME__/g, BRAND_NAME)
    .replace(/__BRAND_FORMERLY__/g, BRAND_FORMERLY)
    .replace(/__BRAND_DESCRIPTION__/g, BRAND_DESCRIPTION)
    .replace(/__PRIMARY_URL__/g, PRIMARY_URL);
}
