# Global Search

One search engine, two surfaces. Type a few characters and find any task, capture, page, project, area, or habit instantly, with the matched text highlighted in place. Search is purely client-side: it adds no new API endpoint and never round-trips for a query.

This document covers how the feature is wired, the data flow, and the contract each piece holds so future changes stay safe.

## The two surfaces

1. **The Search page** (`/search`, the "Search" tab in the sidebar). A focused, full-page experience: a sticky search bar, filter pills with live counts, grouped results, and keyboard navigation.
2. **The `⌘K` dropdown.** The existing JARVIS composer dialog (`⌘K` from any app route except `/today`) now shows a live, non-blocking search dropdown as you type. It is purely additive: picking a result navigates; ignoring it and sending to JARVIS works exactly as it did before (`⌘⏎`).

Both surfaces consume the same index and the same matcher. There is exactly one source of truth for "what matches."

## Architecture at a glance

```
Server (per request)                 Client (per keystroke)
────────────────────                 ──────────────────────
getSearchSnapshot(userId)            SearchProvider
  reuses the same per-domain           buildSearchIndex(snapshot)  ← once per snapshot
  queries the feature pages use        useSearch()
        │                                │  150ms debounce
        ▼                                ▼
  SearchSnapshot  ──(initialData)──►  search(index, term)  ← per query, synchronous
                                         │
                                         ▼
                                   SearchResults (grouped, ranked)
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                              ▼
                   SearchPageClient              SearchDropdown (⌘K)
```

## The engine (`apps/web/lib/search.ts`)

Pure and synchronous, with zero React or UI dependencies, so it is trivially testable. It exposes:

- **`buildSearchIndex(snapshot): SearchEntry[]`.** Flattens the snapshot into a single array of entries. Breadcrumbs (area / project hierarchy), previews, and inline meta are resolved here **once**, not per query. O(n) over all nodes.
- **`search(index, query): SearchResults`.** A single linear scan plus a per-group sort. Returns results grouped by type (`tasks`, `captures`, `pages`, `projects`, `areas`, `habits`) with a `total`.
- **`highlightSegments(text, query): HighlightSegment[]`.** Splits a string into matched / unmatched runs for `<mark>` rendering. Case-insensitive, highlights every non-overlapping occurrence.
- Helpers: `SEARCH_TYPE_ORDER`, `SEARCH_TYPE_LABEL`, `resultsForType()`.

### What gets indexed

Six node types: areas, projects, tasks, captures, pages, habits. Each becomes a `SearchEntry` with a lowercased `searchText` blob used for matching.

| Type | Title | Also matches on | Href |
|---|---|---|---|
| Task | task title | (title only) | `/tasks?task={id}` (opens the detail panel) |
| Capture | full body | hashtags / tags | `/captures` |
| Page | page title + emoji | page body text | `/pages/{id}` |
| Project | project name | (name only) | `/projects/{id}` |
| Area | name + emoji | (name only) | `/areas/{id}` |
| Habit | habit name | (name only) | `/habits` |

Captures lead with a preview (first ~80 chars of the body) rather than a long title, and they match on their tags too: searching a hashtag surfaces a capture even when the word is absent from its body. Pages match on both their title and their plaintext body, and carry a `MMM d` updated-date as inline meta.

### Matching rules

- **Case-insensitive substring.** No fuzzy matching, no stemming, no ranking by edit distance. Predictable and fast.
- A capture matches if the query is a substring of its body **or** of any of its tags.

### Ranking (within each group)

`compareWithinGroup` applies, in order:

1. **Title matches outrank body/tag-only matches.** A task whose title contains the query sorts above a capture matched only on a tag.
2. **Tasks with a due date sort soonest-first.** Tasks with no due date sink below dated ones.
3. **Otherwise most-recent first**, by `updatedAt` (falling back to `createdAt`).

Groups are always rendered in `SEARCH_TYPE_ORDER`: Tasks, Captures, Pages, Projects, Areas, Habits.

## The data snapshot (server side)

The engine needs a lean, denormalized `SearchSnapshot`. Building it is the only part that touches the database, and it happens server-side.

- **`apps/web/lib/search/snapshot.ts`** (`"server-only"`). `getSearchSnapshot(userId)` reuses the exact same per-domain queries the feature pages use (`getSidebarTree`, `getAllTasksForUser`, `getCapturesForUser`, `getPagesForUser`, `loadHabits`), so search never drifts from what the rest of the app shows. It includes archived areas/projects so they remain findable. Captures are indexed up to a generous limit (currently 1000 nodes).
- **`apps/web/lib/search/actions.ts`** (`"use server"`). `fetchSearchSnapshot()` resolves the current user and calls `getSearchSnapshot`. This is the refetch path used by the client.

The snapshot is intentionally decoupled from Drizzle row shapes. The engine only ever sees plain, serializable objects.

## The client provider (`apps/web/components/search/SearchProvider.tsx`)

Mounted once in the app layout (`apps/web/app/(app)/layout.tsx`), wrapping the whole authenticated subtree so both surfaces can reach it.

- The layout builds the snapshot server-side and passes it as `initialData`, so the first query works with **zero** client fetches.
- `useQuery({ queryKey: ["search-snapshot", userId], queryFn: fetchSearchSnapshot, staleTime: 30s, refetchOnWindowFocus: true })` keeps the index reasonably fresh without polling. Returning to the tab refetches.
- `buildSearchIndex(data)` is memoized, so the index rebuilds only when the snapshot actually changes.

### `useSearch()`

The hook every UI piece consumes. It returns:

- `query` / `setQuery` / `clear`: the raw, controlled input value.
- `term`: the **debounced** (150ms), trimmed query. This is what feeds `search()` and `<mark>` highlighting.
- `results`: the grouped `SearchResults` for the current `term`.
- `active`: whether there is a live query.

Debouncing lives here, in the UI layer, never in the engine.

## UI components (`apps/web/components/search/`)

| File | Role |
|---|---|
| `SearchInput.tsx` | Full-width field, leading search icon, trailing clear button. |
| `HighlightedText.tsx` | Renders `highlightSegments` output, wrapping matches in `<mark className="search-mark">`. |
| `TypeBadge.tsx` | Per-type colored badge. Compact 10px variant for the dropdown. |
| `SearchResultItem.tsx` | One result row. Full and compact variants for all five types; breadcrumb, meta, `role="option"`. |
| `SearchResults.tsx` | Grouped renderer with section headers. Also exports `flattenResults(results, filter)`, the flat ordered list the keyboard navigation indexes into. |
| `SearchDropdown.tsx` | The `⌘K` dropdown. Exports `capResults` (max 3 per type, max 4 types). |
| `SearchPageClient.tsx` | The `/search` page: sticky bar, filter pills with counts, empty / no-results states, keyboard handling. |

### Type colors

Each type maps to an existing design token, used for its badge and accents:

| Type | Token |
|---|---|
| Task | `--hud-cyan` |
| Capture | `--ink-sage` |
| Project | `--ink-amber` |
| Area | `--ink-coral` |
| Habit | `--ink-muted` |

### Highlighting

Matched substrings are wrapped in `<mark className="search-mark">`. The `.search-mark` rule lives in `app/globals.css` and tints the background with `--ink-amber` via `color-mix`, leaving the ink color intact for contrast.

## Keyboard model

**On the Search page:**

- `↓` / `↑` move focus through the flat result list (across groups).
- `Enter` opens the focused result.
- `Escape` clears the query.

**In the `⌘K` dropdown** (`GlobalJarvisDialog` + `LiteJarvisComposer`):

- `↓` / `↑` move focus through the capped result list.
- `Enter` with a focused result navigates to it. With **no** result focused, it falls through to the composer (newline / no-op). JARVIS send stays on `⌘⏎`.
- `Escape` closes the dropdown first; a second `Escape` closes the overlay.

The composer integration is deliberately additive. `LiteJarvisComposer` takes two optional props, `onValueChange` and `keyboardInterceptor`. The dialog passes an interceptor that claims arrow / enter / escape only when the dropdown is relevant, and otherwise hands the event back. The JARVIS send path is untouched, so the other composer caller is unaffected.

The dropdown is absolutely positioned and fades in opacity-only, so opening it causes **no layout shift** in the dialog.

## Constraints (by design)

- No fuzzy matching.
- No saved searches or search history.
- No new search API endpoint. Matching is client-side over an index hydrated from one server snapshot.
- Matches the existing design system (tokens, fonts, motion), adds no new primitives.

## Extending it

To index another node type (pages were the sixth — follow the same path):

1. Add the type to `SearchType` and the `SearchResults` shape in `lib/search.ts`.
2. Add its rows to `SearchSnapshot` and populate them in `snapshot.ts` (reuse the existing feature query).
3. Emit entries for it in `buildSearchIndex` (title, `searchText`, breadcrumb, href, meta).
4. Add it to `SEARCH_TYPE_ORDER`, `SEARCH_TYPE_LABEL`, `resultsForType`, the `TypeBadge` color map, the dropdown cap in `SearchDropdown.tsx`, the `EMPTY_RESULTS` literal + a Realtime subscription in `SearchProvider.tsx`, and `SearchResultItem`'s renderer if it needs bespoke layout.

The engine matcher, provider hook, and keyboard model need no changes.
