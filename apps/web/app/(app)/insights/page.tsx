import { requireOnboarded } from "@/lib/auth/get-user";
import { getInsightsData } from "@/lib/db/queries/insights";
import { InsightsCharts } from "@/components/insights/InsightsCharts";
import { EmptyState } from "@/components/shared/EmptyState";

export const dynamic = "force-dynamic";

/**
 * Phase 6 Plan 06-04: /insights Server Component page (RES-06, D-04).
 *
 * Server-side aggregation (no client round-trip). Pre-shaped data is
 * passed to InsightsCharts which renders the 3 charts via recharts.
 *
 * Agent-mode route (UI-SPEC §1) — JARVIS-blue passive glow on the live dot
 * and on each chart panel via InsightsCharts.
 *
 * Empty state (UI-SPEC §9): "Seven days of silence." when totalTurns === 0.
 */
export default async function InsightsPage() {
  const user = await requireOnboarded();
  const data = await getInsightsData(user.id);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="flex items-start gap-3">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-serif font-semibold">Insights</h1>
            {data.totalTurns > 0 && (
              <span
                aria-label="Live data"
                className="inline-block h-1.5 w-1.5 rounded-full agent-glow-passive"
                style={{ background: "var(--color-accent-jarvis)" }}
              />
            )}
          </div>
          <p className="text-base font-serif text-muted-foreground">
            Last 7 days of JARVIS activity.
          </p>
        </div>
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
  );
}
