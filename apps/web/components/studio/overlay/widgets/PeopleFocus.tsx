"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { useStudioPeople } from "@/components/studio/data/hooks";
import type { PersonWithStats } from "@/lib/db/queries/people";

/**
 * PeopleFocus — a read-only roster of people REBUILT for the overlay (same
 * rationale as AgendaFocus), most-referenced first. Each row deep-links to the
 * person on /people?person=<id> (the same param PeopleClient reads); the header
 * opens the full roster.
 */

const OPEN_LINK = (
  <Link
    href="/people"
    className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.12em] text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
  >
    open /people →
  </Link>
);

/** Most-referenced first. The slice is name-sorted and Array.sort is stable, so
 * ties keep alphabetical order — mirrors summarizePeople's tie-break. */
function orderByReferences(people: PersonWithStats[]): PersonWithStats[] {
  return [...people].sort((a, b) => b.referenceCount - a.referenceCount);
}

export function PeopleFocus(): React.ReactElement {
  const { people } = useStudioPeople();
  const ordered = useMemo(() => orderByReferences(people), [people]);

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p
          className="text-[15px] italic text-[#F2E9D8]/70"
          style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
        >
          No people yet.
        </p>
        {OPEN_LINK}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
          People
        </span>
        {OPEN_LINK}
      </div>
      <ul className="flex flex-col">
        {ordered.map((p) => (
          <li
            key={p.id}
            className="border-b border-[color:rgba(201,162,39,0.1)] last:border-b-0"
          >
            <Link
              href={`/people?person=${p.id}`}
              className="cursor-pointer-always flex items-center gap-3 py-2.5 transition-colors duration-100 hover:bg-white/[0.03]"
            >
              <PersonAvatar
                name={p.name}
                avatarUrl={p.avatarUrl}
                sizeClass="w-8 h-8"
                textClass="text-xs"
              />
              <span
                className="min-w-0 flex-1 truncate text-[15px] text-[#F2E9D8]"
                style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
              >
                {p.name}
              </span>
              {p.referenceCount > 0 ? (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]">
                  {p.referenceCount} ref{p.referenceCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PeopleFocus;
