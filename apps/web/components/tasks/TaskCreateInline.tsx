"use client";

import { Spinner } from "@/components/shared/Spinner";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, useTransition } from "react";

type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

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
  const reducedMotion = useReducedMotion() ?? false;
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
    <AnimatePresence mode="wait" initial={!reducedMotion}>
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
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
          transition={{ duration: reducedMotion ? 0 : 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "w-full bg-card border border-border rounded-md px-3 py-2",
            "font-sans text-[13px] text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            "transition-colors"
          )}
        />
      ) : (
        <motion.button
          key="button"
          type="button"
          onClick={openInput}
          disabled={isPending}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.12 }}
          className={cn(
            "flex items-center gap-1 w-full px-1 py-1",
            "font-sans text-[13px] text-muted-foreground",
            "hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
            "disabled:opacity-60 disabled:cursor-not-allowed"
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
