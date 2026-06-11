"use client";

import {
  Area,
  AreaChart,
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
import type { InsightsData } from "@/lib/db/queries/insights";
import { NEUMORPHIC_TILE } from "./tile-style";

/**
 * Phase 7 arc-redesign — Insights charts refreshed to a softer dashboard
 * register inspired by modern productivity dashboards (Arc / Notion /
 * Linear). HUD vocabulary preserved through the cyan colour family; the
 * 1px corner-crop chrome is retired in favour of rounded-2xl cards with
 * subtle inset borders and ambient glow.
 *
 * Series fills use a vertical cyan → transparent gradient under each line
 * so the line reads as a "wave" against the card. Tooltip is a small
 * rounded card that floats above the curve (matches the reference's
 * "35 tasks Wed, 07" hover treatment).
 *
 * recharts SVG fills/strokes cannot resolve var(--*) at render time, so
 * the sRGB hex literals from UI-SPEC §3b OKLCH → sRGB are used directly.
 */
const HUD_CYAN = "#22d3ee";
const HUD_CYAN_DIM = "#0891b2";
const HUD_CYAN_SOFT = "#67e8f9";
const EDGE = "#d4cfc4";
const INK_MUTED = "#7c7669";

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
      className={`relative ${NEUMORPHIC_TILE} p-6 ${className}`}
    >
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
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

function tooltipBoxStyle() {
  return {
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in oklch, var(--edge-hud) 70%, transparent)",
    borderRadius: "10px",
    color: "var(--ink)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    padding: "8px 12px",
  } as React.CSSProperties;
}

interface Props {
  data: InsightsData;
}

export function InsightsCharts({ data }: Props) {
  const shouldReduce = useReducedMotion();
  const isAnimationActive = !shouldReduce;

  const errPct = data.errorRate.totalTurns
    ? `${(data.errorRate.rate * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="grid grid-cols-1 @lg/main:grid-cols-2 gap-6">
      {/* Chart 1 — ACTION DISTRIBUTION (full width on md+) */}
      <ChartPanel
        title="Action distribution"
        height={220}
        className="@lg/main:col-span-2"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.actionDist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="action-bar-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HUD_CYAN_SOFT} stopOpacity={0.85} />
                <stop offset="100%" stopColor={HUD_CYAN_DIM} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={EDGE}
              strokeDasharray="3 6"
              vertical={false}
              opacity={0.45}
            />
            <XAxis
              dataKey="type"
              tick={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fill: INK_MUTED,
              }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={tooltipBoxStyle()}
              cursor={{
                fill: "color-mix(in oklch, var(--hud-cyan) 8%, transparent)",
              }}
            />
            <Bar
              dataKey="count"
              fill="url(#action-bar-fill)"
              radius={[8, 8, 4, 4]}
              isAnimationActive={isAnimationActive}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Chart 2 — LATENCY P50/P95 */}
      <ChartPanel title="Latency  p50 / p95" height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.latencyByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="latency-p50-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HUD_CYAN} stopOpacity={0.35} />
                <stop offset="100%" stopColor={HUD_CYAN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={EDGE}
              strokeDasharray="3 6"
              vertical={false}
              opacity={0.45}
            />
            <XAxis
              dataKey="day"
              tick={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fill: INK_MUTED,
              }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={tooltipBoxStyle()}
              cursor={{ stroke: HUD_CYAN, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="p50"
              stroke={HUD_CYAN}
              strokeWidth={2}
              fill="url(#latency-p50-fill)"
              dot={false}
              activeDot={{ r: 5, fill: HUD_CYAN, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={isAnimationActive}
              animationDuration={900}
              animationEasing="ease-out"
              name="p50"
            />
            <Line
              type="monotone"
              dataKey="p95"
              stroke={HUD_CYAN_DIM}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: HUD_CYAN_DIM, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={isAnimationActive}
              animationDuration={900}
              animationEasing="ease-out"
              name="p95"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Chart 3 — ERROR RATE (big stat + smooth sparkline) */}
      <ChartPanel title="Error rate" subtitle={errPct} height={140}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.errorRate.sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="error-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HUD_CYAN_DIM} stopOpacity={0.4} />
                <stop offset="100%" stopColor={HUD_CYAN_DIM} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip contentStyle={tooltipBoxStyle()} cursor={false} />
            <Area
              type="monotone"
              dataKey="errors"
              stroke={HUD_CYAN_DIM}
              strokeWidth={2}
              fill="url(#error-spark-fill)"
              dot={false}
              isAnimationActive={isAnimationActive}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
