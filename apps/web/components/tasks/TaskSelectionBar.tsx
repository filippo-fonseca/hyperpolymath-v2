"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Spinner } from "@/components/shared/Spinner";
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
  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
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
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] hover:bg-[var(--canvas)]/15 cursor-pointer-always disabled:opacity-50"
            >
              {pending ? <Spinner size={12} label="Deleting tasks" /> : null}
              Delete
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full p-1 hover:bg-[var(--canvas)]/15 cursor-pointer-always"
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
