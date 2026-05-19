"use client";

/**
 * MemoryTable — JARVIS persistent fact cards per UI-SPEC §5d.
 *
 * Phase 6.1 Plan 06.1-03: each fact renders as a card with 1px --edge
 * LEFT EDGE ONLY (no full border), --surface background, ambient
 * --hud-cyan-glow-soft shadow, mono uppercase metadata label
 * ("FACT · {type}"), EB Garamond serif body for the fact value, and a
 * mono dim source row at the bottom. Edit/Delete affordances render as
 * agent-secondary / destructive buttons per UI-SPEC §9a.
 *
 * Carry-forward (UI-SPEC §14): useTableSubscription("jarvis_facts",
 * userId) realtime invalidation, queryClient.setQueryData optimistic
 * delete, MemoryEditDialog, forgetFactAction — all unchanged.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import { forgetFactAction } from "@/app/actions/jarvis-facts";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { MemoryEditDialog } from "./MemoryEditDialog";

interface JarvisFactRow {
  id: string;
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
  source: "user_explicit" | "jarvis_suggested";
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
    <article
      className="relative bg-[var(--surface)] p-4"
      style={{
        borderLeft: "1px solid var(--edge)",
        boxShadow: "0 0 24px var(--hud-cyan-glow-soft)",
      }}
    >
      {/* Metadata top row — mono uppercase tracking-wide. */}
      <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-2">
        FACT · {fact.type}
      </div>

      {/* Key + body — serif (content register per UI-SPEC §5d). */}
      <div className="font-serif text-base text-[var(--ink)] leading-snug">
        <span className="font-semibold">{fact.key}</span>
        <span className="text-[var(--ink-muted)] mx-2">·</span>
        <span>{fact.value}</span>
      </div>

      {/* Source row — mono dim. */}
      <div className="font-mono text-[11px] text-[var(--ink-muted)] mt-2 opacity-70 flex items-center gap-2 flex-wrap">
        <span>{sourceLabel}</span>
        <span aria-hidden="true">·</span>
        <span>
          written <RelativeTime date={fact.updatedAt} />
        </span>
      </div>

      {/* Action row — agent-secondary + destructive buttons per UI-SPEC §9a. */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit fact"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always px-2 py-1 transition-colors duration-100 ease-out"
          style={{ border: "1px solid var(--edge-hud)" }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Forget fact"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-coral)] cursor-pointer-always px-2 py-1 transition-colors duration-100 ease-out hover:bg-[color:rgb(220_38_38_/_0.08)]"
          style={{ border: "1px solid var(--ink-coral)" }}
        >
          Delete
        </button>
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
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
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
