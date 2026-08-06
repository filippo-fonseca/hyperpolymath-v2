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
import { CHART, DevEmpty, DevPanel, DevPanelHeader } from './dev-chrome';

/**
 * Anthropic API usage panel (issue #133), sd console register.
 *
 * Surfaces the three asks: token consumption (input/output), request counts,
 * and usage trends over time with a daily/weekly/monthly granularity toggle.
 * All cost + token data comes from `getAnthropicApiUsage`'s
 * AnthropicDailyUsage[] contract; request counts come from the optional
 * `requests` prop (the trends.ts Usage Report helper), which degrades quietly
 * when no admin key is configured.
 *
 * Sensitive: never renders any key. The empty state points the user to Settings
 * to connect their Anthropic admin key — no key, no fallback, nothing leaked.
 * This panel is the known-inert one until an admin key is set; its empty state
 * stays calm rather than alarming.
 *
 * Chart strokes/fills use `var(--sd-*)` tokens (recharts resolves them as SVG
 * presentation attributes), so the bars read correctly in BOTH themes — cyan is
 * the primary spend series.
 */

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

/** Inline mono readout: value in ink, label after — the panel's headline totals. */
function Total({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span className="text-[var(--sd-ink)]">{value}</span> {label}
    </span>
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
      <DevPanel>
        <DevPanelHeader eyebrow="Anthropic API" />
        <div className="mt-3">
          {looksLikeMissingKey ? (
            <DevEmpty
              heading="Admin key not connected"
              body="Connect your Anthropic admin key in Settings to see API token usage, request counts, and spend trends."
            />
          ) : (
            <p className="font-mono text-xs text-[var(--sd-ink-faint)]">
              Couldn&apos;t load Anthropic API usage. {result.error}
            </p>
          )}
        </div>
      </DevPanel>
    );
  }

  if (usage.length === 0) {
    return (
      <DevPanel>
        <DevPanelHeader eyebrow="Anthropic API" />
        <div className="mt-3">
          <DevEmpty heading="No API usage recorded yet" />
        </div>
      </DevPanel>
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
    <DevPanel>
      <DevPanelHeader
        eyebrow="Anthropic API"
        right={
          <div className="flex items-baseline gap-4 text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
            <Total value={formatUsd(totalCost)} label="spend" />
            <Total value={formatTokens(totalInput)} label="in" />
            <Total value={formatTokens(totalOutput)} label="out" />
            {hasRequestData ? (
              <Total value={formatCount(totalRequests)} label="req" />
            ) : (
              <span title="Total tokens across input, output, and cache">
                <Total value={formatTokens(totalTokens)} label="tok" />
              </span>
            )}
          </div>
        }
      />

      {/* Controls: what to plot (left) + how to bucket time (right). */}
      <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-2">
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
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={CHART.grid}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="key"
              tickFormatter={(v) => formatBucketLabel(String(v), granularity)}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tick={{ fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={(v) => active.fmt(Number(v))}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tick={{ fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--sd-accent) 10%, transparent)' }}
              contentStyle={CHART.tooltip}
              labelFormatter={(v) => formatBucketLabel(String(v), granularity)}
              formatter={(v) =>
                [active.fmt(Number(v)), active.label] as [string, string]
              }
            />
            <Bar
              dataKey={active.dataKey as string}
              fill={CHART.accent}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* When the request-count source is unavailable, say so quietly rather
          than silently dropping a requested metric. */}
      {requests && !requests.ok ? (
        <p className="mt-3 text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
          Request counts unavailable — {requests.error}
        </p>
      ) : null}
    </DevPanel>
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
      className="flex items-center gap-0.5 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-0.5"
    >
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          data-active={value === v || undefined}
          onClick={() => onChange(v)}
          className="craft-chip cursor-pointer-always"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
