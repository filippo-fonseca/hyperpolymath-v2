"use client";

import { useState, useTransition } from "react";
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
import { AreaContextMenu } from "@/components/areas/AreaContextMenu";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { cn } from "@/lib/utils";

interface Props {
  areas: SidebarArea[];
  collapsed: boolean;
}

export function SidebarTree({ areas, collapsed }: Props) {
  // Blocker 5 Option A: NO local areas state — read from props (Server Component data).
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = areas.findIndex((a) => a.id === active.id);
    const newIndex = areas.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(areas, oldIndex, newIndex);
    // Blocker 5 Option A: NO setAreas() local mutation. Persist then refresh.
    setPendingDragId(String(active.id));
    startTransition(async () => {
      const result = await reorderAreas({ orderedIds: next.map((a) => a.id) });
      setPendingDragId(null);
      if (!result.success) {
        toast.error(result.error);
        return; // UI stays in pre-drag order (no local mutation to roll back)
      }
      toast("Areas reordered.");
      router.refresh(); // Re-fetch Server Component data
    });
  }

  if (areas.length === 0) {
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
        items={areas.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {areas.map((area) => (
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        isDragging && "opacity-90 shadow-sm ring-1 ring-ring",
        isPending && "opacity-50",
      )}
    >
      <AreaContextMenu
        areaId={area.id}
        areaName={area.name}
        isArchived={!!area.archivedAt}
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-sans hover:bg-secondary cursor-pointer select-none",
            area.archivedAt && "opacity-50 italic line-through",
          )}
        >
          <span className="text-base leading-none">{area.emoji ?? "·"}</span>
          {!collapsed && (
            <span className="truncate text-foreground">{area.name}</span>
          )}
        </div>
      </AreaContextMenu>
      {!collapsed && area.projects.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-6 mt-0.5">
          {area.projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] font-sans text-muted-foreground py-1 hover:bg-secondary hover:text-foreground rounded-md px-2 truncate",
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
