import { requireOnboarded } from "@/lib/auth/get-user";
import { getInsightsData } from "@/lib/db/queries/insights";
import {
  getHabitCompletionsInRange,
  getHabitsForCurrentUser,
} from "@/app/actions/habits";
import { InsightsTabs } from "@/components/insights/InsightsTabs";

export const dynamic = "force-dynamic";

/**
 * Phase 6.1 Plan 06.1-03: /insights agent-surface treatment (UI-SPEC §5b).
 *
 * Server Component. Preserves the Phase 6 getInsightsData() query + the
 * data flow into InsightsCharts (UI-SPEC §14 carry-forward).
 *
 * What changes vs Phase 6:
 *   - Page is wrapped in .agent-mode-scope so :focus-visible inside picks
 *     up --ring-hud (cyan) instead of --ring-doc (amber) per UI-SPEC §11a.
 *   - 4 breathing corner crops mount at the viewport (HudCornerCrops 12px).
 *   - Bottom HudEdgeInstrumentation rail renders LATENCY · CACHE · LAST at
 *     opacity 0.4 → 0.85 on hover per UI-SPEC §6d. Telemetry values are
 *     null today (renders "—ms / —% / —") — jarvis_events aggregation
 *     hookup deferred per the same pattern as Plan 02 (TODO phase 6.1.x).
 *   - H1 stays serif 36px 600 "Insights"; subhead "Last 7 days of JARVIS
 *     activity." per UI-SPEC §12c.
 *   - InsightsCharts itself carries the HUD chrome per UI-SPEC §5b (1px
 *     --edge-hud border + corner L-brackets + ambient cyan glow + cyan
 *     stroke series, no neumorphic shadow).
 *
 * Empty state (UI-SPEC §12b): "Seven days of silence." when zero events.
 */
export default async function InsightsPage() {
  const user = await requireOnboarded();

  // 365-day window for the Habits tab so the range pills (7d/28d/90d/all)
  // all have a year of completion data to work with. Volume is tiny at
  // single-user scale (one row per habit per checked day).
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 364);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayISO = toISO(today);
  const startISO = toISO(start);

  const [data, habits, habitCompletions] = await Promise.all([
    getInsightsData(user.id),
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(startISO, todayISO),
  ]);

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-8 py-12">
      <main className="relative z-10 max-w-5xl mx-auto space-y-8">
        <header className="space-y-1.5">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
            Insights
          </h1>
          <p className="font-serif text-base text-[var(--ink-muted)] flex items-center gap-2">
            JARVIS activity and habit patterns.
            {data.totalTurns > 0 ? (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--hud-cyan)" }}
              />
            ) : null}
          </p>
        </header>

        <InsightsTabs
          jarvis={{ hasData: data.totalTurns > 0, data }}
          habits={{
            habits,
            completions: habitCompletions,
            today: todayISO,
            earliestAvailable: startISO,
          }}
        />
      </main>
    </div>
  );
}
