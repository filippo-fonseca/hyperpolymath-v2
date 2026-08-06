"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { useState } from "react";

interface Hashtag {
  id: string;
  name: string;
  displayName: string;
  count: number;
}

interface Props {
  hashtags: Hashtag[];
  activeHashtagId: string | null;
  favoritesActive?: boolean;
  favoritesCount?: number;
  /**
   * Total captures owned by the user (no filter applied). Rendered as the
   * count on the "All"row at the top of the sidebar — the primary
   * affordance for clearing an active `?tag=` filter.
   */
  totalCount: number;
  onSelect: (hashtagId: string | null) => void;
  onToggleFavorites?: () => void;
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
 * - Active row: bg-secondary + medium weight (theme-aware; reads in light + dark)
 * - Sorted DESC by count by the server query; we render in given order
 * - Orphan tags (count === 0): hidden by default; "Show all"toggle reveals at opacity-40
 * - Click again on the active hashtag row also clears the filter (secondary affordance)
 */
export function HashtagSidebar({
  hashtags,
  activeHashtagId,
  favoritesActive = false,
  favoritesCount = 0,
  totalCount,
  onSelect,
  onToggleFavorites,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const active = hashtags.filter((h) => h.count > 0);
  const orphans = hashtags.filter((h) => h.count === 0);
  const allIsActive = activeHashtagId === null && !favoritesActive;

  function rowFor(h: Hashtag, isOrphan: boolean) {
    const isActive = activeHashtagId === h.id;
    return (
      <button
        key={h.id}
        type="button"
        onClick={() => onSelect(isActive ? null : h.id)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-meta font-normal text-left transition-colors",
          isActive
            ? "bg-[var(--sd-selected)] font-medium text-[var(--sd-ink)]"
            : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
          isOrphan && !isActive && "opacity-40"
        )}
        aria-pressed={isActive}
      >
        <span className="truncate">#{h.displayName}</span>
        <span className="shrink-0 text-micro tabular-nums text-[var(--sd-ink-faint)]">{h.count}</span>
      </button>
    );
  }

  return (
    <div className="craft-card flex flex-col p-3">
      {/* All row — filter-clear; sits above the "Hashtags"heading. */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-meta font-normal text-left transition-colors",
          allIsActive
            ? "bg-[var(--sd-selected)] font-medium text-[var(--sd-ink)]"
            : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
        )}
        aria-pressed={allIsActive}
      >
        <span className="truncate">All</span>
        <span className="shrink-0 text-micro tabular-nums text-[var(--sd-ink-faint)]">{totalCount}</span>
      </button>

      <button
        type="button"
        onClick={onToggleFavorites}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-meta font-normal text-left transition-colors",
          favoritesActive
            ? "bg-[var(--sd-selected)] font-medium text-[var(--sd-ink)]"
            : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
        )}
        aria-pressed={favoritesActive}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Star
            className={cn("h-3.5 w-3.5 shrink-0", favoritesActive && "text-[var(--ink-amber)]")}
            fill={favoritesActive ? "currentColor" : "none"}
            aria-hidden="true"
          />
          <span className="truncate">Favorites</span>
        </span>
        <span className="shrink-0 text-micro tabular-nums text-[var(--sd-ink-faint)]">{favoritesCount}</span>
      </button>

      <div className="my-2 border-b border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]" />

      <h3 className="text-micro text-[var(--sd-ink-faint)] mb-2 px-2">
        Hashtags
      </h3>

      <div className="flex flex-col gap-0.5">
        {active.length === 0 && orphans.length === 0 && (
          <p className="px-2 py-1 text-micro text-[var(--sd-ink-faint)]">
            No hashtags yet.
          </p>
        )}
        {active.map((h) => rowFor(h, false))}
        {orphans.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="px-2 py-1 text-left text-micro text-[var(--sd-ink-faint)] transition-colors hover:text-[var(--sd-ink)]"
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
