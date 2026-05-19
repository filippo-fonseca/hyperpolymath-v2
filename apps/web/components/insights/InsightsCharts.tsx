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
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
import type { InsightsData } from "@/lib/db/queries/insights";

/**
 * Phase 6.1 Plan 06.1-03: rebuilt /insights chart panels (UI-SPEC §5b).
 *
 * Each panel: --surface background, 1px --edge-hud border, 4 static
 * corner L-brackets (8px legs), ambient --hud-cyan-glow-soft shadow,
 * mono 11px uppercase title. Series strokes use the HUD cyan family.
 *
 * recharts SVG fills/strokes cannot resolve var(--*) at render time,
 * so we use the sRGB hex literals from UI-SPEC §3b OKLCH → sRGB mapping
 * (HUD_CYAN = #22d3ee, HUD_CYAN_DIM = #0891b2, EDGE = #d4cfc4).
 *
 * Reduced-motion gating: useReducedMotion() drives isAnimationActive on
 * every series so the 800ms stroke draw-in is suppressed (UI-SPEC §11c).
 *
 * The Phase 6 neumorphic shadow + passive-halo utility class are fully
 * retired — chrome is now corner crops + 1px border + ambient glow.
 */
const HUD_CYAN = "#22d3ee";
const HUD_CYAN_DIM = "#0891b2";
const EDGE = "#d4cfc4";

interface ChartPanelProps {
  title: string;
  subtitle?: string;
  height: number;
  className?: string;
  children: React.ReactNode;
}

function ChartPanel({
  title,
  subtitle,
  height,
  className = "",
  children,
}: ChartPanelProps) {
  return (
    <div
      className={`relative bg-[var(--surface)] p-6 ${className}`}
      style={{
        border: "1px solid var(--edge-hud)",
        boxShadow: "0 0 24px var(--hud-cyan-glow-soft)",
      }}
    >
      <HudCornerCrops
        size={8}
        breathing={false}
        className="absolute inset-0 pointer-events-none"
      />
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink)]">
            {subtitle}
          </p>
        ) : null}
      </header>
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  );
}

interface Props {
  data: InsightsData;
}

export function InsightsCharts({ data }: Props) {
  const shouldReduce = useReducedMotion();
  const isAnimationActive = !shouldReduce;

  const errPct = data.errorRate.totalTurns
    ? (data.errorRate.rate * 100).toFixed(1)
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Chart 1 — ACTION DISTRIBUTION (full width on md+) */}
      <ChartPanel
        title="ACTION DISTRIBUTION"
        height={200}
        className="md:col-span-2"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.actionDist}>
            <CartesianGrid
              stroke={EDGE}
              strokeDasharray="2 2"
              vertical={false}
            />
            <XAxis
              dataKey="type"
              tick={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fill: "var(--ink-muted)",
              }}
              axisLine={{ stroke: EDGE }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--surface-raised)",
                border: "1px solid var(--edge-hud)",
                color: "var(--ink)",
              }}
              cursor={{ fill: "var(--hud-cyan-glow-soft)" }}
            />
            <Bar
              dataKey="count"
              fill={HUD_CYAN}
              isAnimationActive={isAnimationActive}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Chart 2 — LATENCY P50/P95 */}
      <ChartPanel title="LATENCY  P50/P95" height={200}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.latencyByDay}>
            <CartesianGrid
              stroke={EDGE}
              strokeDasharray="2 2"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fill: "var(--ink-muted)",
              }}
              axisLine={{ stroke: EDGE }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--surface-raised)",
                border: "1px solid var(--edge-hud)",
                color: "var(--ink)",
              }}
              cursor={{ stroke: HUD_CYAN_DIM, strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke={HUD_CYAN}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={isAnimationActive}
              animationDuration={800}
              animationEasing="ease-out"
              name="p50"
            />
            <Line
              type="monotone"
              dataKey="p95"
              stroke={HUD_CYAN_DIM}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              connectNulls
              isAnimationActive={isAnimationActive}
              animationDuration={800}
              animationEasing="ease-out"
              name="p95"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Chart 3 — ERROR RATE (large mono readout + sparkline) */}
      <ChartPanel
        title="ERROR RATE"
        subtitle={errPct ? `${errPct}%` : "—"}
        height={120}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.errorRate.sparkline}>
            <Line
              type="monotone"
              dataKey="errors"
              stroke={HUD_CYAN_DIM}
              strokeWidth={1}
              dot={false}
              isAnimationActive={isAnimationActive}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
