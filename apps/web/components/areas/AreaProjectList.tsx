"use client";

import { AreaProjectCardMenu } from "@/components/areas/AreaProjectCardMenu";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import {
  type SemesterTerm,
  isProjectExpired,
  todayISODate,
} from "@/lib/projects/archive-status";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface AreaProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  description: string | null;
  endDate: string | null;
  archivedAt: string | Date | null;
  semesterTerm: SemesterTerm | null;
  semesterYear: number | null;
}

interface Props {
  areaId: string;
  projects: AreaProject[];
  allAreas: { id: string; name: string }[];
}

const TODAY = todayISODate();

/**
 * Archived, or its run has ended — either way it's no longer "live". A class
 * ends with its semester; everything else ends with its end date (issue #55).
 */
function isPast(p: AreaProject): boolean {
  if (p.archivedAt) return true;
  return isProjectExpired(p, TODAY);
}

/**
 * Area project list with three behaviors layered on the simple grid:
 *  - CLASS badge on class projects.
 *  - "Hide classes" toggle so non-class work can be isolated (Yale-style areas
 *    that mix classes with standalone projects).
 *  - Active / Archived tabs — archived or past-end-date projects move out of the
 *    live view into their own tab instead of vanishing.
 */
export function AreaProjectList({ areaId, projects, allAreas }: Props) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [hideClasses, setHideClasses] = useState(false);

  const { active, archived } = useMemo(() => {
    const active: AreaProject[] = [];
    const archived: AreaProject[] = [];
    for (const p of projects) (isPast(p) ? archived : active).push(p);
    return { active, archived };
  }, [projects]);

  const activeHasClasses = active.some((p) => p.isClass);
  const baseList = tab === "active" ? active : archived;
  const list = tab === "active" && hideClasses ? baseList.filter((p) => !p.isClass) : baseList;

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-10 text-center">
        <p className="text-base text-[var(--ink-muted)]">
          No projects in this area yet.
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]/70 mt-2">
          Use the New project button above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab + filter row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <TabButton
            label="Active"
            count={active.length}
            active={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabButton
            label="Archived"
            count={archived.length}
            active={tab === "archived"}
            onClick={() => setTab("archived")}
          />
        </div>

        {tab === "active" && activeHasClasses ? (
          <button
            type="button"
            onClick={() => setHideClasses((v) => !v)}
            aria-pressed={hideClasses}
            className={cn(
              "px-2.5 py-1 rounded-sm font-mono text-[11px] uppercase tracking-[0.08em] cursor-pointer-always",
              "border transition-colors duration-150 ease-out",
              hideClasses
                ? "border-[var(--edge-hud)] bg-[var(--surface-raised)] text-[var(--ink)]"
                : "border-[var(--edge)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]"
            )}
          >
            {hideClasses ? "Show classes" : "Hide classes"}
          </button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-8 text-center">
          <p className="text-base text-[var(--ink-muted)]">
            {tab === "archived"
              ? "Nothing archived or past its end date."
              : hideClasses
                ? "No non-class projects here."
                : "No active projects."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3 gap-4">
          {list.map((p) => (
            <li key={p.id} className="relative group">
              <Link
                href={`/projects/${p.id}`}
                className={cn(
                  "group flex flex-col gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-4 py-4 h-full",
                  "hover:border-[var(--edge-hud)] hover:bg-[var(--surface-raised)] transition-colors duration-150 ease-out cursor-pointer-always",
                  isPast(p) && "opacity-70"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <DynamicIcon
                    name={p.icon}
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--ink-muted)] shrink-0 mt-0.5 group-hover:text-[var(--ink)] transition-colors"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg font-semibold text-[var(--ink)] leading-tight truncate">
                        {p.name}
                      </span>
                      {p.isClass ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)] bg-[var(--surface-raised)]">
                          Class
                        </span>
                      ) : null}
                      {p.archivedAt ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)]">
                          Archived
                        </span>
                      ) : isPast(p) ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)]">
                          Ended
                        </span>
                      ) : null}
                    </div>
                    {p.isClass && p.courseCode ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                        {p.courseCode}
                      </span>
                    ) : null}
                  </div>
                </div>
                {p.description ? (
                  <p className="text-sm text-[var(--ink-muted)] line-clamp-2">
                    {p.description}
                  </p>
                ) : null}
              </Link>
              <div className="absolute top-2 right-2 z-10">
                <AreaProjectCardMenu
                  projectId={p.id}
                  projectName={p.name}
                  projectDescription={p.description}
                  projectIcon={p.icon}
                  isClass={p.isClass}
                  currentAreaId={areaId}
                  allAreas={allAreas}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-sm font-mono text-[11px] font-semibold uppercase tracking-[0.12em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--surface-raised)] text-[var(--ink)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      )}
    >
      {label} <span className="tabular-nums text-[var(--ink-muted)]">({count})</span>
    </button>
  );
}
