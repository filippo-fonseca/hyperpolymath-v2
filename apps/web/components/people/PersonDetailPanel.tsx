"use client";

import { deletePerson, getPersonReferencesForCurrentUser } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "./PersonAvatar";

interface Props {
  person: PersonWithStats | null;
  open: boolean;
  onClose: () => void;
  onEdit: (person: PersonWithStats) => void;
  /** Fired after a successful delete so the parent can refetch + clear selection. */
  onDeleted: () => void;
}

/**
 * Person detail sheet (Spacedrive register). Solid --sd-box panel with a
 * consistently padded body: a left-aligned identity header (avatar + name +
 * mono email), an sd tag-chip strip matching the /people filter rail, the
 * detail fields, and a live reference breakdown. Inner plates sit on --sd-input
 * so they read as raised against the --sd-box sheet. The breakdown query is
 * keyed by personId so it refreshes when references change.
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

            <div className="p-6">
              {/* Identity header — avatar + name + mono email. pr-8 clears the
                  sheet's absolute close button. */}
              <div className="flex items-center gap-4 pr-8">
                <PersonAvatar
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  sizeClass="w-16 h-16"
                  textClass="text-xl"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">
                    {person.name}
                  </h2>
                  {person.email ? (
                    <p className="mt-0.5 truncate font-mono text-[12px] tracking-[0.01em] text-[var(--sd-ink-dull)]">
                      {person.email}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Tag chips — mono/uppercase, matching the /people filter rail. */}
              {person.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {person.tags.map((t) => (
                    <TagChip key={t}>{t}</TagChip>
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
                      <p className="font-mono text-[13px] tabular-nums text-[var(--sd-ink)]">
                        {person.phone}
                      </p>
                    </Field>
                  ) : null}
                  {person.bio ? (
                    <Field label="Bio">
                      <p className="text-[15px] leading-relaxed text-[var(--sd-ink)]">{person.bio}</p>
                    </Field>
                  ) : null}
                </div>
              ) : null}

              {/* Reference stats — inner plate on --sd-input so it reads raised
                  against the --sd-box sheet. */}
              <div className="mt-6 rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-input)] p-4 dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
                    References
                  </h3>
                  <span className="text-2xl font-black tabular-nums tracking-[-0.01em] text-[var(--sd-ink)]">
                    {breakdown?.total ?? person.referenceCount}
                  </span>
                </div>
                {breakdown && Object.keys(breakdown.byType).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
                    {Object.entries(breakdown.byType).map(([type, n]) => (
                      <span key={type}>
                        <span className="tabular-nums text-[var(--sd-accent)]">{n}</span> {type}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Linked entities */}
              <div className="mt-5">
                <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
                  Linked
                </h3>
                {breakdown && breakdown.items.length > 0 ? (
                  <ul className="space-y-1">
                    {breakdown.items.map((item) => {
                      const href = referenceHref(item.fromType, item.fromId);
                      const inner = (
                        <>
                          <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                            {item.fromType}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-[var(--sd-ink)]">
                              {item.label}
                            </span>
                            {item.fromType === "task" && (item.status || item.due) ? (
                              <span className="font-mono text-[10px] text-[var(--sd-ink-dull)]">
                                {item.status ?? ""}
                                {item.due
                                  ? `${item.status ? " · " : ""}due ${new Date(item.due).toLocaleDateString()}`
                                  : ""}
                              </span>
                            ) : null}
                          </span>
                        </>
                      );
                      const baseCls =
                        "flex items-start gap-2 rounded-[8px] px-2 py-1.5 border border-[var(--sd-line)] bg-[var(--sd-input)]";
                      return (
                        <li key={`${item.fromType}:${item.fromId}`}>
                          {href ? (
                            <Link
                              href={href}
                              onClick={onClose}
                              className={`${baseCls} transition-colors duration-150 ease-out hover:border-[var(--sd-accent)] cursor-pointer-always`}
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                    Loading references…
                  </p>
                ) : (
                  <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                    No references yet.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** sd tag chip — mono/uppercase, matching the /people filter rail grammar. */
function TagChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-[6px] border border-[var(--sd-line)] px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
      {children}
    </span>
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
    <div className="space-y-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
        {label}
      </span>
      {children}
    </div>
  );
}
