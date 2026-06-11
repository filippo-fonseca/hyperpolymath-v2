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
  /**
   * Total captures owned by the user (no filter applied). Rendered as the
   * count on the "All"row at the top of the sidebar — the primary
   * affordance for clearing an active `?tag=` filter.
   */
  totalCount: number;
  onSelect: (hashtagId: string | null) => void;
}

/**
 * Hashtag sidebar per UI-SPEC §Hashtag Sidebar (Captures Page).
 *
 * Phase 3 live-count contract (D-10):
 * - The `hashtags` prop is the data returned by the `useQuery({ queryKey:
 *   tableKey("hashtags", userId) })` mounted in CapturesClient. CapturesClient
 *   also mounts `useTableSubscription("captures_hashtags", userId, {
 *   alsoInvalidate: [tableKey("hashtags", userId), ...] })` so that when a
 *   capture is tagged/untagged in another window, this sidebar's counts
 *   refetch and re-render automatically.
 * - No state of our own — pure render off the prop.
 *
 * Layout (top → bottom):
 *   1. "All"row — clears the `?tag=` filter; active when no tag is selected.
 *      Sits above the "Hashtags"heading because it is a filter-clear, not a
 *      hashtag itself. Users who land on `/captures?tag=...` need a
 *      discoverable way back to the full feed (the previous "click the active
 *      tag again"toggle was the only path, and not discoverable).
 *   2. "Hashtags"section heading.
 *   3. Hashtag rows — `#name` + count, font-sans 13px/400.
 *
 * - 200px-wide column rendered by CapturesClient
 * - Active row: text-accent + bg-secondary (color shift only, no weight change)
 * - Sorted DESC by count by the server query; we render in given order
 * - Orphan tags (count === 0): hidden by default; "Show all"toggle reveals at opacity-40
 * - Click again on the active hashtag row also clears the filter (secondary affordance)
 */
export function HashtagSidebar({
  hashtags,
  activeHashtagId,
  totalCount,
  onSelect,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const active = hashtags.filter((h) => h.count > 0);
  const orphans = hashtags.filter((h) => h.count === 0);
  const allIsActive = activeHashtagId === null;

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
    <div className="flex flex-col p-4 rounded-xl glass-tile">
      {/* All row — filter-clear; sits above the "Hashtags"heading. */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md font-sans text-[13px] font-normal text-left",
          allIsActive
            ? "bg-secondary text-accent"
            : "text-foreground hover:bg-secondary/60",
        )}
        aria-pressed={allIsActive}
      >
        <span className="truncate">All</span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {totalCount}
        </span>
      </button>

      <div className="border-b border-border my-2" />

      <h3 className="font-sans text-[13px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
        Hashtags
      </h3>

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
    </div>
  );
}
