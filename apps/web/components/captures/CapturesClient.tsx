"use client";

import { deleteCapture, getCapturesForCurrentUser } from "@/app/actions/captures";
import { type HashtagWithCount, getHashtagsForUserAction } from "@/app/actions/hashtags";
import { getPeopleForCurrentUser } from "@/app/actions/people";
import { createProject } from "@/app/actions/projects";
import { EmptyState } from "@/components/shared/EmptyState";
import type { InlineProjectArea } from "@/components/shared/InlineProjectCreateForm";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CaptureComposer } from "./CaptureComposer";
import { CaptureDetailPanel } from "./CaptureDetailPanel";
import { CaptureSearch } from "./CaptureSearch";
import { CapturesFeed } from "./CapturesFeed";
import { HashtagSidebar } from "./HashtagSidebar";

interface Props {
  /** Signed-in user id — required for tableKey-scoped queries + Realtime filters. */
  userId: string;
  initialCaptures: CaptureWithLinks[];
  hashtags: HashtagWithCount[];
  projects: ProjectMultiSelectOption[];
  /** Active areas a new project can be filed under (inline project creation). */
  areas: InlineProjectArea[];
  /**
   * Total captures owned by the user (no filter applied). Drives the "All"
   * row count in the hashtag sidebar — the primary affordance for clearing
   * an active `?tag=` filter.
   */
  totalCount: number;
  /**
   * Signed-in user's Google profile avatar URL (from Supabase Auth metadata).
   * Rendered Twitter-style at the leading edge of each non-compact CaptureCard
   * and in the detail panel header. Pre-fetched in the page loader so cards
   * don't re-resolve per row.
   */
  userAvatarUrl: string | null;
  /** Single-char fallback for `<AvatarFallback>` when no avatar URL is set. */
  userInitials: string;
}

/**
 * /captures client orchestrator — Phase 3 Realtime + TanStack Query + useOptimistic.
 *
 * Data plane:
 * - `useQuery({ queryKey: [...tableKey("captures", userId), activeTagId], initialData })`
 *   owns the captures feed. SSR provides initialData (no flash), TanStack Query owns
 *   all subsequent state. `getCapturesForCurrentUser({ tag })` is the queryFn —
 *   re-runs when `?tag=` changes or when the captures key prefix is invalidated.
 * - `useQuery({ queryKey: tableKey("hashtags", userId), initialData })` owns the
 *   hashtag sidebar list (with counts). HashtagSidebar reads `liveHashtags`.
 *
 * Realtime plane:
 * - Four subscriptions on this surface:
 *   1. captures        → invalidates ["captures", userId]
 *   2. captures_hashtags → invalidates ["captures_hashtags", userId] AND fans
 *      out to ["hashtags", userId] + ["captures", userId] so the sidebar count
 *      AND the feed-card chip lists update live as captures are tagged/untagged
 *      (D-10 — the critical live-count requirement).
 *   3. captures_projects → invalidates ["captures_projects", userId] AND fans
 *      out to ["captures", userId] so feed-card project chips update live.
 *   4. hashtags        → invalidates ["hashtags", userId] so newly-auto-created
 *      hashtag rows (from CAPT-08) show up in the sidebar.
 *
 * Optimistic plane:
 * - `useOptimistic(captures, captureOptimisticReducer)` provides instant feed
 *   updates for composer inserts. The composer generates `crypto.randomUUID()`
 *   BEFORE calling the Server Action, passes the same UUID to addOptimistic
 *   AND to createCapture. The Realtime echo arrives with that same UUID; the
 *   reducer's `insert` dedupe makes the echo a no-op.
 * - Per D-02: no opacity dim, no spinner, no pending pill on the optimistic row.
 * - Per D-03: server rejection → silent revert (useOptimistic auto-reverts when
 *   the transition completes) + toast.error.
 * - Per D-05: no toast/badge on cross-device invalidation — the UI just updates.
 *
 * Filter composition (preserved from Phase 2):
 * - active hashtag (URL ?tag=<id>) narrows the feed server-side via queryFn
 * - search results (server-side tsvector match) narrow further client-side
 * - both apply together (CAPT-06 "search + hashtag combine")
 *
 * Detail panel: a single CaptureDetailPanel instance lives at this level.
 * Clicking any feed card sets `selectedCaptureId` → panel opens. The panel is
 * the canonical edit surface for captures (content + hashtags + project links
 * + timestamps in one place).
 */
export function CapturesClient({
  userId,
  initialCaptures,
  hashtags,
  projects: initialProjects,
  areas,
  totalCount,
  userAvatarUrl,
  userInitials,
}: Props) {
  const queryClient = useQueryClient();
  // Local copy so an inline-created project shows in the picker immediately.
  // Captures don't subscribe to the projects table, so optimistic insert here
  // is what surfaces the new project (and its chip) without a reload.
  const [projects, setProjects] = useState<ProjectMultiSelectOption[]>(initialProjects);
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const handleCreateProject = useCallback(
    async (input: { name: string; areaId: string }): Promise<string | null> => {
      const newId = crypto.randomUUID();
      const optimistic: ProjectMultiSelectOption = {
        id: newId,
        name: input.name,
        isClass: false,
        courseCode: null,
      };
      setProjects((prev) => [...prev, optimistic]);
      const r = await createProject({
        id: newId,
        areaId: input.areaId,
        name: input.name,
      });
      if (!r.success) {
        toast.error(r.error);
        setProjects((prev) => prev.filter((p) => p.id !== newId));
        return null;
      }
      await queryClient.invalidateQueries({
        queryKey: tableKey("projects", userId),
      });
      toast("Project created.");
      return newId;
    },
    [queryClient, userId],
  );

  const [activeTagId, setActiveTagId] = useQueryState("tag", parseAsString);
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
  // URL-driven (?capture=<id>) so the person profile card can deep-link into a
  // specific capture and open its detail panel.
  const [selectedCaptureId, setSelectedCaptureId] = useQueryState("capture", parseAsString);

  // -- Data plane ---------------------------------------------------------
  // queryFn closes over `activeTagId` so the query refetches when the nuqs
  // ?tag= URL state changes. The queryKey embeds `activeTagId` so each tag
  // filter is its own cached slice but ALL slices share the `["captures",
  // userId]` prefix — invalidateQueries on the prefix fans out to every slice.
  const capturesQuery = useQuery({
    queryKey: [...tableKey("captures", userId), activeTagId ?? null] as const,
    queryFn: () => getCapturesForCurrentUser({ tag: activeTagId ?? undefined }),
    initialData: activeTagId === null || activeTagId === undefined ? initialCaptures : undefined,
  });

  const liveCaptures = capturesQuery.data ?? initialCaptures;

  const hashtagsQuery = useQuery({
    queryKey: tableKey("hashtags", userId),
    queryFn: () => getHashtagsForUserAction({ withCounts: true }),
    initialData: hashtags,
  });
  const liveHashtags = hashtagsQuery.data ?? hashtags;

  // People feed the `@`-mention menu in the composer (Phase C). No SSR seed —
  // it loads on mount and stays live via the people / people_references subs
  // below. Mapped to the composer's {id,name} shape at the call site.
  const peopleQuery = useQuery({
    queryKey: tableKey("people", userId),
    queryFn: getPeopleForCurrentUser,
    initialData: [],
  });
  const composerPeople = useMemo(
    () => (peopleQuery.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    [peopleQuery.data]
  );

  // -- Realtime plane -----------------------------------------------------
  useTableSubscription("captures", userId);

  // D-10 — captures_hashtags join changes drive hashtag count refresh AND
  // feed-card chip refresh. Without this fanout, tagging a capture in window A
  // would not update the hashtag sidebar count in window B.
  useTableSubscription("captures_hashtags", userId, {
    alsoInvalidate: [tableKey("hashtags", userId), tableKey("captures", userId)],
  });

  // captures_projects join changes drive feed-card project chip refresh.
  useTableSubscription("captures_projects", userId, {
    alsoInvalidate: [tableKey("captures", userId)],
  });

  // people subscriptions — keep the `@`-mention menu live as people are added
  // (inline-created on capture save) or referenced elsewhere.
  useTableSubscription("people", userId);
  useTableSubscription("people_references", userId, {
    alsoInvalidate: [tableKey("people", userId)],
  });

  // hashtags subscription — picks up newly-auto-created tags so they appear
  // in the sidebar even before a capture references them via the join.
  useTableSubscription("hashtags", userId);

  // -- Optimistic plane (RT-06 self-reconciling) --------------------------
  // Pending inserts/updates/deletes persist until the canonical feed catches
  // up, so a composer insert (dispatched outside any transition) and the 5s
  // undo-delete window both survive a slow Realtime echo without flickering.
  const [optimisticCaptures, addOptimistic] = useOptimisticList<CaptureWithLinks>(liveCaptures);

  // -- Composition --------------------------------------------------------
  const filtered = useMemo(() => {
    let result = optimisticCaptures;
    // activeTagId is already handled server-side by the queryFn. The
    // additional client-side filter below is a defensive narrowing for the
    // window between an optimistic insert (which doesn't go through
    // server-side filtering) and the Realtime echo.
    if (activeTagId) {
      result = result.filter((c) => c.hashtags.some((h) => h.id === activeTagId));
    }
    if (searchResultIds !== null) {
      const allowed = new Set(searchResultIds);
      result = result.filter((c) => allowed.has(c.id));
    }
    return result;
  }, [optimisticCaptures, activeTagId, searchResultIds]);

  // Selected capture is pulled from the optimistic+live feed so detail panel
  // edits reflect the freshest data on every invalidation.
  const selectedCapture = useMemo(
    () =>
      selectedCaptureId
        ? (optimisticCaptures.find((c) => c.id === selectedCaptureId) ?? null)
        : null,
    [optimisticCaptures, selectedCaptureId]
  );

  // Hashtag source for the detail panel's TipTap mention popover —
  // strip the count field (panel only needs id/name/displayName).
  const hashtagSuggestions = useMemo(
    () =>
      liveHashtags.map((h) => ({
        id: h.id,
        name: h.name,
        displayName: h.displayName,
      })),
    [liveHashtags]
  );

  const handleSearchResults = useCallback((ids: string[] | null) => {
    setSearchResultIds(ids);
  }, []);

  // Optimistic-action callbacks passed down to the surfaces that mutate.
  // These wrap `addOptimistic` so consumers don't see the reducer shape.
  const handleOptimisticInsert = useCallback(
    (row: CaptureWithLinks) => addOptimistic({ type: "insert", row }),
    [addOptimistic]
  );
  const handleOptimisticRevert = useCallback(
    (id: string) => addOptimistic({ type: "revert", id }),
    [addOptimistic]
  );
  const handleOptimisticUpdate = useCallback(
    (id: string, patch: Partial<CaptureWithLinks>) => addOptimistic({ type: "update", id, patch }),
    [addOptimistic]
  );
  const handleOptimisticDelete = useCallback(
    (id: string) => addOptimistic({ type: "delete", id }),
    [addOptimistic]
  );

  // Phase 6 Plan 06-02 (RES-02): delete-capture wrapped in 5s sonner Undo.
  // Passed to CapturesFeed → CaptureCard so the card no longer commits the
  // server-side delete itself; the toast helper manages the commit window.
  const { show: showUndoToast } = useUndoToast();
  const [, startTransition] = useTransition();
  const handleDeleteCapture = useCallback(
    (capture: CaptureWithLinks) => {
      // 1. Optimistic remove — instant feedback (D-02)
      addOptimistic({ type: "delete", id: capture.id });
      // 2. Toast with 5s Undo (RES-02 / UI-SPEC §8h)
      const preview = capture.content.slice(0, 40);
      const ellipsis = capture.content.length > 40 ? "…" : "";
      showUndoToast({
        message: `"${preview}${ellipsis}" deleted`,
        optimisticRemove: () => {
          /* already done above */
        },
        commit: async () => {
          const r = await deleteCapture(capture.id);
          if (!r.success) {
            toast.error(r.error);
            startTransition(() => {
              addOptimistic({ type: "insert", row: capture });
            });
          }
          // Realtime DELETE echo invalidates → refetch → cache aligns.
        },
        undo: () => {
          /* Server delete only fires on commit; no server-side rollback needed */
        },
        addBack: () =>
          startTransition(() => {
            addOptimistic({ type: "insert", row: capture });
          }),
      });
    },
    [addOptimistic, showUndoToast]
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[232px] p-4 pr-2 overflow-y-auto shrink-0">
        <HashtagSidebar
          hashtags={liveHashtags}
          activeHashtagId={activeTagId}
          totalCount={totalCount}
          onSelect={setActiveTagId}
        />
      </aside>
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden min-w-0">
        <CaptureSearch activeHashtagId={activeTagId} onResults={handleSearchResults} />
        <div className="sticky top-0 z-10">
          <CaptureComposer
            userId={userId}
            hashtags={hashtagSuggestions}
            people={composerPeople}
            projects={projects}
            onOptimisticInsert={handleOptimisticInsert}
            onOptimisticRevert={handleOptimisticRevert}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Phase 6 Plan 06-02 (RES-03, AES-04, UI-SPEC §9): brand-voice empty
              state when the inbox is truly empty (no captures, no filter, no
              search). CapturesFeed retains its own filter/search empty states. */}
          {optimisticCaptures.length === 0 && !activeTagId && searchResultIds === null ? (
            <EmptyState
              heading="The inbox is quiet."
              body="Type anything — a thought, a link, a fragment. JARVIS will sort it out."
            />
          ) : (
            <CapturesFeed
              captures={filtered}
              activeHashtagId={activeTagId}
              isSearchActive={searchResultIds !== null}
              onClearHashtag={() => setActiveTagId(null)}
              onClearSearch={() => handleSearchResults(null)}
              onSelectCapture={(c) => setSelectedCaptureId(c.id)}
              onOptimisticDelete={handleOptimisticDelete}
              onDeleteCapture={handleDeleteCapture}
              userAvatarUrl={userAvatarUrl}
              userInitials={userInitials}
              availableProjects={projects}
            />
          )}
        </div>
      </div>

      <CaptureDetailPanel
        capture={selectedCapture}
        hashtags={hashtagSuggestions}
        projects={projects}
        areas={areas}
        onCreateProject={handleCreateProject}
        open={selectedCapture !== null}
        onClose={() => setSelectedCaptureId(null)}
        onOptimisticUpdate={handleOptimisticUpdate}
        onOptimisticDelete={handleOptimisticDelete}
        onOptimisticRevert={handleOptimisticRevert}
        userAvatarUrl={userAvatarUrl}
        userInitials={userInitials}
      />
    </div>
  );
}
