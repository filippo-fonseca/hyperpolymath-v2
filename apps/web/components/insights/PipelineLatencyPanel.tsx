"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PipelineLatencyStats } from "@/lib/db/queries/analytics";
import { EmptyState } from "@/components/ui/EmptyState";
import { Gauge } from "lucide-react";
import { NEUMORPHIC_TILE } from "./tile-style";

/**
 * Phase 9 / TEL-02 — Pipeline Latency panel (D-03/D-04).
 *
 * Horizontal stacked bar of per-stage p50 (composite "average turn") + per-stage
 * 7-day sparklines + p50/p95 toggle. Renders ABOVE the existing /insights tabs
 * per D-03 — non-regressive on Phase 6's charts; first thing the user sees on
 * the page so Phases 10-13 wins are immediately visible.
 *
 * recharts SVG strokes/fills require sRGB hex literals (var(--*) does not
 * resolve at chart render time — Phase 6 P04 D-08 / 06.1 P03 precedent).
 *
 * The empty-state copy is LOCKED per Plan 09-02 must_haves.truths:
 *   heading: "Eight stages, no signal yet."
 *   body:    'No voice turns recorded — say "hey jarvis" and the timeline lights up.'
 * (Renaissance / Garamond / dry — CONTEXT.md §specifics)
 */

// Chart chrome rides the theme token (recharts resolves var(--*) as an SVG
// presentation attribute); the stage colours below stay hex because they
// encode data, not chrome.
const EDGE = "var(--edge)";

// D-04 (Claude's Discretion): luminance ladder of --hud-cyan across the 8
// stages so the stacked bar reads as a single hue gradient. sRGB literals
// because recharts SVG can't resolve var(--*) at render time.
const STAGE_COLORS = [
  "#a5f3fc",
  "#67e8f9",
  "#22d3ee",
  "#0891b2",
  "#0e7490",
  "#155e75",
  "#164e63",
  "#0c4a6e",
];

interface Props {
  stats: PipelineLatencyStats;
}

export function PipelineLatencyPanel({ stats }: Props) {
  const [view, setView] = useState<"p50" | "p95">("p50");

  // Empty-state: no instrumented turns yet (post-migration-0017 fresh user
  // or fresh re-instrumentation). Copy LOCKED per must_haves.truths.
  if (stats.totalTurns === 0) {
    return (
      <section className={`${NEUMORPHIC_TILE} mb-8 p-6`}>
        <header className="mb-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-[var(--ink)]">
            Pipeline Latency
          </h2>
        </header>
        {/* Copy is LOCKED per Plan 09-02 must_haves.truths — only the chrome
            moves to the shared empty state on the insights hue. */}
        <EmptyState
          size="page"
          className="tint-sky"
          icon={<Gauge />}
          title="Eight stages, no signal yet."
          description={`No voice turns recorded — say "hey jarvis" and the timeline lights up.`}
        />
      </section>
    );
  }

  // Visible composite stages — drop the "overall" composite from the stacked
  // bar to avoid double-counting. Keep it as a headline number above the bar.
  const stackStages = stats.stages.filter(
    (s) => s.name !== "speech_end_to_audio_first_play",
  );
  const composite = stats.stages.find(
    (s) => s.name === "speech_end_to_audio_first_play",
  );

  // Stacked-bar data — one row, one column per stage segment. recharts stacks
  // Bars within a chart when each Bar shares a stackId.
  const stackedBarData = [
    stackStages.reduce<Record<string, number | string>>(
      (acc, s) => {
        acc[s.name] = view === "p50" ? s.p50Ms : s.p95Ms;
        return acc;
      },
      { name: "Average turn" },
    ),
  ];

  const headlineMs = composite
    ? view === "p50"
      ? composite.p50Ms
      : composite.p95Ms
    : 0;

  return (
    <section className={`${NEUMORPHIC_TILE} mb-8 p-6`}>
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-[var(--ink)]">
            Pipeline Latency
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] mt-1">
            {stats.voiceTurns} voice turns · {stats.totalTurns} total · rolling 24h
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {headlineMs > 0 ? `${headlineMs} ms` : "—"}
          </span>
          <ToggleSwitch view={view} setView={setView} />
        </div>
      </header>

      {/* Horizontal stacked bar — composite "where do the seconds go?" */}
      <div className="mb-6" style={{ height: 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stackedBarData}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-raised)",
                border: `1px solid ${EDGE}`,
                borderRadius: 12,
                boxShadow: "var(--shadow-pop)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              formatter={(value, name) => [`${value} ms`, String(name)]}
            />
            {stackStages.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                stackId="pipeline"
                fill={STAGE_COLORS[i % STAGE_COLORS.length]}
                name={s.label}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-stage sparklines — 7-day trend, one per visible stage */}
      <div className="grid grid-cols-2 @xl/main:grid-cols-4 gap-4">
        {stackStages.map((s, i) => (
          <StageSparkline
            key={s.name}
            stage={s}
            color={STAGE_COLORS[i % STAGE_COLORS.length]}
            view={view}
          />
        ))}
      </div>
    </section>
  );
}

function ToggleSwitch({
  view,
  setView,
}: {
  view: "p50" | "p95";
  setView: (v: "p50" | "p95") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Percentile view"
      className="flex items-center gap-0.5 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-0.5"
    >
      {(["p50", "p95"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => setView(v)}
          // Craft segmented control: a raised plate on a recessed track.
          className={`cursor-pointer rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-[background-color,color,box-shadow] duration-[160ms] ease-out ${
            view === v
              ? "bg-[var(--surface-raised)] font-medium text-[var(--ink)] shadow-[var(--shadow-card)]"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function StageSparkline({
  stage,
  color,
  view,
}: {
  stage: PipelineLatencyStats["stages"][number];
  color: string;
  view: "p50" | "p95";
}) {
  const currentMs = view === "p50" ? stage.p50Ms : stage.p95Ms;
  const data = stage.sparkline.map((d) => ({
    date: d.date,
    ms: view === "p50" ? d.p50Ms : d.p95Ms,
  }));
  return (
    // Craft mini-plate: the retired neumorphic bloom becomes a raised white
    // card on the shadow ladder. `.craft-card` is unlayered, so no `bg-*`
    // utility rides along; the stage hue survives as a saturated dot.
    <div className="craft-card rounded-xl p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{stage.label}</span>
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {currentMs > 0 ? `${currentMs}` : "—"}
          {currentMs > 0 ? (
            <span className="text-[10px] text-[var(--ink-muted)] ml-0.5">ms</span>
          ) : null}
        </span>
      </div>
      <div style={{ height: 28 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="ms"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
