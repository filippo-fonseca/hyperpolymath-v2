'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Result } from '@/lib/integrations/result';
import type {
  Activity,
  WeeklyStats,
} from '@/lib/integrations/strava/activities';
import { StravaDisconnectButton } from './StravaConnectionControl';

const ACCENT = '#FC4C02';
// const ACCENT_DIM = '#c43d02'; // reserved for hover/secondary use

interface Props {
  result: Result<{ activities: Activity[]; weeklyStats: WeeklyStats[] }>;
}

function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--edge)] p-6"
      style={
        {
          ['--panel-accent']: ACCENT,
          boxShadow:
            'inset 0 0 0 1px color-mix(in oklch, var(--panel-accent) 40%, transparent), 0 0 32px color-mix(in oklch, var(--panel-accent) 5%, transparent)',
        } as React.CSSProperties
      }
    >
      {children}
    </section>
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
  if (!result.ok) {
    const isDisconnected =
      /not connected|reconnect required/i.test(result.error);
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Strava</h3>
        </header>
        {isDisconnected ? (
          <div className="flex flex-col gap-3">
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Strava not connected.
            </p>
            <a
              href="/api/integrations/strava/connect"
              className="inline-flex items-center gap-1.5 self-start rounded-md bg-[var(--panel-accent,#FC4C02)] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-white hover:opacity-90 transition-opacity"
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

  const { activities, weeklyStats } = result.data;
  // weeklyStats[0] is the current (most recent) week per data layer ordering.
  const currentWeek = weeklyStats[0];
  // Chart data wants chronological order (oldest left).
  const chartData = [...weeklyStats]
    .reverse()
    .map((w) => ({
      label: shortWeek(w.weekStart),
      km: Number((w.distanceMeters / 1000).toFixed(2)),
    }));
  const recent = activities.slice(0, 3);

  return (
    <PanelChrome>
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-lg text-[var(--ink)]">Strava</h3>
          <StravaDisconnectButton />
        </div>
        {currentWeek ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            <span className="text-[var(--ink)]">{formatKm(currentWeek.distanceMeters)}</span>{' '}
            km this week
          </span>
        ) : null}
      </header>

      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#d4cfc4" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#7c7669' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#7c7669' }}
              axisLine={false}
              tickLine={false}
              width={36}
              unit="km"
            />
            <Tooltip
              cursor={{ fill: 'rgba(252, 76, 2, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v) => [`${v} km`, 'distance'] as [string, string]}
            />
            <Bar dataKey="km" fill={ACCENT} radius={[2, 2, 0, 0]} />
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
                <span className="font-serif text-[var(--ink)] truncate">{a.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  {a.type}
                </span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)] whitespace-nowrap">
                <span className="text-[var(--ink)]">{formatKm(a.distanceMeters)}</span>{' '}
                km · {formatTime(a.movingTimeSeconds)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </PanelChrome>
  );
}
