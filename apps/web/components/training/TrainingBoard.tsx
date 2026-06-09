"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { isSameDay, format } from "date-fns";
import { toast } from "sonner";
import { moveActivity } from "@/app/actions/training";
import type {
  ActivityWithType,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import type { DistanceUnit } from "@/lib/training/distance";
import { TrainingDayColumn } from "./TrainingDayColumn";

interface Props {
  userId: string;
  days: Date[];
  activities: ActivityWithType[];
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
  /** Threaded through to ActivityCard — opens CompleteActivityDialog. */
  onCheckOff?: (activity: ActivityWithType) => void;
  /** Threaded through to ActivityCard — opens ActivityEditDialog. */
  onEdit?: (activity: ActivityWithType) => void;
}

/**
 * Week kanban — 7 day columns wrapped in a single `@dnd-kit` DndContext.
 *
 * Drop semantics (D-03): dropping a card on a *different* day column triggers
 * `moveActivity({ id, scheduledDate })`. The column droppable id is the ISO
 * date string of that column, which matches the column's `useDroppable({ id })`
 * declaration in TrainingDayColumn.
 *
 * RESEARCH correction: the older Tasks kanban uses native HTML5 DnD; the
 * Training board does NOT. We mirror SidebarTree's `@dnd-kit/core` precedent.
 */
export function TrainingBoard({
  userId,
  days,
  activities,
  types,
  distanceUnit,
  onCheckOff,
  onEdit,
}: Props) {
  void userId; // accepted for callback parity; mutations run via Server Actions.

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const [isDragging, setIsDragging] = useState(false);

  // Group activities by yyyy-MM-dd so each column only renders its own slice.
  const byDate = useMemo(() => {
    const m = new Map<string, ActivityWithType[]>();
    for (const a of activities) {
      const arr = m.get(a.scheduledDate);
      if (arr) arr.push(a);
      else m.set(a.scheduledDate, [a]);
    }
    return m;
  }, [activities]);

  const handleDragEnd = (e: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = e;
    if (!over) return;
    const targetDate = String(over.id);
    const activityId = String(active.id);
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) return;
    if (activity.scheduledDate === targetDate) return;

    // Optimistic UX: Realtime echo will refresh the cache; we just rely on the
    // Server Action returning + Realtime invalidating the week key.
    void moveActivity({ id: activityId, scheduledDate: targetDate }).then(
      (res) => {
        if (!res.success) {
          toast.error(res.error || "Could not move activity");
        }
      },
    );
  };

  const today = new Date();

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => setIsDragging(true)}
      onDragCancel={() => setIsDragging(false)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid flex-1 grid-cols-7 gap-2 overflow-x-auto">
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          return (
            <TrainingDayColumn
              key={iso}
              dateISO={iso}
              date={d}
              isToday={isSameDay(d, today)}
              activities={byDate.get(iso) ?? []}
              types={types}
              distanceUnit={distanceUnit}
              isAnyDragging={isDragging}
              onCheckOff={onCheckOff}
              onEdit={onEdit}
            />
          );
        })}
      </div>
    </DndContext>
  );
}
