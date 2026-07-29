"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { TaskCard } from "./TaskCard";

// ── localStorage-backed UI persistence ──────────────────────────────────────
// Mirrors OverdueTasksPanel's self-contained persistence: a single boolean for
// the disclosure's open/closed state. Kept local to this component so the Inbox
// panel owns its own toggle grammar, exactly like the Overdue panel it sits
// beside in the triage rail.

const PANEL_OPEN_KEY = "tasks-inbox-panel-open";

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

interface Props {
  /** Undated, non-lesno tasks (`dueDate IS NULL AND status != 'lesno'`).
   * Passed in full — NO 24-card truncation (D-01). */
  inboxTasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  /** Lifted drag state — the card currently being dragged anywhere on the
   * tasks surface. Shared with KanbanBoard so the Inbox can be a drop target
   * for cards dragged out of any kanban column (D-04). */
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  /** Fired when a card is dropped onto the Inbox surface. Parent reads
   * `draggedTaskId` and nulls the task's due date via the existing
   * `bulkUpdateTaskDueDate` server action. */
  onDrop: () => void | Promise<void>;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
}

/**
 * Persistent, first-class Inbox panel for undated tasks (D-01 / TASK-INBOX-01).
 *
 * Shows EVERY undated task (no `slice(0, 24)` cap) and acts as an HTML5 native
 * DnD drop target: dropping a card here nulls its due date (D-04 /
 * TASK-INBOX-02), bidirectional with the drag-out-of-inbox flow.
 *
 * Sits in the tasks triage rail half-and-half beside {@link OverdueTasksPanel}
 * and adopts EXACTLY that panel's disclosure grammar: a 12px `--surface` panel,
 * a chevron header button that toggles the body open/closed with a localStorage-
 * persisted boolean, and a matched 280ms height/opacity collapse. Both panels
 * toggle independently, so both can be open at once.
 *
 * Aesthetic guardrails: accent ONLY appears on drag-over (the reserved
 * drag-target state, painted with direct DOM writes so a dragover never
 * re-renders the card list); default borders stay neutral. The whole panel
 * (header included) is the drop target, so a card can still be dropped onto
 * the Inbox even when it is collapsed to its header strip.
 */
export function InboxColumn({
  inboxTasks,
  onTaskClick,
  draggedTaskId,
  onDragStart,
  onDragEnd,
  onDrop,
  selectedIds,
  onToggleSelected,
}: Props) {
  const reduced = useReducedMotion();
  const [panelOpen, setPanelOpen] = usePersistentBoolean(PANEL_OPEN_KEY, true);

  return (
    <section
      aria-label="Tasks without a due date"
      onDragOver={(e) => {
        e.preventDefault();
        // Drag-target active state, written straight to the DOM: a state
        // write here would re-render every card on every dragover frame.
        e.currentTarget.style.boxShadow = "inset 0 0 0 1px var(--accent)";
      }}
      onDragLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = "none";
        void onDrop();
      }}
      className="overflow-hidden rounded-xl border border-[var(--edge)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
    >
      {/* Panel header: toggle open/closed + summary count. Neutral grammar
          (no functional hue), matching the Overdue panel's chevron affordance. */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
          className="group/header flex min-w-0 items-center gap-2 rounded-lg text-left cursor-pointer-always focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span className="text-[var(--ink-muted)]">
            {panelOpen ? (
              <ChevronDown size={15} strokeWidth={2} />
            ) : (
              <ChevronRight size={15} strokeWidth={2} />
            )}
          </span>
          <Inbox size={14} strokeWidth={1.75} className="text-[var(--ink-muted)]" />
          <span className="truncate text-meta font-medium text-[var(--ink-muted)]">
            Inbox
          </span>
          <span className="font-mono text-micro tabular-nums text-[var(--ink-muted)]">
            {inboxTasks.length}
          </span>
        </button>
      </header>

      <AnimatePresence initial={false}>
        {panelOpen ? (
          <motion.div
            key="inbox-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-[40vh] overflow-y-auto px-4 pb-3">
              {inboxTasks.length === 0 ? (
                <p className="px-0.5 text-meta text-[var(--ink-muted)]">
                  Inbox is empty.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {inboxTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onClick={onTaskClick}
                      draggable
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggedTaskId === t.id}
                      selectionActive={selectedIds.size > 0}
                      isSelected={selectedIds.has(t.id)}
                      onToggleSelected={(id) => onToggleSelected(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
