"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { Card } from "@/components/ui/card";
import type { InsightsData } from "@/lib/db/queries/insights";

/**
 * Phase 6 Plan 06-04: 3-chart client component (RES-06, UI-SPEC §8e).
 *
 * recharts 3.8.1 ResponsiveContainer requires explicit height on parent
 * (RESEARCH §6 Pitfall 4). Each chart wraps in a fixed-height div.
 *
 * Agent-mode tokens — bars + lines use --color-accent-jarvis (#00d4ff).
 * isAnimationActive disabled under prefers-reduced-motion (UI-SPEC §11d).
 *
 * Card wrappers carry shadow-nm-surface (neumorphic) + agent-glow-passive
 * (passive JARVIS-blue halo) per UI-SPEC §7e and §8e.
 */
const JARVIS_BLUE = "#00d4ff";
const JARVIS_BLUE_FADED = "rgba(0, 212, 255, 0.5)";

interface Props {
  data: InsightsData;
}

export function InsightsCharts({ data }: Props) {
  const shouldReduce = useReducedMotion();
  const isAnimationActive = !shouldReduce;

  const errPct = (data.errorRate.rate * 100).toFixed(1);
  const errBad = data.errorRate.rate > 0.05;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Chart 1: Action Distribution (UI-SPEC §8e) */}
      <Card
        className="p-6 gap-4 md:col-span-2 agent-glow-passive"
        style={{ boxShadow: "var(--shadow-nm-surface)", border: "none" }}
      >
        <h2 className="text-2xl font-serif font-semibold">
          Action Distribution
        </h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.actionDist}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="type"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Bar
                dataKey="count"
                fill={JARVIS_BLUE}
                fillOpacity={0.7}
                isAnimationActive={isAnimationActive}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Chart 2: Latency (p50/p95 by day) */}
      <Card
        className="p-6 gap-4 agent-glow-passive"
        style={{ boxShadow: "var(--shadow-nm-surface)", border: "none" }}
      >
        <h2 className="text-2xl font-serif font-semibold">Latency</h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.latencyByDay}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="day"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
              />
              <Tooltip
                contentStyle={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={JARVIS_BLUE}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={isAnimationActive}
                name="p50 (ms)"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="p95"
                stroke={JARVIS_BLUE_FADED}
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 3 }}
                isAnimationActive={isAnimationActive}
                name="p95 (ms)"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Chart 3: Error Rate (number + sparkline) */}
      <Card
        className="p-6 gap-4 agent-glow-passive"
        style={{ boxShadow: "var(--shadow-nm-surface)", border: "none" }}
      >
        <h2 className="text-2xl font-serif font-semibold">Error Rate</h2>
        <div className="space-y-3">
          <p
            className="text-4xl font-serif font-semibold"
            style={{
              color: errBad
                ? "var(--color-destructive)"
                : "var(--color-accent-jarvis)",
            }}
          >
            {errPct}%
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            {data.errorRate.errorTurns} errors / {data.errorRate.totalTurns}{" "}
            turns
          </p>
          <div className="h-[60px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.errorRate.sparkline}>
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke={errBad ? "var(--color-destructive)" : JARVIS_BLUE}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={isAnimationActive}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
}
