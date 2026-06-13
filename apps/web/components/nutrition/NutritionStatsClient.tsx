"use client";

import { NutritionHeatMap } from "@/components/nutrition/NutritionHeatMap";
import { MacroTrendChart } from "@/components/nutrition/MacroTrendChart";
import { PersonalBestsStrip } from "@/components/nutrition/PersonalBestsStrip";
import type {
  DailyAdherence,
  DailyMacros,
} from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// NutritionStatsClient — client island for the /nutrition/stats route
//
// Three sections per UI-SPEC Stats Page Contract:
//   1. LOGGING HISTORY  — NutritionHeatMap
//   2. 7-DAY MACRO TREND — MacroTrendChart
//   3. PERSONAL BESTS   — PersonalBestsStrip
//
// Do NOT apply .agent-mode-scope (UI-SPEC line 282 — reserved for agent
// surfaces only).
// ---------------------------------------------------------------------------

interface PersonalBests {
  longestStreakDays: number;
  highestKcal: number;
  bestAdherencePct: number;
}

interface NutritionStatsClientProps {
  userId: string;
  adherence: DailyAdherence[];
  trend: DailyMacros[];
  bests: PersonalBests;
}

export function NutritionStatsClient({
  adherence,
  trend,
  bests,
}: NutritionStatsClientProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-12">
      {/* Section 1: LOGGING HISTORY */}
      <section>
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--ink-muted)]">
          LOGGING HISTORY
        </h2>
        <div className="mt-4 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-6">
          <NutritionHeatMap data={adherence} />
        </div>
      </section>

      {/* Section 2: 7-DAY MACRO TREND */}
      <section>
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--ink-muted)]">
          7-DAY MACRO TREND
        </h2>
        <div className="mt-4 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-6">
          <MacroTrendChart data={trend} />
        </div>
      </section>

      {/* Section 3: PERSONAL BESTS */}
      <section>
        <h2 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--ink-muted)]">
          PERSONAL BESTS
        </h2>
        <div className="mt-4">
          <PersonalBestsStrip bests={bests} />
        </div>
      </section>
    </div>
  );
}
