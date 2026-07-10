"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStudioAreas } from "@/components/studio/data/hooks";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

/**
 * AreasFocus — active areas with nested open projects, deep-linked into the app.
 */

const OPEN_LINK = (
  <Link
    href="/areas"
    className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.12em] text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
  >
    open /areas →
  </Link>
);

function openProjects(area: SidebarArea) {
  return area.projects
    .filter((p) => p.archivedAt === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

function orderActive(areas: SidebarArea[]): SidebarArea[] {
  return areas
    .filter((a) => a.archivedAt === null)
    .sort((a, b) => {
      const diff = openProjects(b).length - openProjects(a).length;
      if (diff !== 0) return diff;
      return a.orderIndex - b.orderIndex;
    });
}

export function AreasFocus(): React.ReactElement {
  const { areas } = useStudioAreas();
  const active = useMemo(() => orderActive(areas), [areas]);

  if (active.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p
          className="text-[15px] italic text-[#F2E9D8]/70"
          style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
        >
          No active areas. Carve one on /areas and it will appear here.
        </p>
        {OPEN_LINK}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
            Areas
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#C9A227]/80">
            {active.length} active
          </span>
        </div>
        {OPEN_LINK}
      </div>
      <ul className="flex flex-col gap-4">
        {active.map((a) => {
          const projects = openProjects(a);
          return (
            <li
              key={a.id}
              className="rounded-xl border border-[color:rgba(201,162,39,0.12)] bg-black/20 px-4 py-3"
            >
              <Link
                href={`/areas/${a.id}`}
                className="cursor-pointer-always flex items-center gap-3 transition-colors duration-100 hover:text-[#E8C46B]"
              >
                {a.emoji ? (
                  <span aria-hidden className="w-6 shrink-0 text-center text-[18px]">
                    {a.emoji}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#C9A227]/70"
                  />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-[17px] text-[#F2E9D8]"
                  style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
                >
                  {a.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]">
                  {projects.length} project{projects.length === 1 ? "" : "s"}
                </span>
              </Link>
              {projects.length > 0 ? (
                <ul className="mt-2 flex flex-col border-t border-[color:rgba(201,162,39,0.08)] pt-2">
                  {projects.slice(0, 4).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="cursor-pointer-always flex items-center gap-2 py-1.5 pl-8 text-[13px] text-[#F2E9D8]/75 transition-colors duration-100 hover:text-[#F2E9D8]"
                        style={{
                          fontFamily: "var(--font-eb-garamond, Georgia, serif)",
                        }}
                      >
                        {p.icon ? (
                          <span aria-hidden className="w-4 shrink-0 text-center">
                            {p.icon}
                          </span>
                        ) : (
                          <span className="w-4 shrink-0 text-center text-[#C9A227]/50">
                            ·
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      </Link>
                    </li>
                  ))}
                  {projects.length > 4 ? (
                    <li className="pl-8 pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8FA8C7]/70">
                      +{projects.length - 4} more
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default AreasFocus;
