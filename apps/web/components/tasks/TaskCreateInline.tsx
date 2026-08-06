"use client";

import { useState, useRef, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";
import { Spinner } from "@/components/shared/Spinner";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "./status";

interface Props {
  status: TaskStatus;
  onCreateTask: (input: { title: string; status: TaskStatus }) => Promise<void>;
  /**
   * When provided, "+ Add task" opens the full task detail panel as a draft
   * instead of revealing the inline input. Preferred path now that users
   * want to set project / due date / etc. at create time.
   */
  onStartCreate?: (status: TaskStatus) => void;
}

export function TaskCreateInline({ status, onCreateTask, onStartCreate }: Props) {
  const reduced = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function openInput() {
    if (onStartCreate) {
      onStartCreate(status);
      return;
    }
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && title.trim()) {
      e.preventDefault();
      const t = title.trim();
      setTitle("");
      setIsOpen(false);
      startTransition(async () => {
        await onCreateTask({ title: t, status });
      });
    } else if (e.key === "Escape") {
      setTitle("");
      setIsOpen(false);
    }
  }

  function handleBlur() {
    if (!title.trim()) {
      setIsOpen(false);
      setTitle("");
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isOpen ? (
        <motion.input
          key="input"
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="new task…  ↵ to add, esc to cancel"
          disabled={isPending}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: reduced ? 0 : 0.16, ease: [0.25, 1, 0.5, 1] }}
          className={cn(
            // craft-ui-v2: the composer is a .craft-pill input row. Focus uses
            // an outline (ring is box-shadow-based and loses to the unlayered
            // pill's shadow); the pill's own hover handles the lift.
            "craft-pill w-full px-3.5 py-2",
            "text-meta text-[var(--ink)] placeholder:text-[var(--ink-faint)]",
            "focus:outline-2 focus:-outline-offset-1 focus:outline-[var(--accent)]",
          )}
        />
      ) : (
        <motion.button
          key="button"
          type="button"
          onClick={openInput}
          disabled={isPending}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-1 py-1",
            "text-meta text-[var(--ink-muted)]",
            "transition-colors duration-[160ms] ease-out hover:text-[var(--ink)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {isPending ? (
            <>
              <Spinner size={13} label="Adding task" />
              Adding…
            </>
          ) : (
            <>
              <Plus size={13} />
              Add task
            </>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
