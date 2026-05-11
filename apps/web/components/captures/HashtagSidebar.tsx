"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Hashtag {
  id: string;
  name: string;
  displayName: string;
  count: number;
}

interface Props {
  hashtags: Hashtag[];
  activeHashtagId: string | null;
  onSelect: (hashtagId: string | null) => void;
}

/**
 * Hashtag sidebar per UI-SPEC §Hashtag Sidebar (Captures Page).
 *
 * - 200px-wide column rendered by CapturesClient
 * - Each row: #name + count, font-sans 13px/400
 * - Active row: text-accent + bg-secondary (color shift only, no weight change)
 * - Sorted DESC by count by the server query; we render in given order
 * - Orphan tags (count === 0): hidden by default; "Show all" toggle reveals at opacity-40
 * - Click again on the active row to clear the filter (toggle behavior)
 */
export function HashtagSidebar({
  hashtags,
  activeHashtagId,
  onSelect,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const active = hashtags.filter((h) => h.count > 0);
  const orphans = hashtags.filter((h) => h.count === 0);

  function rowFor(h: Hashtag, isOrphan: boolean) {
    const isActive = activeHashtagId === h.id;
    return (
      <button
        key={h.id}
        type="button"
        onClick={() => onSelect(isActive ? null : h.id)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md font-sans text-[13px] font-normal text-left",
          isActive
            ? "bg-secondary text-accent"
            : "text-foreground hover:bg-secondary/60",
          isOrphan && !isActive && "opacity-40",
        )}
        aria-pressed={isActive}
      >
        <span className="truncate">#{h.displayName}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {h.count}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {active.length === 0 && orphans.length === 0 && (
        <p className="font-sans text-[13px] text-muted-foreground italic px-2 py-1">
          No hashtags yet.
        </p>
      )}
      {active.map((h) => rowFor(h, false))}
      {orphans.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="font-sans text-[13px] text-muted-foreground hover:text-foreground px-2 py-1 text-left"
          >
            {showAll ? "Hide unused" : `Show all (${orphans.length} unused)`}
          </button>
          {showAll && orphans.map((h) => rowFor(h, true))}
        </>
      )}
    </div>
  );
}
