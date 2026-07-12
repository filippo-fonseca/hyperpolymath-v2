"use client";

import { Spinner } from "@/components/shared/Spinner";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MoveToMenu } from "./MoveToMenu";

interface Props {
  count: number;
  onMoveTo: (dateYmd: string | null) => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  pending: boolean;
}

/**
 * Bottom-anchored selection bar — slides up when one or more tasks are
 * selected in the kanban day view. Contains the "Move to…" affordance and
 * a clear-selection button. Lives outside the column layout so the bar
 * stays visible while the user scrolls through tasks.
 */
export function TaskSelectionBar({ count, onMoveTo, onDeleteSelected, onClear, pending }: Props) {
  const reducedMotion = useReducedMotion() ?? false;
  return (
    <AnimatePresence initial={!reducedMotion}>
      {count > 0 ? (
        <motion.div
          initial={reducedMotion ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.25, 1, 0.5, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--ink)] px-4 py-2 text-[var(--canvas)] shadow-lg"
            role="toolbar"
            aria-label="Bulk task actions"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] opacity-80">
              {count} selected
            </span>
            <MoveToMenu onPick={onMoveTo} variant="bar" allowClear disabled={pending} />
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={pending}
              className="inline-flex min-h-8 items-center gap-1 rounded-[0.375rem] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-[var(--canvas)]/15 cursor-pointer-always disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              {pending ? <Spinner size={12} label="Deleting tasks" /> : null}
              Delete
            </button>
            <button
              type="button"
              onClick={onClear}
              className="min-h-8 min-w-8 rounded-[0.375rem] p-1 hover:bg-[var(--canvas)]/15 cursor-pointer-always focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
              aria-label="Clear selection"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
