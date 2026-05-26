"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { InsightsCharts } from "./InsightsCharts";
import { HabitsInsightsPanel } from "./HabitsInsightsPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import type { HabitWithAreas } from "@/app/actions/habits";

type Tab = "jarvis" | "habits";

interface Props {
  jarvis: {
    hasData: boolean;
    // Pass-through to InsightsCharts. Typed as `any` here only because the
    // existing `InsightsCharts` prop type isn't exported as a named symbol —
    // we forward verbatim.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
  };
  habits: {
    habits: HabitWithAreas[];
    completions: { habitId: string; completedDate: string }[];
    today: string;
    earliestAvailable: string;
  };
}

/**
 * Insights surface tabs. Server still owns data fetching; this client just
 * picks which panel is currently visible. Tab state is in URL? — no, kept
 * local since neither panel deep-links into.
 */
export function InsightsTabs({ jarvis, habits }: Props) {
  const [tab, setTab] = useState<Tab>("jarvis");

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Insights view"
        className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)] w-fit"
      >
        <TabButton
          active={tab === "jarvis"}
          onClick={() => setTab("jarvis")}
          label="JARVIS"
        />
        <TabButton
          active={tab === "habits"}
          onClick={() => setTab("habits")}
          label="Habits"
        />
      </div>

      {tab === "jarvis" ? (
        jarvis.hasData ? (
          <InsightsCharts data={jarvis.data} />
        ) : (
          <EmptyState
            heading="Seven days of silence."
            body="JARVIS hasn't logged any turns yet. Send it a message to populate this."
          />
        )
      ) : (
        <HabitsInsightsPanel
          habits={habits.habits}
          completions={habits.completions}
          today={habits.today}
          earliestAvailable={habits.earliestAvailable}
        />
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
