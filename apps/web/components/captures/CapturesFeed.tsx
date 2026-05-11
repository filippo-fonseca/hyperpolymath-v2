"use client";

import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { CaptureCard } from "./CaptureCard";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

interface Props {
  captures: CaptureWithLinks[];
  activeHashtagId: string | null;
  isSearchActive: boolean;
  onClearHashtag: () => void;
  onClearSearch: () => void;
  /**
   * Clicking a card opens the canonical detail panel (Notion-style Sheet).
   * Owned by CapturesClient — feed just forwards the click.
   */
  onSelectCapture: (capture: CaptureWithLinks) => void;
  /**
   * Signed-in user's avatar URL + fallback initial. Forwarded to each card so
   * the Twitter-style avatar | content rhythm renders consistently across the
   * feed. Compact mode (project detail Captures column) does NOT receive this.
   */
  userAvatarUrl: string | null;
  userInitials: string;
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
  onClearHashtag,
  onClearSearch,
  onSelectCapture,
  userAvatarUrl,
  userInitials,
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
      <EmptyState
        title="What's on your mind?"
        body="Capture a thought. Tag it. Let it breathe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {captures.map((c) => (
          <CaptureCard
            key={c.id}
            capture={c}
            onOpen={() => onSelectCapture(c)}
            userAvatarUrl={userAvatarUrl}
            userInitials={userInitials}
          />
        ))}
      </AnimatePresence>
    </div>
  );
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
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <h3 className="font-serif text-[28px] font-semibold leading-tight text-foreground mb-2">
        {title}
      </h3>
      <p className="font-serif text-base text-muted-foreground mb-6 max-w-md">
        {body}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          className="font-sans text-[13px]"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
