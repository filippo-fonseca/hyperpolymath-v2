import { getHabitCompletionsInRange, getHabitsForCurrentUser } from "@/app/actions/habits";
import { InsightsTabs } from "@/components/insights/InsightsTabs";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getAnalyticsData, getStageLatencyStats } from "@/lib/db/queries/analytics";
import { getInsightsData } from "@/lib/db/queries/insights";
// 260607-h2k — Life tab integrations. GitHub self-fetches client-side, so only
// three Result-returning calls are added to the page-level Promise.all.
import { getClaudeCodeUsage } from "@/lib/integrations/claude-code/usage";
import { getFlowSessions } from "@/lib/integrations/flow/sessions";
import { getStravaActivities } from "@/lib/integrations/strava/activities";

export const dynamic = "force-dynamic";

type Tab = "life" | "habits" | "jarvis";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireOnboarded();
  const { tab } = await searchParams;
  const initialTab: Tab = tab === "habits" || tab === "jarvis" || tab === "life" ? tab : "life";

  // 365-day window for the Habits tab. Same as analytics, matches the heatmap.
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 364);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayISO = toISO(today);
  const startISO = toISO(start);

  const [
    analytics,
    jarvisLegacy,
    habits,
    habitCompletions,
    pipelineStats,
    claudeCode,
    strava,
    flow,
  ] = await Promise.all([
    getAnalyticsData(user.id),
    getInsightsData(user.id),
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(startISO, todayISO),
    // Phase 9 / TEL-02 — rolling 24h window per CONTEXT §D-04.
    getStageLatencyStats(user.id, 60 * 24),
    // 260607-h2k — each integration returns Result<T> and never throws (D-06).
    // Belt-and-suspenders .catch as final safety net so a thrown error here
    // can never crash the page.
    getClaudeCodeUsage().catch((e) => ({
      ok: false as const,
      error: String(e?.message ?? e),
    })),
    getStravaActivities(user.id).catch((e) => ({
      ok: false as const,
      error: String(e?.message ?? e),
    })),
    getFlowSessions().catch((e) => ({
      ok: false as const,
      error: String(e?.message ?? e),
    })),
  ]);

  const totalEvents = analytics.events.length + analytics.meta.taskTotalCompleted;

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-8 py-12">
      <main className="relative z-10 max-w-6xl mx-auto space-y-8">
        <header className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
              Analytics
            </h1>
            {totalEvents > 0 ? (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--hud-cyan)" }}
              />
            ) : null}
          </div>
          <p className="font-serif text-base text-[var(--ink-muted)]">
            Tasks, captures, habits, and JARVIS — all systems at a glance.
          </p>
        </header>

        <InsightsTabs
          initialTab={initialTab}
          jarvis={{
            hasData: jarvisLegacy.totalTurns > 0,
            data: jarvisLegacy,
            pipelineStats,
          }}
          habits={{
            habits,
            completions: habitCompletions,
            today: todayISO,
            earliestAvailable: startISO,
          }}
          life={{ claudeCode, strava, flow, githubUsername: user.githubUsername }}
        />
      </main>
    </div>
  );
}
