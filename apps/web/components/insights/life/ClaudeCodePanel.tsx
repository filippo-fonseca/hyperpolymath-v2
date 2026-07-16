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
import {
  CHART,
  DevEmpty,
  DevPanel,
  DevPanelHeader,
} from '../development/dev-chrome';

/**
 * Daily Claude Code token consumption (owner-only DEVELOPMENT tab). The series
 * rides the functional amber ink to read as a distinct spend source next to the
 * cyan Anthropic API panel. Chart tokens are `var(--sd-*)` so it resolves in
 * BOTH themes (recharts reads them as SVG presentation attributes) — see the
 * nutrition MacroTrendChart exemplar.
 */

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

export function ClaudeCodePanel({ result }: Props) {
  if (!result.ok) {
    const msg = /not found on this host/i.test(result.error)
      ? "Claude Code session data isn't available here."
      : `Couldn't load Claude Code data — ${result.error}`;
    return (
      <DevPanel>
        <DevPanelHeader eyebrow="Claude Code · daily tokens" />
        <p className="mt-3 font-mono text-xs text-[var(--sd-ink-faint)]">
          {msg}
        </p>
      </DevPanel>
    );
  }

  const data = result.data;

  if (data.length === 0) {
    return (
      <DevPanel>
        <DevPanelHeader eyebrow="Claude Code · daily tokens" />
        <div className="mt-3">
          <DevEmpty heading="Seven days of silence" />
        </div>
      </DevPanel>
    );
  }

  const totalTokens = data.reduce((acc, d) => acc + d.totalTokens, 0);
  const hasCost = data.some((d) => d.costUsd != null);
  const totalCost = hasCost
    ? data.reduce((acc, d) => acc + (d.costUsd ?? 0), 0)
    : null;
  const sessionDays = data.filter((d) => d.totalTokens > 0).length;

  return (
    <DevPanel>
      <DevPanelHeader
        eyebrow="Claude Code · daily tokens"
        right={
          <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
            <span>
              <span className="text-[var(--sd-ink)] tabular-nums">
                {formatTokens(totalTokens)}
              </span>{' '}
              tok
            </span>
            {totalCost != null ? (
              <span>
                <span className="text-[var(--sd-ink)] tabular-nums">
                  ${totalCost.toFixed(2)}
                </span>{' '}
                cost
              </span>
            ) : null}
            <span>
              <span className="text-[var(--sd-ink)] tabular-nums">
                {sessionDays}
              </span>{' '}
              days
            </span>
          </div>
        }
      />
      <div className="mt-4" style={{ height: 200 }}>
        {/* Explicit width/height: recharts 3's ResponsiveContainer can measure
            its parent at 0px on the first paint inside a spanning grid cell
            (this panel sits in @2xl/main:col-span-2), leaving the bar chart
            blank. Passing 100%/100% makes the dimensions deterministic. */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={CHART.grid}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tick={{ fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={formatTokens}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tick={{ fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--ink-amber) 10%, transparent)' }}
              contentStyle={CHART.tooltip}
              labelFormatter={(v) => formatShortDate(String(v))}
              formatter={(v) =>
                [formatTokens(Number(v)), 'tokens'] as [string, string]
              }
            />
            <Bar
              dataKey="totalTokens"
              fill={CHART.amber}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DevPanel>
  );
}
