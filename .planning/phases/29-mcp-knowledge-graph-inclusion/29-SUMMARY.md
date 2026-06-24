# Phase 29 — MCP + Knowledge-Graph Inclusion — SUMMARY

Status: SHIPPED on `fix/pages-create-ux`. `pnpm --filter web typecheck` clean
(except the 6 known `tests/api-jarvis-tts.test.ts` errors); `pnpm --filter web
build` green; `lib/context` suite 15/15 and `personal-context-mcp` suite 40/40
pass. No Drizzle/DB schema or migration changes (the snapshot SCHEMA version bump
is a context-graph contract version, not a DB migration). Not pushed.

## What shipped
Wiki pages now flow into the personal-context snapshot, the tree-based knowledge
graph, and the MCP export by default, under the Phase 21 folder model, with a
per-page `noExport` gate to exclude.

1. Page graph node enrichment (`apps/web/lib/context/nodes/pages.ts` `loadPages`):
   - `projectIds` is now the EFFECTIVE set: own direct `pages_projects` links
     UNION the inherited set from ancestor folders, computed by loading
     `getFoldersWithProjects(userId)` into a folderMap and calling
     `getEffectiveProjectIds(page.folderId, folderMap)` (reuses the client-safe
     `lib/pages/folder-projects.ts` helpers server-side).
   - New node fields `folderId` (nullable) and `folderPath` (root-first folder
     names, cycle-guarded walk up parentId; empty when unfiled).
   - Existing `noExport` exclusion is unchanged (excluded pages stay out, counted
     in `meta.excludedNoExportCount`).

2. Graph edges (`apps/web/lib/context/edges.ts`): new `page_in_folder` edge
   (page -> folderId) for filed pages. The pre-existing `page_in_project` edges
   auto-derive from `projectIds`, so they now reflect inherited membership for
   free.

3. Snapshot schema versioning (`apps/web/lib/context/types.ts` and the mirrored
   deployable `packages/personal-context-mcp/src/types.ts`): page node shape +
   `page_in_folder` edge added; `CURRENT_SCHEMA_VERSION` 2 -> 3. A v2 -> v3
   migrator (`apps/web/lib/context/migrate.ts`) backfills `folderId: null` +
   `folderPath: []` on historical page nodes (never fabricating folder data;
   direct-only `projectIds` on old rows is preserved). v1 chains through v2.

4. Per-page `noExport` nav-bar gate:
   - `setPageNoExport({ pageId, noExport })` server action in
     `apps/web/app/actions/pages.ts` (owner-scoped, mirrors the existing page
     actions and the settings-context noExport flips).
   - A Globe / GlobeLock toggle in `PageDetailClient.tsx` nav bar (distinct from
     the receipts Eye toggle), optimistic local state that re-syncs from the
     realtime-backed server page. `noExport` is threaded through
     `getPagesForUser` / `PageWithProjects`.

## MCP flow
Adding fields to the page node flows to MCP with no route/transport changes:
the cron persists the snapshot, `lib/mcp/load-snapshot-db.ts` reads it through
`migrate()`, and the MCP server exposes it. The schema-version bump + migrator is
what keeps historical snapshot rows readable.

## Caveats
- Browser verification of the Globe/GlobeLock noExport toggle is DEFERRED to the
  human; it typechecks + builds and the optimistic-state wiring mirrors existing
  toggles, but no interactive browser test was run in the autonomous flow.
- Process lesson (logged in STATE.md): phase subagents run typecheck + build but
  not vitest, so test fixtures rotted silently (invalid placeholder UUIDs under
  Zod 4; an un-stubbed folder query in the build-snapshot mock). A follow-up
  test-only fix pass made both suites green. The orchestrator now runs the vitest
  suites after each phase, not just typecheck/build.

## Commits (this phase)
- `2b8fdc6` feat(wiki): page graph node carries folderId, folderPath, effective projects
- `9e9b0f8` feat(wiki): loadPages emits effective project set + folder path
- `6b48609` feat(wiki): page_in_folder knowledge-graph edges
- `daad6ac` feat(wiki): setPageNoExport server action
- `6674a33` feat(wiki): mirror page graph schema v3 into MCP package
- `90033d5` feat(wiki): noExport knowledge-graph gate toggle in page nav bar
- `afba46e` test(wiki): update context-snapshot fixtures for schema v3
- `aa9de34` test(wiki): valid UUIDs in context migrate v2->v3 fixtures
- `82f3b70` test(wiki): stub folder query in build-snapshot mock for Phase 29 loadPages
