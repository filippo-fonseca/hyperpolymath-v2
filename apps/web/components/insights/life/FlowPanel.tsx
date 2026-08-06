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
import { FlowUploadButton } from './FlowUploadButton';
import { INSIGHTS_PANEL } from '../tile-style';

const ACCENT = '#7c3aed'; // violet-600
// const ACCENT_DIM = '#5b21b6';
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  result: Result<Session[]>;
}

function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

/**
 * Craft panel plate. `.craft-card` (via INSIGHTS_PANEL) paints the fill,
 * hairline and shadow, so no `bg-*` utility and no inline boxShadow may ride
 * on this element — unlayered CSS would win over the utility anyway and an
 * inline shadow would erase the ladder.
 *
 * Flow's violet is the panel's identity: it stays saturated on the header dot
 * and the bars, never on a fill.
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

/** Saturated identity dot — the one place the brand hue runs at full strength. */
function AccentDot() {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: 'var(--panel-accent)' }}
    />
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
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
 <h3 className="flex items-center gap-2 font-serif text-subtitle text-[var(--ink)]">
            <AccentDot />
            Flow
          </h3>
          <FlowUploadButton />
        </header>
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Couldn&apos;t load Flow — {result.error}
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
        <div className="flex items-baseline gap-3">
 <h3 className="flex items-center gap-2 font-serif text-subtitle text-[var(--ink)]">
            <AccentDot />
            Flow
          </h3>
          <FlowUploadButton />
        </div>
        <div className="flex items-center gap-2 text-micro tracking-[0.06em] text-[var(--ink-muted)]">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="cursor-pointer-always rounded-lg p-1 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
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
            className="cursor-pointer-always rounded-lg p-1 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <span className="text-micro tracking-[0.06em] text-[var(--ink-muted)]">
          Total: <span className="text-[var(--ink)]">{formatHm(totalMinutes)}</span>
        </span>
      </header>

      {totalMinutes === 0 ? (
        <p className="font-serif text-meta text-[var(--ink-muted)]">
          No focused sessions this week.
        </p>
      ) : null}

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {/* recharts resolves CSS custom properties as SVG presentation
                attributes, so tokens keep the chart correct in both themes. */}
            <CartesianGrid stroke="var(--edge)" strokeDasharray="2 4" vertical={false} />
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
              unit="m"
            />
            <Tooltip
              cursor={{ fill: 'rgba(124, 58, 237, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 12,
                boxShadow: 'var(--shadow-pop)',
                fontSize: 11,
              }}
              formatter={(v) => [`${v}m`, 'focus'] as [string, string]}
            />
            <Bar dataKey="minutes" fill={ACCENT} radius={[5, 5, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelChrome>
  );
}
