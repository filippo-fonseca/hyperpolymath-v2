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
import type { DailyUsage } from '@/lib/integrations/claude-code/usage';
import { NEUMORPHIC_TILE, glassyTileShadow } from '../tile-style';

// Recharts cannot resolve var(--*) at render time; literal hex per accent_constants.
const ACCENT_HEX = '#d97706'; // ~ var(--ink-amber)
const ACCENT_VAR = 'var(--ink-amber)';

interface Props {
  result: Result<DailyUsage[]>;
}

function formatShortDate(d: string): string {
  // d: YYYY-MM-DD
  const [, m, day] = d.split('-');
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
  const mi = Number(m) - 1;
  return `${monthNames[mi] ?? m} ${Number(day)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <section
      className={`group ${NEUMORPHIC_TILE} p-6`}
      style={
        {
          ['--panel-accent']: ACCENT_VAR,
          boxShadow: glassyTileShadow({ withPanelAccentHalo: true }),
        } as React.CSSProperties
      }
    >
      {children}
    </section>
  );
}

export function ClaudeCodePanel({ result }: Props) {
  if (!result.ok) {
    const msg = /not found on this host/i.test(result.error)
      ? "Claude Code session data isn't available here."
      : `Couldn't load Claude Code data — ${result.error}`;
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        </header>
        <p className="font-mono text-xs text-[var(--ink-muted)]">{msg}</p>
      </PanelChrome>
    );
  }

  const data = result.data;

  if (data.length === 0) {
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        </header>
        <p className="font-serif text-sm text-[var(--ink-muted)]">
          Seven days of silence.
        </p>
      </PanelChrome>
    );
  }

  const totalTokens = data.reduce((acc, d) => acc + d.totalTokens, 0);
  const hasCost = data.some((d) => d.costUsd != null);
  const totalCost = hasCost
    ? data.reduce((acc, d) => acc + (d.costUsd ?? 0), 0)
    : null;
  const sessionDays = data.filter((d) => d.totalTokens > 0).length;

  return (
    <PanelChrome>
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          <span>
            <span className="text-[var(--ink)]">{formatTokens(totalTokens)}</span>{' '}
            tok
          </span>
          {totalCost != null ? (
            <span>
              <span className="text-[var(--ink)]">${totalCost.toFixed(2)}</span>{' '}
              cost
            </span>
          ) : null}
          <span>
            <span className="text-[var(--ink)]">{sessionDays}</span> days
          </span>
        </div>
      </header>
      <div style={{ height: 200 }}>
        {/* Explicit width/height: recharts 3's ResponsiveContainer can measure
            its parent at 0px on the first paint inside a spanning grid cell
            (this panel sits in @2xl/main:col-span-2), leaving the bar chart
            blank. Passing 100%/100% matches InsightsCharts / PipelineLatencyPanel
            and makes the dimensions deterministic. */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#d4cfc4" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10, fill: '#7c7669' }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={formatTokens}
              tick={{ fontSize: 10, fill: '#7c7669' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'rgba(217, 119, 6, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(v) => formatShortDate(String(v))}
              formatter={(v) => [formatTokens(Number(v)), 'tokens'] as [string, string]}
            />
            <Bar dataKey="totalTokens" fill={ACCENT_HEX} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelChrome>
  );
}
