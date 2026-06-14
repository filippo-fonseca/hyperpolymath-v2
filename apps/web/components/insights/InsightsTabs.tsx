"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { InsightsCharts } from "./InsightsCharts";
import { HabitsInsightsPanel } from "./HabitsInsightsPanel";
import { LifeTabPanel } from "./life/LifeTabPanel";
import { PipelineLatencyPanel } from "./PipelineLatencyPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import type { HabitWithAreas } from "@/app/actions/habits";
import type { Result } from "@/lib/integrations/result";
import type { DailyUsage } from "@/lib/integrations/claude-code/usage";
import type { StravaData } from "@/lib/integrations/strava/activities";
import type { Session } from "@/lib/integrations/flow/sessions";
import type { PipelineLatencyStats } from "@/lib/db/queries/analytics";

type Tab = "life" | "habits" | "jarvis";

interface Props {
  initialTab?: Tab;
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
    claudeCode: Result<DailyUsage[]>;
    strava: Result<StravaData>;
    flow: Result<Session[]>;
    githubUsername: string | null;
  };
}

/**
 * Insights surface tabs. Server still owns data fetching; this client just
 * picks which panel is currently visible. Life is the default (and central)
 * surface; JARVIS analytics — including the pipeline-latency breakdown — lives
 * last.
 */
export function InsightsTabs({ initialTab = "life", jarvis, habits, life }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Insights view"
        className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)] w-fit"
      >
        <TabButton
          active={tab === "life"}
          onClick={() => setTab("life")}
          label="Life"
        />
        <TabButton
          active={tab === "habits"}
          onClick={() => setTab("habits")}
          label="Habits"
        />
        <TabButton
          active={tab === "jarvis"}
          onClick={() => setTab("jarvis")}
          label="JARVIS"
        />
      </div>

      {tab === "life" ? (
        <LifeTabPanel
          claudeCode={life.claudeCode}
          strava={life.strava}
          flow={life.flow}
          githubUsername={life.githubUsername}
        />
      ) : tab === "habits" ? (
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
            <EmptyState
              heading="Seven days of silence."
              body="JARVIS hasn't logged any turns yet. Send it a message to populate this."
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
      className={cn(
        "px-3 py-1 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
      )}
    >
      {label}
    </button>
  );
}
