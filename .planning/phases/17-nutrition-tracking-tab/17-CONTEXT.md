# Phase 17: Nutrition tracking tab - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

MyFitnessPal-style nutrition tab in the web app (`apps/web`): log foods per day assigned to meal slots (breakfast/lunch/dinner/snacks), macros auto-fetched from Open Food Facts, manual-entry fallback, reusable "meals" (saved groupings of foods with exact quantities), personal food history for quick re-select, daily stats + macro breakdowns + GitHub-style heat map, one global user-configurable target set (calories + protein/carb/fat %) with live daily progress.

**Explicitly OUT of this phase:**
- JARVIS tools for nutrition ("Jarvis, I just ate a pineapple") — architecture must make this trivial later, but tools are NOT built without explicit user confirmation
- Mobile surface — tracked separately (GitHub issue #24: barcode scanner via Open Food Facts on `apps/mobile`)
- Barcode scanning anywhere (web has no camera flow)

</domain>

<decisions>
## Implementation Decisions

### Food database & search
- **D-01:** Open Food Facts is THE external source (free, no key, barcode-ready for the mobile follow-up). No USDA FDC.
- **D-02:** Search priority: personal food history first (instant, local), then Open Food Facts results.
- **D-03:** Manual entry fallback when a food isn't found — user types name + macros + serving info; manual foods enter the personal history like any other.

### Serving & quantity model
- **D-04:** Canonical base unit is grams for solids, ml for liquids — every log resolves to a base quantity for macro math.
- **D-05:** Product-defined serving sizes are first-class selectable units (MFP-style): user picks a unit ("1 medium pineapple", "1 slice", "100 g", "1 cup") and a quantity multiplier of that unit. Serving definitions come from the OFF product data where available, or from manual entry.
- **D-06:** Schema must store per-food serving options (label + gram/ml equivalent) so any logged entry = food + serving unit + quantity → resolved base amount → macros.

### Logging flow
- **D-07:** BOTH entry points: per-meal-slot inline "+ add" (MFP-style) AND a global quick-add composer with meal picker. Same underlying search/quick-select surface.
- **D-08:** Input must be seamless — search-as-you-type, keyboard-first, minimal clicks from intent to logged.

### Targets
- **D-09:** One global target set, edited in settings: target calories + protein % + carb % + fat % (percentages of calories; show computed gram equivalents). No per-day or per-weekday variants for now.
- **D-10:** Daily view shows live progress against targets as logs accumulate (consumed vs remaining, per macro and calories).

### Stats & heat map
- **D-11:** GitHub-style contribution heat map for the year view.
- **D-12:** Remaining stats design is **Claude's discretion** — daily macro breakdown, trends, etc. Keep it useful, not dashboard-bloat.

### Visual treatment
- **D-13:** Glassy/neumorphic like the settings menu pill bar (`SettingsSectionNav.tsx`: rounded-full + backdrop-blur-md + mono uppercase micro-labels) — but within the established app look (cyan-canonical accent, EB Garamond, Anthropic-discipline restraint from Phases 6.1/6.2). Glass on interactive surfaces; document discipline elsewhere. NOT a new visual language.

### JARVIS-readiness (architecture only)
- **D-14:** All mutations go through a server-side service layer (same pattern as Phase 16 ActionExecutor methods) so JARVIS tools (`log_food`, `log_meal`, …) can be added later by wiring tool definitions to existing functions. Do NOT add the tools in this phase.

### Claude's Discretion
- Recents vs frequents ordering in quick-select; copy-yesterday / duplicate-meal shortcuts
- Stats beyond the heat map (D-12)
- Whether to track fiber/sugar/sodium etc. from OFF data (store if cheap; targets are macros-only for now)
- Heat map cell encoding (calories vs adherence) — pick what reads best with one global target set

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Visual language
- `apps/web/components/settings/SettingsSectionNav.tsx` — the "glassy pill" reference the user explicitly cited (rounded-full, backdrop-blur-md, mono uppercase labels)
- `apps/web/components/shell/PersistentNav.tsx` + `apps/web/components/shell/TopTabBar.tsx` — nav registration points for the new tab

### Feature-shape precedent
- `apps/web/lib/db/schema.ts` — Drizzle schema; `trainingBatches`/`trainingActivityTypes`/`trainingActivities` (Phase 15) are the closest precedent for a self-contained feature family
- `apps/web/components/training/` + `apps/web/app/(app)/training/` — Phase 15 tab structure (client board, stats subroute, dialogs) to mirror

### External API
- Open Food Facts API v2 — search (`https://world.openfoodfacts.org/cgi/search.pl` / v2 search) and product-by-barcode (`/api/v2/product/{barcode}`); no API key; researcher must verify current endpoints, rate-limit etiquette (User-Agent header required), and nutriments field shape (`nutriments.energy-kcal_100g`, `proteins_100g`, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Training tab (Phase 15) — full template: schema tables, components dir, `(app)` route with stats subpage, TanStack Query + Realtime wiring
- `SettingsSectionNav.tsx` — glass pill styling to lift
- `EmptyState.tsx`, `use-undo-toast.ts` (`components/shared/`) — empty states and undo affordances
- Server actions pattern in `apps/web/app/actions/`

### Established Patterns
- Drizzle schema in single `apps/web/lib/db/schema.ts`, all rows `userId`-scoped; migrations via Supabase (remember: prod is remote Supabase now — migrations must apply to remote)
- TanStack Query for reads + Supabase Realtime as invalidation signal
- Phase 16 executor pattern: server-side mutation functions with `userId` ownership verified at the boundary — the JARVIS-readiness hook (D-14)

### Integration Points
- `PersistentNav.tsx` nav items array + `TopTabBar.tsx` route map — add `/nutrition` entry (icon: something food-ish from Lucide)
- New route: `apps/web/app/(app)/nutrition/` (+ optional `stats` subroute mirroring training)
- New components: `apps/web/components/nutrition/`

</code_context>

<specifics>
## Specific Ideas

- "Like MyFitnessPal" — meal-slot day view, serving-size dropdown per product, quantity multiplier
- Glassy = the settings menu pill bar, specifically; "keep our look... but neumorphic"
- GitHub-style heat map explicitly requested

</specifics>

<deferred>
## Deferred Ideas

- **Mobile barcode scanner** → GitHub issue #24 (Expo camera → OFF barcode lookup → pre-filled log). Depends on this phase's service layer.
- **JARVIS nutrition tools** — design-ready via D-14, but requires explicit user confirmation before building.
- **Per-day / training-vs-rest-day target variants** — "one global one for now" implies this may come later.

</deferred>

---

*Phase: 17-nutrition-tracking-tab*
*Context gathered: 2026-06-12*
