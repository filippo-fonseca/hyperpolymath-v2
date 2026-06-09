# Deferred items — Phase 999.12

Out-of-scope discoveries logged during execution. Not blocking Phase 999.12.

## Pre-existing TypeScript errors in apps/web (unrelated to Plan 999.12-01)

Discovered while running `pnpm tsc --noEmit` for Task 3 verification.
**All 9 errors live in files this plan did not modify and existed before this plan ran.**

### Files with errors

1. `apps/web/components/training/CreateRecurringDialog.tsx` (untracked, Phase 15 leftover)
   - `error TS2305: Module '"@/app/actions/training"' has no exported member 'createSeries'.`
   - Root cause: `createSeries` server action referenced by uncommitted UI was never landed alongside migration 0024.

2. `apps/web/components/training/TrainingMonthView.tsx` (untracked, Phase 15 leftover)
   - 2× `error TS2339: Property 'icon' does not exist on type ... training_activity_types`
   - Root cause: migration 0025 added `icon text` to `training_activity_types`, but the matching Drizzle schema field was never added to `trainingActivityTypes` in `apps/web/lib/db/schema.ts`.

3. `apps/web/tests/api-jarvis-tts.test.ts`
   - 6× `error TS2345: Argument of type 'Request' is not assignable to parameter of type 'NextRequest'.`
   - Root cause: test constructs plain `new Request(...)` and passes it to a route handler typed against `NextRequest`. Pre-existing across Phase 7/8 voice telemetry work.

### Recommendation

These belong to the Phase 15 follow-up (or a dedicated quick plan) — they're not in this phase's plan scope. Leaving the typecheck baseline as-is preserves the signal: the next time someone runs typecheck, they'll see the same 9 errors and know they're pre-existing, not regressions from Phase 999.12.

When fixing, the Phase 15 leftovers will need:
- Either land the missing `createSeries` action + `icon` schema field, or revert the uncommitted UI files.
- The `NextRequest` test errors can be fixed by switching the constructor to `new NextRequest(...)` (cheap one-liner per call site).
