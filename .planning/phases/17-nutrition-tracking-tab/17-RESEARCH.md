# Phase 17: Nutrition Tracking Tab — Research

**Researched:** 2026-06-12
**Domain:** Nutrition logging, Open Food Facts API, macro math, GitHub-style heatmap
**Confidence:** HIGH (core schema + patterns verified from live codebase; API verified from live endpoint)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Open Food Facts is THE external source (free, no key, barcode-ready for the mobile follow-up). No USDA FDC.
- **D-02:** Search priority: personal food history first (instant, local), then Open Food Facts results.
- **D-03:** Manual entry fallback when a food isn't found — user types name + macros + serving info; manual foods enter the personal history like any other.
- **D-04:** Canonical base unit is grams for solids, ml for liquids — every log resolves to a base quantity for macro math.
- **D-05:** Product-defined serving sizes are first-class selectable units (MFP-style): user picks a unit ("1 medium pineapple", "1 slice", "100 g", "1 cup") and a quantity multiplier of that unit. Serving definitions come from the OFF product data where available, or from manual entry.
- **D-06:** Schema must store per-food serving options (label + gram/ml equivalent) so any logged entry = food + serving unit + quantity → resolved base amount → macros.
- **D-07:** BOTH entry points: per-meal-slot inline "+ add" (MFP-style) AND a global quick-add composer with meal picker. Same underlying search/quick-select surface.
- **D-08:** Input must be seamless — search-as-you-type, keyboard-first, minimal clicks from intent to logged.
- **D-09:** One global target set, edited in settings: target calories + protein % + carb % + fat % (percentages of calories; show computed gram equivalents). No per-day or per-weekday variants for now.
- **D-10:** Daily view shows live progress against targets as logs accumulate (consumed vs remaining, per macro and calories).
- **D-11:** GitHub-style contribution heat map for the year view.
- **D-12:** Remaining stats design is Claude's discretion — daily macro breakdown, trends, etc. Keep it useful, not dashboard-bloat.
- **D-13:** Glassy/neumorphic like the settings menu pill bar (`SettingsSectionNav.tsx`: rounded-full + backdrop-blur-md + mono uppercase micro-labels) — within the established app look (cyan-canonical accent, EB Garamond, Anthropic-discipline restraint from Phases 6.1/6.2). Glass on interactive surfaces; document discipline elsewhere. NOT a new visual language.
- **D-14:** All mutations go through a server-side service layer (same pattern as Phase 16 ActionExecutor methods) so JARVIS tools (`log_food`, `log_meal`, …) can be added later by wiring tool definitions to existing functions. Do NOT add the tools in this phase.

### Claude's Discretion

- Recents vs frequents ordering in quick-select; copy-yesterday / duplicate-meal shortcuts
- Stats beyond the heat map (D-12)
- Whether to track fiber/sugar/sodium etc. from OFF data (store if cheap; targets are macros-only for now)
- Heat map cell encoding (calories vs adherence) — pick what reads best with one global target set

### Deferred Ideas (OUT OF SCOPE)

- **Mobile barcode scanner** → GitHub issue #24 (Expo camera → OFF barcode lookup → pre-filled log). Depends on this phase's service layer.
- **JARVIS nutrition tools** — design-ready via D-14, but requires explicit user confirmation before building.
- **Per-day / training-vs-rest-day target variants** — "one global one for now" implies this may come later.
</user_constraints>

---

## Summary

Phase 17 adds a MyFitnessPal-style nutrition tab to `apps/web`. The feature family closely mirrors Phase 15 (training): a set of Drizzle schema tables, a server-side service layer (JARVIS-ready per D-14), a Next.js route at `/nutrition`, and a client island driven by TanStack Query + Supabase Realtime.

The principal external dependency is **Open Food Facts (OFF)**. Text search must be proxied through a Next.js route handler so the required User-Agent header is injected server-side and responses can be cached with `next: { revalidate }` semantics. The canonical search endpoint for full-text lookup is `https://search.openfoodfacts.org/search?q=...` (Search-a-licious). Product-by-barcode uses the v2 endpoint `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`. The nutriments object uses hyphenated field names (`energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`) with reliable `_100g` and `_serving` suffixes; `serving_quantity` (numeric grams/ml) and `serving_size` (human-readable string) are present for most packaged foods.

Macro math is straightforward: `(quantity_in_base_unit / 100) × macro_100g`. Calories cross-check via the 4/4/9 rule. The schema must snapshot macros at log time (store computed `kcal`, `protein_g`, `carbs_g`, `fat_g` directly on the `food_logs` row) so history is immutable to OFF data changes.

The GitHub-style heatmap is best built with plain CSS grid + `date-fns 4` (already in the project) rather than adding a new library — the dependency cost of `react-github-calendar` (which is already in `package.json` at v5.0.6) is acceptable as a fallback if custom grid proves fiddly, but it targets GitHub-specific data shapes, not arbitrary calorie data.

**Primary recommendation:** Proxy OFF calls through `/api/nutrition/search` and `/api/nutrition/product/[barcode]` route handlers; snapshot macros on the `food_logs` row; mirror the Phase 15 training three-table pattern + service layer pattern from Phase 16 executor.

---

## Project Constraints (from CLAUDE.md)

- **Framework:** Next.js 16 App Router, TypeScript strict — no exceptions
- **Styling:** Tailwind 4 (CSS-first `@theme`, Oxide engine); shadcn/ui on Radix primitives
- **DB:** Drizzle ORM for typed queries + schema; `supabase-js` for Realtime only
- **Auth:** `supabase.auth.getClaims()` in Server Components/Actions — NEVER `getSession()`
- **State:** TanStack Query 5.x for reads; Supabase Realtime as invalidation signal only (never merge payloads)
- **Validation:** Zod 4 (native `.toJSONSchema()`, no `zod-to-json-schema`)
- **Animations:** `motion/react` (Motion 12, already in project)
- **No new heavy deps without justification** — prefer project's existing `date-fns 4`, `lucide-react`, `recharts` (already installed), `sonner`
- **All rows userId-scoped + RLS from day one**
- **Server Actions pattern:** `"use server"`, Zod input validation, `getClaims()` auth, Drizzle writes
- **Migration files:** Supabase migrations at `apps/web/supabase/migrations/`; latest is `0028`. Next migration will be `0029`.

---

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | `0.36.x` | Schema + typed queries | Established project ORM; training precedent |
| `@supabase/ssr` + `@supabase/supabase-js` | `0.10.x` + `2.x` | Auth cookie + Realtime | Required for the whole app |
| `@tanstack/react-query` | `5.59.x` | Client state, caching, refetch | Established pattern across all tabs |
| `date-fns` | `4` | Date arithmetic, heat map grid generation | Already installed; handles ISO date strings |
| `zod` | `4` | Input validation in Server Actions + service layer | Already installed |
| `recharts` | `3.8.x` | Macro breakdown charts on stats subpage | Already installed; used in `/insights` |
| `lucide-react` | `0.460.x` | Icons (food icon: `UtensilsCrossed` or `Salad`) | Already installed |
| `sonner` | `2.0.7` | Undo toast on log deletion | Already installed; `use-undo-toast.ts` pattern |
| `motion` | `12.38.x` | Subtle animations on add/remove | Already installed |

### New Dependency Assessment

| Candidate | Decision | Reason |
|-----------|----------|--------|
| `react-github-calendar` v5.0.6 | **Already installed** — but NOT recommended for this use. It is GitHub-specific (fetches from GitHub API or accepts hardcoded contribution data). Use plain CSS grid instead. | CSS grid with `date-fns` gives full control over cell encoding (calories vs adherence), color scale, and tooltip, with zero new dependency cost. |
| `react-activity-calendar` | Available on npm at `3.2.0` (underlying renderer used by `react-github-calendar`) | May use as a headless renderer if plain grid proves complex. Accepts `{ date, count, level }[]`. Medium confidence on Tailwind 4 compatibility. |
| Any barcode scanning library | DEFERRED | Out of scope per D-14 and CONTEXT.md deferred section |

**No new runtime dependencies required.** Everything can be built from the existing project stack.

---

## Open Food Facts API

### Endpoints (MEDIUM-HIGH confidence — verified via live API calls)

| Endpoint | URL | Purpose | Notes |
|----------|-----|---------|-------|
| **Text search (recommended)** | `https://search.openfoodfacts.org/search?q={term}&json=1&page_size=20&fields=code,product_name,nutriments,serving_size,serving_quantity` | Full-text product search | Search-a-licious API; response is `{ hits: [...], count, page_size }` |
| **Text search (legacy)** | `https://world.openfoodfacts.org/cgi/search.pl?search_terms={term}&search_simple=1&action=process&json=1&page_size=20&fields=...` | v1 fallback | Rate-limited at 10 req/min/IP; use only if Search-a-licious is down |
| **Product by barcode** | `https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name,nutriments,serving_size,serving_quantity,product_quantity_unit,quantity` | Barcode lookup (mobile follow-up) | Returns `{ product: {...}, status: 1 }` if found; `status: 0` if not |
| **Structured search (v2)** | `https://world.openfoodfacts.org/api/v2/search?fields=...&categories_tags_en=...` | Filter by category/brand/nutrient | NOT full-text; do NOT use for user search |

### Rate Limits (MEDIUM confidence — from official docs)

- **Search queries:** 10 req/min/IP (`/cgi/search.pl` and `/api/v2/search`)
- **Product reads:** 15 req/min/IP
- HTTP 503 on global capacity exceeded
- **Mitigation:** Route all OFF calls through Next.js route handlers with `next: { revalidate: 3600 }` for barcode lookups (products rarely change) and `next: { revalidate: 300 }` for search results. Never call OFF from the browser directly.

### User-Agent (HIGH confidence — required by OFF ToS)

```
User-Agent: hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)
```

The route handler MUST set this header on every OFF request. OFF will block or throttle requests without a proper User-Agent.

### Nutriments Object Shape (HIGH confidence — verified via live API call)

```typescript
// Verified from world.openfoodfacts.org/api/v2/product/0016000275270.json
interface OFFNutriments {
  // Primary macros — always prefer _100g for math (serving may be absent)
  "energy-kcal_100g": number;    // calories per 100g
  "energy-kcal_serving": number; // calories per declared serving
  "proteins_100g": number;       // grams protein per 100g
  "proteins_serving": number;
  "carbohydrates_100g": number;  // grams carbs per 100g
  "carbohydrates_serving": number;
  "fat_100g": number;            // grams fat per 100g
  "fat_serving": number;
  // Secondary — store if present, not in targets
  "fiber_100g"?: number;
  "fiber_serving"?: number;
  "sugars_100g"?: number;
  "sodium_100g"?: number;        // grams sodium per 100g (not mg — scale ×1000 for display)
}

// Serving fields — present on most packaged foods, absent on raw foods
interface OFFProduct {
  product_name: string;
  serving_size: string;          // e.g., "3/4 cup (28 g) (28 g)" — HUMAN READABLE
  serving_quantity: number;      // numeric grams (or ml for liquids) for 1 serving
  product_quantity_unit: string; // "g" or "ml" — use to detect solid vs liquid
  quantity: string;              // e.g., "347 g" or "500 ml" — product package size
  nutriments: OFFNutriments;
}
```

### Solid vs Liquid Detection

Use `product_quantity_unit`: if `"ml"`, canonical base unit is ml (D-04). If `"g"` or absent, default to grams.

### Macro Reliability

- `_100g` fields are reliable when the product has nutrition data (completeness > 0.5)
- `_serving` fields are unreliable on many raw/generic products
- `serving_quantity` is present on most packaged foods with declared serving sizes
- **Always use `_100g` as the ground truth for math**; `serving_quantity` drives the default unit

### Route Handler Pattern

```typescript
// apps/web/app/api/nutrition/search/route.ts
import { NextResponse } from "next/server";
import { requireOnboarded } from "@/lib/auth/get-user";

export async function GET(req: Request) {
  await requireOnboarded(); // auth gate
  const q = new URL(req.url).searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json({ hits: [] });

  const res = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&json=1&page_size=20&fields=code,product_name,nutriments,serving_size,serving_quantity,product_quantity_unit`,
    {
      headers: { "User-Agent": "hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)" },
      next: { revalidate: 300 }, // 5 min cache for search results
    },
  );
  const data = await res.json();
  return NextResponse.json(data);
}
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/web/
├── app/(app)/nutrition/
│   ├── page.tsx                    # Server Component — SSR initial data, mirrors training/page.tsx
│   └── stats/
│       └── page.tsx                # Stats subpage (heatmap + macro trends)
├── app/actions/
│   └── nutrition.ts                # Server Actions ("use server") — CRUD mutations
├── app/api/nutrition/
│   ├── search/route.ts             # Proxy → search.openfoodfacts.org
│   └── product/[barcode]/route.ts  # Proxy → world.openfoodfacts.org/api/v2/product/
├── components/nutrition/
│   ├── NutritionClient.tsx         # Client island (TanStack Query + Realtime)
│   ├── NutritionDayView.tsx        # Meal slots, daily totals, progress bars
│   ├── MealSlot.tsx                # Breakfast/lunch/dinner/snacks section
│   ├── FoodLogRow.tsx              # Individual logged food item
│   ├── FoodSearch.tsx              # Search-as-you-type + quick-select surface
│   ├── FoodSearchResult.tsx        # Search result card (OFF or history)
│   ├── ServingPicker.tsx           # Unit select + quantity input (D-05)
│   ├── ManualEntryForm.tsx         # Manual food entry fallback (D-03)
│   ├── MacroProgressBar.tsx        # Consumed / target progress (D-10)
│   ├── MacroRing.tsx               # Optional: donut chart summary
│   ├── NutritionHeatMap.tsx        # GitHub-style year grid (D-11)
│   └── NutritionStatsClient.tsx    # Stats page client island
└── lib/
    ├── db/
    │   ├── schema.ts               # ADD: foods, food_serving_options, food_logs, meals, meal_items, nutrition_targets
    │   └── queries/
    │       └── nutrition.ts        # Typed Drizzle read queries
    ├── nutrition/
    │   ├── macro-math.ts           # Pure functions: resolveBase(), computeMacros(), formatMacro()
    │   ├── off-client.ts           # Typed OFF fetch helpers (called from route handlers only)
    │   └── nutrition-service.ts    # Service layer (D-14 JARVIS-readiness hook)
    └── realtime/
        └── query-keys.ts           # ADD 5 new RealtimeTable literals
```

### Pattern 1: Service Layer (D-14 JARVIS-Readiness)

All mutations live in `lib/nutrition/nutrition-service.ts` as plain `async` functions that accept `(userId, input)` and return typed results. Server Actions in `app/actions/nutrition.ts` call these functions after auth. JARVIS executor methods will call the same functions directly when tools are wired later.

```typescript
// lib/nutrition/nutrition-service.ts
export async function logFood(
  userId: string,
  input: {
    date: string;           // ISO date "YYYY-MM-DD"
    mealSlot: MealSlot;
    foodId: string;
    servingOptionId: string;
    quantity: number;       // multiplier of serving unit
  }
): Promise<FoodLogRow> { /* Drizzle insert + return */ }

export async function deleteLog(userId: string, logId: string): Promise<void> { /* ... */ }
export async function logMeal(userId: string, mealId: string, date: string, mealSlot: MealSlot): Promise<FoodLogRow[]> { /* ... */ }
```

### Pattern 2: TanStack Query + Realtime (mirrors TrainingClient)

```typescript
// In NutritionClient.tsx
useQuery({
  queryKey: ["food_logs", userId, date],
  queryFn: () => listFoodLogsAction(userId, date),
  initialData: props.initialLogs,
});

// Realtime subscriptions — one per table (food_logs, foods, meals, meal_items)
useTableSubscription("food_logs", userId);
useTableSubscription("foods", userId);
```

### Pattern 3: Server Component Shell (mirrors training/page.tsx)

```typescript
// app/(app)/nutrition/page.tsx
export default async function NutritionPage() {
  const user = await requireOnboarded();
  const today = new Date().toISOString().split("T")[0];
  const [initialLogs, initialFoods, initialTargets] = await Promise.all([
    listFoodLogsForDay(user.id, today),
    getFoodHistory(user.id, { limit: 20 }),
    getNutritionTargets(user.id),
  ]);
  return <NutritionClient userId={user.id} initialLogs={initialLogs} ... />;
}
```

### Pattern 4: Macro Computation (pure functions)

```typescript
// lib/nutrition/macro-math.ts
export function resolveBaseAmount(quantity: number, servingGrams: number): number {
  return quantity * servingGrams; // in grams or ml
}

export function computeMacros(baseAmount: number, food: FoodRow) {
  const factor = baseAmount / 100;
  return {
    kcal: Math.round(food.kcalPer100g * factor),
    proteinG: round1(food.proteinPer100g * factor),
    carbsG: round1(food.carbsPer100g * factor),
    fatG: round1(food.fatPer100g * factor),
    fiberG: food.fiberPer100g != null ? round1(food.fiberPer100g * factor) : null,
  };
}

// Calorie cross-check: protein×4 + carbs×4 + fat×9 ≈ kcal (within 10%)
// Discrepancy is normal for alcohol-containing foods; accept ±15%
export function validateMacroConsistency(macros: ReturnType<typeof computeMacros>): boolean {
  const derived = macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
  return Math.abs(derived - macros.kcal) / Math.max(macros.kcal, 1) < 0.15;
}
```

### Pattern 5: Heat Map with Plain CSS Grid

```typescript
// components/nutrition/NutritionHeatMap.tsx
// 52 weeks × 7 days = 364 cells. date-fns eachDayOfInterval() generates the date list.
// CSS: display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column
// Cell color: interpolate between --surface and --hud-cyan using oklch based on adherence %
// (calories logged / calorie target) clamped to [0, 1], then quantized into 5 levels
```

### Anti-Patterns to Avoid

- **Don't call OFF from the browser.** User-Agent spoofing is not reliable; CORS may fail; rate limit hits the user's IP rather than server IP.
- **Don't store OFF product data without normalizing.** Pull only the needed fields; store as `foods` table rows with our schema — never store raw OFF JSON.
- **Don't recompute macros from `food.macros_per_100g` at query time.** Snapshot them on the `food_logs` row. Historical entries must not change when a food definition is edited.
- **Don't merge Realtime payloads into TanStack Query cache.** Invalidate and refetch (Critical Pattern 3 from CLAUDE.md).
- **Don't use `getSession()` in Server Actions.** Always `getClaims()`.

---

## Schema Design

### Table Family (mirrors training pattern from schema.ts)

```typescript
// Additions to apps/web/lib/db/schema.ts

// ─── NUTRITION ──────────────────────────────────────────────────────────────
// Phase 17 — nutrition tracker. Five tables, all userId-scoped with RLS in
// migration 0029. state_version BEFORE-triggers fire on food_logs + meals so
// JARVIS state-snapshot cache invalidates on nutrition writes (D-14 prep).
//
//   foods                — canonical food registry (OFF-sourced or manual)
//   food_serving_options — per-food selectable serving units (D-05/D-06)
//   food_logs            — per-day per-meal-slot log entries
//   meals                — saved reusable meal groupings
//   meal_items           — foods+servings inside a saved meal

export const foods = pgTable("foods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // OFF barcode — null for manual entries and generic foods
  offBarcode: text("off_barcode"),
  name: text("name").notNull(),
  brand: text("brand"),
  // Per-100g macros — the canonical source of truth (D-04)
  kcalPer100g: numeric("kcal_per_100g", { precision: 8, scale: 2 }).notNull(),
  proteinPer100g: numeric("protein_per_100g", { precision: 8, scale: 2 }).notNull(),
  carbsPer100g: numeric("carbs_per_100g", { precision: 8, scale: 2 }).notNull(),
  fatPer100g: numeric("fat_per_100g", { precision: 8, scale: 2 }).notNull(),
  // Optional secondary macros — store if present in OFF data
  fiberPer100g: numeric("fiber_per_100g", { precision: 8, scale: 2 }),
  sodiumPer100g: numeric("sodium_per_100g", { precision: 8, scale: 2 }), // grams (÷1000 to display mg)
  // Base unit for this food: "g" | "ml"
  baseUnit: text("base_unit").notNull().default("g"),
  // Manual = no OFF barcode; determines whether to offer "find in OFF" shortcut
  isManual: boolean("is_manual").notNull().default(false),
  // Track usage for "personal history" sort ordering (D-02)
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("foods_user_last_used_idx").on(t.userId, sql`last_used_at DESC`),
  uniqueIndex("foods_user_barcode_uniq").on(t.userId, t.offBarcode).where(sql`off_barcode IS NOT NULL`),
]);

export const foodServingOptions = pgTable("food_serving_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized for RLS (pattern from tasksProjects)
  label: text("label").notNull(),     // e.g., "1 cup", "1 slice", "100 g", "1 medium"
  gramsOrMl: numeric("grams_or_ml", { precision: 8, scale: 2 }).notNull(), // base-unit equivalent
  isDefault: boolean("is_default").notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
}, (t) => [
  index("food_serving_options_food_idx").on(t.foodId),
  index("food_serving_options_user_idx").on(t.userId),
]);

export const mealSlotEnum = pgEnum("meal_slot", ["breakfast", "lunch", "dinner", "snacks"]);

export const foodLogs = pgTable("food_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),        // ISO date "YYYY-MM-DD" (client timezone, not server)
  mealSlot: mealSlotEnum("meal_slot").notNull(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "restrict" }),
  servingOptionId: uuid("serving_option_id").references(() => foodServingOptions.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull(), // multiplier of serving unit
  // Snapshotted macros at log time — immutable to future food edits (KEY PATTERN)
  kcal: integer("kcal").notNull(),
  proteinG: numeric("protein_g", { precision: 8, scale: 2 }).notNull(),
  carbsG: numeric("carbs_g", { precision: 8, scale: 2 }).notNull(),
  fatG: numeric("fat_g", { precision: 8, scale: 2 }).notNull(),
  fiberG: numeric("fiber_g", { precision: 8, scale: 2 }),
  // Display: quantity × servingOption.label (reconstructed in UI)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("food_logs_user_date_idx").on(t.userId, t.logDate),
  index("food_logs_user_date_slot_idx").on(t.userId, t.logDate, t.mealSlot),
]);

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("meals_user_last_used_idx").on(t.userId, sql`last_used_at DESC`)]);

export const mealItems = pgTable("meal_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "restrict" }),
  servingOptionId: uuid("serving_option_id").references(() => foodServingOptions.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull(),
  orderIndex: integer("order_index").notNull().default(0),
}, (t) => [
  index("meal_items_meal_idx").on(t.mealId),
  index("meal_items_user_idx").on(t.userId),
]);

// One row per user — upserted on save (ON CONFLICT user_id DO UPDATE)
export const nutritionTargets = pgTable("nutrition_targets", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  targetKcal: integer("target_kcal").notNull().default(2000),
  proteinPct: numeric("protein_pct", { precision: 5, scale: 2 }).notNull().default("30"), // % of calories
  carbsPct: numeric("carbs_pct", { precision: 5, scale: 2 }).notNull().default("40"),
  fatPct: numeric("fat_pct", { precision: 5, scale: 2 }).notNull().default("30"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // CHECK: protein_pct + carbs_pct + fat_pct = 100 — enforced in migration SQL
});
```

### Migration Number

Next migration: **`0029_nutrition.sql`**. Includes: CREATE TABLE for all 5 tables, CREATE TYPE for `meal_slot` enum, RLS policies (owner-only SELECT/INSERT/UPDATE/DELETE on all tables; nutritionTargets uses `user_id = auth.uid()` as PK so SELECT policy is trivial), Realtime publication entries for `food_logs`, `foods`, `meals`, `meal_items` (nutritionTargets does not need Realtime — targets change rarely), and `bump_user_state_version()` BEFORE triggers on `food_logs` (D-14 state-snapshot cache hook).

### RealtimeTable Union Extension

Add to `apps/web/lib/realtime/query-keys.ts`:

```typescript
| "foods"
| "food_serving_options"
| "food_logs"
| "meals"
| "meal_items"
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub-style heat map grid | Custom D3 / SVG calendar | Plain CSS grid + `date-fns 4` `eachDayOfInterval()` | date-fns already in project; no SVG complexity; full Tailwind 4 styling control |
| Macro trend charts | Custom canvas chart | `recharts` (already in project, used in `/insights`) | Already battle-tested in-repo; `BarChart` or `LineChart` for weekly macro view |
| Debounced search input | `setTimeout` + `useRef` juggling | `nuqs` (already in project) for URL state OR standard `useDeferredValue` + 300ms `useEffect` debounce | `useDeferredValue` is React 19 idiomatic; no external dep |
| OFF response normalization | `any` cast + runtime field access | Zod 4 schema for `OFFProduct` and `OFFNutriments` | Catches missing fields at parse time; provides typed result |
| Serving option "100 g" default | Special-case | Every food automatically gets a "100 g" serving option seeded on create | Simplest model; covers manual entry and OFF products without serving data |

---

## Common Pitfalls

### Pitfall 1: Recomputing Macros from Per-100g at Query Time

**What goes wrong:** Food definition edited (user corrects fat from 5g to 8g) → all historical logs silently change their calorie counts.
**Why it happens:** Joining `food_logs` → `foods` for macro math at read time.
**How to avoid:** Snapshot `kcal`, `protein_g`, `carbs_g`, `fat_g` on the `food_logs` row at insert time. Read logs → macros from the log row itself.

### Pitfall 2: Missing nutriments Fields on Raw/Generic Foods

**What goes wrong:** `energy-kcal_100g` is undefined → `NaN` macros logged.
**Why it happens:** OFF has community-sourced data; raw agricultural products often lack per-100g nutrition entries.
**How to avoid:** Zod parse OFF response with `.optional().default(0)` on all nutriment fields. If `energy-kcal_100g` is 0 and protein/carbs/fat are all 0, flag the result as "incomplete data" in the search UI and prompt manual entry.

### Pitfall 3: OFF Rate Limiting Hitting End Users

**What goes wrong:** Multiple rapid searches from the browser hit the 10 req/min/IP limit.
**Why it happens:** Calling OFF directly from `fetch()` in a client component.
**How to avoid:** Proxy ALL OFF calls through `/api/nutrition/search`. Apply debounce (300ms minimum) on the client search input. Cache search results in the route handler with `next: { revalidate: 300 }`.

### Pitfall 4: Percentage Target Validation

**What goes wrong:** `protein_pct + carbs_pct + fat_pct ≠ 100` → macros don't sum to calories.
**Why it happens:** User edits one macro % without adjusting others.
**How to avoid:** Zod refinement on the target save schema: `.refine(d => Math.abs(d.proteinPct + d.carbsPct + d.fatPct - 100) < 0.5, ...)`. UI: auto-adjust remaining when one changes (like MyFitnessPal).

### Pitfall 5: `serving_quantity` Missing = Broken Serving Dropdown

**What goes wrong:** OFF product has no `serving_quantity` field → serving picker shows only "100 g".
**Why it happens:** Many products, especially generic/raw ones, have no declared serving size in OFF.
**How to avoid:** Always seed a "100 g" (or "100 ml") serving option on every food. Only add the product-declared serving if `serving_quantity > 0`. This is the fallback path per D-05.

### Pitfall 6: Date Timezone Mismatch

**What goes wrong:** Server uses UTC; user logs midnight meal → appears on wrong day.
**Why it happens:** `new Date().toISOString()` returns UTC.
**How to avoid:** Client sends ISO date string from `format(new Date(), 'yyyy-MM-dd')` in `date-fns` (local date, no timezone conversion). Server stores verbatim as a `DATE` column — same pattern as `habit_completions.completed_date` and `training_activities.scheduled_date` in the existing schema.

### Pitfall 7: Clobbering history with a food edit

**What goes wrong:** User renames a manual food or corrects its macros → historical logs pick up the new values on next read.
**Why it happens:** `food_logs` joins to `foods` instead of having snapshotted values.
**How to avoid:** As per Pitfall 1 — snapshot macros on `food_logs`. Editing a food definition should NOT retroactively change logs.

### Pitfall 8: Stale Realtime Table Keys

**What goes wrong:** New nutrition tables not added to `RealtimeTable` union → TypeScript allows incorrect table names in `useTableSubscription` calls.
**How to avoid:** Add all 5 nutrition tables to `query-keys.ts` `RealtimeTable` union in the same plan that creates the schema, before any component code is written.

---

## Macro Math Reference

```
// 4/4/9 calorie rule
kcal_from_macros = proteinG × 4 + carbsG × 4 + fatG × 9

// Target gram derivation from % targets
target_protein_g = (target_kcal × protein_pct / 100) / 4
target_carbs_g   = (target_kcal × carbs_pct / 100) / 4
target_fat_g     = (target_kcal × fat_pct / 100) / 9

// Per-log macro computation
base_amount_g = quantity × serving_option.grams_or_ml   // e.g., 2 × 28g = 56g
kcal          = round(food.kcal_per_100g × base_amount_g / 100)
protein_g     = round1(food.protein_per_100g × base_amount_g / 100)
carbs_g       = round1(food.carbs_per_100g × base_amount_g / 100)
fat_g         = round1(food.fat_per_100g × base_amount_g / 100)
```

---

## Code Examples

### Serving Option Seeding (verified pattern)

```typescript
// Seeded on food creation in nutrition-service.ts
const DEFAULT_SERVING = { label: "100 g", gramsOrMl: 100, isDefault: true, orderIndex: 0 };

// If OFF product has serving_quantity:
const OFF_SERVING = {
  label: product.serving_size.split("(")[0].trim() || "1 serving",
  gramsOrMl: product.serving_quantity,
  isDefault: true,  // product serving is default; 100g option always also added
  orderIndex: 0,
};
```

### OFF Search URL (verified live)

```
GET https://search.openfoodfacts.org/search?q=banana&json=1&page_size=20&fields=code,product_name,nutriments,serving_size,serving_quantity,product_quantity_unit
```

Response shape: `{ hits: OFFProduct[], count: number, page_size: number, page_count: number }`

### Heat Map Grid (plain CSS approach)

```tsx
// NutritionHeatMap.tsx — no library dependency
import { eachDayOfInterval, subDays, format } from "date-fns";

const today = new Date();
const start = subDays(today, 364);
const days = eachDayOfInterval({ start, end: today });

// Group into 52 columns of 7 rows
// CSS: grid-template-rows: repeat(7, 10px); grid-auto-columns: 10px; grid-auto-flow: column; gap: 2px

// Color: 5 levels based on (daily_kcal / target_kcal) clamped [0, 1.0+]
// Level 0: 0%      → var(--surface) + border
// Level 1: 1–39%   → oklch(30% 0.08 200)   (very dim cyan)
// Level 2: 40–69%  → oklch(45% 0.13 200)
// Level 3: 70–99%  → oklch(60% 0.18 200)
// Level 4: 100%+   → var(--hud-cyan)        (full target met)
```

### Navigation Entry (verified from PersistentNav.tsx pattern)

```typescript
// Append to `items` array in apps/web/components/shell/PersistentNav.tsx
{ href: "/nutrition", label: "Nutrition", icon: UtensilsCrossed, disabled: false, tooltip: undefined, isAgent: false },
```

Import: `import { UtensilsCrossed } from "lucide-react";` (Lucide icon for food/nutrition — already in project).

### SettingsSectionNav Glass Pill CSS (extracted from source)

The target glass pill visual is `SettingsSectionNav.tsx`'s rail container:
- Rail: `rounded-full px-2 py-1.5 backdrop-blur-md bg-[color-mix(in_oklch,var(--surface)_88%,transparent)] shadow-[inset_0_1px_0 …] border border-[color-mix(in_oklch,var(--edge)_60%,transparent)]`
- Active pill: `rounded-full bg-[var(--surface)] shadow-[inset_2px_2px_5px …]` with `motion.span layoutId` spring animation

Use this pattern for the meal slot tab bar (Breakfast / Lunch / Dinner / Snacks) navigation.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Open Food Facts API | Food search + product lookup | ✓ (HTTPS, no auth) | Rate limit 10/min/IP; proxy required |
| Supabase (remote prod) | All DB writes | ✓ | Migrations apply to remote per CONTEXT.md |
| `date-fns` 4 | Heat map grid, date arithmetic | ✓ | In `package.json` |
| `recharts` 3.8.x | Stats charts | ✓ | In `package.json` |
| `react-github-calendar` 5.0.6 | Heat map (fallback) | ✓ | In `package.json` — NOT recommended; use plain grid |
| `lucide-react` 0.460 | Navigation icon | ✓ | `UtensilsCrossed` or `Salad` available |

**No missing dependencies.** All required libraries are already in `package.json`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test` |
| Full suite command | `pnpm --filter web test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NUTR-MATH-01 | `computeMacros()` returns correct kcal/protein/carbs/fat | unit | `pnpm --filter web test -- nutrition/macro-math` | ❌ Wave 0 |
| NUTR-MATH-02 | `validateMacroConsistency()` flags >15% divergence | unit | `pnpm --filter web test -- nutrition/macro-math` | ❌ Wave 0 |
| NUTR-TARGET-01 | Target gram derivation correct for 30/40/30 split | unit | `pnpm --filter web test -- nutrition/macro-math` | ❌ Wave 0 |
| NUTR-SERVICE-01 | `logFood()` snapshots macros correctly (not just foodId) | unit (mock Drizzle) | `pnpm --filter web test -- nutrition/nutrition-service` | ❌ Wave 0 |
| NUTR-RLS-01 | Cross-user `food_logs` reads return empty | integration | `pnpm --filter web test -- nutrition/rls` | ❌ Wave 0 |
| NUTR-OFF-01 | OFF search proxy returns typed result; missing fields default 0 | unit (mock fetch) | `pnpm --filter web test -- nutrition/off-client` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `apps/web/tests/nutrition/macro-math.test.ts` — covers NUTR-MATH-01, NUTR-MATH-02, NUTR-TARGET-01
- [ ] `apps/web/tests/nutrition/nutrition-service.test.ts` — covers NUTR-SERVICE-01
- [ ] `apps/web/tests/nutrition/off-client.test.ts` — covers NUTR-OFF-01
- [ ] `apps/web/tests/nutrition/rls.test.ts` — covers NUTR-RLS-01

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `react-activity-calendar` + GitHub-specific data shape | Plain CSS grid + `date-fns 4` | No library overhead; full control of color scale |
| OFF legacy `/cgi/search.pl` | Search-a-licious `search.openfoodfacts.org/search` | Better full-text relevance, richer response |
| Storing OFF JSON blob | Normalize to `foods` table + `food_serving_options` | Enables Drizzle queries, RLS, Realtime |
| Computing macros at read time | Snapshotting on `food_logs` | Immutable history |

---

## Open Questions

1. **Meal slot sub-nav style**
   - What we know: D-13 references the SettingsSectionNav pill bar as the visual target. Training uses a weekday column layout.
   - What's unclear: Should the Breakfast/Lunch/Dinner/Snacks selector be a top pill bar (like Settings) or vertical tabs? The MFP-style is a full-page accordion by meal slot.
   - Recommendation (Claude's Discretion): Use the pill bar pattern for a horizontal tab selector at the top of the day view; each tab reveals that meal slot's logs below. Feels native to the app's established pill pattern.

2. **Heat map cell encoding**
   - What we know: D-11 asks for GitHub-style heatmap; D-12 says encoding is Claude's discretion.
   - Recommendation: Encode adherence (daily kcal logged ÷ target_kcal, clamped 0–1+). A level-4 green cell = "hit or exceeded target." This is more meaningful than raw calories (changes meaning when target changes). Display actual kcal in cell tooltip.

3. **Fiber/sodium storage**
   - What we know: D-12 says "store if cheap; targets are macros-only for now."
   - Recommendation: Add `fiber_g` and optionally `sodium_mg` columns to both `foods` and `food_logs`. Cost is two nullable columns; benefit is future target extension without a migration.

4. **"Copy yesterday" shortcut**
   - What we know: Claude's Discretion allows this convenience feature.
   - Recommendation: Add a "Copy from yesterday" button on the day view header when today's logs are empty. Implement as a server action that clones yesterday's `food_logs` rows to today with new IDs.

---

## Sources

### Primary (HIGH confidence)

- Live API call to `world.openfoodfacts.org/api/v2/product/0016000275270.json` — nutriments field names, serving_size, serving_quantity, product_quantity_unit verified
- `apps/web/lib/db/schema.ts` — training schema precedent, Drizzle patterns
- `apps/web/components/settings/SettingsSectionNav.tsx` — glass pill CSS classes (source of truth per D-13)
- `apps/web/components/shell/PersistentNav.tsx` — nav registration pattern
- `apps/web/lib/realtime/query-keys.ts` — RealtimeTable union extension pattern
- `apps/web/lib/realtime/useTableSubscription.ts` — Realtime hook API
- `apps/web/app/(app)/training/page.tsx` — Server Component shell pattern
- `apps/web/app/actions/training.ts` — Server Action pattern (getUserId, Zod schema, Drizzle write)
- `apps/web/components/training/TrainingClient.tsx` — TanStack Query + Realtime client island pattern
- `apps/web/lib/jarvis/executor.ts` — Phase 16 service layer pattern for D-14

### Secondary (MEDIUM confidence)

- [Open Food Facts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/) — rate limits (10 req/min search, 15 req/min product), User-Agent requirement, Search-a-licious recommendation
- [OFF API tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/) — nutriments field naming conventions (`_100g`, `_serving` suffixes)
- [openfoodfacts-go/nutriment.go](https://github.com/openfoodfacts/openfoodfacts-go/blob/develop/nutriment.go) — comprehensive nutriment field list (verified naming convention)
- Live call to `search.openfoodfacts.org/search?q=banana` — confirmed `{ hits, count, page_size }` response shape
- [shadcn-calendar-heatmap](https://github.com/gurbaaz27/shadcn-calendar-heatmap) — library evaluated and rejected (adds `react-day-picker` dep for marginal benefit over plain CSS grid)

### Tertiary (LOW confidence)

- WebSearch results for Search-a-licious endpoint stability — flagged as needing validation; confirmed from live call but endpoint could change

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from `package.json`
- OFF API endpoints: MEDIUM-HIGH — primary endpoint confirmed via live call; Search-a-licious is current recommendation but beta
- OFF nutriments shape: HIGH — verified from live API call to real product
- Architecture: HIGH — directly mirrored from Phase 15 training precedent in same repo
- Schema design: HIGH — follows established patterns, snapshotting pattern is domain standard
- Pitfalls: HIGH — derived from live code inspection + domain knowledge
- Heat map: HIGH (plain CSS grid approach); MEDIUM (library fallback)

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable APIs; OFF endpoint could shift)
