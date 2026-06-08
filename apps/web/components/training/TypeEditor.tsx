"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createType,
  deleteType,
  reorderTypes,
  updateType,
} from "@/app/actions/training";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { BatchRow, TypeWithBatch } from "@/lib/db/queries/training";
import { TRAINING_PALETTE, paletteById } from "@/lib/training/palette";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./ColorPicker";

interface Props {
  /** Null for ungrouped scope; UUID for a specific batch. */
  batchId: string | null;
  /** Types in this scope only — parent filters. */
  types: TypeWithBatch[];
  /** All non-archived batches — used by the "Move to batch" submenu. */
  allBatches: BatchRow[];
}

/**
 * TypeEditor — slide-over Sheet's per-batch type list (Phase 15 / D-05).
 *
 * - `@dnd-kit/sortable` reorder within the (batch) scope.
 * - Inline-edit name; color swatch opens a Popover containing ColorPicker.
 * - has_distance toggle as a small checkbox-styled switch (no shadcn Switch
 *   in this repo yet — built ad-hoc).
 * - Archive: server may return `{ success: false, error: "This type has N..." }`
 *   when activities still reference it; surface as a toast asking the user to
 *   delete the activities first (per RESEARCH Open Q4).
 * - Move-to-batch via kebab submenu.
 */
export function TypeEditor({ batchId, types, allBatches }: Props) {
  const [draftName, setDraftName] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = useMemo(() => {
    if (!optimisticIds) return types;
    const map = new Map(types.map((t) => [t.id, t]));
    const arr: TypeWithBatch[] = [];
    for (const id of optimisticIds) {
      const t = map.get(id);
      if (t) arr.push(t);
    }
    for (const t of types) if (!optimisticIds.includes(t.id)) arr.push(t);
    return arr;
  }, [types, optimisticIds]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((t) => t.id === active.id);
    const newIndex = ordered.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOptimisticIds(next.map((t) => t.id));
    const res = await reorderTypes({
      orderedIds: next.map((t) => t.id),
      batchId,
    });
    if (!res.success) {
      toast.error(res.error || "Could not reorder types");
      setOptimisticIds(null);
    }
  };

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    const id = crypto.randomUUID(); // RT-05 — optimistic UUID
    const defaultColor =
      paletteById("cyan")?.oklch ?? TRAINING_PALETTE[0]!.oklch;
    setDraftName("");
    const res = await createType({
      id,
      batchId,
      name,
      color: defaultColor,
      hasDistance: false,
    });
    if (!res.success) toast.error(res.error || "Could not create type");
  };

  const handleRename = async (id: string) => {
    const name = editingValue.trim();
    setEditingId(null);
    if (!name) return;
    const res = await updateType({ id, name });
    if (!res.success) toast.error(res.error || "Could not rename type");
  };

  const handleColorChange = async (id: string, color: string) => {
    const res = await updateType({ id, color });
    if (!res.success) toast.error(res.error || "Could not recolor type");
  };

  const handleToggleDistance = async (
    id: string,
    nextHasDistance: boolean,
  ) => {
    const res = await updateType({ id, hasDistance: nextHasDistance });
    if (!res.success) toast.error(res.error || "Could not update type");
  };

  const handleMoveToBatch = async (
    id: string,
    targetBatchId: string | null,
  ) => {
    const res = await updateType({ id, batchId: targetBatchId });
    if (!res.success) toast.error(res.error || "Could not move type");
  };

  const handleArchive = async (id: string) => {
    const res = await deleteType({ id });
    if (!res.success) {
      // Server returns a friendly error if activities reference the type.
      toast.error(res.error || "Could not archive type");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col">
            {ordered.map((t) => (
              <TypeRow
                key={t.id}
                type={t}
                editing={editingId === t.id}
                editingValue={editingValue}
                allBatches={allBatches}
                currentBatchId={batchId}
                onStartEdit={() => {
                  setEditingValue(t.name);
                  setEditingId(t.id);
                }}
                onEditingValueChange={setEditingValue}
                onCommitEdit={() => handleRename(t.id)}
                onCancelEdit={() => setEditingId(null)}
                onColorChange={(c) => handleColorChange(t.id, c)}
                onToggleDistance={(v) => handleToggleDistance(t.id, v)}
                onMoveToBatch={(b) => handleMoveToBatch(t.id, b)}
                onArchive={() => handleArchive(t.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="mt-1 flex items-center gap-1 px-1">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="New activity type"
          className="h-7 text-xs"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          aria-label="Add type"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

interface TypeRowProps {
  type: TypeWithBatch;
  editing: boolean;
  editingValue: string;
  allBatches: BatchRow[];
  currentBatchId: string | null;
  onStartEdit: () => void;
  onEditingValueChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onColorChange: (oklch: string) => void;
  onToggleDistance: (v: boolean) => void;
  onMoveToBatch: (batchId: string | null) => void;
  onArchive: () => void;
}

function TypeRow({
  type,
  editing,
  editingValue,
  allBatches,
  currentBatchId,
  onStartEdit,
  onEditingValueChange,
  onCommitEdit,
  onCancelEdit,
  onColorChange,
  onToggleDistance,
  onMoveToBatch,
  onArchive,
}: TypeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: type.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-1 rounded px-1 py-0.5",
        isDragging && "z-10 opacity-60",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="flex h-6 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--ink-muted)] opacity-0 hover:text-[var(--ink)] group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change color"
            className="h-4 w-4 shrink-0 rounded-full ring-1 ring-[var(--edge)] transition-transform hover:scale-110"
            style={{ backgroundColor: type.color }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <ColorPicker value={type.color} onChange={onColorChange} />
        </PopoverContent>
      </Popover>

      <div
        className="flex flex-1 items-center gap-2"
        onDoubleClick={onStartEdit}
      >
        {editing ? (
          <Input
            autoFocus
            value={editingValue}
            onChange={(e) => onEditingValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            onBlur={onCommitEdit}
            className="h-6 text-xs"
          />
        ) : (
          <span className="flex-1 truncate font-serif text-sm">{type.name}</span>
        )}
      </div>

      {/* Distance toggle — ad-hoc switch (no shadcn Switch in repo yet). */}
      <label
        className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:bg-[var(--surface)]"
        title="Track distance for this activity"
      >
        <input
          type="checkbox"
          checked={type.hasDistance}
          onChange={(e) => onToggleDistance(e.target.checked)}
          className="h-3 w-3 accent-[var(--ink)]"
        />
        km
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Type actions"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--ink-muted)] opacity-0 hover:bg-[var(--surface)] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onStartEdit}>Rename</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to batch</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem
                disabled={currentBatchId === null}
                onSelect={() => onMoveToBatch(null)}
              >
                <span className="font-serif italic">Ungrouped</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {allBatches.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  disabled={currentBatchId === b.id}
                  onSelect={() => onMoveToBatch(b.id)}
                >
                  {b.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onArchive}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
