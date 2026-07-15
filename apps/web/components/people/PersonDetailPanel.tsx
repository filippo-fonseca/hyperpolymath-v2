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
 * Right-hand profile sheet. Shows the full record plus a live reference
 * breakdown (total + per-type counts + the linked entities), fetched lazily
 * via its own query keyed by personId so it refreshes when references change.
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
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {person ? (
          <>
            <SheetHeader>
              <SheetTitle className="sr-only">{person.name}</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col items-center gap-3 pt-2 pb-4 text-center">
              <PersonAvatar
                name={person.name}
                avatarUrl={person.avatarUrl}
                sizeClass="w-20 h-20"
                textClass="text-2xl"
              />
              <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">{person.name}</h2>
              {person.email ? (
                <p className="text-[13px] text-[var(--sd-ink-dull)]">{person.email}</p>
              ) : null}
              {person.tags.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {person.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded border border-[var(--sd-line)] bg-[var(--sd-input)] px-1.5 py-[1px] text-tiny font-medium tracking-wide text-[var(--sd-ink-dull)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex justify-center gap-2 pb-5">
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

            {person.phone ? <DetailRow label="Phone" value={person.phone} /> : null}
            {person.bio ? (
              <div className="mb-5 space-y-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                  Bio
                </span>
                <p className="text-[15px] leading-relaxed text-[var(--sd-ink)]">
                  {person.bio}
                </p>
              </div>
            ) : null}

            {/* Reference stats */}
            <div className="mb-4 rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-4 dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]">
              <div className="flex items-baseline justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
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
            {breakdown && breakdown.items.length > 0 ? (
              <div className="space-y-1.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                  Linked
                </span>
                <ul className="space-y-1">
                  {breakdown.items.map((item) => {
                    const href = referenceHref(item.fromType, item.fromId);
                    const inner = (
                      <>
                        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)] shrink-0 mt-0.5">
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
                      "flex items-start gap-2 rounded-[8px] px-2 py-1.5 border border-[var(--sd-line)]";
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
              </div>
            ) : refsQuery.isLoading ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                Loading references…
              </p>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                No references yet.
              </p>
            )}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4 space-y-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
        {label}
      </span>
      <p className="text-[15px] text-[var(--sd-ink)]">{value}</p>
    </div>
  );
}
