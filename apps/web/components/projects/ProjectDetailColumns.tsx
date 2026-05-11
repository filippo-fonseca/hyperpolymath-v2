"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  taskCount: number;
  captureCount: number;
  // Plans 03 + 04 will pass actual lists here; Phase 2 accepts empty
}

/**
 * Two-column project detail layout — per D-15 + UI-SPEC §Project Detail Page.
 * Left column: Tasks (stub — Plan 03 wires real data).
 * Right column: Captures (stub — Plan 04 wires real data).
 * Below 1024px (lg breakpoint): stacks vertically, Tasks on top.
 * Per UI-SPEC empty-state copy:
 *   Tasks: "No tasks linked." / "Add a task here..."
 *   Captures: "No captures linked." / "Tag a capture with this project..."
 */
export function ProjectDetailColumns({ projectId: _projectId, taskCount, captureCount }: Props) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full">
      {/* Tasks column */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[13px] uppercase tracking-widest text-muted-foreground">
            Tasks ({taskCount})
          </h2>
        </div>
        <div className="border-t border-border" />
        <ScrollArea className="flex-1 mt-3">
          {taskCount === 0 ? (
            <TasksEmptyState />
          ) : (
            <div className="text-[13px] text-muted-foreground">
              {/* Plan 03 renders task list here */}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Captures column */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[13px] uppercase tracking-widest text-muted-foreground">
            Captures ({captureCount})
          </h2>
        </div>
        <div className="border-t border-border" />
        <ScrollArea className="flex-1 mt-3">
          {captureCount === 0 ? (
            <CapturesEmptyState />
          ) : (
            <div className="text-[13px] text-muted-foreground">
              {/* Plan 04 renders captures list here */}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function TasksEmptyState() {
  return (
    <div className={cn("flex flex-col items-center text-center py-12 px-4")}>
      <h3 className="font-serif text-[28px] font-semibold leading-tight text-foreground mb-2">
        No tasks linked.
      </h3>
      <p className="font-serif text-base text-muted-foreground mb-6 max-w-xs">
        Add a task here, or link existing tasks to this project.
      </p>
      <Button variant="outline" className="font-sans text-[13px]" disabled>
        Add Task
      </Button>
    </div>
  );
}

function CapturesEmptyState() {
  return (
    <div className={cn("flex flex-col items-center text-center py-12 px-4")}>
      <h3 className="font-serif text-[28px] font-semibold leading-tight text-foreground mb-2">
        No captures linked.
      </h3>
      <p className="font-serif text-base text-muted-foreground mb-6 max-w-xs">
        Tag a capture with this project, or add one from the composer above.
      </p>
      <Button variant="outline" className="font-sans text-[13px]" disabled>
        Open composer
      </Button>
    </div>
  );
}
