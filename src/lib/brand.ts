// Product name, tagline and public URLs. The client, the server, index.html
// (via vite.config.ts) and the tests all read them from here.
// Internal identifiers (Firestore collections, localStorage keys, the Firebase
// project, the GitHub repo) keep the old "kwegatta" name on purpose.

export const BRAND_NAME = 'Matchpiece';
export const BRAND_TAGLINE = 'Find your missing piece';
export const BRAND_FORMERLY = 'Kwegatta';
export const BRAND_DESCRIPTION =
  'Say what you need and what you offer. Matchpiece matches students and builders with co-founders, teammates, mentors and study partners using the open-weight Gemma 4 model.';

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
