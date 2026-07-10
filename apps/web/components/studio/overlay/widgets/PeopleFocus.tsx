"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { useStudioPeople } from "@/components/studio/data/hooks";
import type { PersonWithStats } from "@/lib/db/queries/people";

/**
 * PeopleFocus — roster ordered by reference count, with tags/bio when present.
 */

const OPEN_LINK = (
  <Link
    href="/people"
    className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.12em] text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
  >
    open /people →
  </Link>
);

function orderByReferences(people: PersonWithStats[]): PersonWithStats[] {
  return [...people].sort((a, b) => {
    if (b.referenceCount !== a.referenceCount) {
      return b.referenceCount - a.referenceCount;
    }
    return a.name.localeCompare(b.name);
  });
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
          No people yet. Mention someone with @ in a capture or task and they
          will land here.
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
            People
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#C9A227]/80">
            {ordered.length} in roster
          </span>
        </div>
        {OPEN_LINK}
      </div>
      <ul className="flex flex-col">
        {ordered.map((p) => {
          const tags = Array.isArray(p.tags) ? p.tags.slice(0, 4) : [];
          const bio = (p.bio ?? "").trim();
          return (
            <li
              key={p.id}
              className="border-b border-[color:rgba(201,162,39,0.1)] last:border-b-0"
            >
              <Link
                href={`/people?person=${p.id}`}
                className="cursor-pointer-always flex items-start gap-3 py-3 transition-colors duration-100 hover:bg-white/[0.03]"
              >
                <PersonAvatar
                  name={p.name}
                  avatarUrl={p.avatarUrl}
                  sizeClass="w-9 h-9"
                  textClass="text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="min-w-0 truncate text-[15px] text-[#F2E9D8]"
                      style={{
                        fontFamily: "var(--font-eb-garamond, Georgia, serif)",
                      }}
                    >
                      {p.name}
                    </span>
                    {p.referenceCount > 0 ? (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]">
                        {p.referenceCount} ref
                        {p.referenceCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {bio ? (
                    <p
                      className="mt-0.5 line-clamp-2 text-[13px] text-[#F2E9D8]/60"
                      style={{
                        fontFamily: "var(--font-eb-garamond, Georgia, serif)",
                      }}
                    >
                      {bio}
                    </p>
                  ) : null}
                  {tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[color:rgba(201,162,39,0.2)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#C9A227]/90"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
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

export default PeopleFocus;
