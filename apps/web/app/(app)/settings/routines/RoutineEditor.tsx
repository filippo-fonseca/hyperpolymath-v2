"use client";

/**
 * RoutineEditor — the full-page edit surface (replaces the list while open).
 * Composes: name + description, the TriggerBuilder, and the drag-reorderable
 * BlockList. On save it assembles a RoutineSpec, validates it through the
 * jarvis-core zRoutineSpec contract (never send an unvalidated routine), then
 * calls create or update via the TanStack Query mutations.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  ROUTINE_SPEC_VERSION,
  zRoutineSpec,
  type RoutineBlock,
  type RoutineSpec,
  type RoutineTrigger,
} from "@hyperpolymath/jarvis-core";
import { TriggerBuilder } from "./TriggerBuilder";
import { BlockList } from "./BlockList";
import { useCreateRoutine, useUpdateRoutine } from "./queries";

export interface RoutineDraft {
  /** Present when editing an existing routine; absent for new/template drafts. */
  id?: string;
  name: string;
  description: string;
  spec: RoutineSpec;
}

interface Props {
  userId: string;
  draft: RoutineDraft;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 font-serif text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hud-cyan)] transition-colors duration-100";

export function RoutineEditor({ userId, draft, onClose }: Props) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [triggers, setTriggers] = useState<RoutineTrigger[]>(
    draft.spec.triggers,
  );
  const [blocks, setBlocks] = useState<RoutineBlock[]>(draft.spec.blocks);

  const createMut = useCreateRoutine(userId);
  const updateMut = useUpdateRoutine(userId);
  const pending = createMut.isPending || updateMut.isPending;
  const isEdit = Boolean(draft.id);

  function save() {
    if (!name.trim()) {
      toast.error("Give the routine a name.");
      return;
    }

    const spec: RoutineSpec = {
      version: ROUTINE_SPEC_VERSION,
      triggers,
      blocks,
    };

    const parsed = zRoutineSpec.safeParse(spec);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where =
        first?.path[0] === "triggers"
          ? "Add at least one valid trigger."
          : first?.path[0] === "blocks"
            ? "Add at least one block."
            : (first?.message ?? "Routine is incomplete.");
      toast.error(where);
      return;
    }

    if (isEdit && draft.id) {
      updateMut.mutate(
        {
          id: draft.id,
          name: name.trim(),
          description: description.trim() || null,
          spec: parsed.data,
        },
        { onSuccess: onClose },
      );
    } else {
      createMut.mutate(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          spec: parsed.data,
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100"
        >
          <ArrowLeft size={14} /> All routines
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
        >
          {pending ? "Saving…" : isEdit ? "Save routine" : "Create routine"}
        </button>
      </div>

      <div className="glass-tile space-y-4 rounded-xl p-6">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning Brief"
            maxLength={120}
            autoFocus
            className={`mt-2 ${inputClass}`}
          />
        </div>
        <div>
          <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Description
            <span className="ml-1 lowercase tracking-normal text-[var(--ink-muted)]">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Your day, assembled before you're out of bed."
            maxLength={500}
            className={`mt-2 ${inputClass}`}
          />
        </div>
      </div>

      <div className="glass-tile rounded-xl p-6">
        <TriggerBuilder triggers={triggers} onChange={setTriggers} />
      </div>

      <div className="glass-tile rounded-xl p-6">
        <BlockList blocks={blocks} onChange={setBlocks} />
      </div>
    </div>
  );
}
