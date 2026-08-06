"use client";

import { getPeopleForCurrentUser } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { PageScaffold } from "@/components/ui/PageScaffold";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, Users } from "lucide-react";
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
 *
 * jul-29 craft restyle: the page moves onto the shared PageScaffold, so its
 * measure, gutter and header rhythm match every other route (the roster used to
 * own an ad-hoc `p-6` full-height column with its own scroller). Colour comes
 * from two deterministic hue sources — the person's own tint on their avatar
 * plate, and each tag's tint on the filter rail and the cards — so a tag looks
 * the same everywhere it appears.
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
    <PageScaffold
      eyebrow="Roster"
      title="People"
      subtitle="Everyone who shows up in your tasks, captures, and pages."
      meta={
        <PageScaffold.MetaRow>
          {[
            <span key="count" className="tabular-nums">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>,
            allTags.length > 0 ? (
              <span key="tags" className="tabular-nums">
                {allTags.length} {allTags.length === 1 ? "tag" : "tags"}
              </span>
            ) : null,
          ]}
        </PageScaffold.MetaRow>
      }
      actions={
        <Button type="button" onClick={openCreate}>
          <UserPlus size={15} className="mr-1.5" />
          Add person
        </Button>
      }
    >
      <PageScaffold.Section>
        <div className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
            />
          </div>

          {/* Filter rail — each tag wears its own pastel, the same hue it wears
              on every person card, so filtering is a colour match. */}
          {allTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                aria-pressed={activeTag === null}
                className="craft-chip cursor-pointer-always"
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                  aria-pressed={activeTag === t}
                  className={cn("craft-chip cursor-pointer-always", tintFor(t))}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {people.length === 0 ? (
            <EmptyState
              size="page"
              className="tint-lavender"
              icon={<Users strokeWidth={1.5} />}
              title="No one here yet"
              description="Add the people who matter. Mention them in tasks, captures, and pages and they wire themselves into your knowledge graph."
              action={{ label: "Add your first person", onClick: openCreate }}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              size="section"
              className="tint-lavender"
              icon={<Users strokeWidth={1.5} />}
              title="No people match this filter"
              description="Try a different tag, or clear the search."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((person) => (
                <PersonCard key={person.id} person={person} onOpen={(p) => setSelectedId(p.id)} />
              ))}
            </div>
          )}
        </div>
      </PageScaffold.Section>

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
    </PageScaffold>
  );
}
