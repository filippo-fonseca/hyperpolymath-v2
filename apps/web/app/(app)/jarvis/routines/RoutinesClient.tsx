"use client";

/**
 * RoutinesClient — the routines list + empty state + editor orchestration
 * (Spacedrive register).
 *
 * Full-page-panel model (per plan): when a routine is open for edit (or a new /
 * template draft is started), the editor replaces the list. Reads come from
 * TanStack Query (SSR-seeded); toggle/delete are optimistic; run-now hits the
 * block-engine endpoint and degrades gracefully.
 */

import { useState } from "react";
import { Plus, Play, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  ROUTINE_SPEC_VERSION,
  type Routine,
  type RoutineSpec,
} from "@hyperpolymath/jarvis-core";
import { cn } from "@/lib/utils";
import {
  useRoutinesQuery,
  useToggleRoutine,
  useDeleteRoutine,
  useRunRoutine,
} from "./queries";
import { RoutineEditor, type RoutineDraft } from "./RoutineEditor";
import { ROUTINE_TEMPLATES, instantiateTemplate } from "./templates";
import { triggerMeta, triggerValue } from "./trigger-labels";

interface Props {
  userId: string;
  initialRoutines: Routine[];
}

const emptySpec = (): RoutineSpec => ({
  version: ROUTINE_SPEC_VERSION,
  triggers: [],
  blocks: [],
});

function NewRoutineButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
 className="sd-btn-solid inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-micro transition-opacity duration-100 cursor-pointer-always"
    >
      <Plus size={14} /> New routine
    </button>
  );
}

export function RoutinesClient({ userId, initialRoutines }: Props) {
  const { data: routines = [] } = useRoutinesQuery(userId, initialRoutines);
  const [draft, setDraft] = useState<RoutineDraft | null>(null);

  const toggleMut = useToggleRoutine(userId);
  const deleteMut = useDeleteRoutine(userId);

  if (draft) {
    return (
      <RoutineEditor
        userId={userId}
        draft={draft}
        onClose={() => setDraft(null)}
      />
    );
  }

  function editRoutine(r: Routine) {
    setDraft({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      spec: r.spec,
    });
  }

  function newBlank() {
    setDraft({ name: "", description: "", spec: emptySpec() });
  }

  // --- Empty state ---------------------------------------------------------
  if (routines.length === 0) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-8 text-center shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
          <p className="text-xl font-semibold text-[var(--sd-ink)]">No routines yet.</p>
 <p className="mx-auto mt-2 max-w-[440px] text-meta leading-[1.55] text-[var(--sd-ink-dull)]">
            A routine lets JARVIS do a sequence of smart things on a trigger.
            Start from a template below, or build one from scratch.
          </p>
          <div className="mt-5 flex justify-center">
            <NewRoutineButton onClick={newBlank} />
          </div>
        </div>

        <div>
 <p className="mb-3 text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
            Start from a template
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROUTINE_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => setDraft(instantiateTemplate(tpl))}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-5 text-left shadow-[var(--shadow-card)] transition-[background-color,border-color,box-shadow] duration-[140ms] ease-out hover:bg-[var(--sd-hover)] hover:shadow-[var(--shadow-card-hover)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)] dark:hover:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card-hover)]"
                >
                  <span
                    style={{ background: "var(--sd-input)" }}
                    className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[var(--sd-line)] text-[var(--sd-ink-dull)] transition-colors duration-[140ms] group-hover:text-[var(--sd-accent)]"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
 <span className="text-body font-semibold text-[var(--sd-ink)]">
                    {tpl.name}
                  </span>
 <span className="text-meta leading-[1.5] text-[var(--sd-ink-dull)]">
                    {tpl.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- List ----------------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
 <p className="text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
          {routines.length} routine{routines.length === 1 ? "" : "s"}
        </p>
        <NewRoutineButton onClick={newBlank} />
      </div>

      <div className="space-y-3">
        {routines.map((r) => (
          <RoutineRow
            key={r.id}
            routine={r}
            onEdit={() => editRoutine(r)}
            onToggle={(enabled) => toggleMut.mutate({ id: r.id, enabled })}
            onDelete={() => {
              if (confirm(`Delete “${r.name}”? This can't be undone.`)) {
                deleteMut.mutate(r.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

// --- Row -------------------------------------------------------------------

function RoutineRow({
  routine,
  onEdit,
  onToggle,
  onDelete,
}: {
  routine: Routine;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const runMut = useRunRoutine();
  const blockCount = routine.spec.blocks.length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
 <p className="text-subtitle font-semibold text-[var(--sd-ink)]">{routine.name}</p>
          {!routine.enabled ? (
 <span className="text-micro text-[var(--sd-ink-faint)]">
              off
            </span>
          ) : null}
        </div>
        {routine.description ? (
 <p className="mt-0.5 text-meta text-[var(--sd-ink-dull)]">{routine.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {routine.spec.triggers.map((t, i) => {
            const meta = triggerMeta(t.type);
            const Icon = meta.icon;
            return (
              <span
                key={i}
                style={{ background: "var(--sd-input)" }}
                className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--sd-line)] px-2 py-0.5"
              >
                <Icon className="h-3 w-3 text-[var(--sd-accent)]" />
 <span className="font-mono text-micro tracking-[0.04em] text-[var(--sd-ink)]">
                  {triggerValue(t)}
                </span>
              </span>
            );
          })}
 <span className="text-micro text-[var(--sd-ink-faint)]">
            · {blockCount} block{blockCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Enabled toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={routine.enabled}
          onClick={() => onToggle(!routine.enabled)}
          style={{ background: routine.enabled ? "var(--sd-accent)" : "var(--sd-input)" }}
          className="relative h-6 w-10 rounded-full border border-[var(--sd-line)] transition-colors duration-[140ms]"
          aria-label={routine.enabled ? "Disable routine" : "Enable routine"}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-[140ms]",
              routine.enabled ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => runMut.mutate(routine.id)}
          disabled={runMut.isPending}
 className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--sd-line)] px-2 py-1.5 text-micro text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] disabled:opacity-40 transition-colors duration-[140ms]"
          aria-label="Run now"
        >
          {runMut.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          Run
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
          aria-label="Edit routine"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:border-[color-mix(in_oklch,var(--ink-coral)_40%,transparent)] hover:text-[var(--ink-coral)] transition-colors duration-[140ms]"
          aria-label="Delete routine"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
