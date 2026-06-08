"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type StatsWindow = "week" | "month" | "all";

interface Props {
  value: StatsWindow;
  onChange: (v: StatsWindow) => void;
}

/**
 * Stats time-window toggle (TRN-11): week / month / all-time.
 *
 * Custom-range deferred per CONTEXT Deferred Ideas — three options only.
 * The heatmap itself ignores this toggle (it stays a fixed 12-month view);
 * the supporting stat cards re-aggregate on change.
 *
 * Built on shadcn `Tabs` (radix under the hood) since the repo already ships
 * Tabs and not ToggleGroup; semantically a toggle-group, visually a tab row.
 */
export function TimeWindowToggle({ value, onChange }: Props) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as StatsWindow)}
      className="w-fit"
    >
      <TabsList>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="all">All time</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
