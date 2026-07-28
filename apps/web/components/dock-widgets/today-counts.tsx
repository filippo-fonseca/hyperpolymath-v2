"use client";

import { getTasksForCurrentUser } from "@/app/actions/tasks";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

/**
 * Today's counts — the first widget through the D11 seam.
 *
 * It owns its data end to end: its own query, its own realtime subscription,
 * its own empty state. The Dock never fetches for it. It reuses the `tasks`
 * table key the app already invalidates on every task mutation, so it stays
 * honest with zero new channels.
 */

type TodayCounts = {
  overdue: number;
  today: number;
  loading: boolean;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function useTodayCounts(): TodayCounts {
  const userId = useCurrentUserId() ?? "";
  useTableSubscription("tasks", userId);

  const { data, isPending } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    enabled: Boolean(userId),
  });

  const iso = todayISO();
  const open = (data ?? []).filter((task) => task.status !== "lesno" && task.dueDate != null);

  return {
    overdue: open.filter((task) => (task.dueDate as string) < iso).length,
    today: open.filter((task) => (task.dueDate as string) === iso).length,
    loading: isPending,
  };
}

function Count({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      className="flex h-8 items-center justify-between rounded-lg px-2 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
    >
      <span className="text-meta text-[var(--ink-muted)]">{label}</span>
      <span
        className="text-meta font-medium tabular-nums"
        style={{
          color: tone === "warn" && value > 0 ? "var(--ink-amber)" : "var(--ink)",
        }}
      >
        {value}
      </span>
    </Link>
  );
}

function Compact({ data }: { data: TodayCounts }) {
  if (data.loading) {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Counting…</p>;
  }

  if (data.overdue === 0 && data.today === 0) {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Nothing due today.</p>;
  }

  return (
    <div className="flex flex-col">
      <Count href="/tasks" label="Due today" value={data.today} />
      <Count href="/tasks" label="Overdue" value={data.overdue} tone="warn" />
    </div>
  );
}

export const todayCountsWidget = defineDockWidget<TodayCounts>({
  id: "today-counts",
  title: "Today",
  defaultDocked: true,
  order: 10,
  useData: useTodayCounts,
  Compact,
});
