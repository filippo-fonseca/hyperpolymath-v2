"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PriorityChip } from "@/components/tasks/PriorityChip";
import { CaptureCard } from "@/components/captures/CaptureCard";
import { cn } from "@/lib/utils";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

interface Props {
  projectId: string;
  tasks: TaskWithProjects[]; // TASK-08: real tasks from getTasksForProject
  captures: CaptureWithLinks[]; // CAPT-07: real captures from getCapturesForProject
}

/**
 * Two-column project detail layout — per D-15 + UI-SPEC §Project Detail Page.
 * Left column: Tasks (Plan 03 wires real data — TASK-08).
 * Right column: Captures (stub — Plan 04 wires real data).
 * Below 1024px (lg breakpoint): stacks vertically, Tasks on top.
 * Per UI-SPEC empty-state copy:
 *   Tasks: "No tasks linked." / "Add a task here..."
 *   Captures: "No captures linked." / "Tag a capture with this project..."
 */
export function ProjectDetailColumns({
  projectId: _projectId,
  tasks,
  captures,
}: Props) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full">
      {/* Tasks column */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[13px] uppercase tracking-widest text-muted-foreground">
            Tasks ({tasks.length})
          </h2>
        </div>
        <div className="border-t border-border" />
        <ScrollArea className="flex-1 mt-3">
          {tasks.length === 0 ? (
            <TasksEmptyState />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {tasks.map((task) => (
                <CompactTaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Captures column */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[13px] uppercase tracking-widest text-muted-foreground">
            Captures ({captures.length})
          </h2>
        </div>
        <div className="border-t border-border" />
        <ScrollArea className="flex-1 mt-3">
          {captures.length === 0 ? (
            <CapturesEmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              {captures.map((c) => (
                <CaptureCard key={c.id} capture={c} compact />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Compact task row (TASK-08) ───────────────────────────────────────────────

function CompactTaskRow({ task }: { task: TaskWithProjects }) {
  const isLesno = task.status === "lesno";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue =
    task.dueDate !== null &&
    !isLesno &&
    new Date(task.dueDate) < today;

  const STATUS_LABELS: Record<string, string> = {
    "not started": "Not Started",
    "up next": "Up Next",
    "in progress": "In Progress",
    "almost done": "Almost Done",
    lesno: "Lesno",
  };

  return (
    <div className="flex items-center gap-2 py-2 px-1 hover:bg-secondary/40 rounded transition-colors">
      <div className="flex-shrink-0">
        <PriorityChip priority={task.priority} />
      </div>
      <span
        className={cn(
          "font-serif text-base text-foreground truncate flex-1",
          isLesno && "line-through opacity-60",
        )}
      >
        {task.title}
      </span>
      <span className="font-sans text-[13px] text-muted-foreground flex-shrink-0">
        {STATUS_LABELS[task.status] ?? task.status}
      </span>
      {task.dueDate && (
        <span
          className={cn(
            "font-sans text-[13px] flex-shrink-0",
            isOverdue ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {formatDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
