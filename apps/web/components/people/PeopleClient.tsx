"use client";

import { getPeopleForCurrentUser } from "@/app/actions/people";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { PersonCard } from "./PersonCard";
import { PersonDetailPanel } from "./PersonDetailPanel";
import { PersonEditDialog } from "./PersonEditDialog";
import { CANONICAL_TAGS } from "./initials";

interface Props {
  userId: string;
  initialPeople: PersonWithStats[];
}

/**
 * /people client orchestrator. Owns the roster query (SSR initialData, then
 * TanStack Query takes over), both Realtime subscriptions (people +
 * people_references so reference counts stay live as entities mention people),
 * search + tag filtering, and the create/edit dialog + detail-sheet state.
 */
export function PeopleClient({ userId, initialPeople }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonWithStats | null>(null);
  // URL-backed so search results and JARVIS receipts can deep-link a person
  // via /people?person=<id> (mirrors captures' ?capture= and tasks' ?task=).
  const [selectedId, setSelectedId] = useQueryState("person", parseAsString);

  const peopleQuery = useQuery({
    queryKey: tableKey("people", userId),
    queryFn: getPeopleForCurrentUser,
    initialData: initialPeople,
  });
  const people = peopleQuery.data ?? initialPeople;

  // A people_references change must also refresh the roster so per-card
  // reference counts update live.
  useTableSubscription("people", userId);
  useTableSubscription("people_references", userId, {
    alsoInvalidate: [tableKey("people", userId)],
  });

  const refetchPeople = () =>
    queryClient.invalidateQueries({ queryKey: tableKey("people", userId) });

  // Union of canonical tags and any tag actually in use, preserving canonical
  // order first, then extras alphabetically.
  const allTags = useMemo(() => {
    const used = new Set<string>();
    for (const p of people) for (const t of p.tags) used.add(t);
    const extras = [...used]
      .filter((t) => !CANONICAL_TAGS.includes(t as (typeof CANONICAL_TAGS)[number]))
      .sort();
    return [...CANONICAL_TAGS.filter((t) => used.has(t)), ...extras];
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (activeTag && !p.tags.includes(activeTag)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.email?.toLowerCase().includes(q) ?? false);
    });
  }, [people, search, activeTag]);

  const selected = useMemo(
    () => (selectedId ? (people.find((p) => p.id === selectedId) ?? null) : null),
    [people, selectedId]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(person: PersonWithStats) {
    setEditing(person);
    setSelectedId(null);
    setDialogOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-6 gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">People</h1>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)] tabular-nums">
            {people.length}
          </span>
        </div>
        <Button type="button" onClick={openCreate}>
          <UserPlus size={15} className="mr-1.5" />
          Add person
        </Button>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sd-ink-faint)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={cn(
              "rounded-[8px] border px-2.5 h-[26px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors duration-150 ease-out cursor-pointer-always",
              activeTag === null
                ? "border-transparent bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                : "border-[var(--sd-line)] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
            )}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
              className={cn(
                "rounded-[8px] border px-2.5 h-[26px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors duration-150 ease-out cursor-pointer-always",
                activeTag === t
                  ? "border-transparent bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                  : "border-[var(--sd-line)] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto min-h-0">
        {people.length === 0 ? (
          <EmptyState
            heading="No one here yet."
            body="Add the people who matter. Mention them in tasks, captures, and pages and they wire themselves into your knowledge graph."
            action={{ label: "Add your first person", onClick: openCreate }}
          />
        ) : filtered.length === 0 ? (
          <p className="pt-4 text-[13px] text-[var(--sd-ink-faint)]">
            No people match this filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((person) => (
              <PersonCard key={person.id} person={person} onOpen={(p) => setSelectedId(p.id)} />
            ))}
          </div>
        )}
      </div>

      <PersonEditDialog
        userId={userId}
        open={dialogOpen}
        person={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={refetchPeople}
      />

      <PersonDetailPanel
        person={selected}
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        onEdit={openEdit}
        onDeleted={() => {
          setSelectedId(null);
          refetchPeople();
        }}
      />
    </div>
  );
}
