"use client";

/**
 * MemoryTable — displays jarvis_facts grouped by type.
 *
 * Phase 5.1 Plan 05.1-03 (D-M6 / JARVIS-18).
 *
 * Uses useTableSubscription("jarvis_facts", userId) so the table live-updates
 * when JARVIS writes a new remember_fact during an active turn (Realtime
 * invalidates the TanStack Query, which triggers a page re-render via
 * invalidateQueries). The Settings → Memory page is the escape valve for
 * reviewing, editing, or deleting what JARVIS has remembered.
 *
 * Empty state: "No facts yet — JARVIS will remember things you tell it"
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import { forgetFactAction } from "@/app/actions/jarvis-facts";
import { Button } from "@/components/ui/button";
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

  // Realtime subscription: live updates when JARVIS writes a new fact via
  // remember_fact during an active turn. Invalidates the TanStack Query.
  useTableSubscription("jarvis_facts", userId);

  const { data: facts = initialFacts } = useQuery<JarvisFactRow[]>({
    queryKey: tableKey("jarvis_facts", userId),
    queryFn: async (): Promise<JarvisFactRow[]> => {
      // The initial server-loaded facts are the source of truth. Realtime
      // invalidation triggers this queryFn. For MVP, we return the cached
      // data — a full read action will be added in Phase 6 when needed.
      // The page is force-dynamic so a hard refresh always gets fresh data.
      return initialFacts;
    },
    initialData: initialFacts,
    initialDataUpdatedAt: Date.now(),
    staleTime: Infinity,
  });

  async function handleDelete(fact: JarvisFactRow) {
    const result = await forgetFactAction({ factId: fact.id });
    if (result.ok) {
      toast.success(`Forgot: ${fact.key}`);
      // Optimistically remove from query cache
      queryClient.setQueryData<JarvisFactRow[]>(
        tableKey("jarvis_facts", userId),
        (old) => (old ? old.filter((f) => f.id !== fact.id) : []),
      );
    } else {
      toast.error(result.error);
    }
  }

  if (facts.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground font-serif italic">
        No facts yet — JARVIS will remember things you tell it.
      </div>
    );
  }

  const grouped = FACT_TYPES.reduce(
    (acc, type) => {
      acc[type] = facts.filter((f) => f.type === type);
      return acc;
    },
    {} as Record<(typeof FACT_TYPES)[number], JarvisFactRow[]>,
  );

  return (
    <>
      <div>
        {FACT_TYPES.map((type) => {
          const list = grouped[type];
          if (list.length === 0) return null;
          return (
            <div key={type} className="border-b last:border-b-0">
              <div className="px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground bg-secondary/30">
                {TYPE_LABELS[type]}
              </div>
              {list.map((fact) => (
                <div
                  key={fact.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-sm">{fact.key}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {fact.value}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    {fact.source === "user_explicit" ? "you" : "jarvis"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(fact)}
                    aria-label="Edit fact"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(fact)}
                    aria-label="Forget fact"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {editing ? (
        <MemoryEditDialog fact={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
