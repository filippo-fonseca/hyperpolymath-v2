"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BatchRow, TypeWithBatch } from "@/lib/db/queries/training";
import { BatchEditor } from "./BatchEditor";
import { TypeEditor } from "./TypeEditor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  batches: BatchRow[];
  types: TypeWithBatch[];
}

type BatchScope = string | null | "__ungrouped__";

/**
 * ManageTypesSheet — slide-over surface for batch + type CRUD (Phase 15 / D-04).
 *
 * Layout: a right-side Sheet split into two stacked editors —
 *   - BatchEditor: list of batches with drag-to-reorder; selecting a batch
 *     scopes the TypeEditor below to its types.
 *   - TypeEditor: types belonging to the selected scope (a specific batch,
 *     or the special "__ungrouped__" sentinel for types with batchId=null).
 *
 * Pitfall 8: open state is owned by TrainingClient (one level up) so Realtime
 * invalidations on `types` / `batches` refetch the underlying data without
 * closing the sheet mid-edit.
 *
 * Empty state (D-07): when the user has zero types AND zero batches, render
 * an inline "Create your first activity type" CTA — TrainingClient already
 * auto-opens the sheet when `types.length === 0` so this is the first thing
 * the user sees on a fresh install.
 */
export function ManageTypesSheet({
  open,
  onOpenChange,
  userId,
  batches,
  types,
}: Props) {
  void userId; // accepted for parity with the rest of the planner surface

  // Default the type-list scope to the first batch (or "__ungrouped__" if no
  // batches exist). Update when batches arrive via realtime so the scope
  // doesn't dangle on a stale id.
  const [scope, setScope] = useState<BatchScope>(() =>
    batches[0]?.id ?? "__ungrouped__",
  );

  useEffect(() => {
    if (scope === "__ungrouped__" || scope === null) return;
    if (!batches.some((b) => b.id === scope)) {
      setScope(batches[0]?.id ?? "__ungrouped__");
    }
  }, [batches, scope]);

  const scopedTypes = useMemo(() => {
    if (scope === "__ungrouped__") return types.filter((t) => t.batchId == null);
    return types.filter((t) => t.batchId === scope);
  }, [types, scope]);

  const isEmpty = batches.length === 0 && types.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 sm:max-w-[560px]"
      >
        <SheetHeader className="border-b border-[var(--edge)]">
          <SheetTitle>Activity types & batches</SheetTitle>
          <SheetDescription>
            Group your activity types into batches. Drag to reorder. Pick a
            color from the palette — colors blend in the heatmap.
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-sm text-[var(--sd-ink-dull)]">
              Create your first activity type to start planning. Types are the
              templates ("Run", "Yoga", "Lift") you reuse across days. Batches
              are optional groupings ("Cardio", "Strength").
            </p>
            {/* First-run composer sits on a craft plate rather than a dashed
                box, so the first thing a new user sees matches the register. */}
            <div className="craft-card rounded-xl p-3">
              <TypeEditor batchId={null} types={[]} allBatches={[]} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-4">
            <BatchEditor
              batches={batches}
              types={types}
              selectedBatchId={scope}
              onSelectBatchForTypes={setScope}
            />

            <div className="border-t border-[var(--edge)]" />

            <div className="flex flex-col gap-1">
              <div className="px-1 pb-1 text-micro text-[var(--sd-ink-dull)]">
                {scope === "__ungrouped__"
                  ? "Ungrouped types"
                  : `Types in ${batches.find((b) => b.id === scope)?.name ?? "batch"}`}
              </div>
              <TypeEditor
                batchId={scope === "__ungrouped__" ? null : (scope as string | null)}
                types={scopedTypes}
                allBatches={batches}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
