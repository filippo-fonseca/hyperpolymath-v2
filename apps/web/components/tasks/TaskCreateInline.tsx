"use client";

import { useState, useRef, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

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
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "w-full bg-card border border-border rounded-md px-3 py-2",
            "font-sans text-[13px] text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            "transition-colors",
          )}
        />
      ) : (
        <motion.button
          key="button"
          type="button"
          onClick={openInput}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className={cn(
            "flex items-center gap-1 w-full px-1 py-1",
            "font-sans text-[13px] text-muted-foreground",
            "hover:text-foreground transition-colors rounded",
          )}
        >
          <Plus size={13} />
          Add task
        </motion.button>
      )}
    </AnimatePresence>
  );
}
