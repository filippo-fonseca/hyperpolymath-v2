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
  createBatch,
  deleteBatch,
  reorderBatches,
  updateBatch,
} from "@/app/actions/training";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { BatchRow, TypeWithBatch } from "@/lib/db/queries/training";
import { cn } from "@/lib/utils";

interface Props {
  batches: BatchRow[];
  types: TypeWithBatch[];
  /** Selected batch id (or null for ungrouped) — drives which TypeEditor is shown. */
  selectedBatchId: string | null | "__ungrouped__";
  onSelectBatchForTypes: (batchId: string | null | "__ungrouped__") => void;
}

/**
 * BatchEditor — slide-over Sheet's batch list (Phase 15 / D-05).
 *
 * - `@dnd-kit/sortable` + `verticalListSortingStrategy` for drag-to-reorder.
 *   Mirrors `SidebarTree` precedent — NOT native HTML5 DnD.
 * - Inline-editable name (click name → input → Enter to save).
 * - Optimistic UUID per RT-05: `crypto.randomUUID()` is generated client-side
 *   and passed to `createBatch({ id, name })` so Realtime echo deduplicates.
 * - Archive (soft delete) via the kebab.
 * - Always renders an "Ungrouped" pseudo-row at the bottom (non-draggable) so
 *   the user can park types outside any batch.
 *
 * Clicking a batch row selects it as the "types scope" for the parent
 * ManageTypesSheet — TypeEditor below filters to that batch.
 */
export function BatchEditor({
  batches,
  types,
  selectedBatchId,
  onSelectBatchForTypes,
}: Props) {
  const [draftName, setDraftName] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // Local optimistic order — Realtime invalidation will repopulate from server.
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = useMemo(() => {
    if (!optimisticIds) return batches;
    const map = new Map(batches.map((b) => [b.id, b]));
    const arr: BatchRow[] = [];
    for (const id of optimisticIds) {
      const b = map.get(id);
      if (b) arr.push(b);
    }
    // Append any batch not in optimistic list (newly arrived via realtime).
    for (const b of batches) if (!optimisticIds.includes(b.id)) arr.push(b);
    return arr;
  }, [batches, optimisticIds]);

  const ungroupedCount = useMemo(
    () => types.filter((t) => t.batchId == null).length,
    [types],
  );

  const countByBatch = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of types) {
      if (t.batchId == null) continue;
      m.set(t.batchId, (m.get(t.batchId) ?? 0) + 1);
    }
    return m;
  }, [types]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((b) => b.id === active.id);
    const newIndex = ordered.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOptimisticIds(next.map((b) => b.id));
    const res = await reorderBatches({ orderedIds: next.map((b) => b.id) });
    if (!res.success) {
      toast.error(res.error || "Could not reorder batches");
      setOptimisticIds(null);
    }
  };

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    const id = crypto.randomUUID(); // RT-05 — pre-generate so realtime dedupes
    setDraftName("");
    const res = await createBatch({ id, name });
    if (!res.success) toast.error(res.error || "Could not create batch");
  };

  const handleRename = async (id: string) => {
    const name = editingValue.trim();
    setEditingId(null);
    if (!name) return;
    const res = await updateBatch({ id, name });
    if (!res.success) toast.error(res.error || "Could not rename batch");
  };

  const handleArchive = async (id: string) => {
    const res = await deleteBatch({ id });
    if (!res.success) toast.error(res.error || "Could not archive batch");
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
        Batches
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col">
            {ordered.map((b) => (
              <BatchRow
                key={b.id}
                batch={b}
                selected={selectedBatchId === b.id}
                editing={editingId === b.id}
                editingValue={editingValue}
                count={countByBatch.get(b.id) ?? 0}
                onSelect={() => onSelectBatchForTypes(b.id)}
                onStartEdit={() => {
                  setEditingValue(b.name);
                  setEditingId(b.id);
                }}
                onEditingValueChange={setEditingValue}
                onCommitEdit={() => handleRename(b.id)}
                onCancelEdit={() => setEditingId(null)}
                onArchive={() => handleArchive(b.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Ungrouped pseudo-row — non-draggable, always last. */}
      <button
        type="button"
        onClick={() => onSelectBatchForTypes("__ungrouped__")}
        className={cn(
          "group flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
          selectedBatchId === "__ungrouped__"
            ? "bg-[var(--surface)] text-[var(--ink)]"
            : "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
        )}
      >
        <span className="w-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate font-serif italic">Ungrouped</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          {ungroupedCount}
        </span>
      </button>

      {/* Add batch footer */}
      <div className="mt-2 flex items-center gap-1 px-1">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="New batch"
          className="h-7 text-xs"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          aria-label="Add batch"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

interface BatchRowProps {
  batch: BatchRow;
  selected: boolean;
  editing: boolean;
  editingValue: string;
  count: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditingValueChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onArchive: () => void;
}

function BatchRow({
  batch,
  selected,
  editing,
  editingValue,
  count,
  onSelect,
  onStartEdit,
  onEditingValueChange,
  onCommitEdit,
  onCancelEdit,
  onArchive,
}: BatchRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: batch.id });

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

      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onStartEdit}
        className={cn(
          "flex flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors",
          selected
            ? "bg-[var(--surface)] text-[var(--ink)]"
            : "text-[var(--ink)] hover:bg-[var(--surface)]",
        )}
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
            onClick={(e) => e.stopPropagation()}
            className="h-6 text-xs"
          />
        ) : (
          <span className="flex-1 truncate font-serif">{batch.name}</span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          {count}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Batch actions"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--ink-muted)] opacity-0 hover:bg-[var(--surface)] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onStartEdit}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={onArchive}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
