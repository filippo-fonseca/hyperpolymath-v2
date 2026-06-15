"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { reorderTasks } from "@/app/actions/tasks";
import { TaskListRow } from "./TaskListRow";
import { PriorityChip } from "./PriorityChip";
import { cn } from "@/lib/utils";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string | null) => void;
  addOptimistic: TasksOptimisticDispatch;
}

export function TaskList({ tasks, onTaskClick, addOptimistic }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId) ?? null
    : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const taskId = String(active.id);
    const overId = String(over.id);

    const oldIndex = tasks.findIndex((t) => t.id === taskId);
    const newIndex = tasks.findIndex((t) => t.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const newOrder = arrayMove(tasks, oldIndex, newIndex);

    // Group reorders by status and call reorderTasks for each status group
    const byStatus = new Map<string, string[]>();
    for (const t of newOrder) {
      const list = byStatus.get(t.status) ?? [];
      list.push(t.id);
      byStatus.set(t.status, list);
    }

    startTransition(async () => {
      // Optimistic: apply the new order across all tasks
      addOptimistic({ type: "reorder", ids: newOrder.map((t) => t.id) });
      for (const [status, orderedIds] of byStatus) {
        const r = await reorderTasks({ status, orderedIds });
        if (!r.success) {
          // D-03: explicit revert (RT-06: overlay no longer auto-reverts) +
          // toast.error. Drop the order override → fall back to canonical order.
          toast.error(r.error);
          addOptimistic({ type: "revert-reorder" });
          return;
        }
      }
      // Realtime echo invalidates ['tasks', userId] and refetches canonical order.
    });
  }

  if (tasks.length === 0) return null;

  return (
    <DndContext
      id="tasks-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        id="tasks-list-sortable"
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col">
          {/* Header row — mono metadata chrome per UI-SPEC §5h */}
          <div className="flex items-center gap-2 h-8 px-2 border-b border-[var(--edge)]">
            <div className="w-4 flex-shrink-0" /> {/* drag handle placeholder */}
            <div className="w-4 flex-shrink-0" /> {/* checkbox placeholder */}
            <div className="w-4 flex-shrink-0" /> {/* priority placeholder */}
            <span className="flex-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Title
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] w-28 flex-shrink-0">
              Project
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] w-24 flex-shrink-0">
              Status
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] w-20 flex-shrink-0">
              Due
            </span>
            <div className="w-6 flex-shrink-0" />
          </div>

          {/* AnimatePresence drives TaskListRow exit animation (opacity 0 + height 0)
              on delete per UI-SPEC §7c / felt-quality mandate. `mode="popLayout"`
              lets sibling rows reflow during the exit instead of holding the slot. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {tasks.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                onRowClick={onTaskClick}
                addOptimistic={addOptimistic}
              />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>

      {/* DragOverlay — floating preview */}
      <DragOverlay>
        {activeTask ? (
          <div
            className={cn(
              "flex items-center gap-2 h-10 px-3 rounded-md opacity-95",
              "bg-[var(--surface)] border border-[var(--edge)]",
            )}
            style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          >
            <PriorityChip priority={activeTask.priority} />
            <span className="font-serif text-base text-[var(--ink)] truncate flex-1">
              {activeTask.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
