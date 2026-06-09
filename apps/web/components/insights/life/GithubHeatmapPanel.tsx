'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';
import { GitHubCalendar } from 'react-github-calendar';

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
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--edge)] p-6"
      style={
        {
          ['--panel-accent']: ACCENT,
          boxShadow:
            'inset 0 0 0 1px color-mix(in oklch, var(--panel-accent) 60%, transparent), 0 0 32px color-mix(in oklch, var(--panel-accent) 6%, transparent)',
        } as React.CSSProperties
      }
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-lg text-[var(--ink)]">GitHub</h3>
        {username ? (
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
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
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Github className="h-6 w-6 text-[var(--ink-muted)]" />
          <p className="font-serif text-base text-[var(--ink)]">
            Connect your GitHub.
          </p>
          <p className="font-serif text-sm text-[var(--ink-muted)] max-w-sm">
            Add your username in settings to surface your contributions here.
          </p>
          <Link
            href="/settings"
            className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Open settings →
          </Link>
        </div>
      )}
    </section>
  );
}
