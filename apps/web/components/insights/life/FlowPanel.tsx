'use client';

import { useMemo, useState } from 'react';
import { addDays, format, isBefore, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import type { Session } from '@/lib/integrations/flow/bucket';
import { bucketByDayForWeek } from '@/lib/integrations/flow/bucket';

const ACCENT = '#7c3aed'; // violet-600
// const ACCENT_DIM = '#5b21b6';
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  result: Result<Session[]>;
}

function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
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

function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function FlowPanel({ result }: Props) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const today = useMemo(() => new Date(), []);
  const thisMonday = useMemo(() => mondayOf(today), [today]);
  const canGoNext = isBefore(weekStart, thisMonday);

  if (!result.ok) {
    const isMissing = /not found/i.test(result.error);
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Flow</h3>
        </header>
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Couldn&apos;t load Flow — {result.error}
          {isMissing
            ? ' Make sure the Flow app is writing to ~/Desktop/Flow-Stats.csv.'
            : ''}
        </p>
      </PanelChrome>
    );
  }

  const sessions = result.data;
  const buckets = useMemo(
    () => bucketByDayForWeek(sessions, weekStart),
    [sessions, weekStart],
  );
  const totalMinutes = buckets.reduce((acc, b) => acc + b.minutes, 0);
  const chartData = buckets.map((b, i) => ({
    label: WEEKDAY_LABELS[i] ?? '',
    minutes: Math.round(b.minutes),
  }));

  return (
    <PanelChrome>
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-lg text-[var(--ink)]">Flow</h3>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="cursor-pointer-always rounded p-1 hover:bg-[var(--surface-raised)]"
            aria-label="Previous week"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[14ch] text-center">
            {format(weekStart, 'MMM d')} — {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            disabled={!canGoNext}
            className="cursor-pointer-always rounded p-1 hover:bg-[var(--surface-raised)] disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          Total: <span className="text-[var(--ink)]">{formatHm(totalMinutes)}</span>
        </span>
      </header>

      {totalMinutes === 0 ? (
        <p className="font-serif text-sm text-[var(--ink-muted)]">
          No focused sessions this week.
        </p>
      ) : null}

      <div style={{ width: '100%', height: 200 }}>
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
              unit="m"
            />
            <Tooltip
              cursor={{ fill: 'rgba(124, 58, 237, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v) => [`${v}m`, 'focus'] as [string, string]}
            />
            <Bar dataKey="minutes" fill={ACCENT} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelChrome>
  );
}
