# Phase 20: Journaling — daily entries with a storyworthy prompt + notes, surfaced in graph & MCP export - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Source:** Conversation discussion (feature briefing + this-session codebase exploration; canonical refs verified against working tree)

<domain>
## Phase Boundary

This phase adds a **Journaling** tab: one journal entry per calendar day, structured around a single fixed prompt plus a free-form notes section, with a scrollable history of past days. Journal entries become a **first-class entity** alongside captures/tasks/etc. — owner-only RLS, Supabase Realtime, and representation in the personal-context graph + daily MCP export (with a per-entry `no_export` privacy gate).

It is intentionally **simple and low-friction**: open the tab → land on today → write → autosave. The prompt is the same every day: *"What was the most storyworthy moment from today?"* There is a separate **Notes / Misc** section for any extra tidbits the user wants to capture for that day.

**Bundled minor task (same phase, independent work):** add a copy-to-clipboard button to each Quick Capture card, easy to tap/click while scrolling, working on both mobile and web.

**In scope:** `journal_entries` table + migration + RLS + Realtime; upsert-per-day server actions; `/journaling` route + client (day view, history feed, autosave, glass styling) + nav registration; `journal_entry` graph node type (dual schema-version bump) + MCP snapshot loader honoring `no_export`; per-entry no-export toggle; the captures copy button.

**Out of scope:** JARVIS tools for journaling (no `create_journal_entry` tool this phase — architecture should make it trivial later, but it is not built now); rich-text/markdown editor (plain multiline text is fine for MVP — match how captures store/render text); multiple entries per day; reminders/streaks/analytics on journaling; calendar integration.
</domain>

<decisions>
## Implementation Decisions

### 1. Data model — one row per (user, day), upsert semantics
- New table `journal_entries`: `id` (uuid pk), `user_id` (uuid, FK → users, on delete cascade), `date` (DATE), `main_response` (text, nullable), `notes_section` (text, nullable), `no_export` (boolean, not null, default false), `created_at` / `updated_at` (timestamptz, default now()).
- **`UNIQUE(user_id, date)`** — exactly one entry per calendar day. Index `(user_id, date DESC)` for the history feed.
- The prompt text itself ("What was the most storyworthy moment from today?") is a **UI constant, not a column** — it is fixed and identical every day. Do not store it per-row. (If a future phase wants rotating/configurable prompts, that's a separate schema change.)
- Mirror the `captures` table's `no_export` privacy column exactly (schema.ts ~line 171 / migration `0027_no_export_columns.sql`).
- Migration file: `apps/web/supabase/migrations/0030_journal_entries.sql` (next number after `0029_nutrition.sql`). Hand-written SQL (this repo writes raw SQL migrations; Drizzle schema is the type source of truth, not migration-generated).

### 2. Server actions — upsert keyed on (userId, date)
- `app/actions/journal.ts`, mirroring `app/actions/captures.ts` conventions: `supabase.auth.getClaims()` for auth (never `getSession()`), Zod input schemas, `ActionResult<T>` return shape, Drizzle for queries.
- `upsertJournalEntry({ date, mainResponse?, notesSection? })` — INSERT … ON CONFLICT (user_id, date) DO UPDATE (or Drizzle `.onConflictDoUpdate`). Never creates a second row for an existing day. Double-WHERE ownership on the update path.
- `getJournalEntry(date)` — fetch a single day.
- `getJournalEntries({ startDate?, endDate?, limit? })` — range/feed fetch, most-recent-first.
- No hard delete needed for MVP (an emptied entry can simply persist with null fields, or planner may add a delete for fully-empty days — planner's discretion). Do NOT add a JARVIS executor path this phase.

### 3. Realtime + state
- Add `journal_entries` to the Realtime publication, extend the `RealtimeTable` union, and ensure the `bump_user_state_version` trigger fires on `journal_entries` writes (parity with other primary tables — keeps JARVIS state cache fresh).
- Client uses TanStack Query with SSR-hydrated initial data; `useTableSubscription("journal_entries", userId)` invalidates the query key on Realtime echo. **Always invalidate, never merge payloads** (Critical Pattern 3). Query keys: `["journaling", userId]` (feed) and `["journaling", userId, date]` (single day) — hierarchical so one invalidation refreshes the feed.

### 4. Routing + UI surface
- `/journaling` route: `app/(app)/journaling/page.tsx` server shell (calls `requireOnboarded()`, fetches recent entries) → `JournalingClient` island (Realtime + TanStack Query + autosave).
- Register in `TopTabBar.tsx` ROUTE_META and `PersistentNav.tsx` (lucide `BookOpen` or `NotebookPen`, label "Journaling"). The TopTabBar `metaForPath()` already resolves nested routes to the parent tab, so `/journaling/<date>` (if used) auto-highlights.
- **Day view:** lands on today; the fixed prompt rendered in EB Garamond serif above the response field; a separate "Notes / Misc" field below; a day navigator (← {date} →, with Today/Yesterday/EEE, MMM d formatting like the nutrition DayNavigator). Edits **autosave debounced** with a visible saved/saving indicator (no explicit Save button required, but the affordance should feel safe — clearly show "Saved").
- **History feed:** a scrollable list of past entries (most recent first), each revisitable/editable. Empty days show an inviting empty state, not a blank row.
- **Mobile + web:** the writing surface must be comfortable at mobile widths too (the project is otherwise web-first, but the user explicitly wants journaling usable on mobile).

### 5. Styling — established glass register, NOT bespoke
- Use `glass-tile` / `glass-button` and the `--glass-*` tokens defined in `apps/web/app/globals.css` (the "glassy pill recipe" rolled across every tab). Per-callsite accents via `--glass-border` / `--glass-glow-color` arbitrary properties.
- EB Garamond serif for the prompt + entry body (this is a writing surface — lean into the journal/paper feel); mono for timestamps/metadata; warm-parchment tokens.
- **Confirmed this session:** neumorphic/glassy IS the app's current canonical style (via `feat/neumorphic-polish-v2` #14 + the centralized glass system). Build within that system; do not invent new shadows or one-off neumorphism.

### 6. Graph + MCP export (the integration that makes this "first-class")
- Add a `journal_entry` node type to the `Node` union in **BOTH** `packages/personal-context-mcp/src/types.ts` AND `apps/web/lib/context/types.ts`. Suggested shape: `{ type: "journal_entry", id, date, mainResponse, notesSection?, createdAt }` (omit/trim notes if empty).
- **Bump `CURRENT_SCHEMA_VERSION` from `1` → `2` in BOTH files** (they currently both declare `1` and carry an in-file note that they must stay in sync). Register a pure migrator if the migrate module requires it (see the in-file comment at types.ts ~line 10/14). Divergence between the two files breaks the MCP server — this is the #1 risk.
- Create `apps/web/lib/context/nodes/journal.ts` mirroring `nodes/captures.ts` (returns `{ nodes, excluded }`, filters `no_export = true` out, counts them as `excluded`). Wire it into the parallel loader array in `buildSnapshot()` (`apps/web/lib/context/build-snapshot.ts`).
- Render the new node type in the graph explorer (`app/(app)/graph/`). No new edges required initially (journal entries are standalone nodes); planner may defer edge derivation.

### 7. Captures copy button (bundled)
- Add a copy-to-clipboard control to each capture card (`apps/web/components/captures/CaptureCard.tsx`) that copies the capture's `content`.
- **Mobile:** always-visible or an obvious tap target (do not hide behind hover, which doesn't exist on touch). **Web:** may hover-reveal to keep the card clean, but must remain reachable. Show brief "copied" feedback.
- Reuse any existing clipboard/copy utility in the repo if one exists; otherwise `navigator.clipboard.writeText` with a graceful fallback. This is independent of the journaling work and can land in any wave.

### Claude's Discretion
- Whether the history feed and the day editor are one combined scroll (today pinned at top, past days below) or a day-navigator editor + a separate "past entries" list — pick whichever reads cleanest in the glass/Notion discipline and is least clunky on mobile.
- Whether `/journaling/<date>` deep links are worth adding now or deferred (nice-to-have; not required).
- Exact autosave debounce timing and the saved-indicator treatment.
- Whether fully-empty days get a delete path or just persist as null-field rows.
- The exact journal node payload fields surfaced to the graph/MCP (keep it lean; honor `no_export`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing. All paths verified to exist in the working tree on 2026-06-19.**

### Reference entity to mirror end-to-end (captures)
- `apps/web/lib/db/schema.ts` (`captures` table ~lines 181-224; `no_export` pattern ~line 171) — table shape, userId scoping, indexes, tsvector
- `apps/web/supabase/migrations/0027_no_export_columns.sql` — the `no_export` column migration pattern
- `apps/web/supabase/migrations/0029_nutrition.sql` — most recent migration (next number is **0030**); shows table+RLS+Realtime+trigger SQL conventions in one file
- `apps/web/app/actions/captures.ts` — server-action conventions (getClaims auth, Zod, ActionResult, Drizzle)
- `apps/web/lib/realtime/useTableSubscription.ts` — Realtime subscription + invalidation (RT-AUTH `setAuth`/INITIAL_SESSION handling)
- `apps/web/lib/realtime/query-keys.ts` — `tableKey(table, userId)` query-key convention + RealtimeTable union
- `apps/web/app/(app)/captures/page.tsx` — server shell → client island pattern; `requireOnboarded()`
- `apps/web/components/captures/CaptureCard.tsx` — card component to add the copy button to

### Graph + MCP export pipeline
- `apps/web/lib/context/build-snapshot.ts` — `buildSnapshot()`; parallel node-loader array to extend
- `apps/web/lib/context/nodes/captures.ts` — node-loader template (returns `{ nodes, excluded }`, honors `no_export`)
- `apps/web/lib/context/nodes/` — existing loaders: areas, projects, tasks, captures, training, habits, jarvis-facts
- `apps/web/lib/context/types.ts` (`CURRENT_SCHEMA_VERSION = 1` at ~line 21; sync note ~line 10) — web-side Node union + version
- `packages/personal-context-mcp/src/types.ts` (`CURRENT_SCHEMA_VERSION = 1` at ~line 22; sync note ~line 10) — MCP-side Node union + version (**must match web side**)
- `apps/web/app/(app)/graph/` — graph explorer (render the new node type)

### Styling (glass language)
- `apps/web/app/globals.css` (~lines 520-556) — `.glass-tile` / `.glass-button` + `--glass-*` tokens (`--glass-raise`, `--glass-drop`, `--glass-hi`, `--glass-lo`, `--glass-glow-color`, `--glass-border`, `--glass-bg`); per-callsite accent override pattern
- `apps/web/app/(app)/settings/page.tsx` + `apps/web/components/.../SettingsSectionNav.tsx` and the Phase 17 nutrition pill bar — reference glass-tile + pill usage
- `apps/web/components/shell/TopTabBar.tsx` (ROUTE_META) + `PersistentNav.tsx` — nav registration

### Auth
- `requireOnboarded()` / `getClaims()` helpers (used by every `(app)` server page) — server pages never use `getSession()`
</canonical_refs>

<specifics>
## Specific Ideas

- Prompt is a hardcoded UI string, identical every day: "What was the most storyworthy moment from today?" — not a DB column.
- `date` is a DATE (no time component); compute "today" in the user's local timezone consistently (reuse the app's existing local-day helper rather than raw UTC `Date`, to avoid the day-boundary drift the tasks phase warned about).
- Upsert, not insert: re-opening today must edit the existing row, never create a duplicate. Enforce at both the DB (`UNIQUE(user_id, date)`) and the action (`onConflictDoUpdate`).
- Autosave should feel safe: debounce keystrokes, show "Saving…/Saved", and flush on blur/route-change so nothing is lost.
- Schema-version bump is dual-file and load-bearing: `1 → 2` in `apps/web/lib/context/types.ts` AND `packages/personal-context-mcp/src/types.ts`, plus any migrator registration the migrate module expects. Verify the MCP build/typecheck after.
- Copy button must work on touch (no hover-only affordance on mobile).
</specifics>

<deferred>
## Deferred Ideas

- JARVIS journaling tools (`create_journal_entry` / "Jarvis, journal that …") — architecture should make it trivial later (thin action layer like nutrition's D-14), but NOT built this phase; requires explicit user go-ahead.
- Rich text / markdown editor, attachments, photos — plain multiline text for MVP.
- Rotating/configurable prompts, prompt history, mood tags, streaks/analytics — future.
- Calendar surfacing of journal entries / linking entries to tasks or projects (graph edges) — standalone nodes only for now.
- Journaling in the mobile Expo app — this phase covers the web app's responsive layout, not the native app.
</deferred>

---

*Phase: 20-journaling-daily-entries-prompt-notes-graph-mcp*
*Context gathered: 2026-06-19 via conversation discussion; canonical refs verified against working tree.*
