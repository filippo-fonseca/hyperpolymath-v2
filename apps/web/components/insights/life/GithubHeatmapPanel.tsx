'use client';

import { cloneElement } from 'react';
import Link from 'next/link';
import { Github } from 'lucide-react';
import { GitHubCalendar } from 'react-github-calendar';
import { format, parseISO } from 'date-fns';
import { EmptyState } from '@/components/ui/EmptyState';
import { INSIGHTS_PANEL } from '../tile-style';

/**
 * GitHub contributions heatmap (260607-h2k, Task 9 + D-01 + D-09).
 *
 * Wraps react-github-calendar which proxies through the jogruber public API
 * (github-contributions-api.jogruber.de). NO GITHUB_TOKEN required.
 *
 * Username is per-user (users.github_username). When null, render a
 * "connect in settings" placeholder instead of the calendar — falling back
 * to the previously-hardcoded username here would leak the developer's
 * graph onto every user's Life tab.
 *
 * If jogruber outages ever mount, fall back via the library's `transformData`
 * prop + GraphQL/PAT — see RESEARCH §6.1.
 */

const ACCENT = '#2da44e'; // canonical github.com mid-green (panel halo)
const THEME = {
  light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  dark: ['#0d1117', '#0e4429', '#006d32', '#26a641', '#2da44e'],
};

interface Props {
  username: string | null;
}

export function GithubHeatmapPanel({ username }: Props) {
  return (
    // `.craft-card` (via INSIGHTS_PANEL) owns the fill, hairline and shadow —
    // no `bg-*` utility and no inline boxShadow may ride on this element.
    // GitHub's green stays saturated on the identity dot and inside the
    // contribution scale, never as a plate fill.
    <section
      className={`group ${INSIGHTS_PANEL} p-6`}
      style={{ ['--panel-accent']: ACCENT } as React.CSSProperties}
    >
      <header className="mb-4 flex items-baseline justify-between">
 <h3 className="flex items-center gap-2 font-serif text-subtitle text-[var(--ink)]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--panel-accent)' }}
          />
          GitHub
        </h3>
        {username ? (
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noreferrer"
            className="text-micro tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            @{username}
          </a>
        ) : null}
      </header>
      {username ? (
        <GitHubCalendar
          username={username}
          theme={THEME}
          blockSize={11}
          blockMargin={3}
          blockRadius={2}
          fontSize={11}
          showColorLegend={true}
          showTotalCount={true}
          renderBlock={(block, activity) =>
            cloneElement(
              block,
              {},
              <title>{`${activity.count} contribution${activity.count === 1 ? '' : 's'} on ${format(parseISO(activity.date), 'MMM d, yyyy')}`}</title>,
            )
          }
        />
      ) : (
        // Shared empty state on the insights hue: the icon rides a soft sky
        // plate instead of floating grey on grey.
        <EmptyState
          className="tint-sky"
          icon={<Github />}
          title="Connect your GitHub."
          description="Add your username in settings to surface your contributions here."
          actionSlot={
            <Link
              href="/settings"
              className="text-micro tracking-[0.08em] text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:text-[var(--ink)]"
            >
              Open settings →
            </Link>
          }
        />
      )}
    </section>
  );
}
