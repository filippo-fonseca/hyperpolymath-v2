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
import { toast } from "sonner";
import { reorderTasks } from "@/app/actions/tasks";
import { TaskListRow } from "./TaskListRow";
import { PriorityChip } from "./PriorityChip";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string | null) => void;
  addOptimistic: TasksOptimisticDispatch;
  /** Unused since the craft-ui-v2 bare-row pass (rows carry their own
   * grammar, no column captions); kept so existing call sites compile. */
  showHeader?: boolean;
  /** Distinguishes multiple lists mounted at once (grouped view). */
  id?: string;
}

export function TaskList({
  tasks,
  onTaskClick,
  addOptimistic,
  id = "tasks-list",
}: Props) {
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
          // Explicit revert + toast.error. Drop the order override and fall
          // back to canonical order.
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
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        id={`${id}-sortable`}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {/* Craft Tasks hub grammar (craft-ui-v2): bare rows sitting directly
            on the sheet — no card box, no column captions. Each row carries
            its own trailing meta chips, so the list is just a quiet stack. */}
        <div className="flex flex-col gap-0.5">
          {tasks.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              onRowClick={onTaskClick}
              addOptimistic={addOptimistic}
            />
          ))}
        </div>
      </SortableContext>

      {/* DragOverlay — floating preview. The transient lifted row is the one
          surface here allowed a soft shadow (it floats like a popover). */}
      <DragOverlay>
        {activeTask ? (
          <div
            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 opacity-95"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <PriorityChip priority={activeTask.priority} />
            <span className="flex-1 truncate text-body text-[var(--ink)]">
              {activeTask.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
