"use client";

import { deletePerson, getPersonReferencesForCurrentUser } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "./PersonAvatar";
import { PersonTagChip } from "./PersonCard";

interface Props {
  person: PersonWithStats | null;
  open: boolean;
  onClose: () => void;
  onEdit: (person: PersonWithStats) => void;
  /** Fired after a successful delete so the parent can refetch + clear selection. */
  onDeleted: () => void;
}

/**
 * Person detail sheet (jul-29 craft register). The body follows the same plate
 * + card grammar as the roster: a tinted identity plate beside the name, the
 * pastel tag chips the filter rail uses, then plain fields, then two raised
 * white cards (the reference count, the linked entities). The whole body sits
 * under the person's `tint-*` class so the plate, the dot and the rules all
 * resolve from one hue.
 *
 * The breakdown query is keyed by personId so it refreshes when references
 * change.
 */
export function PersonDetailPanel({ person, open, onClose, onEdit, onDeleted }: Props) {
  const [deleting, startDelete] = useTransition();

  const personId = person?.id ?? null;
  const refsQuery = useQuery({
    queryKey: ["person-refs", personId ?? "none"],
    queryFn: () => getPersonReferencesForCurrentUser(personId ?? ""),
    enabled: open && personId !== null,
  });

  function handleDelete() {
    if (!person) return;
    if (!confirm(`Delete ${person.name}? This cannot be undone.`)) return;
    startDelete(async () => {
      const r = await deletePerson(person.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`${person.name} deleted.`);
      onDeleted();
    });
  }

  const breakdown = refsQuery.data;

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {person ? (
          <>
            <SheetHeader className="sr-only p-0">
              <SheetTitle>{person.name}</SheetTitle>
            </SheetHeader>

            <div className={cn("p-6", tintFor(person.id))}>
              {/* Identity header — tinted plate + name + email. pr-8 clears the
                  sheet's absolute close button. */}
              <div className="flex items-center gap-4 pr-8">
                <PersonAvatar
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  sizeClass="size-16"
                  textClass="text-xl"
                  radiusClass="rounded-2xl"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-title font-semibold text-[var(--ink)]">
                    {person.name}
                  </h2>
                  {person.email ? (
                    <p className="mt-0.5 truncate text-meta text-[var(--ink-muted)]">
                      {person.email}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Tag chips — the same pastel taxonomy as the /people filter rail. */}
              {person.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {person.tags.map((t) => (
                    <PersonTagChip key={t} tag={t} />
                  ))}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-5 flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(person)}>
                  <Pencil size={14} className="mr-1.5" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[var(--ink-coral)] hover:text-[var(--ink-coral)]"
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Delete
                </Button>
              </div>

              {/* Detail fields */}
              {person.phone || person.bio ? (
                <div className="mt-6 space-y-5">
                  {person.phone ? (
                    <Field label="Phone">
                      <p className="text-body tabular-nums text-[var(--ink)]">{person.phone}</p>
                    </Field>
                  ) : null}
                  {person.bio ? (
                    <Field label="Bio">
                      <p className="text-body leading-relaxed text-[var(--ink)]">{person.bio}</p>
                    </Field>
                  ) : null}
                </div>
              ) : null}

              {/* Reference stats — a raised white card, colour only on the
                  per-type dots. */}
              <div className="craft-card mt-6 rounded-xl p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-meta font-medium text-[var(--ink-muted)]">References</h3>
                  <span className="text-title font-semibold tabular-nums text-[var(--ink)]">
                    {breakdown?.total ?? person.referenceCount}
                  </span>
                </div>
                {breakdown && Object.keys(breakdown.byType).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                    {Object.entries(breakdown.byType).map(([type, n]) => (
                      <span
                        key={type}
                        className={cn(
                          tintFor(type),
                          "inline-flex items-center gap-1.5 text-micro text-[var(--ink-muted)]"
                        )}
                      >
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-[var(--tint-edge)]"
                        />
                        <span className="tabular-nums font-medium text-[var(--ink)]">{n}</span>{" "}
                        {type}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Linked entities */}
              <div className="mt-5">
                <h3 className="mb-2 text-meta font-medium text-[var(--ink-muted)]">Linked</h3>
                {breakdown && breakdown.items.length > 0 ? (
                  <ul className="space-y-1.5">
                    {breakdown.items.map((item) => {
                      const href = referenceHref(item.fromType, item.fromId);
                      const inner = (
                        <>
                          {/* Kind on its own pastel plate — one hue per entity
                              kind, so page / task / capture read at a glance. */}
                          <span
                            className={cn(
                              tintFor(item.fromType),
                              "mt-0.5 inline-flex h-[18px] shrink-0 items-center rounded-md px-1.5 text-micro font-medium",
                              "bg-[var(--tint-bg)] text-[var(--tint-ink)]"
                            )}
                          >
                            {item.fromType}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-meta text-[var(--ink)]">
                              {item.label}
                            </span>
                            {item.fromType === "task" && (item.status || item.due) ? (
                              <span className="text-micro text-[var(--ink-muted)]">
                                {item.status ?? ""}
                                {item.due
                                  ? `${item.status ? " · " : ""}due ${new Date(item.due).toLocaleDateString()}`
                                  : ""}
                              </span>
                            ) : null}
                          </span>
                        </>
                      );
                      const baseCls = "craft-card flex items-start gap-2 px-2.5 py-2";
                      return (
                        <li key={`${item.fromType}:${item.fromId}`}>
                          {href ? (
                            <Link
                              href={href}
                              onClick={onClose}
                              className={`${baseCls} craft-card-hover cursor-pointer-always`}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className={baseCls}>{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : refsQuery.isLoading ? (
                  <p className="text-meta text-[var(--ink-faint)]">Loading references…</p>
                ) : (
                  <p className="text-meta text-[var(--ink-faint)]">No references yet.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Deep-link a referenced entity back to where it lives. Wiki pages have a real
 * detail route; tasks and captures open their detail panel via a URL param
 * (?task / ?capture). jarvis_fact and event have no navigable surface yet.
 */
function referenceHref(fromType: string, fromId: string): string | null {
  switch (fromType) {
    case "page":
      return `/wiki/${fromId}`;
    case "task":
      return `/tasks?task=${fromId}`;
    case "capture":
      return `/captures?capture=${fromId}`;
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-meta font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
    </div>
  );
}
