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
import type { Result } from '@/lib/integrations/result';
import type { AnthropicDailyUsage } from '@/lib/integrations/anthropic-api/usage';
import type { AnthropicDailyRequests } from '@/lib/integrations/anthropic-api/trends';
import { NEUMORPHIC_TILE, glassyTileShadow } from '../tile-style';

/**
 * Anthropic API usage panel (issue #133).
 *
 * Surfaces the three asks: token consumption (input/output), request counts,
 * and usage trends over time with a daily/weekly/monthly granularity toggle.
 * All cost + token data comes from `getAnthropicApiUsage`'s
 * AnthropicDailyUsage[] contract; request counts come from the optional
 * `requests` prop (the trends.ts Usage Report helper), which degrades quietly
 * when no admin key is configured.
 *
 * Sensitive: never renders any key. The empty state points the user to
 * Settings to connect their Anthropic admin key — no key, no fallback, nothing
 * leaked.
 *
 * recharts cannot resolve var(--*) at render time, so chart strokes/fills use
 * sRGB hex literals; hud-cyan (#22b8cf) is the canonical JARVIS accent. Per
 * project convention (and to avoid a known blank-render bug in spanning grid
 * cells), ResponsiveContainer is always given explicit width/height.
 */

const ACCENT_HEX = '#22b8cf';
const ACCENT_VAR = 'var(--hud-cyan)';
const EDGE = '#d4cfc4';
const INK_MUTED = '#7c7669';

type Granularity = 'daily' | 'weekly' | 'monthly';
type Metric = 'cost' | 'tokens' | 'requests';

interface Props {
  result: Result<AnthropicDailyUsage[]>;
  /**
   * Optional per-day request counts (issue #133). When omitted, errored, or
   * empty, the panel hides the request-count surfaces and still renders cost +
   * token trends. Decoupled from `result` so the panel never hard-depends on
   * the Usage Report API being reachable.
   */
  requests?: Result<AnthropicDailyRequests[]>;
}

const MONTH_NAMES = [
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

function formatShortDate(d: string): string {
  // d: YYYY-MM-DD
  const [, m, day] = d.split('-');
  const mi = Number(m) - 1;
  return `${MONTH_NAMES[mi] ?? m} ${Number(day)}`;
}

function formatBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'monthly') {
    // key: YYYY-MM
    const [, m] = key.split('-');
    const mi = Number(m) - 1;
    return MONTH_NAMES[mi] ?? key;
  }
  // daily / weekly buckets are keyed by a YYYY-MM-DD anchor date.
  return formatShortDate(key);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ISO-week anchor: Monday of the week containing `date`, as YYYY-MM-DD (UTC).
function weekAnchor(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
  const delta = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
}

interface ChartRow {
  key: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

/**
 * Roll the daily series up into the chosen granularity. Daily passes through;
 * weekly buckets by ISO-week Monday; monthly by YYYY-MM. Request counts are
 * joined in by date from the (optional) requests series.
 */
function bucketByGranularity(
  usage: AnthropicDailyUsage[],
  requestsByDate: Map<string, number>,
  granularity: Granularity,
): ChartRow[] {
  const byKey = new Map<string, ChartRow>();
  for (const d of usage) {
    const key =
      granularity === 'daily'
        ? d.date
        : granularity === 'weekly'
          ? weekAnchor(d.date)
          : d.date.slice(0, 7); // YYYY-MM
    const requestCount = requestsByDate.get(d.date) ?? 0;
    const existing = byKey.get(key) ?? {
      key,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requestCount: 0,
    };
    existing.costUsd += d.costUsd;
    existing.inputTokens += d.inputTokens;
    existing.outputTokens += d.outputTokens;
    existing.totalTokens += d.totalTokens;
    existing.requestCount += requestCount;
    byKey.set(key, existing);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
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

function PanelHeading({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mb-2 flex items-baseline justify-between">
      <h3 className="font-serif text-lg text-[var(--ink)]">Anthropic API</h3>
      {children}
    </header>
  );
}

export function AnthropicApiPanel({ result, requests }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [metric, setMetric] = useState<Metric>('cost');

  const usage = result.ok ? result.data : [];
  const requestSeries = requests?.ok ? requests.data : [];
  const hasRequestData = requestSeries.length > 0;

  const requestsByDate = useMemo(
    () => new Map(requestSeries.map((r) => [r.date, r.requestCount])),
    [requestSeries],
  );

  const rows = useMemo(
    () => bucketByGranularity(usage, requestsByDate, granularity),
    [usage, requestsByDate, granularity],
  );

  // ── Error / empty states ────────────────────────────────────────────────
  if (!result.ok) {
    const looksLikeMissingKey = /key|configured|sign|admin/i.test(result.error);
    return (
      <PanelChrome>
        <PanelHeading />
        {looksLikeMissingKey ? (
          <p className="font-serif text-sm text-[var(--ink-muted)]">
            Connect your Anthropic admin key in{' '}
            <span className="font-mono text-[var(--ink)]">Settings</span> to see
            API token usage, request counts, and spend trends.
          </p>
        ) : (
          <p className="font-mono text-xs text-[var(--ink-muted)]">
            Couldn&apos;t load Anthropic API usage. {result.error}
          </p>
        )}
      </PanelChrome>
    );
  }

  if (usage.length === 0) {
    return (
      <PanelChrome>
        <PanelHeading />
        <p className="font-serif text-sm text-[var(--ink-muted)]">
          No API usage recorded yet.
        </p>
      </PanelChrome>
    );
  }

  // ── Headline totals ─────────────────────────────────────────────────────
  const totalCost = usage.reduce((acc, d) => acc + d.costUsd, 0);
  const totalInput = usage.reduce((acc, d) => acc + d.inputTokens, 0);
  const totalOutput = usage.reduce((acc, d) => acc + d.outputTokens, 0);
  const totalTokens = usage.reduce((acc, d) => acc + d.totalTokens, 0);
  const totalRequests = requestSeries.reduce(
    (acc, r) => acc + r.requestCount,
    0,
  );

  // Coerce metric to a renderable one: hide "requests" mode when there's no
  // request data so the toggle never strands on an empty chart.
  const activeMetric: Metric =
    metric === 'requests' && !hasRequestData ? 'cost' : metric;

  const metricMeta: Record<
    Metric,
    { dataKey: keyof ChartRow; label: string; fmt: (n: number) => string }
  > = {
    cost: { dataKey: 'costUsd', label: 'spend', fmt: formatUsd },
    tokens: { dataKey: 'totalTokens', label: 'tokens', fmt: formatTokens },
    requests: { dataKey: 'requestCount', label: 'requests', fmt: formatCount },
  };
  const active = metricMeta[activeMetric];

  return (
    <PanelChrome>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-y-2">
        <h3 className="font-serif text-lg text-[var(--ink)]">Anthropic API</h3>
        <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          <span>
            <span className="text-[var(--ink)]">{formatUsd(totalCost)}</span>{' '}
            spend
          </span>
          <span>
            <span className="text-[var(--ink)]">{formatTokens(totalInput)}</span>{' '}
            in
          </span>
          <span>
            <span className="text-[var(--ink)]">
              {formatTokens(totalOutput)}
            </span>{' '}
            out
          </span>
          {hasRequestData ? (
            <span>
              <span className="text-[var(--ink)]">
                {formatCount(totalRequests)}
              </span>{' '}
              req
            </span>
          ) : (
            <span title="Total tokens across input, output, and cache">
              <span className="text-[var(--ink)]">
                {formatTokens(totalTokens)}
              </span>{' '}
              tok
            </span>
          )}
        </div>
      </header>

      {/* Controls: what to plot (left) + how to bucket time (right). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          ariaLabel="Metric"
          value={activeMetric}
          onChange={setMetric}
          options={
            hasRequestData
              ? ([
                  ['cost', 'Cost'],
                  ['tokens', 'Tokens'],
                  ['requests', 'Requests'],
                ] as const)
              : ([
                  ['cost', 'Cost'],
                  ['tokens', 'Tokens'],
                ] as const)
          }
        />
        <SegmentedControl
          ariaLabel="Trend granularity"
          value={granularity}
          onChange={setGranularity}
          options={
            [
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
              ['monthly', 'Monthly'],
            ] as const
          }
        />
      </div>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke={EDGE}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="key"
              tickFormatter={(v) => formatBucketLabel(String(v), granularity)}
              tick={{ fontSize: 10, fill: INK_MUTED }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={(v) => active.fmt(Number(v))}
              tick={{ fontSize: 10, fill: INK_MUTED }}
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
              labelFormatter={(v) =>
                formatBucketLabel(String(v), granularity)
              }
              formatter={(v) =>
                [active.fmt(Number(v)), active.label] as [string, string]
              }
            />
            <Bar
              dataKey={active.dataKey as string}
              fill={ACCENT_HEX}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* When the request-count source is unavailable, say so quietly rather
          than silently dropping a requested metric. */}
      {requests && !requests.ok ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          Request counts unavailable — {requests.error}
        </p>
      ) : null}
    </PanelChrome>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)]"
    >
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer transition-colors ${
            value === v
              ? 'bg-[var(--hud-cyan)]/15 text-[var(--ink)] ring-1 ring-inset ring-[var(--hud-cyan)]/40'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
