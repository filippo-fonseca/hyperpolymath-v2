"use client";

import { getTasksForCurrentUser, updateTaskStatus } from "@/app/actions/tasks";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** One row of the area's cross-project task rollup. */
export interface AreaTaskRow {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  /** The task's projects that live in this area (names for the meta line). */
  projects: { id: string; name: string }[];
}

const VISIBLE_ROWS = 8;

/**
 * Live rollup of the area's tasks: the canonical ['tasks', userId] snapshot
 * (the same cache /tasks renders from) filtered down to tasks linked to this
 * area's projects. Until the snapshot resolves, the server-fetched rows
 * render; after that the cache is authoritative, so completions from /tasks,
 * Kiwi, or this very list settle everywhere at once.
 */
export function useAreaTasks(
  userId: string,
  areaProjectIds: string[],
  initialTasks: AreaTaskRow[]
): AreaTaskRow[] {
  const idSet = useMemo(() => new Set(areaProjectIds), [areaProjectIds]);
  const { data } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    select: (rows) =>
      rows
        .filter((t) => t.projects.some((p) => idSet.has(p.id)))
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
          projects: t.projects.filter((p) => idSet.has(p.id)),
        })),
  });
  return data ?? initialTasks;
}

interface Props {
  userId: string;
  areaProjectIds: string[];
  initialTasks: AreaTaskRow[];
}

export function AreaTasksRollup({ userId, areaProjectIds, initialTasks }: Props) {
  // Same pair /tasks subscribes to: task rows plus the join table, so linking
  // a task to one of this area's projects surfaces it here without a reload.
  useTableSubscription("tasks", userId);
  useTableSubscription("tasks_projects", userId);

  const rows = useAreaTasks(userId, areaProjectIds, initialTasks);

  // Optimistic completion overlay, cleared whenever the live rows change (the
  // Realtime echo re-runs `select`, at which point the cache is authoritative).
  const [overlay, setOverlay] = useState<Map<string, boolean>>(new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: the overlay clears when the live rows change
  useEffect(() => {
    setOverlay(new Map());
  }, [rows]);

  const isDone = (t: AreaTaskRow) => overlay.get(t.id) ?? t.status === "lesno";

  // Checked-off rows stay in place (checked) until the echo settles, so the
  // list never jumps under the cursor mid-interaction.
  const open = useMemo(
    () =>
      rows
        .filter((t) => t.status !== "lesno")
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return 0;
        }),
    [rows]
  );

  async function toggle(t: AreaTaskRow) {
    const next = !isDone(t);
    setOverlay((prev) => new Map(prev).set(t.id, next));
    const result = await updateTaskStatus({
      id: t.id,
      newStatus: next ? "lesno" : "not started",
    });
    if (!result.success) {
      setOverlay((prev) => {
        const reverted = new Map(prev);
        reverted.delete(t.id);
        return reverted;
      });
      toast.error(result.error);
    } else if (result.data.becameLesno) {
      toast.success("Lesno.");
    }
  }

  if (open.length === 0) {
    return (
      <EmptyState
        size="section"
        title="No open tasks in this area"
        description="Tasks linked to this area's projects roll up here."
      />
    );
  }

  const visible = open.slice(0, VISIBLE_ROWS);
  const remaining = open.length - visible.length;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-[var(--edge)]">
        {visible.map((t) => {
          const done = isDone(t);
          return (
            <li key={t.id} className="flex min-h-9 items-center gap-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                onClick={() => toggle(t)}
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border cursor-pointer-always",
                  "transition-colors duration-[160ms] ease-out",
                  done
                    ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink-muted)]"
                    : "border-[var(--edge-strong)] bg-transparent text-transparent hover:border-[var(--ink-faint)]"
                )}
              >
                <Check className="size-3" strokeWidth={2.5} />
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body text-[var(--ink)]",
                  done && "text-[var(--ink-faint)] line-through"
                )}
              >
                {t.title}
              </span>
              <span className="flex shrink-0 items-center text-meta text-[var(--ink-muted)]">
                {t.projects[0]?.name}
                {t.dueDate ? (
                  <>
                    <span aria-hidden className="mx-2 text-[var(--ink-faint)]">
                      ·
                    </span>
                    <span className="font-mono text-micro tabular-nums">
                      {format(parseISO(t.dueDate), "MMM d")}
                    </span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {remaining > 0 ? (
        <p className="pt-3 text-meta text-[var(--ink-faint)]">
          {remaining} more with later or no due dates.
        </p>
      ) : null}
    </div>
  );
}
