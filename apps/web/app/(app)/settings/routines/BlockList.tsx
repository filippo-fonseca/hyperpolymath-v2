"use client";

/**
 * BlockList — the ordered, drag-reorderable list of a routine's blocks. Array
 * order IS execution order. dnd-kit wiring mirrors components/tasks/TaskList.tsx
 * (PointerSensor distance:8, closestCenter, verticalListSortingStrategy,
 * arrayMove on drag end). "+ Add block" and per-block edit open the BlockEditor.
 */

import { useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import { BlockCard } from "./BlockCard";
import { BlockEditor } from "./BlockEditor";

interface Props {
  blocks: RoutineBlock[];
  onChange: (blocks: RoutineBlock[]) => void;
}

type EditorState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; block: RoutineBlock };

export function BlockList({ blocks, onChange }: Props) {
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }

  function upsert(block: RoutineBlock) {
    const exists = blocks.some((b) => b.id === block.id);
    onChange(
      exists
        ? blocks.map((b) => (b.id === block.id ? block : b))
        : [...blocks, block],
    );
    setEditor({ mode: "closed" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          Blocks
        </p>
        <p className="font-serif text-[12px] text-[var(--ink-muted)]">
          Run top to bottom. Drag to reorder.
        </p>
      </div>

      {blocks.length === 0 && editor.mode === "closed" ? (
        <p className="font-serif text-[14px] text-[var(--ink-muted)]">
          No blocks yet. Add one so the routine actually does something.
        </p>
      ) : null}

      <DndContext
        id="routine-blocks"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {blocks.map((block, i) => (
              <BlockCard
                key={block.id}
                block={block}
                index={i}
                onEdit={() => setEditor({ mode: "edit", block })}
                onRemove={() =>
                  onChange(blocks.filter((b) => b.id !== block.id))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editor.mode === "add" ? (
        <BlockEditor
          onConfirm={upsert}
          onCancel={() => setEditor({ mode: "closed" })}
        />
      ) : editor.mode === "edit" ? (
        <BlockEditor
          initial={editor.block}
          onConfirm={upsert}
          onCancel={() => setEditor({ mode: "closed" })}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditor({ mode: "add" })}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--edge)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:border-[var(--hud-cyan)] hover:text-[var(--ink)] transition-colors duration-100"
        >
          <Plus size={14} /> Add block
        </button>
      )}
    </div>
  );
}
