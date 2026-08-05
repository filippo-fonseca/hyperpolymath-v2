'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { Result } from '@/lib/integrations/result';
import {
  SPORT_CATEGORIES,
  SPORT_LABELS,
  type SportCategory,
  type StravaData,
} from '@/lib/integrations/strava/types';
import { StravaDisconnectButton } from './StravaConnectionControl';
import { INSIGHTS_PANEL } from '../tile-style';

const ACCENT = '#FC4C02';

// Only Run is distance-based. HIIT is logged as a lift (distance ~0) and the
// bike is a stationary trainer (distance is meaningless), so both read off
// time/sessions instead.
const isDistanceSport = (s: SportCategory) => s === 'Run';

interface Props {
  result: Result<StravaData>;
}

/**
 * Craft panel plate. `.craft-card` (via INSIGHTS_PANEL) paints fill, hairline
 * and shadow, so this element carries no `bg-*` utility and no inline
 * boxShadow. Strava orange stays saturated on the identity dot, the bars and
 * the connect button; it never becomes a plate fill.
 */
function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <section
      className={`group ${INSIGHTS_PANEL} p-6`}
      style={{ ['--panel-accent']: ACCENT } as React.CSSProperties}
    >
      {children}
    </section>
  );
}

/** Saturated identity dot — the brand hue at full strength, small. */
function AccentDot() {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: 'var(--panel-accent)' }}
    />
  );
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)}`;
}
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
function shortWeek(weekStart: string): string {
  const [, m, day] = weekStart.split('-');
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[Number(m) - 1] ?? m} ${Number(day)}`;
}

export function StravaPanel({ result }: Props) {
  // Default to the sport of the most recent activity (falls back to Run).
  const initialSport: SportCategory = result.ok
    ? (result.data.activities.find((a) => a.category)?.category ?? 'Run')
    : 'Run';
  const [sport, setSport] = useState<SportCategory>(initialSport);

  if (!result.ok) {
    const isDisconnected = /not connected|reconnect required/i.test(
      result.error,
    );
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-2 font-serif text-lg text-[var(--ink)]">
            <AccentDot />
            Strava
          </h3>
        </header>
        {isDisconnected ? (
          <div className="flex flex-col gap-3">
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Strava not connected.
            </p>
            <a
              href="/api/integrations/strava/connect"
              className="inline-flex items-center gap-1.5 self-start rounded-lg bg-[var(--panel-accent,#FC4C02)] px-3 py-1.5 text-micro font-medium tracking-[0.06em] text-white shadow-[var(--shadow-card)] transition-[opacity,box-shadow] duration-[160ms] ease-out hover:opacity-90 hover:shadow-[var(--shadow-card-hover)]"
            >
              Connect Strava →
            </a>
          </div>
        ) : (
          <p className="font-mono text-xs text-[var(--ink-muted)]">
            Couldn&apos;t load Strava — {result.error}
          </p>
        )}
      </PanelChrome>
    );
  }

  const { activities, sports } = result.data;
  return (
    <PanelChrome>
      <header className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-lg text-[var(--ink)]">Strava</h3>
          <StravaDisconnectButton />
        </div>
        <div
          role="tablist"
          aria-label="Sport"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-0.5"
        >
          {SPORT_CATEGORIES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
              className="craft-chip cursor-pointer-always"
            >
              {SPORT_LABELS[s]}
            </button>
          ))}
        </div>
      </header>

      <SportView summary={sports[sport]} activities={activities} sport={sport} />
    </PanelChrome>
  );
}

function SportView({
  summary,
  activities,
  sport,
}: {
  summary: StravaData['sports'][SportCategory];
  activities: StravaData['activities'];
  sport: SportCategory;
}) {
  const distanceMode = isDistanceSport(sport);
  const currentWeek = summary.weeklyStats[0];

  const chartData = useMemo(
    () =>
      [...summary.weeklyStats].reverse().map((w) => ({
        label: shortWeek(w.weekStart),
        value: distanceMode
          ? Number((w.distanceMeters / 1000).toFixed(2))
          : Math.round(w.movingTimeSeconds / 60),
      })),
    [summary.weeklyStats, distanceMode],
  );

  const recent = useMemo(
    () => activities.filter((a) => a.category === sport).slice(0, 3),
    [activities, sport],
  );

  if (summary.totalCount === 0) {
    return (
      <p className="font-mono text-xs text-[var(--ink-muted)] py-6">
        No {SPORT_LABELS[sport].toLowerCase()} activities in the last 30 days.
      </p>
    );
  }

  return (
    <>
      <div className="mb-2 flex items-baseline justify-end">
        {currentWeek ? (
          <span className="text-micro tracking-[0.06em] text-[var(--ink-muted)]">
            {distanceMode ? (
              <>
                <span className="text-[var(--ink)]">
                  {formatKm(currentWeek.distanceMeters)}
                </span>{' '}
                km this week
              </>
            ) : (
              <>
                <span className="text-[var(--ink)]">
                  {currentWeek.activityCount}
                </span>{' '}
                {currentWeek.activityCount === 1 ? 'session' : 'sessions'} ·{' '}
                <span className="text-[var(--ink)]">
                  {formatTime(currentWeek.movingTimeSeconds)}
                </span>
              </>
            )}
          </span>
        ) : null}
      </div>

      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            {/* Tokens, not hex: recharts resolves CSS custom properties as SVG
                presentation attributes, so these stay correct in dark too. */}
            <CartesianGrid
              stroke="var(--edge)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--ink-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--ink-muted)' }}
              axisLine={false}
              tickLine={false}
              width={36}
              unit={distanceMode ? 'km' : 'm'}
            />
            <Tooltip
              cursor={{ fill: 'rgba(252, 76, 2, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 12,
                boxShadow: 'var(--shadow-pop)',
                fontSize: 11,
              }}
              formatter={(v) =>
                [
                  distanceMode ? `${v} km` : `${v} min`,
                  distanceMode ? 'distance' : 'time',
                ] as [string, string]
              }
            />
            <Bar dataKey="value" fill={ACCENT} radius={[5, 5, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {recent.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-[var(--edge)] pt-3">
          {recent.map((a) => (
            <li
              key={a.id}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="flex items-baseline gap-2 truncate">
                <span className="font-serif text-[var(--ink)] truncate">
                  {a.name}
                </span>
              </span>
              <span className="font-mono text-micro tabular-nums text-[var(--ink-muted)] whitespace-nowrap">
                {distanceMode ? (
                  <>
                    <span className="text-[var(--ink)]">
                      {formatKm(a.distanceMeters)}
                    </span>{' '}
                    km · {formatTime(a.movingTimeSeconds)}
                  </>
                ) : (
                  <span className="text-[var(--ink)]">
                    {formatTime(a.movingTimeSeconds)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
