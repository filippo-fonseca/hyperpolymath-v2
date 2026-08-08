"use client";

import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { Button } from "@/components/ui/button";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { AnimatePresence } from "motion/react";
import { CaptureCard } from "./CaptureCard";

interface Props {
  captures: CaptureWithLinks[];
  activeHashtagId: string | null;
  isSearchActive: boolean;
  isFavoritesActive?: boolean;
  /**
   * Issue #139 — the live search term, forwarded to each card so matched
   * substrings in the capture body are highlighted in the cyan accent. Empty
   * string means no active search → no highlighting.
   */
  searchQuery?: string;
  onClearHashtag: () => void;
  onClearSearch: () => void;
  onClearFavorites?: () => void;
  /**
   * Clicking a card opens the canonical detail panel (Notion-style Sheet).
   * Owned by CapturesClient — feed just forwards the click.
   */
  onSelectCapture: (capture: CaptureWithLinks) => void;
  /**
   * Phase 3 — optimistic delete callback forwarded to each card. Wired by
   * CapturesClient to addOptimistic({ type: "delete", id }) so card-level
   * delete is instant.
   */
  onOptimisticDelete?: (id: string) => void;
  /**
   * Phase 6 Plan 06-02 (RES-02) — when provided, CaptureCard hands off the
   * entire delete flow (optimistic remove + 5s sonner Undo + server commit)
   * to this parent handler instead of running its own deleteCapture()
   * invocation. Lifts the toast UX up one level (UI-SPEC §8h).
   */
  onDeleteCapture?: (capture: CaptureWithLinks) => void;
  onToggleFavorite?: (capture: CaptureWithLinks) => void;
  /**
   * Signed-in user's avatar URL + fallback initial. Forwarded to each card so
   * the Twitter-style avatar | content rhythm renders consistently across the
   * feed. Compact mode (project detail Captures column) does NOT receive this.
   */
  userAvatarUrl: string | null;
  userInitials: string;
  /**
   * Plan 05-04 (JARVIS-13 / D-14) — project options for the Convert-to-task
   * dialog. Forwarded to each card; the dialog only mounts when the capture's
   * createdVia === "jarvis".
   */
  availableProjects: ProjectMultiSelectOption[];
}

/**
 * Vertical reverse-chronological capture feed (CAPT-04).
 *
 * Empty-state copy per UI-SPEC §Empty States:
 * - No captures at all:           "What's on your mind?" / "Capture a thought. Tag it. Let it breathe."
 * - Hashtag filter, no results:   "Nothing tagged with this." / "Either the tag is empty, or you haven't captured it yet." / Clear filter
 * - Search active, no results:    "No captures match that search." / "Try different words, or scroll the full feed." / Clear search
 */
export function CapturesFeed({
  captures,
  activeHashtagId,
  isSearchActive,
  isFavoritesActive = false,
  searchQuery,
  onClearHashtag,
  onClearSearch,
  onClearFavorites,
  onSelectCapture,
  onOptimisticDelete,
  onDeleteCapture,
  onToggleFavorite,
  userAvatarUrl,
  userInitials,
  availableProjects,
}: Props) {
  if (captures.length === 0) {
    if (isSearchActive) {
      return (
        <EmptyState
          title="No captures match that search."
          body="Try different words, or scroll the full feed."
          actionLabel="Clear search"
          onAction={onClearSearch}
        />
      );
    }
    if (isFavoritesActive) {
      return (
        <EmptyState
          title="No favorite captures yet."
          body="Star captures you want to find quickly."
          actionLabel="Show all captures"
          onAction={onClearFavorites}
        />
      );
    }
    if (activeHashtagId) {
      return (
        <EmptyState
          title="Nothing tagged with this."
          body="Either the tag is empty, or you haven't captured it yet."
          actionLabel="Clear filter"
          onAction={onClearHashtag}
        />
      );
    }
    return (
      <EmptyState title="What's on your mind?" body="Capture a thought. Tag it. Let it breathe." />
    );
  }

  return (
    // sd plate feed — each capture is a solid --sd-box plate; spaced vertically
    // so the hairline chrome reads cleanly. mode="popLayout" still drives the
    // per-row exit via the motion exit prop on CaptureCard.
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {groupByDay(captures).map((group) => (
          <div key={group.key} className="flex flex-col gap-3">
            {/* Day rule. The feed is chronological but read as one
                undifferentiated column, so "when was this" cost a hover over
                every relative timestamp. A quiet hairline header answers it
                once per day instead of once per capture. */}
            <div className="flex items-center gap-3 pt-1">
              <span className="shrink-0 text-micro font-medium text-[var(--ink-muted)]">
                {group.label}
              </span>
              <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
                {group.captures.length}
              </span>
              <span aria-hidden className="h-px flex-1 bg-[var(--edge)]" />
            </div>
            {group.captures.map((c) => (
              <CaptureCard
                key={c.id}
                capture={c}
                searchQuery={searchQuery}
                onOpen={() => onSelectCapture(c)}
                onOptimisticDelete={onOptimisticDelete}
                onDeleteCapture={onDeleteCapture}
                onToggleFavorite={onToggleFavorite}
                userAvatarUrl={userAvatarUrl}
                userInitials={userInitials}
                availableProjects={availableProjects}
              />
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

type DayGroup = { key: string; label: string; captures: CaptureWithLinks[] };

/**
 * Split the feed into calendar days, preserving the incoming order (the query
 * already sorts newest first). Local time, because "which day was that" is a
 * question about the user's day, not UTC's.
 */
function groupByDay(captures: CaptureWithLinks[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const c of captures) {
    const d = new Date(c.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(d), captures: [] };
      groups.push(current);
    }
    current.captures.push(c);
  }
  return groups;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  // sd empty state — Space Grotesk H2 24px + body on --sd-ink-dull + primary
  // <Button> (the sd primitive). No serif.
  return (
    <div className="flex flex-col items-center text-center py-24 px-6 gap-3">
 <h2 className="text-title font-semibold leading-tight text-[var(--sd-ink)]">{title}</h2>
      <p className="text-base text-[var(--sd-ink-dull)] max-w-md">{body}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
