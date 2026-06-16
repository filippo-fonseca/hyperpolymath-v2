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
import type { AnthropicDailyUsage } from '@/lib/integrations/anthropic-api/usage';
import { NEUMORPHIC_TILE, glassyTileShadow } from '../tile-style';

// Recharts cannot resolve var(--*) at render time; literal hex per accent_constants.
// hud-cyan is the canonical JARVIS signature accent (oklch(72% 0.13 210)).
const ACCENT_HEX = '#22b8cf';
const ACCENT_VAR = 'var(--hud-cyan)';

interface Props {
  result: Result<AnthropicDailyUsage[]>;
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

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
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

export function AnthropicApiPanel({ result }: Props) {
  if (!result.ok) {
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Anthropic API</h3>
        </header>
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Couldn&apos;t load Anthropic API spend. {result.error}
        </p>
      </PanelChrome>
    );
  }

  const data = result.data;

  if (data.length === 0) {
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Anthropic API</h3>
        </header>
        <p className="font-serif text-sm text-[var(--ink-muted)]">
          No API spend recorded yet.
        </p>
      </PanelChrome>
    );
  }

  const totalCost = data.reduce((acc, d) => acc + d.costUsd, 0);
  const totalTokens = data.reduce((acc, d) => acc + d.totalTokens, 0);
  const spendDays = data.filter((d) => d.costUsd > 0).length;

  return (
    <PanelChrome>
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-lg text-[var(--ink)]">Anthropic API</h3>
        <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          <span>
            <span className="text-[var(--ink)]">{formatUsd(totalCost)}</span> spend
          </span>
          <span>
            <span className="text-[var(--ink)]">{formatTokens(totalTokens)}</span> tok
          </span>
          <span>
            <span className="text-[var(--ink)]">{spendDays}</span> days
          </span>
        </div>
      </header>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
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
              tickFormatter={(v) => formatUsd(Number(v))}
              tick={{ fontSize: 10, fill: '#7c7669' }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'rgba(34, 184, 207, 0.08)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--edge)',
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(v) => formatShortDate(String(v))}
              formatter={(v) => [formatUsd(Number(v)), 'spend'] as [string, string]}
            />
            <Bar dataKey="costUsd" fill={ACCENT_HEX} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelChrome>
  );
}
