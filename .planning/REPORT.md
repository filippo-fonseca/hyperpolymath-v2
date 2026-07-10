# Ordering Backend Completion Report

## Built

- Added pure fractional position-key support in `apps/web/lib/pages/position.ts`:
  `keyBetween`, `initialKeysFor`, `compareExplorerItems`, and `withPinnedFirst`.
- Added Vitest coverage in `apps/web/tests/position-keys.test.ts` for ordering
  invariants, prepend/append, midpoint churn, randomized fuzz insertion, NULLS
  LAST sort behavior, and pinned-first composition.
- Added `apps/web/app/actions/ordering.ts` with `reorderItem` and
  `movePagesBulk`, using authenticated server actions, ownership checks,
  transaction-scoped updates, lazy legacy key seeding, and `updatedAt` writes.
- Surfaced `positionKey` through wiki page/folder queries and folder row types:
  `apps/web/lib/db/queries/pages.ts`,
  `apps/web/lib/db/queries/folders.ts`, and
  `apps/web/lib/pages/folder-projects.ts`.
- Kept the committed migration idempotent and did not modify
  `apps/web/drizzle/meta/_journal.json` or apply migrations to any database.

## Commits

- `fe17e43d` `feat(wiki): add position_key migration for pages + page_folders`
- `14d5ed48` `feat(wiki): add positionKey columns + partial indexes to schema`
- `5fcf42db` `feat(wiki): add fractional position key helper`
- `7d9eb91c` `feat(wiki): add ordering server actions`

## Verification

- `pnpm --filter web test -- tests/position-keys.test.ts` passed:
  1 file, 16 tests.
- `pnpm --filter web typecheck` passed.
- `pnpm --filter web build` passed. The build emitted existing Turbopack
  warnings for `::highlight(...)` CSS parsing and the landing build-log trace,
  but exited successfully.
