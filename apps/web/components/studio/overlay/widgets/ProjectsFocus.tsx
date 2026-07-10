"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStudioProjects, useStudioAreas, useStudioTasks } from "@/components/studio/data/hooks";
import type { ProjectRow } from "@/app/actions/projects";
import { isProjectExpired } from "@/lib/projects/archive-status";

/**
 * ProjectsFocus — open projects with area context and open-task counts.
 */

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

function endLabel(endDate: string | null): string | null {
  if (endDate === null) return null;
  const [y, mo, d] = endDate.split("-").map(Number);
  const date = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectsFocus(): React.ReactElement {
  const { projects } = useStudioProjects();
  const { areas } = useStudioAreas();
  const { tasks } = useStudioTasks();
  const open = useMemo(() => orderOpen(projects), [projects]);

  const areaNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of areas) map.set(a.id, a.name);
    return map;
  }, [areas]);

  const openTaskCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "lesno") continue;
      for (const p of t.projects ?? []) {
        map.set(p.id, (map.get(p.id) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  if (open.length === 0) {
    return (
      <p
        className="text-[15px] italic text-[#F2E9D8]/70"
        style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
      >
        No open projects. Spin one up under an area and it will show here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
          Projects
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#C9A227]/80">
          {open.length} open
        </span>
      </div>
      <ul className="flex flex-col">
        {open.map((p) => {
          const ends = endLabel(p.endDate);
          const areaName =
            p.areaId && areaNameById.has(p.areaId)
              ? areaNameById.get(p.areaId)!
              : null;
          const taskCount = openTaskCountByProject.get(p.id) ?? 0;
          return (
            <li
              key={p.id}
              className="border-b border-[color:rgba(201,162,39,0.1)] last:border-b-0"
            >
              <Link
                href={`/projects/${p.id}`}
                className="cursor-pointer-always flex flex-col gap-1 py-3 transition-colors duration-100 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-3">
                  {p.icon ? (
                    <span aria-hidden className="w-5 shrink-0 text-center text-[15px]">
                      {p.icon}
                    </span>
                  ) : null}
                  <span
                    className="min-w-0 flex-1 truncate text-[15px] text-[#F2E9D8]"
                    style={{
                      fontFamily: "var(--font-eb-garamond, Georgia, serif)",
                    }}
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
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 sm:pl-8">
                  {areaName ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8FA8C7]/80">
                      {areaName}
                    </span>
                  ) : null}
                  {taskCount > 0 ? (
                    <span className="font-mono text-[10px] tabular-nums text-[#E8C46B]/85">
                      {taskCount} open task{taskCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[#8FA8C7]/50">
                      no open tasks
                    </span>
                  )}
                  {p.description ? (
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] text-[#F2E9D8]/50"
                      style={{
                        fontFamily: "var(--font-eb-garamond, Georgia, serif)",
                      }}
                    >
                      {p.description}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ProjectsFocus;
