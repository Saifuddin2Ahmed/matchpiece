// Link fields on profiles. Shared by the profile form and the server so a bare
// domain like "otwox.com" is saved as "https://otwox.com" on both sides.

export const LINK_ERROR = 'Enter a full link, e.g. https://example.com';
export const HTTPS_LINK_ERROR = 'Use a link that starts with https://';

const BARE_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/** Adds https:// to a bare domain ("otwox.com/about"); anything else comes back trimmed, unchanged. */
export function withHttps(raw: unknown): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return BARE_DOMAIN_RE.test(trimmed) ? `https://${trimmed}` : trimmed;
}

export interface LinkRule {
  /** Only https:// links (custom links). */
  httpsOnly?: boolean;
  /** Allowed hosts, e.g. ['huggingface.co']; subdomains are allowed too. */
  domains?: string[];
}

/** The link as it will be saved, and an error message ('' when fine or empty). */
export function checkLink(raw: unknown, rule: LinkRule = {}): { value: string; error: string } {
  const value = withHttps(raw);
  if (!value) return { value: '', error: '' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { value, error: LINK_ERROR };
  }
  if (/\s/.test(value) || !url.hostname.includes('.')) return { value, error: LINK_ERROR };
  if (url.protocol === 'http:' && rule.httpsOnly) return { value, error: HTTPS_LINK_ERROR };
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { value, error: LINK_ERROR };
  if (rule.domains) {
    const host = url.hostname.toLowerCase();
    if (!rule.domains.some(d => host === d || host.endsWith(`.${d}`))) {
      return { value, error: `Enter a ${rule.domains[0]} link, e.g. https://${rule.domains[0]}/your-name` };
    }
  }
  return { value: value.slice(0, 500), error: '' };
}

/** Profile link fields and their rules (GitHub is a username, not a link). */
export const PROFILE_LINK_RULES = {
  linkedin: {},
  website: {},
  twitter: {},
  facebook: {},
  tiktok: {},
  instagram: {},
  youtube: {},
  scholar: {},
  orcid: {},
  huggingface: { domains: ['huggingface.co'] },
  kaggle: { domains: ['kaggle.com'] },
  gitlab: { domains: ['gitlab.com'] },
  google_play: { domains: ['play.google.com'] },
  google_dev: { domains: ['g.dev', 'developers.google.com'] },
  ieee: { domains: ['ieee-collabratec.ieee.org'] }
} satisfies Record<string, LinkRule>;

export type ProfileLinkKey = keyof typeof PROFILE_LINK_RULES;
export const PROFILE_LINK_KEYS = Object.keys(PROFILE_LINK_RULES) as ProfileLinkKey[];
