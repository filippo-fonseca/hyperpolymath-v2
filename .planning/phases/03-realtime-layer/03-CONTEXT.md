# Phase 3: Realtime Layer - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cross-device and cross-tab live updates across every primary table (Areas, Projects, Tasks, Captures, hashtag counts) via Supabase Realtime `postgres_changes` events invalidating TanStack Query caches. Includes leak-proof subscription lifecycle, `visibilitychange → 'visible'` recovery, and optimistic-update echo dedupe via client-generated UUIDs.

By end of phase: two browser windows open on `/tasks` (or `/captures`, `/projects/<id>`, etc.), mutating in one window updates the other within Realtime's ~150ms delivery window without manual refresh. Backgrounding a tab for 5+ minutes and returning triggers a refetch on visibility. DevTools Network → WS shows exactly one Supabase websocket per tab regardless of navigation history.

**Out of scope:** Conflict resolution UI for concurrent edits (single-user app — concurrent edit from the same user across devices is rare; last-write-wins is acceptable). Presence indicators ("Filippo is editing"). Multi-user collaboration. Server-pushed notifications. Background sync via service worker.

</domain>

<decisions>
## Implementation Decisions

### Optimistic UX

- **D-01: Optimism scope — all write paths.** Every mutation feels instant: drag-reorder (kanban + sidebar), create (tasks, captures, areas, projects, hashtag toggle), edit (inline + detail panels), delete, complete-toggle, project-link change. The "be goated" bar means no surface should feel laggy. Rollback complexity is acceptable because echo dedupe is the same pattern reused everywhere.
- **D-02: Pending visual indicator — none.** Optimistic update applies immediately; UI reflects the post-mutation state with no opacity dim, spinner, or pending pill. Assumes ≥99% success rate; on failure the rollback handles user feedback. Most "native app" feel; matches the journal-paper restraint (no busy chrome).
- **D-03: Rollback UX — silent revert + `toast.error`.** On server rejection (validation, RLS, conflict, network), UI snaps back to pre-mutation state and surfaces a single `toast.error` with the failure reason. No shake animation, no inline error pills. Calm, journal-paper-consistent, reuses the sonner pattern already mounted in Plan 02-01.
- **D-04: Optimistic primitive — React 19 `useOptimistic` + ID-based echo dedupe.** Carried forward from Phase 2 CONTEXT.md (Blocker 5 revision note). Client generates a UUID (`crypto.randomUUID()`) before the Server Action call; the optimistic row uses that UUID; Server Action persists it; when Realtime echoes back, dedupe by `id` to avoid double-insert. Same pattern for updates (echo with same `id` is a no-op) and deletes (echo with matching tombstone is a no-op).

### Cross-Device Sync UX

- **D-05: Silent cross-device updates.** When Device B's edit lands in Device A, the UI just updates — no toast, no pulse, no badge. Trust the data. Single-user app, so "another device" is always the same user; explicit notification adds noise without value. Matches journal aesthetic.

### TanStack Query Adoption

- **D-06: Hybrid SSR + `useQuery({ initialData })` pattern.** Server Components remain the initial render path (preserves first-paint speed, SEO, and the existing Plan 01-02-03 data-loading code). Each page wraps its server-fetched data in `useQuery` on the client with `initialData: serverData` so TanStack Query owns subsequent invalidation. No loading skeletons on navigation; cache invalidates on Realtime events. **`@supabase-cache-helpers/postgrest-react-query` is optional** — researcher to evaluate whether the type-inference convenience outweighs the Drizzle-on-the-server typed-query path we already have.
- **D-07: QueryClient placement.** Single `QueryClient` instance per request, mounted via a new `apps/web/components/providers/QueryProvider.tsx` (`"use client"`) inserted into `app/(app)/layout.tsx`. Devtools enabled only in `process.env.NODE_ENV !== "production"`. Hydration via `HydrationBoundary` if needed for streamed SSR data; otherwise plain `initialData` is sufficient.

### Subscription Lifecycle

- **D-08: One channel per (table, userId) — singleton via `useTableSubscription<T>(table, userId)`.** RT-01 contract. The hook reads from a module-level `Map<table, RealtimeChannel>` so multiple component mounts of the same `useTableSubscription("tasks", uid)` share one underlying channel. Cleanup runs only when the last subscriber unmounts (refcount).
- **D-09: Subscription invalidates queries by `[table, userId]` key prefix.** Realtime event arrives → channel callback calls `queryClient.invalidateQueries({ queryKey: [table, userId] })`. All queries reading that table get re-fetched. Don't merge payloads into cache manually — too easy to introduce consistency bugs (cited in CLAUDE.md "Critical Pattern 3").
- **D-10: Hashtag count live updates — subscribe to `captures_hashtags` join table.** When the join changes (capture tagged/untagged), invalidate the `["hashtags", userId]` query key that drives `HashtagSidebar`. Granular: only refetches when the join actually changes, not on every `captures` update.
- **D-11: Visibility recovery — `visibilitychange → 'visible'` triggers `queryClient.invalidateQueries()` on all active table keys.** Implemented once at the `QueryProvider` level (one listener, not per-hook). Recovers from Realtime gaps when the websocket was dormant.

### Migration of Phase 2 Surfaces

- **D-12: Replace every `router.refresh()` call site with the optimistic + Realtime pattern.** Phase 2's intentionally non-optimistic mutations (`KanbanBoard.handleDragEnd`, `SidebarTree.handleDragEnd`, `CaptureComposer.submit`, `TaskDetailPanel.save`, `CaptureDetailPanel.save`, etc.) get rewritten to: (1) generate UUID, (2) call `useOptimistic` mutator, (3) await Server Action, (4) on error toast + revert; Realtime echoes update the canonical cache. Plan should enumerate every `router.refresh()` site as a migration task.

### Claude's Discretion

- Channel partition keys, exact reconnect/backoff behavior, and Supabase Realtime authorization settings (RLS-aware broadcast) — researcher to confirm current 2026 Supabase Realtime patterns.
- TanStack Query default `staleTime`, `gcTime`, and `refetchOnWindowFocus` flags — likely `staleTime: 30s` since Realtime keeps data fresh; visibility-change handles the window-focus case explicitly.
- Whether to install `@supabase-cache-helpers/postgrest-react-query` — judge after seeing how much boilerplate `useQuery` wrappers add. Skip if not material.
- Optimistic update API surface — `useOptimistic` directly, or a thin `useOptimisticMutation` wrapper if it reduces duplication across the 6 mutation domains.
- Toast copy for rollback errors (RLS deny, validation, network, conflict) — match Plan 02 sonner copy patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `CLAUDE.md` — Tech stack contract (Critical Pattern 3: TanStack Query + Realtime invalidation; "What NOT to use" excludes manual Realtime payload merging). The 2026 idiomatic pattern is documented here.
- `.planning/PROJECT.md` — Single-user app, journal-paper aesthetic, "be goated" quality bar.

### Requirements
- `.planning/REQUIREMENTS.md` §RT-01..RT-05 (the canonical contract).
- `.planning/ROADMAP.md` Phase 3 — 5 success criteria.

### Prior phase decisions
- `.planning/phases/02-manual-crud/02-CONTEXT.md` Blocker 5 revision note — establishes `useOptimistic` + Realtime echo dedupe as the Phase 3 primitive.
- `.planning/phases/02-manual-crud/02-04-SUMMARY.md` — `RelativeTime` component already in place; the captures search query + `getCaptureCountForUser` are existing `useQuery` candidates.

### External patterns (2026 idiomatic)
- Supabase Blog: "React Query + Next.js App Router + Cache Helpers" — the official idiomatic pattern documented in CLAUDE.md.
- Supabase Realtime Authorization docs — RLS-aware broadcasts (required since Phase 1 has full RLS on every table).
- TanStack Query 5.x SSR helpers — `HydrationBoundary`, `initialData`.

### Sentinels in the codebase that change in Phase 3
- `apps/web/app/actions/*.ts` — every Server Action becomes a candidate for optimistic-update wrapping (post-action `revalidatePath` may be redundant once Realtime drives invalidation).
- `apps/web/components/shell/SidebarTree.tsx` — drag-reorder is the highest-visibility optimistic path.
- `apps/web/components/tasks/KanbanBoard.tsx` — cross-column status change is the second-highest.
- `apps/web/components/captures/CapturesClient.tsx`, `CaptureComposer.tsx`, `HashtagSidebar.tsx` — capture create + hashtag count updates touch the most components.
- `apps/web/app/(app)/layout.tsx` — where `QueryProvider` mounts.
- `apps/web/lib/db/client.ts` — the globalThis-cached Drizzle singleton from 02-04's connection-pool fix; Realtime uses `@supabase/supabase-js` separately, not Drizzle.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`@supabase/ssr` + `@supabase/supabase-js`** — Already installed in Plan 01. `supabase-js` client supports `.channel()` directly. Plan 03 adds `lib/supabase/client.ts` consumers for Realtime subscriptions; no new deps.
- **sonner toaster** — Mounted globally at `(app)/layout.tsx` from Plan 02-01. Rollback `toast.error()` calls plug in directly.
- **`crypto.randomUUID()`** — Native in modern runtimes. No `uuid` lib needed for client-generated IDs.
- **nuqs URL state** — Already drives `?tag=` filter on `/captures` and `?priority=` etc. on `/tasks`. Realtime doesn't conflict; nuqs handles URL, TanStack Query handles data.
- **Existing Server Actions** in `app/actions/{areas,projects,tasks,captures,hashtags}.ts` — All already return the row(s) they mutate or refetch. Optimistic wrapper can consume the returned row as the canonical post-mutation state.

### Established Patterns
- **Server Actions + `revalidatePath`** — Current pattern. Phase 3 retains Server Actions as the write API but replaces `revalidatePath` / `router.refresh()` with Realtime-driven invalidation. Researcher: confirm whether to remove `revalidatePath` entirely (purer) or keep as belt-and-suspenders.
- **Drizzle-on-server, supabase-js-on-client** — CLAUDE.md mandate. Phase 3 reads stay Drizzle-typed; Realtime channels are `supabase-js` only.
- **Row ownership via `user_id`** — Every primary table has `user_id`. Realtime filter `event: "*", schema: "public", table: "tasks", filter: "user_id=eq.{uid}"` keeps each user in their lane.

### Integration Points
- **`app/(app)/layout.tsx`** — Where `QueryProvider` + visibility-change listener mount.
- **Every list page** — `/today`, `/tasks`, `/captures`, `/projects/[id]`. Each becomes a `useQuery({ initialData })` wrapper.
- **Every mutation in detail panels + composers** — Wrap with `useOptimistic` (~10-15 sites).
- **Every `router.refresh()` call** — Audit + migrate. Grep target: `grep -rn "router.refresh()" apps/web/`.

### Pitfalls already documented
- `.planning/research/PITFALLS.md` Pitfall 4 — Realtime subscription leaks (the reason RT-01 mandates `useTableSubscription` singleton).
- Phase 2 hit React 19 hydration issues with @dnd-kit (fixed via explicit `id` props) and date-fns (`RelativeTime`); Phase 3 should grep for any new hydration risks (e.g., TanStack Query DevTools mounting on server).

</code_context>

<specifics>
## Specific Ideas

- The "be goated" quality bar means optimism is the default everywhere, not an opt-in. No mutation should feel like it's waiting on the network.
- Silent cross-device updates match journal-paper restraint — no notifications, no badges, just truth.
- The Phase 2 connection-pool fix (`globalThis`-cached Drizzle client, `max: 1`) constrains the Realtime subscription count too — every additional channel costs a websocket connection. Singleton per table is non-negotiable.

</specifics>

<deferred>
## Deferred Ideas

- **Conflict resolution UI for true concurrent edits** — Not needed for single-user MVP; "same user on two devices editing the same row in the same second" is acceptable last-write-wins. Revisit if Phase 7+ adds multi-user.
- **Presence ("Filippo editing in another tab")** — Cute but not in Phase 3 scope and adds noise to journal aesthetic. Backlog.
- **Server-pushed notifications via Realtime broadcast** — e.g., "Kiwi created 3 tasks." Could fold into Phase 5 (Kiwi) — not Phase 3.
- **Service-worker background sync / offline mutations queue** — Out of scope for v2 MVP per PROJECT.md (online-only assumption).
- **`@supabase-cache-helpers/postgrest-react-query` auto-wiring** — Researcher to evaluate; deferred to research output.

</deferred>

---

*Phase: 03-realtime-layer*
*Context gathered: 2026-05-11*
