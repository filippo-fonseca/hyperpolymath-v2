"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStudioProjects } from "@/components/studio/data/hooks";
import type { ProjectRow } from "@/app/actions/projects";
import { isProjectExpired } from "@/lib/projects/archive-status";

/**
 * ProjectsFocus — a read-only roster of open projects REBUILT for the overlay
 * (same rationale as AgendaFocus: the 2D project surfaces own their own router +
 * query state, so a thin projection over the studio projects slice is far
 * cheaper than extracting them). Rows deep-link to each project's detail page.
 * There is no flat `/projects` index (projects live under areas), so the header
 * carries no link-out — the rows are the navigation.
 */

/** Open projects, next-ending first — mirrors summarizeProjects' ordering. */
function orderOpen(projects: ProjectRow[]): ProjectRow[] {
  return projects
    .filter((p) => p.archivedAt === null && !isProjectExpired(p))
    .sort((a, b) => {
      if (a.endDate !== b.endDate) {
        if (a.endDate === null) return 1;
        if (b.endDate === null) return -1;
        return a.endDate < b.endDate ? -1 : 1;
      }
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}

/** `YYYY-MM-DD` → short local "Mon D" label; null passes through. */
function endLabel(endDate: string | null): string | null {
  if (endDate === null) return null;
  const [y, mo, d] = endDate.split("-").map(Number);
  const date = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectsFocus(): React.ReactElement {
  const { projects } = useStudioProjects();
  const open = useMemo(() => orderOpen(projects), [projects]);

  if (open.length === 0) {
    return (
      <p
        className="text-[15px] italic text-[#F2E9D8]/70"
        style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
      >
        No open projects.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
        Projects
      </span>
      <ul className="flex flex-col">
        {open.map((p) => {
          const ends = endLabel(p.endDate);
          return (
            <li
              key={p.id}
              className="border-b border-[color:rgba(201,162,39,0.1)] last:border-b-0"
            >
              <Link
                href={`/projects/${p.id}`}
                className="cursor-pointer-always flex items-center gap-3 py-2.5 transition-colors duration-100 hover:bg-white/[0.03]"
              >
                {p.icon ? (
                  <span aria-hidden className="w-5 shrink-0 text-center text-[15px]">
                    {p.icon}
                  </span>
                ) : null}
                <span
                  className="min-w-0 flex-1 truncate text-[15px] text-[#F2E9D8]"
                  style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
                >
                  {p.name}
                </span>
                {p.isClass && p.courseCode ? (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#C9A227]">
                    {p.courseCode}
                  </span>
                ) : null}
                {ends ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]">
                    {ends}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ProjectsFocus;
