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
 "w-full rounded-[9px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-2 text-meta text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]";

export function RoutineEditor({ userId, draft, onClose }: Props) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [triggers, setTriggers] = useState<RoutineTrigger[]>(
    draft.spec.triggers,
  );
  const [blocks, setBlocks] = useState<RoutineBlock[]>(draft.spec.blocks);
  // Routine-level loading chatter: a spoken opener line JARVIS says the moment
  // the routine fires — interpreted (not echoed verbatim) by the runner into a
  // fresh non-deterministic line every run. Optional; off by default.
  const [openerChatterEnabled, setOpenerChatterEnabled] = useState<boolean>(
    Boolean(
      draft.spec.loadingInstruction &&
        draft.spec.loadingInstruction.length > 0,
    ),
  );
  const [openerLoadingInstruction, setOpenerLoadingInstruction] = useState(
    draft.spec.loadingInstruction ?? "",
  );

  const createMut = useCreateRoutine(userId);
  const updateMut = useUpdateRoutine(userId);
  const pending = createMut.isPending || updateMut.isPending;
  const isEdit = Boolean(draft.id);

  function save() {
    if (!name.trim()) {
      toast.error("Give the routine a name.");
      return;
    }

    const trimmedOpenerInstruction = openerLoadingInstruction.trim();
    const spec: RoutineSpec = {
      version: ROUTINE_SPEC_VERSION,
      triggers,
      blocks,
      loadingInstruction:
        openerChatterEnabled && trimmedOpenerInstruction
          ? trimmedOpenerInstruction
          : undefined,
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
 className="inline-flex items-center gap-1.5 text-micro text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
        >
          <ArrowLeft size={14} /> All routines
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
 className="sd-btn-solid rounded-[8px] px-4 py-2 text-micro disabled:opacity-40 transition-opacity duration-100"
        >
          {pending ? "Saving…" : isEdit ? "Save routine" : "Create routine"}
        </button>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
        <div>
 <label className="text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
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
 <label className="text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
            Description
            <span className="ml-1 lowercase tracking-normal text-[var(--sd-ink-faint)]">
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

      <div className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
        <div>
 <label className="flex items-center gap-2 text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
            <input
              type="checkbox"
              checked={openerChatterEnabled}
              onChange={(e) => setOpenerChatterEnabled(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--sd-accent)]"
            />
            Opening line while routine runs
          </label>
          {openerChatterEnabled ? (
            <>
              <textarea
                value={openerLoadingInstruction}
                onChange={(e) => setOpenerLoadingInstruction(e.target.value)}
                placeholder="what jarvis says the moment the routine fires — e.g. 'greet sir and let him know you're assembling his morning brief'"
                rows={2}
                maxLength={2000}
 className="mt-2 w-full resize-y rounded-[9px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-2 text-meta leading-[1.5] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]"
              />
 <p className="mt-1.5 text-micro leading-[1.5] text-[var(--sd-ink-dull)]">
                Instructions, not a script. JARVIS interprets these into a fresh
                spoken opener every run — played once up front, before any block
                result. Replaces the default opener when set.
              </p>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
        <TriggerBuilder triggers={triggers} onChange={setTriggers} />
      </div>

      <div className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
        <BlockList blocks={blocks} onChange={setBlocks} />
      </div>
    </div>
  );
}
