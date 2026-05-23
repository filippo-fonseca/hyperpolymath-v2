"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTaskStatus } from "@/app/actions/tasks";
import { KanbanColumn } from "./KanbanColumn";
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
  // Single ref tracks the dragged task (v1 pattern: pure React state, no
  // dataTransfer payload needed — though we still write to dataTransfer so
  // Firefox honors the drag, see TaskCard.onDragStart).
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const draggedTask = draggedTaskId
    ? tasks.find((t) => t.id === draggedTaskId) ?? null
    : null;
  const draggedFromStatus: Status | null = draggedTask
    ? (draggedTask.status as Status)
    : null;

  function handleDropOnColumn(targetStatus: Status) {
    if (!draggedTask) return;
    if (draggedTask.status === targetStatus) {
      setDraggedTaskId(null);
      return;
    }

    const taskId = draggedTask.id;
    setDraggedTaskId(null);

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
        toast.error(r.error);
        return;
      }
      if (r.data.becameLesno) {
        toast("Lesno.");
      }
    });
  }

  return (
    <div className="flex gap-5 overflow-x-auto pb-4 pr-2">
      {STATUS_ORDER.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={tasksByStatus[status]}
          onTaskClick={onTaskClick}
          onCreateTask={onCreateTask}
          draggedTaskId={draggedTaskId}
          draggedFromStatus={draggedFromStatus}
          onDragStart={setDraggedTaskId}
          onDragEnd={() => setDraggedTaskId(null)}
          onDropOnColumn={handleDropOnColumn}
          pendingTaskId={null}
        />
      ))}
    </div>
  );
}
