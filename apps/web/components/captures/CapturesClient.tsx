"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { CaptureComposer } from "./CaptureComposer";
import { CapturesFeed } from "./CapturesFeed";
import { CaptureDetailPanel } from "./CaptureDetailPanel";
import { HashtagSidebar } from "./HashtagSidebar";
import { CaptureSearch } from "./CaptureSearch";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";

interface Props {
  initialCaptures: CaptureWithLinks[];
  hashtags: { id: string; name: string; displayName: string; count: number }[];
  projects: ProjectMultiSelectOption[];
}

/**
 * /captures client orchestrator.
 *
 * Layout per UI-SPEC §Hashtag Sidebar + D-09 sticky composer:
 * - left: 200px hashtag sidebar
 * - right: search bar (top), sticky composer, then the feed
 *
 * Filter composition:
 * - active hashtag (URL ?tag=<id>) narrows the feed client-side
 * - search results (server-side tsvector match) narrow further
 * - both apply together (CAPT-06 "search + hashtag combine")
 *
 * Detail panel: a single CaptureDetailPanel instance lives at this level.
 * Clicking any feed card sets `selectedCapture` → panel opens. The panel is
 * the canonical edit surface for captures (content + hashtags + project
 * links + timestamps in one place — addresses user feedback that project
 * links could not be edited after capture creation).
 */
export function CapturesClient({
  initialCaptures,
  hashtags,
  projects,
}: Props) {
  const [activeTagId, setActiveTagId] = useQueryState("tag", parseAsString);
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(
    null,
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(
    null,
  );

  const filtered = useMemo(() => {
    let result = initialCaptures;
    if (activeTagId) {
      result = result.filter((c) =>
        c.hashtags.some((h) => h.id === activeTagId),
      );
    }
    if (searchResultIds !== null) {
      const allowed = new Set(searchResultIds);
      result = result.filter((c) => allowed.has(c.id));
    }
    return result;
  }, [initialCaptures, activeTagId, searchResultIds]);

  // Pull the freshest version of the selected capture from initialCaptures —
  // after router.refresh() following an edit, this reflects updates.
  const selectedCapture = useMemo(
    () =>
      selectedCaptureId
        ? (initialCaptures.find((c) => c.id === selectedCaptureId) ?? null)
        : null,
    [initialCaptures, selectedCaptureId],
  );

  // Hashtag source for the detail panel's TipTap mention popover —
  // strip the count field (panel only needs id/name/displayName).
  const hashtagSuggestions = useMemo(
    () =>
      hashtags.map((h) => ({
        id: h.id,
        name: h.name,
        displayName: h.displayName,
      })),
    [hashtags],
  );

  const handleSearchResults = useCallback((ids: string[] | null) => {
    setSearchResultIds(ids);
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[200px] border-r border-border p-4 overflow-y-auto shrink-0">
        <h3 className="font-sans text-[13px] uppercase tracking-wider text-muted-foreground mb-2">
          Hashtags
        </h3>
        <HashtagSidebar
          hashtags={hashtags}
          activeHashtagId={activeTagId}
          onSelect={setActiveTagId}
        />
      </aside>
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden min-w-0">
        <CaptureSearch
          activeHashtagId={activeTagId}
          onResults={handleSearchResults}
        />
        <div className="sticky top-0 z-10">
          <CaptureComposer
            hashtags={hashtagSuggestions}
            projects={projects}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <CapturesFeed
            captures={filtered}
            activeHashtagId={activeTagId}
            isSearchActive={searchResultIds !== null}
            onClearHashtag={() => setActiveTagId(null)}
            onClearSearch={() => handleSearchResults(null)}
            onSelectCapture={(c) => setSelectedCaptureId(c.id)}
          />
        </div>
      </div>

      <CaptureDetailPanel
        capture={selectedCapture}
        hashtags={hashtagSuggestions}
        projects={projects}
        open={selectedCapture !== null}
        onClose={() => setSelectedCaptureId(null)}
      />
    </div>
  );
}
