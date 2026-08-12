"use client";

import type { HabitWithAreas } from "@/app/actions/habits";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart } from "lucide-react";
import type { PipelineLatencyStats } from "@/lib/db/queries/analytics";
import type { DailyUsage } from "@/lib/integrations/claude-code/usage";
import type { SubscriptionUsage } from "@/lib/integrations/claude-code/subscription";
import type { AnthropicDailyUsage } from "@/lib/integrations/anthropic-api/usage";
import type { AnthropicDailyRequests } from "@/lib/integrations/anthropic-api/trends";
import type { Session } from "@/lib/integrations/flow/sessions";
import type { Result } from "@/lib/integrations/result";
import type { StravaData } from "@/lib/integrations/strava/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { DevRun } from "@/lib/db/queries/dev-runs";
import { HabitsInsightsPanel } from "./HabitsInsightsPanel";
import { InsightsCharts } from "./InsightsCharts";
import { PipelineLatencyPanel } from "./PipelineLatencyPanel";
import { DevelopmentTabPanel } from "./DevelopmentTabPanel";
import { LifeTabPanel } from "./life/LifeTabPanel";
import { XpInsightsPanel } from "@/components/xp/XpInsightsPanel";
import type { XpOverview } from "@/lib/db/queries/xp";

type Tab = "life" | "xp" | "habits" | "jarvis" | "development";

interface Props {
  initialTab?: Tab;
  /** Issue #345. Null only if the XP query failed; the tab hides rather than half-render. */
  xp?: XpOverview | null;
  jarvis: {
    hasData: boolean;
    // Pass-through to InsightsCharts. Typed as `any` here only because the
    // existing `InsightsCharts` prop type isn't exported as a named symbol —
    // we forward verbatim.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    pipelineStats: PipelineLatencyStats;
  };
  habits: {
    habits: HabitWithAreas[];
    completions: { habitId: string; completedDate: string }[];
    today: string;
    earliestAvailable: string;
  };
  life: {
    strava: Result<StravaData>;
    flow: Result<Session[]>;
    githubUsername: string | null;
  };
  // Owner-only. When null, the DEVELOPMENT tab is never shown and its data was
  // never fetched (the owner gate lives in the server page).
  development?: {
    runs: DevRun[];
    anthropicApi: Result<AnthropicDailyUsage[]>;
    // Optional per-day request counts (issue #133). Panel degrades if absent.
    anthropicApiRequests?: Result<AnthropicDailyRequests[]>;
    subscription: Result<SubscriptionUsage>;
    claudeCode: Result<DailyUsage[]>;
  } | null;
}

/**
 * Insights surface tabs. Server still owns data fetching; this client just
 * picks which panel is currently visible. Life is the default (and central)
 * surface; JARVIS analytics — including the pipeline-latency breakdown — lives
 * last.
 */
export function InsightsTabs({
  initialTab = "life",
  xp = null,
  jarvis,
  habits,
  life,
  development = null,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Coerce the effective tab: a "development" selection is only valid when the
  // owner-only development prop is present. Otherwise fall back to life.
  const effectiveTab: Tab =
    (tab === "development" && !development) || (tab === "xp" && !xp)
      ? "life"
      : tab;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Insights view"
        className="flex w-fit items-center gap-0.5 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-0.5"
      >
        <TabButton active={effectiveTab === "life"} onClick={() => setTab("life")} label="Life" />
        {xp ? (
          <TabButton active={effectiveTab === "xp"} onClick={() => setTab("xp")} label="XP" />
        ) : null}
        <TabButton active={effectiveTab === "habits"} onClick={() => setTab("habits")} label="Habits" />
        <TabButton active={effectiveTab === "jarvis"} onClick={() => setTab("jarvis")} label="JARVIS" />
        {development ? (
          <TabButton
            active={effectiveTab === "development"}
            onClick={() => setTab("development")}
            label="Development"
          />
        ) : null}
      </div>

      {effectiveTab === "development" && development ? (
        <DevelopmentTabPanel
          runs={development.runs}
          anthropicApi={development.anthropicApi}
          anthropicApiRequests={development.anthropicApiRequests}
          subscription={development.subscription}
          claudeCode={development.claudeCode}
        />
      ) : effectiveTab === "xp" && xp ? (
        <XpInsightsPanel data={xp} />
      ) : effectiveTab === "life" ? (
        <LifeTabPanel
          strava={life.strava}
          flow={life.flow}
          githubUsername={life.githubUsername}
        />
      ) : effectiveTab === "habits" ? (
        <HabitsInsightsPanel
          habits={habits.habits}
          completions={habits.completions}
          today={habits.today}
          earliestAvailable={habits.earliestAvailable}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {jarvis.hasData ? (
            <InsightsCharts data={jarvis.data} />
          ) : (
            // Shared empty state on the insights hue (tint-sky) — the icon
            // renders on a soft sky plate rather than grey on grey.
            <EmptyState
              size="page"
              className="tint-sky"
              icon={<LineChart />}
              title="Seven days of silence."
              description="JARVIS hasn't logged any turns yet. Send it a message to populate this."
            />
          )}
          <PipelineLatencyPanel stats={jarvis.pipelineStats} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      role="tab"
      className="craft-chip cursor-pointer-always"
    >
      {label}
    </button>
  );
}
