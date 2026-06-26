"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { fromYmd } from "@/lib/tasks/date-shortcuts";
import { differenceInCalendarDays, format } from "date-fns";
import { AlarmClock, Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoveToMenu } from "./MoveToMenu";
import { TaskCard } from "./TaskCard";

// ── localStorage-backed UI persistence ──────────────────────────────────────
// Kept local to this component (rather than in lib/ui/**) so the Overdue panel
// is fully self-contained. Mirrors the useTasksExpanded read/write pattern: a
// boolean for the panel itself and a string[] of collapsed date-group keys.

const PANEL_OPEN_KEY = "tasks-overdue-panel-open";
const COLLAPSED_GROUPS_KEY = "tasks-overdue-collapsed-groups";

function usePersistentBoolean(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(fallback);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "1") setValue(true);
      else if (stored === "0") setValue(false);
    } catch {
      // localStorage unavailable — keep fallback.
    }
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // ignore
      }
    },
    [key]
  );
  return [value, set];
}

function usePersistentStringSet(key: string): [Set<string>, (k: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setSet(new Set(JSON.parse(stored) as string[]));
    } catch {
      // ignore malformed / unavailable storage
    }
  }, [key]);
  const toggle = useCallback(
    (member: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(member)) next.delete(member);
        else next.add(member);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [key]
  );
  return [set, toggle];
}

interface DateGroup {
  /** YYYY-MM-DD original due date — the group key. */
  ymd: string;
  tasks: TaskWithProjects[];
}

interface Props {
  /** Every overdue task: dueDate strictly before today's start, not lesno,
   * and (by construction) never undated. Pre-filtered by the parent. */
  overdueTasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  /** Reschedule a set of tasks to a new YYYY-MM-DD date (mass action + the
   * per-group quick action). Reuses bulkUpdateTaskDueDate in the parent. */
  onReschedule: (ids: string[], dueYmd: string) => void;
  /** Lifted drag state, shared with the rest of the tasks surface so a card
   * dragged OUT of the panel onto a day target reschedules + removes it. */
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

/**
 * Overdue Tasks Panel (issue #143).
 *
 * Aggregates every task whose due date has already passed, grouped by the
 * original due date. Each date group is independently collapsible, the whole
 * panel toggles open/closed, and both states persist in localStorage. Cards
 * are draggable (native HTML5 DnD, matching the Inbox/kanban pattern) so the
 * user can drop one onto any day target to reschedule it; dragging it out
 * updates its due date and it leaves the panel. Bulk select (per-group
 * select-all + select-all-across-panel) feeds a mass-reschedule via the shared
 * MoveToMenu affordance.
 *
 * Aesthetic: glass-tile surfaces, cyan reserved for drag-over/focus, amber for
 * selection (matching TaskCard), coral for the overdue accent.
 */
export function OverdueTasksPanel({
  overdueTasks,
  onTaskClick,
  onReschedule,
  draggedTaskId,
  onDragStart,
  onDragEnd,
}: Props) {
  const [panelOpen, setPanelOpen] = usePersistentBoolean(PANEL_OPEN_KEY, true);
  const [collapsedGroups, toggleGroup] = usePersistentStringSet(COLLAPSED_GROUPS_KEY);

  // Selection is ephemeral (not persisted) — it's scoped to the current
  // triage session, like the kanban day-view selection.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drop stale ids from the selection whenever the overdue set shrinks (e.g.
  // a task got rescheduled out of the panel) so the selection toolbar count
  // never references tasks that no longer exist here.
  const overdueIdSet = useMemo(
    () => new Set(overdueTasks.map((t) => t.id)),
    [overdueTasks]
  );
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (overdueIdSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [overdueIdSet]);

  // Group by original due date, oldest first (most-overdue at the top).
  const groups = useMemo<DateGroup[]>(() => {
    const byDate = new Map<string, TaskWithProjects[]>();
    for (const t of overdueTasks) {
      if (!t.dueDate) continue; // edge case: undated tasks never belong here
      const arr = byDate.get(t.dueDate);
      if (arr) arr.push(t);
      else byDate.set(t.dueDate, [t]);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ymd, tasksForDate]) => ({ ymd, tasks: tasksForDate }));
  }, [overdueTasks]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const allIds = useMemo(() => overdueTasks.map((t) => t.id), [overdueTasks]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleMassReschedule = useCallback(
    (dueYmd: string | null) => {
      if (dueYmd === null) return; // panel only reschedules forward; clearing is the Inbox's job
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      onReschedule(ids, dueYmd);
      clearSelection();
    },
    [selectedIds, onReschedule, clearSelection]
  );

  // Empty: render nothing so the panel never occupies space with no overdue
  // work. (The parent gates on overdueTasks.length too, but guard here as well.)
  if (overdueTasks.length === 0) return null;

  return (
    <section
      aria-label="Overdue tasks"
      className="glass-tile rounded-xl mb-4 overflow-hidden [--glass-glow-color:var(--ink-coral)]"
    >
      {/* Panel header — toggle open/closed + summary count. */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
          className="group/header flex items-center gap-2 cursor-pointer-always text-left"
        >
          <span className="text-[var(--ink-coral)]">
            {panelOpen ? (
              <ChevronDown size={15} strokeWidth={2} />
            ) : (
              <ChevronRight size={15} strokeWidth={2} />
            )}
          </span>
          <AlarmClock size={14} strokeWidth={1.75} className="text-[var(--ink-coral)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-coral)]">
            Overdue
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            {overdueTasks.length}
          </span>
        </button>

        {panelOpen ? (
          <button
            type="button"
            onClick={toggleSelectAll}
            aria-pressed={allSelected}
            className={cn(
              "rounded-md border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always transition-colors duration-150 ease-out shrink-0",
              allSelected
                ? "border-[var(--ink-amber)]/50 bg-[var(--surface-raised)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]"
            )}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </header>

      <AnimatePresence initial={false}>
        {panelOpen ? (
          <motion.div
            key="overdue-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-[40vh] overflow-y-auto px-4 pb-3">
              <div className="flex flex-col gap-3">
                {groups.map((group) => {
                  const groupIds = group.tasks.map((t) => t.id);
                  const collapsed = collapsedGroups.has(group.ymd);
                  const groupAllSelected = groupIds.every((id) => selectedIds.has(id));
                  return (
                    <OverdueDateGroup
                      key={group.ymd}
                      group={group}
                      collapsed={collapsed}
                      onToggleCollapse={() => toggleGroup(group.ymd)}
                      groupAllSelected={groupAllSelected}
                      onToggleGroupSelection={() => toggleGroupSelection(groupIds)}
                      onReschedule={(ymd) => {
                        if (ymd !== null) onReschedule(groupIds, ymd);
                      }}
                      onTaskClick={onTaskClick}
                      selectedIds={selectedIds}
                      onToggleSelected={toggleSelected}
                      selectionActive={selectedIds.size > 0}
                      draggedTaskId={draggedTaskId}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Mass-action toolbar — appears within the panel when one or more
          overdue tasks are selected. Sits at the panel's bottom edge so it
          doesn't collide with the global kanban TaskSelectionBar. */}
      <AnimatePresence>
        {panelOpen && selectedIds.size > 0 ? (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
            className="flex items-center justify-between gap-3 border-t border-[var(--edge)] px-4 py-2.5"
            role="toolbar"
            aria-label="Overdue bulk actions"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <MoveToMenu onPick={handleMassReschedule} variant="inline" />
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always"
                aria-label="Clear overdue selection"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ── Per-date group ───────────────────────────────────────────────────────────

interface GroupProps {
  group: DateGroup;
  collapsed: boolean;
  onToggleCollapse: () => void;
  groupAllSelected: boolean;
  onToggleGroupSelection: () => void;
  onReschedule: (dueYmd: string | null) => void;
  onTaskClick: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  selectionActive: boolean;
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function OverdueDateGroup({
  group,
  collapsed,
  onToggleCollapse,
  groupAllSelected,
  onToggleGroupSelection,
  onReschedule,
  onTaskClick,
  selectedIds,
  onToggleSelected,
  selectionActive,
  draggedTaskId,
  onDragStart,
  onDragEnd,
}: GroupProps) {
  const date = fromYmd(group.ymd);
  const daysAgo = differenceInCalendarDays(new Date(), date);
  // Human "how overdue" badge — empty for same-day edge (shouldn't occur for
  // overdue, but guards the < 1 case so we never render a misleading label).
  const relative = daysAgo === 1 ? "Yesterday" : daysAgo > 1 ? `${daysAgo} days ago` : "";

  return (
    <div className="rounded-lg border border-[var(--edge)] bg-[var(--surface)]/40">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1.5 cursor-pointer-always text-left"
        >
          <span className="text-[var(--ink-muted)]">
            {collapsed ? (
              <ChevronRight size={13} strokeWidth={2} />
            ) : (
              <ChevronDown size={13} strokeWidth={2} />
            )}
          </span>
          <span className="font-sans text-[13px] text-[var(--ink)]">
            {format(date, "EEE, MMM d")}
          </span>
          {relative ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-coral)]/80">
              {relative}
            </span>
          ) : null}
          <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
            · {group.tasks.length}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleGroupSelection}
            aria-pressed={groupAllSelected}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] cursor-pointer-always transition-colors duration-150 ease-out",
              groupAllSelected
                ? "text-[var(--ink-amber)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            )}
          >
            {groupAllSelected ? "Clear" : "Select"}
          </button>
          <MoveToMenu onPick={onReschedule} variant="inline" from={date} />
        </div>
      </div>

      {!collapsed ? (
        <div className="flex flex-col gap-2 px-2.5 pb-2.5">
          {group.tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onClick={onTaskClick}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggedTaskId === t.id}
              selectionActive={selectionActive}
              isSelected={selectedIds.has(t.id)}
              onToggleSelected={(id) => onToggleSelected(id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
