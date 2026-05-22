"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { updateTaskStatus, reorderTasks } from "@/app/actions/tasks";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";

type Status =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

// CRITICAL: order matches task_status enum exactly (D-05). Do NOT alphabetize.
const STATUS_ORDER: Status[] = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
];

interface Props {
  tasks: TaskWithProjects[];
  onTaskClick: (id: string) => void;
  onCreateTask: (input: { title: string; status: Status }) => Promise<void>;
  addOptimistic: TasksOptimisticDispatch;
}

export function KanbanBoard({
  tasks,
  onTaskClick,
  onCreateTask,
  addOptimistic,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // activationConstraint distance: 8 — prevents accidental drag on click
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const tasksByStatus = STATUS_ORDER.reduce<Record<Status, TaskWithProjects[]>>(
    (acc, s) => {
      acc[s] = tasks.filter((t) => t.status === s);
      return acc;
    },
    {
      "not started": [],
      "up next": [],
      "in progress": [],
      "almost done": [],
      lesno: [],
    },
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    // eslint-disable-next-line no-console
    console.log("[kanban] drag start:", e.active.id);
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    // eslint-disable-next-line no-console
    console.log("[kanban] drag end:", { active: active.id, over: over?.id });
    setActiveId(null);
    if (!over) return;

    const taskId = String(active.id);
    const overId = String(over.id);

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (!draggedTask) return;

    // Determine target status — `over` is either another task ID or a column droppable id
    let targetStatus: Status;
    if (overId.startsWith("column:")) {
      targetStatus = overId.slice("column:".length) as Status;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      targetStatus = overTask.status;
    }

    if (targetStatus !== draggedTask.status) {
      // Cross-column drop — optimistic status flip (D-02: no opacity, instant)
      startTransition(async () => {
        addOptimistic({
          type: "update",
          id: taskId,
          patch: { status: targetStatus },
        });
        const r = await updateTaskStatus({
          id: taskId,
          newStatus: targetStatus,
        });
        if (!r.success) {
          // D-03: silent revert (useOptimistic auto-reverts on transition close
          // without a commit), surface error only.
          toast.error(r.error);
          return;
        }
        if (r.data.becameLesno) {
          toast("Lesno."); // UI-SPEC special toast literal — exact match required
        }
        // Realtime echo invalidates ['tasks', userId] → refetch with the canonical row.
      });
    } else {
      // Same-column reorder — optimistic + server reorderTasks
      const colTasks = tasksByStatus[targetStatus];
      const oldIndex = colTasks.findIndex((t) => t.id === taskId);
      const newIndex = colTasks.findIndex((t) => t.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const newCol = arrayMove(colTasks, oldIndex, newIndex);
      const newColIds = newCol.map((t) => t.id);
      // Full ordered ids list passed to reducer — its "reorder" branch keeps
      // any non-listed rows at the tail (other columns).
      const fullOrderedIds = [
        ...newColIds,
        ...tasks.filter((t) => !newColIds.includes(t.id)).map((t) => t.id),
      ];
      startTransition(async () => {
        addOptimistic({ type: "reorder", ids: fullOrderedIds });
        const r = await reorderTasks({
          status: targetStatus,
          orderedIds: newColIds,
        });
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      });
    }
  }

  return (
    <DndContext
      id="tasks-kanban"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-5 overflow-x-auto pb-4 pr-2">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onTaskClick={onTaskClick}
            onCreateTask={onCreateTask}
            activeId={activeId}
            pendingTaskId={null}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} onClick={() => {}} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
