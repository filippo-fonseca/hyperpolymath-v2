import { requireOnboarded } from "@/lib/auth/get-user";
import { getInsightsData } from "@/lib/db/queries/insights";
import { InsightsCharts } from "@/components/insights/InsightsCharts";
import { EmptyState } from "@/components/shared/EmptyState";
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
import { HudEdgeInstrumentation } from "@/components/shared/HudEdgeInstrumentation";

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
  const data = await getInsightsData(user.id);

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-6 py-12">
      <HudCornerCrops
        size={12}
        className="fixed inset-0 pointer-events-none z-0"
      />
      <main className="relative z-10 max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-4xl font-semibold text-[var(--ink)]">
            Insights
          </h1>
          <p className="font-serif text-base text-[var(--ink-muted)] flex items-center gap-2">
            Last 7 days of JARVIS activity.
            {data.totalTurns > 0 ? (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--hud-cyan)" }}
              />
            ) : null}
          </p>
        </header>

        {data.totalTurns === 0 ? (
          <EmptyState
            heading="Seven days of silence."
            body="JARVIS hasn't logged any turns yet. Send it a message to populate this."
          />
        ) : (
          <InsightsCharts data={data} />
        )}
      </main>

      {/* Bottom edge instrumentation rail per UI-SPEC §5b + §6d.
          Values are nullable — renders "—ms / —% / —" placeholders.
          TODO(phase 6.1.x): wire jarvis_events aggregation for live telemetry. */}
      <div className="fixed bottom-4 left-0 right-0 flex justify-center pointer-events-none z-10">
        <HudEdgeInstrumentation
          latencyMs={null}
          cacheHitPercent={null}
          lastTurnRelative={null}
          className="pointer-events-auto"
        />
      </div>
    </div>
  );
}
