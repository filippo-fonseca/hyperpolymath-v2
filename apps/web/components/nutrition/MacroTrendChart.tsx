"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyMacros } from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// MacroTrendChart — 7-day macro trend, sd register.
// protein = --sd-accent (cyan primary series), carbs = --ink-amber,
// fat = --ink-coral (functional). 1px --sd-line grid, mono axis labels.
// ---------------------------------------------------------------------------

const tickFormatter = (d: string) => format(parseISO(d), "EEE");

// Legend chips mirror the three plotted series 1:1 (same tokens as the <Line>
// strokes below), so the colour → macro mapping is legible without hovering.
const TREND_SERIES = [
  { label: "Protein", color: "var(--sd-accent)" },
  { label: "Carbs", color: "var(--ink-amber)" },
  { label: "Fat", color: "var(--ink-coral)" },
] as const;

interface MacroTrendChartProps {
  data: DailyMacros[];
}

export function MacroTrendChart({ data }: MacroTrendChartProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid stroke="var(--sd-line)" strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatter}
          style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}
          tick={{ fill: "var(--sd-ink-faint)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}
          tick={{ fill: "var(--sd-ink-faint)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            backgroundColor: "var(--sd-box)",
            border: "1px solid var(--sd-line)",
            borderRadius: 8,
            color: "var(--sd-ink)",
          }}
          labelFormatter={(label) =>
            typeof label === "string" ? format(parseISO(label), "EEE, MMM d") : String(label)
          }
          formatter={(value, name) => {
            const labels: Record<string, string> = {
              proteinG: "Protein",
              carbsG: "Carbs",
              fatG: "Fat",
            };
            return [`${value}g`, labels[String(name)] ?? String(name)];
          }}
        />
        <Line
          type="monotone"
          dataKey="proteinG"
          stroke="var(--sd-accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "var(--sd-accent)" }}
        />
        <Line
          type="monotone"
          dataKey="carbsG"
          stroke="var(--ink-amber)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "var(--ink-amber)" }}
        />
        <Line
          type="monotone"
          dataKey="fatG"
          stroke="var(--ink-coral)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "var(--ink-coral)" }}
        />
      </LineChart>
    </ResponsiveContainer>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-1">
        {TREND_SERIES.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[3px] w-3.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
