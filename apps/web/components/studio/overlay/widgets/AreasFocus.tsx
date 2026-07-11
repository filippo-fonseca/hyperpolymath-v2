"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStudioAreas } from "@/components/studio/data/hooks";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

/**
 * AreasFocus — a read-only roster of active areas REBUILT for the overlay (same
 * rationale as AgendaFocus). Each row shows the area's active-project count and
 * deep-links to the area page; the header opens the full /areas tree.
 */

const OPEN_LINK = (
  <Link
    href="/areas"
    className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.12em] text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
  >
    open /areas →
  </Link>
);

function activeProjectCount(area: SidebarArea): number {
  return area.projects.filter((p) => p.archivedAt === null).length;
}

/** Active areas, most active projects first — mirrors summarizeAreas' ordering. */
function orderActive(areas: SidebarArea[]): SidebarArea[] {
  return areas
    .filter((a) => a.archivedAt === null)
    .sort((a, b) => {
      const diff = activeProjectCount(b) - activeProjectCount(a);
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
          No active areas.
        </p>
        {OPEN_LINK}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
          Areas
        </span>
        {OPEN_LINK}
      </div>
      <ul className="flex flex-col">
        {active.map((a) => {
          const count = activeProjectCount(a);
          return (
            <li
              key={a.id}
              className="border-b border-[color:rgba(201,162,39,0.1)] last:border-b-0"
            >
              <Link
                href={`/areas/${a.id}`}
                className="cursor-pointer-always flex items-center gap-3 py-2.5 transition-colors duration-100 hover:bg-white/[0.03]"
              >
                {a.emoji ? (
                  <span aria-hidden className="w-5 shrink-0 text-center text-[15px]">
                    {a.emoji}
                  </span>
                ) : null}
                <span
                  className="min-w-0 flex-1 truncate text-[15px] text-[#F2E9D8]"
                  style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
                >
                  {a.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]">
                  {count} project{count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default AreasFocus;
