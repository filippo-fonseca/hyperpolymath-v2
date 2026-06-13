"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyMacros } from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// MacroTrendChart — 7-day macro trend, three academic ink lines
// protein = ink-sage, carbs = ink-amber, fat = ink-coral
// ---------------------------------------------------------------------------

const tickFormatter = (d: string) => format(parseISO(d), "EEE");

interface MacroTrendChartProps {
  data: DailyMacros[];
}

export function MacroTrendChart({ data }: MacroTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatter}
          style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}
          tick={{ fill: "var(--ink-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}
          tick={{ fill: "var(--ink-muted)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--edge)",
            borderRadius: 8,
            color: "var(--ink)",
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
          stroke="var(--ink-sage)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "var(--ink-sage)" }}
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
  );
}
