"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { toast } from "sonner";
import { reorderAreas } from "@/app/actions/areas";
import { AreaActionsMenu } from "@/components/areas/AreaContextMenu";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { cn } from "@/lib/utils";

interface Props {
  areas: SidebarArea[];
  collapsed: boolean;
}

export function SidebarTree({ areas, collapsed }: Props) {
  // React 19 useOptimistic — drop-time visual reorder; auto-reverts to props
  // on error (action returns without success) or when router.refresh() lands.
  const [optimisticAreas, applyOptimisticOrder] = useOptimistic(
    areas,
    (current: SidebarArea[], orderedIds: string[]) =>
      orderedIds
        .map((id) => current.find((a) => a.id === id))
        .filter((a): a is SidebarArea => Boolean(a)),
  );
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = optimisticAreas.findIndex((a) => a.id === active.id);
    const newIndex = optimisticAreas.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(optimisticAreas, oldIndex, newIndex);
    const orderedIds = next.map((a) => a.id);
    setPendingDragId(String(active.id));
    startTransition(async () => {
      // Apply optimistic order — view updates immediately, no snap-back.
      applyOptimisticOrder(orderedIds);
      const result = await reorderAreas({ orderedIds });
      setPendingDragId(null);
      if (!result.success) {
        // useOptimistic auto-reverts to `areas` (props) when transition ends
        // without persisted state — no manual rollback needed.
        toast.error(result.error);
        return;
      }
      toast("Areas reordered.");
      // router.refresh() updates `areas` prop → optimistic merges with new state.
      router.refresh();
    });
  }

  if (optimisticAreas.length === 0) {
    return (
      <div className="px-4 py-2 text-[13px] font-sans text-muted-foreground">
        No areas yet.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={optimisticAreas.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {optimisticAreas.map((area) => (
            <SortableAreaRow
              key={area.id}
              area={area}
              collapsed={collapsed}
              isPending={pendingDragId === area.id && isPending}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableAreaRow({
  area,
  collapsed,
  isPending,
}: {
  area: SidebarArea;
  collapsed: boolean;
  isPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: area.id });
  const [rightClickOpen, setRightClickOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col",
        isDragging && "opacity-90 z-10 relative",
      )}
    >
      {/* The row IS the drag handle. Pointer events on the menu button stop
          propagation so click ⋯ doesn't start a drag. */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => {
          e.preventDefault();
          setRightClickOpen(true);
        }}
        className={cn(
          "group/area relative flex items-center gap-2 rounded-md px-2 py-1",
          "text-[13px] font-sans text-foreground select-none",
          "hover:bg-secondary cursor-grab active:cursor-grabbing",
          "transition-colors",
          isDragging && "bg-secondary shadow-md ring-1 ring-ring cursor-grabbing",
          isPending && "opacity-50",
          area.archivedAt && "opacity-50 italic line-through",
        )}
      >
        <span className="text-base leading-none shrink-0">
          {area.emoji ?? "·"}
        </span>
        {!collapsed && (
          <>
            <span className="truncate flex-1 min-w-0">{area.name}</span>
            <AreaActionsMenu
              areaId={area.id}
              areaName={area.name}
              isArchived={!!area.archivedAt}
              rightClickOpen={rightClickOpen}
              onRightClickClose={() => setRightClickOpen(false)}
            />
          </>
        )}
      </div>

      {!collapsed && area.projects.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-6 mt-0.5">
          {area.projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 truncate",
                  "text-[13px] font-sans text-muted-foreground",
                  "hover:bg-secondary hover:text-foreground transition-colors",
                  p.archivedAt && "opacity-50 italic line-through",
                )}
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
