import React, { useEffect, useState } from 'react';
import { Github, Linkedin, UserRound } from 'lucide-react';
import { TeamMember } from '../types';
import { getInitials } from '../utils';
import { BRAND_NAME } from '../lib/brand';

/** Gold or teal, always the same one for the same name. Dark text on both passes WCAG AA. */
export function teamInitialsColor(name: string): { bg: string; fg: string } {
  const hash = [...String(name || '?')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return hash % 2 === 0 ? { bg: '#F5B700', fg: '#090D16' } : { bg: '#12B5A6', fg: '#090D16' };
}

/** Team photo, or initials in a brand colour when there is no photo or it fails to load. */
export const TeamAvatar: React.FC<{ name: string; photoUrl?: string | null; size?: number }> = ({ name, photoUrl, size = 64 }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={`Photo of ${name}`}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="rounded-full object-cover flex-shrink-0 border border-[var(--card-border)] bg-[var(--bg-subtle)]"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = teamInitialsColor(name);
  return (
    <div
      role="img"
      aria-label={name}
      data-testid="team-initials"
      className="rounded-full flex-shrink-0 grid place-items-center font-display font-bold select-none"
      style={{ width: size, height: size, backgroundColor: color.bg, color: color.fg, fontSize: Math.round(size * 0.36) }}
    >
      {getInitials(name)}
    </div>
  );
};

interface TeamGridProps {
  team: TeamMember[];
  loading: boolean;
}

const text = (v: unknown) => (v ? String(v).trim() : '');

/**
 * Team cards from /api/team (managed in the Admin panel). Used on About and the Team page.
 * Every member gets the same card: photo, name, role, university and links. Empty fields are left out.
 */
export const TeamGrid: React.FC<TeamGridProps> = ({ team, loading }) => {
  if (loading && team.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" aria-busy="true" aria-label="Loading the team">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-56 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] animate-pulse" />
        ))}
      </div>
    );
  }
  if (team.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">The team list will appear here soon.</p>;
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-4 sm:gap-6 items-stretch" aria-label={`${BRAND_NAME} team`}>
      {team.map(member => {
        const photoUrl = member.photo_url || member.linked_avatar || null;
        const role = text(member.title);
        const university = text(member.line2);
        const links: Array<{ href: string; label: string; icon: React.ReactNode; external: boolean }> = [];
        if (member.github) links.push({ href: `https://github.com/${member.github}`, label: 'GitHub', icon: <Github className="w-4 h-4" />, external: true });
        if (member.linkedin) links.push({ href: member.linkedin, label: 'LinkedIn', icon: <Linkedin className="w-4 h-4" />, external: true });
        if (member.linked_profile_id) {
          links.push({ href: `/#/u/${encodeURIComponent(member.linked_profile_id)}`, label: BRAND_NAME, icon: <UserRound className="w-4 h-4" />, external: false });
        }

        return (
          <li
            key={member.id || member.name}
            data-testid="team-card"
            className="h-full p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] flex flex-col items-center text-center gap-3 min-w-0 transition-colors hover:border-[var(--teal)]/40"
          >
            <TeamAvatar name={member.name} photoUrl={photoUrl} size={80} />
            <div className="min-w-0 w-full space-y-1.5">
              <h3 className="font-semibold text-base text-[var(--fg)] break-words">{member.name}</h3>
              {role && (
                <p className="inline-block max-w-full px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--teal)]/10 text-[var(--teal-text)] border border-[var(--teal)]/25 break-words">
                  {role}
                </p>
              )}
              {university && <p className="text-[13px] text-[var(--fg-subtle)] break-words">{university}</p>}
            </div>

            {links.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1 mt-auto pt-1">
                {links.map(l => (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] p-2 rounded-md transition-colors"
                    aria-label={`${member.name} on ${l.label}`}
                    title={l.label}
                  >
                    {l.icon}
                  </a>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
