"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}

export function KanbanBoard({ tasks, onTaskClick, onCreateTask }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

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
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
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

    setPendingTaskId(taskId);

    if (targetStatus !== draggedTask.status) {
      // Cross-column drop: update status server-side, then refresh
      startTransition(async () => {
        const r = await updateTaskStatus({ id: taskId, newStatus: targetStatus });
        setPendingTaskId(null);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        if (r.data.becameLesno) {
          toast("Lesno."); // UI-SPEC special toast literal — exact match required
        }
        router.refresh();
      });
    } else {
      // Same-column reorder
      const colTasks = tasksByStatus[targetStatus];
      const oldIndex = colTasks.findIndex((t) => t.id === taskId);
      const newIndex = colTasks.findIndex((t) => t.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        setPendingTaskId(null);
        return;
      }
      const newCol = arrayMove(colTasks, oldIndex, newIndex);
      startTransition(async () => {
        const r = await reorderTasks({
          status: targetStatus,
          orderedIds: newCol.map((t) => t.id),
        });
        setPendingTaskId(null);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        router.refresh();
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onTaskClick={onTaskClick}
            onCreateTask={onCreateTask}
            activeId={activeId}
            pendingTaskId={pendingTaskId}
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
