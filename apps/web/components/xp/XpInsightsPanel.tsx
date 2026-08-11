"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { XpOverview } from "@/lib/db/queries/xp";
import { MAX_LEVEL, levelFromXp, totalXpForLevel } from "@/lib/xp/levels";
import { XP_CATEGORY_META, type XpCategory } from "@/lib/xp/rules";
import { cn } from "@/lib/utils";
import { NEUMORPHIC_TILE } from "@/components/insights/tile-style";
import { StatTile, categoryColor, formatXp } from "./xp-ui";

/**
 * The XP tab on /insights.
 *
 * Four questions, four charts: how fast am I earning, what am I earning it
 * doing, when in the week do I actually do the work, and how far to the next
 * level. Everything is derived on the client from the same year-long ledger
 * the profile page already fetched, so switching the range pill costs nothing.
 *
 * recharts cannot resolve `var(--*)` in SVG fills or strokes, so series colours
 * are hex literals from XP_CATEGORY_META. Grid and axis chrome uses tokens,
 * which recharts passes straight through as presentation attributes and which
 * therefore do follow dark mode.
 */
const EDGE = "var(--edge)";
const INK_MUTED = "var(--ink-muted)";
const RANGES = [30, 90, 365] as const;
type Range = (typeof RANGES)[number];

const CATEGORIES = Object.keys(XP_CATEGORY_META) as XpCategory[];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function XpInsightsPanel({ data }: { data: XpOverview }) {
  const [range, setRange] = useState<Range>(90);

  const view = useMemo(() => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (range - 1));
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    // Fill the gaps. Days with no XP are meaningful — an area chart that skips
    // them would silently draw a flat line through a week off.
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    const series: { date: string; total: number; cumulative: number }[] = [];
    let running = 0;
    const cursor = new Date(cutoff);
    const today = new Date();
    while (cursor <= today) {
      const iso = cursor.toISOString().slice(0, 10);
      const total = byDate.get(iso)?.total ?? 0;
      running += total;
      series.push({ date: iso, total, cumulative: running });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const inRange = data.days.filter((d) => d.date >= cutoffISO);

    const byCategory = CATEGORIES.map((category) => ({
      category,
      label: XP_CATEGORY_META[category].label,
      value: inRange.reduce((sum, d) => sum + (d.byCategory[category] ?? 0), 0),
    })).filter((c) => c.value > 0);

    // Weekday rhythm, averaged so a 90-day window is comparable to a 30-day one.
    const dowTotals = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
    for (const d of series) {
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      dowTotals[dow].total += d.total;
      dowTotals[dow].days += 1;
    }
    const byDow = dowTotals.map((v, i) => ({
      day: DOW_LABELS[i],
      average: v.days > 0 ? Math.round(v.total / v.days) : 0,
    }));

    const earned = inRange.reduce((s, d) => s + d.total, 0);
    const activeDays = inRange.length;

    return {
      series,
      byCategory,
      byDow,
      earned,
      activeDays,
      perActiveDay: activeDays > 0 ? Math.round(earned / activeDays) : 0,
      perCalendarDay: Math.round(earned / range),
    };
  }, [data.days, range]);

  // How long the next level takes at the current pace. Honest about not
  // knowing: with no recent earning there is no answer worth showing.
  const daysToNextLevel =
    view.perCalendarDay > 0 && !data.progress.isMaxLevel
      ? Math.ceil(data.progress.xpRemaining / view.perCalendarDay)
      : null;

  const levelMilestones = useMemo(() => {
    const rows: { level: number; needed: number; reached: boolean }[] = [];
    for (let l = data.level; l <= Math.min(data.level + 5, MAX_LEVEL); l++) {
      rows.push({
        level: l,
        needed: Math.max(0, totalXpForLevel(l) - data.totalXp),
        reached: totalXpForLevel(l) <= data.totalXp,
      });
    }
    return rows;
  }, [data.level, data.totalXp]);

  if (data.totalXp === 0) {
    return (
      <div className={cn(NEUMORPHIC_TILE, "px-6 py-16 text-center")}>
        <p className="font-serif text-subtitle font-semibold text-[var(--ink)]">
          No XP yet.
        </p>
        <p className="mt-1.5 text-body text-[var(--ink-muted)]">
          Complete a task or tick off a habit and this fills in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="XP range"
          className="flex w-fit items-center gap-0.5 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 font-mono text-micro tabular-nums transition-colors duration-[var(--duration-micro,120ms)]",
                range === r
                  ? "bg-[var(--surface-raised)] text-[var(--ink)] shadow-[var(--shadow-card)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Earned (${range}d)`} value={formatXp(view.earned)} />
        <StatTile
          label="Per active day"
          value={formatXp(view.perActiveDay)}
          sub={`${view.activeDays} active days`}
        />
        <StatTile label="Daily average" value={formatXp(view.perCalendarDay)} sub="including days off" />
        <StatTile
          label="Next level"
          value={daysToNextLevel != null ? `~${daysToNextLevel}d` : "—"}
          sub={
            data.progress.isMaxLevel
              ? "you are capped"
              : daysToNextLevel != null
                ? "at your current pace"
                : "earn something to estimate"
          }
        />
      </section>

      <ChartCard title="XP per day" subtitle={`Daily total over the last ${range} days.`} height={240}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={view.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="xp-daily-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={EDGE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: EDGE }}
              minTickGap={28}
              tickFormatter={shortDate}
            />
            <YAxis
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={<XpTooltip suffix="XP" />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#38bdf8"
              strokeWidth={2}
              fill="url(#xp-daily-fill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Total XP over time"
          subtitle="The line that only goes up."
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={view.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="xp-cume-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={EDGE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: EDGE }}
                minTickGap={28}
                tickFormatter={shortDate}
              />
              <YAxis
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<XpTooltip suffix="XP total" />} />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#c084fc"
                strokeWidth={2}
                fill="url(#xp-cume-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="What earns it"
          subtitle="Share of XP by category in this window."
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={view.byCategory}
                dataKey="value"
                nameKey="label"
                innerRadius="52%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="none"
              >
                {view.byCategory.map((c) => (
                  <Cell key={c.category} fill={categoryColor(c.category)} />
                ))}
              </Pie>
              <Legend
                verticalAlign="middle"
                align="right"
                layout="vertical"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }}
              />
              <Tooltip content={<XpTooltip suffix="XP" />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ChartCard
          title="Your week"
          subtitle="Average XP by weekday. Where your real days are."
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view.byDow} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={EDGE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: EDGE }}
              />
              <YAxis
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<XpTooltip suffix="XP avg" />} cursor={{ fill: "var(--edge)", opacity: 0.4 }} />
              <Bar dataKey="average" fill="#2dd4bf" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className={cn(NEUMORPHIC_TILE, "p-6")}>
          <header className="mb-4">
            <h2 className="font-serif text-subtitle font-semibold tracking-tight text-[var(--ink)]">
              The road ahead
            </h2>
            <p className="mt-0.5 text-micro text-[var(--ink-muted)]">
              What the next five levels cost from here.
            </p>
          </header>
          <ul className="space-y-1">
            {levelMilestones.map((m) => {
              const eta =
                view.perCalendarDay > 0 && m.needed > 0
                  ? `~${Math.ceil(m.needed / view.perCalendarDay)}d`
                  : m.needed === 0
                    ? "reached"
                    : "—";
              const p = levelFromXp(totalXpForLevel(m.level));
              return (
                <li
                  key={m.level}
                  className="flex items-center gap-3 border-b border-[var(--edge)] py-2 last:border-0"
                >
                  <span className="w-14 font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                    Lv {m.level}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-[var(--ink)]">
                    {p.level === data.level ? "You are here" : `${formatXp(m.needed)} XP to go`}
                  </span>
                  <span className="shrink-0 font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                    {eta}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <ChartCard
        title="Top earners"
        subtitle="Which specific actions have paid the most, all time."
        height={Math.max(180, data.byKind.slice(0, 8).length * 34 + 20)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.byKind.slice(0, 8)}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 12 }}
          >
            <CartesianGrid stroke={EDGE} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: EDGE }}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <Tooltip content={<XpTooltip suffix="XP" />} cursor={{ fill: "var(--edge)", opacity: 0.4 }} />
            <Bar dataKey="total" radius={[0, 5, 5, 0]}>
              {data.byKind.slice(0, 8).map((k) => (
                <Cell key={k.kind} fill={categoryColor(k.category)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  height,
  children,
}: {
  title: string;
  subtitle?: string;
  height: number;
  children: React.ReactNode;
}) {
  return (
    // NEUMORPHIC_TILE is `.craft-card`, which paints its own plate — no bg-* here.
    <div className={cn(NEUMORPHIC_TILE, "p-6")}>
      <header className="mb-5">
        <h2 className="font-serif text-subtitle font-semibold tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-micro text-[var(--ink-muted)]">{subtitle}</p> : null}
      </header>
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

type TooltipPayload = { name?: string; value?: number; payload?: { date?: string } };

function XpTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  suffix: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const heading = entry.payload?.date ? shortDate(entry.payload.date) : String(entry.name ?? label ?? "");
  return (
    <div className="craft-glass-pop rounded-lg px-3 py-2">
      <p className="font-serif text-micro text-[var(--ink-muted)]">{heading}</p>
      <p className="font-mono text-body font-semibold tabular-nums text-[var(--ink)]">
        {(entry.value ?? 0).toLocaleString()} {suffix}
      </p>
    </div>
  );
}
