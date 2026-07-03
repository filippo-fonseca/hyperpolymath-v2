"use client";

/**
 * RoutinesClient — the routines list + empty state + editor orchestration.
 *
 * Full-page-panel model (per plan): when a routine is open for edit (or a new /
 * template draft is started), the editor replaces the list. Reads come from
 * TanStack Query (SSR-seeded); toggle/delete are optimistic; run-now hits the
 * block-engine endpoint and degrades gracefully.
 */

import { useState } from "react";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  ROUTINE_SPEC_VERSION,
  type Routine,
  type RoutineSpec,
} from "@hyperpolymath/jarvis-core";
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
        <div className="glass-tile rounded-xl p-8 text-center">
          <p className="font-serif text-xl text-[var(--ink)]">
            No routines yet.
          </p>
          <p className="mx-auto mt-2 max-w-[440px] font-serif text-[15px] leading-[1.55] text-[var(--ink-muted)]">
            A routine lets JARVIS do a sequence of smart things on a trigger.
            Start from a template below, or build one from scratch.
          </p>
          <button
            type="button"
            onClick={newBlank}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90 transition-opacity duration-100"
          >
            <Plus size={14} /> New routine
          </button>
        </div>

        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
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
                  className="glass-button flex flex-col items-start gap-2 rounded-xl p-5 text-left transition-transform duration-100 hover:-translate-y-0.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-serif text-lg font-semibold text-[var(--ink)]">
                    {tpl.name}
                  </span>
                  <span className="font-serif text-[13px] leading-[1.5] text-[var(--ink-muted)]">
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
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          {routines.length} routine{routines.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={newBlank}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90 transition-opacity duration-100"
        >
          <Plus size={14} /> New routine
        </button>
      </div>

      <div className="space-y-3">
        {routines.map((r) => (
          <RoutineRow
            key={r.id}
            routine={r}
            onEdit={() => editRoutine(r)}
            onToggle={(enabled) => toggleMut.mutate({ id: r.id, enabled })}
            onDelete={() => {
              if (
                confirm(`Delete “${r.name}”? This can't be undone.`)
              ) {
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
    <div className="glass-tile flex flex-col gap-3 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-serif text-lg font-semibold text-[var(--ink)]">
            {routine.name}
          </p>
          {!routine.enabled ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              off
            </span>
          ) : null}
        </div>
        {routine.description ? (
          <p className="mt-0.5 font-serif text-[13px] text-[var(--ink-muted)]">
            {routine.description}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {routine.spec.triggers.map((t, i) => {
            const meta = triggerMeta(t.type);
            const Icon = meta.icon;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] px-2 py-0.5"
              >
                <Icon className="h-3 w-3 text-[var(--ink-amber)]" />
                <span className="font-mono text-[10.5px] tracking-[0.04em] text-[var(--ink)]">
                  {triggerValue(t)}
                </span>
              </span>
            );
          })}
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
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
          className={`relative h-6 w-10 rounded-full border transition-colors duration-150 ${
            routine.enabled
              ? "border-[var(--hud-cyan)] bg-[var(--hud-cyan)]/30"
              : "border-[var(--edge)] bg-[var(--surface-raised)]"
          }`}
          aria-label={routine.enabled ? "Disable routine" : "Enable routine"}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--ink)] transition-transform duration-150 ${
              routine.enabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => runMut.mutate(routine.id)}
          disabled={runMut.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--edge)] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] disabled:opacity-40 transition-colors duration-100"
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
          className="rounded-md border border-[var(--edge)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] transition-colors duration-100"
          aria-label="Edit routine"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-[var(--edge)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-coral,var(--ink))] transition-colors duration-100"
          aria-label="Delete routine"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
