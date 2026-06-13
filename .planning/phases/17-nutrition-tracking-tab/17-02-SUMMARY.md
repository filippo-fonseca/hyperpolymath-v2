---
phase: 17-nutrition-tracking-tab
plan: "02"
subsystem: nutrition/server
tags: [nutrition, macro-math, off-api, service-layer, server-actions, tdd, d-14]
dependency_graph:
  requires:
    - "17-01 (schema: foods, foodLogs, foodServingOptions, meals, mealItems, nutritionTargets)"
  provides:
    - "computeMacros / resolveBaseAmount / validateMacroConsistency / deriveTargetGrams (pure)"
    - "normalizeOffProduct Zod parser + offSearch + offProduct fetch helpers"
    - "11 nutrition service functions (D-14 JARVIS-ready surface)"
    - "GET /api/nutrition/search proxy to OFF Search-a-licious"
    - "GET /api/nutrition/product/{barcode} proxy to OFF v2 product"
    - "8 Server Actions (thin auth+Zod wrappers around service layer)"
  affects:
    - apps/web/lib/nutrition/macro-math.ts (created)
    - apps/web/lib/nutrition/off-client.ts (created)
    - apps/web/lib/nutrition/nutrition-service.ts (created)
    - apps/web/app/api/nutrition/search/route.ts (created)
    - apps/web/app/api/nutrition/product/[barcode]/route.ts (created)
    - apps/web/app/actions/nutrition.ts (created)
    - apps/web/tests/nutrition/macro-math.test.ts (created)
    - apps/web/tests/nutrition/off-client.test.ts (created)
    - apps/web/tests/nutrition/nutrition-service.test.ts (created)
tech_stack:
  added: []
  patterns:
    - "Snapshotted macros in logFood (RESEARCH Pitfall 1 — immutable to future food edits)"
    - "D-14 service-layer: every function takes userId first; Server Actions are auth+Zod shells"
    - "TDD: RED (tests written first, import fails) → GREEN (implementation written)"
    - "OFF User-Agent required header: hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)"
    - "sum=100 refine at both Server Action layer (defense-in-depth) and service layer (D-09)"
    - "Double-WHERE ownership pattern: all mutations verify userId on the row being mutated"
    - "date-fns subDays for copyYesterdayAction (no server-side TZ math needed)"
key_files:
  created:
    - apps/web/lib/nutrition/macro-math.ts
    - apps/web/lib/nutrition/off-client.ts
    - apps/web/lib/nutrition/nutrition-service.ts
    - apps/web/app/api/nutrition/search/route.ts
    - apps/web/app/api/nutrition/product/[barcode]/route.ts
    - apps/web/app/actions/nutrition.ts
    - apps/web/tests/nutrition/macro-math.test.ts
    - apps/web/tests/nutrition/off-client.test.ts
    - apps/web/tests/nutrition/nutrition-service.test.ts
decisions:
  - "All service functions take userId first (D-14 JARVIS-readiness) — enables JARVIS tools to call service layer without HTTP context"
  - "normalizeOffProduct handles hyphenated OFF field names (energy-kcal_100g) via Zod passthrough schema"
  - "logFood re-snapshots macros at log time (not at query time) — immutable to future OFF data corrections"
  - "upsertFood: product serving isDefault=true when servingQuantity>0; 100g/ml becomes secondary option"
  - "No revalidatePath in Server Actions — Realtime + TanStack Query invalidation is the Phase 17 pattern (D-14)"
  - "rls.test.ts failure in nutrition/ is pre-existing (requires local Supabase Docker) — expected, documented in 17-01-SUMMARY"
metrics:
  duration: "10 minutes"
  completed_date: "2026-06-13"
  tasks: 3
  files: 9
---

# Phase 17 Plan 02: Server-Side Nutrition Feature Summary

**One-liner:** Pure macro math library (4 functions, 13 tests) + Zod-typed OFF client (normalizeOffProduct + fetch helpers, 8 tests) + D-14 service layer (11 functions, 8 tests) + 2 OFF proxy routes + 8 Server Action thin wrappers — full server-side nutrition feature complete; Plans 03+ consume this surface.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Macro math + OFF Zod client (pure, no DB) | 47a5480 | apps/web/lib/nutrition/macro-math.ts, apps/web/lib/nutrition/off-client.ts |
| 2 | Nutrition service layer + OFF route handlers | 9d76526 | apps/web/lib/nutrition/nutrition-service.ts, app/api/nutrition/search/route.ts, app/api/nutrition/product/[barcode]/route.ts |
| 3 | Server Actions — thin wrappers with auth + Zod | d903bfc | apps/web/app/actions/nutrition.ts |

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| macro-math.test.ts | 13 | GREEN |
| off-client.test.ts | 8 | GREEN |
| nutrition-service.test.ts | 8 | GREEN |
| **Total** | **29** | **29/29 GREEN** |

## Artifacts Produced

### `apps/web/lib/nutrition/macro-math.ts` — Pure functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `resolveBaseAmount` | `(quantity, servingGramsOrMl) → number` | quantity × serving |
| `computeMacros` | `(baseAmount, FoodMacroSource) → MacroNumbers` | kcal (int) + macros (1dp) |
| `validateMacroConsistency` | `(MacroNumbers) → boolean` | ±15% 4/4/9 rule check |
| `deriveTargetGrams` | `(NutritionTargetPcts) → {proteinG, carbsG, fatG}` | Daily gram targets |

Key verified behaviors:
- `resolveBaseAmount(2, 50) === 100`
- Banana 100g: `{kcal: 52, proteinG: 1.3, carbsG: 14, fatG: 0.3}`
- 2000 kcal 30/40/30 → `{proteinG: 150, carbsG: 200, fatG: 67}`

### `apps/web/lib/nutrition/off-client.ts` — OFF API client

- `normalizeOffProduct(raw)` — parses `energy-kcal_100g` hyphenated keys; defaults missing fields to 0; detects `ml`/`g` baseUnit
- `offSearch(q, opts)` — GET Search-a-licious; `next: { revalidate: 300 }`
- `offProduct(barcode, opts)` — GET v2 product; `next: { revalidate: 3600 }`
- User-Agent: `hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)`

### `apps/web/lib/nutrition/nutrition-service.ts` — D-14 Service Layer (11 functions)

| Function | Description |
|----------|-------------|
| `logFood(userId, input)` | SELECT food+serving → computeMacros → INSERT food_logs (snapshotted) → bump useCount |
| `deleteLog(userId, logId)` | DELETE WHERE id + user_id (double-WHERE) |
| `updateLog(userId, logId, patch)` | Patch + re-snapshot macros if quantity/serving changes |
| `logMeal(userId, mealId, date, mealSlot)` | Expand meal items → N food_logs rows in transaction |
| `upsertFood(userId, input)` | INSERT foods ON CONFLICT update + seed serving options |
| `createMeal(userId, input)` | INSERT meal + items in transaction with ownership verify |
| `listFoodLogsForDay(userId, date)` | SELECT with LEFT JOINs, ORDER BY mealSlot+createdAt |
| `getFoodHistory(userId, opts)` | Recency+useCount-sorted food list (D-02 history-first) |
| `getNutritionTargets(userId)` | Returns stored or defaults `{2000, 30/40/30}` |
| `upsertNutritionTargets(userId, input)` | INSERT ON CONFLICT with sum=100 Zod refine |
| `copyDayLogs(userId, fromDate, toDate)` | Clone food_logs preserving snapshotted macros |

### OFF Proxy Routes

| Route | Cache | Auth |
|-------|-------|------|
| `GET /api/nutrition/search?q=…` | 5 min | requireOnboarded |
| `GET /api/nutrition/product/{barcode}` | 1 hour | requireOnboarded |

### Server Actions (8)

| Action | Wraps |
|--------|-------|
| `logFoodAction` | `logFood` |
| `deleteLogAction` | `deleteLog` |
| `updateLogAction` | `updateLog` |
| `logMealAction` | `logMeal` |
| `upsertFoodAction` | `upsertFood` |
| `createMealAction` | `createMeal` |
| `upsertNutritionTargetsAction` | `upsertNutritionTargets` (+ sum=100 refine) |
| `copyYesterdayAction` | `copyDayLogs` (fromDate via `subDays`) |

Pattern: `getClaims()` → Zod validate → service call → `ActionResult<T>`. No `revalidatePath`.

## D-14 Architecture Note

All mutations live in `nutrition-service.ts`. Server Actions are the auth boundary. This makes JARVIS tool calls in Phase 5/16 style trivially addable — the JARVIS executor can call `logFood(userId, input)` directly without any HTTP overhead or auth simulation. The service is the JARVIS surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @ts-expect-error directives for Next.js `next: { revalidate }` were unused**
- **Found during:** Task 1 TypeScript check
- **Issue:** TypeScript in this project already types the `next` fetch extension; `@ts-expect-error` became an error (TS2578).
- **Fix:** Removed the two `@ts-expect-error` directives from `off-client.ts`.
- **Files modified:** apps/web/lib/nutrition/off-client.ts
- **Commit:** 47a5480

**2. [Rule 1 - Bug] `vi.mock()` factory in nutrition-service.test.ts referenced module-scope variable**
- **Found during:** Task 2 test execution (RED→GREEN)
- **Issue:** Vitest hoists `vi.mock()` to the top of the file, so the factory cannot reference `mockDb` declared with `const` in module scope — `Cannot access 'mockDb' before initialization`.
- **Fix:** Replaced with `vi.hoisted()` pattern to bridge the hoisting gap. Rewritten test file uses `vi.hoisted()` to create `mockDb`, then `vi.mock('@/lib/db', () => ({ db: mockDb }))`.
- **Files modified:** apps/web/tests/nutrition/nutrition-service.test.ts
- **Commit:** 9d76526

No other deviations — plan executed as written.

## Known Stubs

None. This plan is server-side only (no UI). No rendering stubs possible. All service functions perform real DB operations (mocked in tests). Plans 03–05 wire client islands to these endpoints.

## Self-Check: PASSED

### Files exist
- [x] apps/web/lib/nutrition/macro-math.ts
- [x] apps/web/lib/nutrition/off-client.ts
- [x] apps/web/lib/nutrition/nutrition-service.ts
- [x] apps/web/app/api/nutrition/search/route.ts
- [x] apps/web/app/api/nutrition/product/[barcode]/route.ts
- [x] apps/web/app/actions/nutrition.ts
- [x] apps/web/tests/nutrition/macro-math.test.ts
- [x] apps/web/tests/nutrition/off-client.test.ts
- [x] apps/web/tests/nutrition/nutrition-service.test.ts

### Commits exist
- [x] 47a5480 — feat(17-02): pure macro math + OFF Zod client (Task 1 — 21 tests green)
- [x] 9d76526 — feat(17-02): nutrition service layer + OFF proxy routes (Task 2 — 8 tests green)
- [x] d903bfc — feat(17-02): Server Actions — 8 thin wrappers with auth + Zod (Task 3)

### Acceptance criteria
- [x] `computeMacros`, `validateMacroConsistency`, `deriveTargetGrams` exported from macro-math.ts
- [x] `hyperpolymath-v2/1.0` User-Agent in off-client.ts
- [x] `search.openfoodfacts.org/search` URL in off-client.ts
- [x] `world.openfoodfacts.org/api/v2/product` URL in off-client.ts
- [x] `energy-kcal_100g` field name in off-client.ts (verified hyphenated key)
- [x] 11 service functions exported from nutrition-service.ts (grep count = 11)
- [x] Snapshot pattern: `kcal: macros.kcal`, `proteinG: macros.proteinG` in logFood
- [x] `eq(foodLogs.userId` in nutrition-service.ts (double-WHERE ownership)
- [x] `/api/nutrition/search/route.ts` with `runtime = "nodejs"` + `requireOnboarded`
- [x] `/api/nutrition/product/[barcode]/route.ts` with same auth gate
- [x] `"use server"` directive at top of nutrition.ts
- [x] 8 exported action functions (grep count = 8)
- [x] `Math.abs(t.proteinPct + t.carbsPct + t.fatPct - 100) < 0.5` refine in actions
- [x] `"Percentages must add up to 100. Adjust the values to continue."` copy
- [x] No `revalidatePath` call in nutrition.ts (only in comment)
- [x] TypeScript: no nutrition-related errors
- [x] 29 tests passing (13 macro-math + 8 off-client + 8 nutrition-service)
