"use client";

/**
 * MemoryTable — JARVIS persistent fact cards per UI-SPEC §5d.
 *
 * jul-29 craft restyle: each fact is now a raised white plate on the shared
 * card shadow ladder (rounded-xl, one --edge hairline, hover deepens the
 * shadow), replacing the left-edge-only + cyan-glow HUD chrome. The mono
 * "FACT · {type}" label survives, with the type moved onto a pastel chip whose
 * hue comes from tintFor(type), and the Edit/Delete affordances become quiet
 * outlined pills (coral rim on the destructive one, never a red fill).
 *
 * Carry-forward (UI-SPEC §14): useTableSubscription("jarvis_facts",
 * userId) realtime invalidation, queryClient.setQueryData optimistic
 * delete, MemoryEditDialog, forgetFactAction — all unchanged.
 */

import { useState } from "react";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import { forgetFactAction } from "@/app/actions/jarvis-facts";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { NoExportToggle } from "@/components/privacy/NoExportToggle";
import { MemoryEditDialog } from "./MemoryEditDialog";

interface JarvisFactRow {
  id: string;
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
  source: "user_explicit" | "jarvis_suggested";
  // Phase 999.12 / CTX-04 — privacy gate for the MCP personal-context export.
  noExport: boolean;
  updatedAt: Date;
  lastUsedAt: Date | null;
}

interface Props {
  userId: string;
  initialFacts: JarvisFactRow[];
}

function FactCard({
  fact,
  onEdit,
  onDelete,
}: {
  fact: JarvisFactRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sourceLabel = fact.source === "user_explicit" ? "you" : "jarvis";
  return (
    // Craft register: a raised white plate on the card shadow ladder, replacing
    // the left-edge-plus-cyan-glow HUD treatment. The fact's type carries the
    // colour instead, on its own pastel chip.
    <article
      className={cn(
        "relative rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] p-4",
        "shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out",
        "hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]",
        tintFor(fact.type),
      )}
    >
      {/* Metadata top row — the type sits on its deterministic pastel chip. */}
      <div className="mb-2 flex items-center gap-2 text-micro tracking-[0.06em] text-[var(--ink-muted)]">
        <span>FACT</span>
        <span className="rounded-md border border-[color-mix(in_srgb,var(--tint-edge)_50%,transparent)] bg-[var(--tint-bg)] px-1.5 py-[1px] text-[var(--tint-ink)]">
          {fact.type}
        </span>
      </div>

      {/* Key + body — serif (content register per UI-SPEC §5d). */}
      <div className="text-base leading-snug text-[var(--ink)]">
        <span className="font-semibold">{fact.key}</span>
        <span className="mx-2 text-[var(--ink-faint)]">·</span>
        <span>{fact.value}</span>
      </div>

      {/* Source row — mono dim. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-micro text-[var(--ink-faint)]">
        <span>{sourceLabel}</span>
        <span aria-hidden="true">·</span>
        <span>
          written <RelativeTime date={fact.updatedAt} />
        </span>
      </div>

      {/* Action row — agent-secondary + destructive buttons per UI-SPEC §9a.
          Plus the Phase 999.12 / CTX-04 NoExportToggle so each fact has a
          per-row privacy gate against the MCP personal-context export. */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit fact"
          className="cursor-pointer-always rounded-lg border border-[var(--edge)] px-2.5 py-1 text-micro tracking-[0.06em] text-[var(--ink-muted)] transition-[color,border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:text-[var(--ink)] hover:shadow-[var(--shadow-card)]"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Forget fact"
          className="cursor-pointer-always rounded-lg border border-[color-mix(in_oklch,var(--ink-coral)_35%,var(--edge))] px-2.5 py-1 text-micro tracking-[0.06em] text-[var(--ink-coral)] transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--ink-coral)] hover:shadow-[var(--shadow-card)]"
        >
          Delete
        </button>
        <NoExportToggle
          resource="jarvis_fact"
          id={fact.id}
          initial={fact.noExport}
        />
      </div>
    </article>
  );
}

const FACT_TYPES = ["preference", "rule", "entity", "workflow"] as const;
const TYPE_LABELS: Record<string, string> = {
  preference: "Preferences",
  rule: "Rules",
  entity: "Entities",
  workflow: "Workflows",
};

export function MemoryTable({ userId, initialFacts }: Props) {
  const [editing, setEditing] = useState<JarvisFactRow | null>(null);
  const queryClient = useQueryClient();

  // Realtime subscription: invalidate when JARVIS writes a new fact via
  // remember_fact during an active turn.
  useTableSubscription("jarvis_facts", userId);

  const { data: facts = initialFacts } = useQuery<JarvisFactRow[]>({
    queryKey: tableKey("jarvis_facts", userId),
    queryFn: async (): Promise<JarvisFactRow[]> => initialFacts,
    initialData: initialFacts,
    initialDataUpdatedAt: Date.now(),
    staleTime: Infinity,
  });

  async function handleDelete(fact: JarvisFactRow) {
    const result = await forgetFactAction({ factId: fact.id });
    if (result.ok) {
      toast.success(`Forgot: ${fact.key}`);
      queryClient.setQueryData<JarvisFactRow[]>(
        tableKey("jarvis_facts", userId),
        (old) => (old ? old.filter((f) => f.id !== fact.id) : []),
      );
    } else {
      toast.error(result.error);
    }
  }

  // Group by type so the visual list keeps the Preferences / Rules /
  // Entities / Workflows section labels from the prior layout. Each group
  // header is a mono chrome label; the cards inside are §5d FactCards.
  const grouped = FACT_TYPES.reduce(
    (acc, type) => {
      acc[type] = facts.filter((f) => f.type === type);
      return acc;
    },
    {} as Record<(typeof FACT_TYPES)[number], JarvisFactRow[]>,
  );

  return (
    <>
      <div className="space-y-6">
        {FACT_TYPES.map((type) => {
          const list = grouped[type];
          if (list.length === 0) return null;
          return (
            <section key={type} className="space-y-3">
              <h2 className="pl-1 text-micro tracking-[0.08em] text-[var(--ink-faint)]">
                {TYPE_LABELS[type]}
              </h2>
              <div className="space-y-3">
                {list.map((fact) => (
                  <FactCard
                    key={fact.id}
                    fact={fact}
                    onEdit={() => setEditing(fact)}
                    onDelete={() => handleDelete(fact)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {editing ? (
        <MemoryEditDialog fact={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
