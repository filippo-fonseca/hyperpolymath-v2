"use client";

import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";
import { useStudioData } from "@/components/studio/data/useStudioData";
import { useStudioTasks } from "@/components/studio/data/hooks";

/**
 * TasksFocus — thin adapter around the real `UpcomingTasksWidget`.
 *
 * Feeds it the studio's live task collection as `initialData` on the SAME
 * `tableKey("tasks", userId)` query the widget subscribes to — so there is zero
 * extra fetch and the overlay renders crisp, fully interactive rows (inline
 * create, optimistic check-off). `limit: 50` opens it up for the full-focus
 * view versus the ambient tile's short list.
 */
export function TasksFocus(): React.ReactElement {
  const { userId } = useStudioData();
  const { tasks } = useStudioTasks();
  return (
    <UpcomingTasksWidget
      userId={userId}
      initialTasks={tasks}
      limit={50}
      compact={false}
    />
  );
}

export default TasksFocus;
