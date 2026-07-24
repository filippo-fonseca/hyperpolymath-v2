# PLAN — unit-wiki-browse (issue #330)

Mobile Wiki browse/read surface on the sd register, wired against the sealed
API-CONTRACT device wiki routes. Client points at settings serverUrl with
`authHeaders()` (Supabase JWT or `hpd_` device token). Server routes will not
exist in this worktree — handle errors gracefully (null → empty/error state),
mock nothing.

## Deliverables (fenced files only)
1. `apps/mobile/src/lib/wiki-api.ts` — typed client for the 5 contract routes
   (`getWikiTree`, `getWikiPage`, `createWikiPage`, `updateWikiPage`,
   `getDailyPage`) + types (`WikiFolder`, `WikiPageMeta`, `WikiPage`,
   `WikiTree`). Mirrors the `data.ts` `call<T>()` idiom exactly.
2. `apps/mobile/src/screens/Wiki/index.tsx` — `WikiScreen` container. Owns
   internal navigation (browse ↔ reader) since the app has no nav library and
   keeps all screens mounted. `active` prop drives `useCollection` refetch.
3. `apps/mobile/src/screens/Wiki/WikiBrowse.tsx` — Files.app-style drill-in:
   current folder shows its subfolders then its pages; breadcrumb + back to go
   up; root shows pinned pages first. Client-side search filters the whole tree
   (flat page + folder results) when the query is non-empty. Pull-to-refresh.
   Emoji + title + relative updatedAt on each page row. Empty/loading/error.
4. `apps/mobile/src/screens/Wiki/WikiReader.tsx` — fetches the page by id,
   renders the markdown mirror `content` (falls back to a plain-text extract of
   `contentJson` when `content` is empty). Header with emoji + title, back, and
   an Edit button that is disabled with a subtle "editor coming in this session"
   hint while `onEdit` is undefined (unit-wiki-editor wires it live later).
5. `apps/mobile/src/screens/Wiki/Markdown.tsx` — dependency-free lightweight
   markdown renderer: headings, bold/italic, inline code, fenced code blocks,
   bullet/numbered lists, blockquotes, links (open via expo-web-browser), hr.
   No webview.

## Tab wiring
- The tab bar already carries 4 text tabs + the center JARVIS orb (5 visual
  slots at fontSize 8). A 6th text tab is cramped at sd density on iPhone.
  Decision: **prominent Wiki entry at the TOP of More** as a new dedicated
  section above "SECONDARY SURFACES", matching the existing MoreDestination
  pattern. Reason + screenshot stated in the report.
- `More.tsx`: add `"wiki"` to `MoreDestination`, render a top Wiki section.
- `Root.tsx`: add `screen("wiki", <WikiScreen active={tab === "wiki"} />)`
  (tab wiring only). `MoreDestination` flows through `Tab` automatically.

## Navigation model
- `WikiScreen` state: `{ view: "browse" } | { view: "reader"; pageId }`.
- `WikiBrowse` owns `folderStack: (WikiFolder | null)[]` (null = root).
- Selecting a page → container switches to reader with that id; reader back →
  browse (folder stack preserved because WikiBrowse stays mounted).

## Verification
- `pnpm install` (worktree has no node_modules) then
  `pnpm --filter mobile typecheck`.
- Simulator boot to the Wiki surface; screenshots of home, a folder, reader,
  search, and the More entry under `.planning/evidence/`.
- No apps/web touched → no web gates.

## Commits (atomic, explicit pathspecs)
1. wiki-api client
2. Markdown renderer
3. WikiReader
4. WikiBrowse
5. WikiScreen container
6. More + Root wiring
7. evidence screenshots + report
