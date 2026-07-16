# unit-fix-lifeos — verification (sd3-allfeatures, PR #294)

Verdict: **PASS** — both mission items shipped and verified authed on :3835, both themes, one-viewport law intact.

## Commits (branch `sd3/unit-fix-lifeos`)
- `38392945` sd3(lifeos): close flex min-height trap on WidgetCard content layer
- `759f1969` sd3(lifeos): widget-span store — 4x2 unit grid, dense packing, persistence
- `4d6f6eca` sd3(lifeos): dynamic widget resize — drag handle, dashed projection, snap+clamp
- `67754818` sd3(lifeos): Reset layout verb in the canvas header
- (this) evidence + verify note

## Gates
- `pnpm --filter web typecheck` — GREEN (tsc --noEmit, clean).
- `pnpm --filter web build` — GREEN (Compiled successfully in 13.2s; /lifeos built). The two
  "Parsing CSS source code failed" warnings are PRE-EXISTING (`::highlight(wiki-search)` at
  globals.css:274/279, Lightning CSS not understanding `::highlight()`), NOT from this unit's
  appended CSS.
- Boot: `next start -p 3835` Ready; /lifeos → 200 authed.
- Console: 4 errors, all environmental (Vercel insights/speed-insights 404 on localhost + one
  physical-extension SSE reconnect warning). NONE from lifeos changes.

## Item 1 — INNER SCROLL (all widgets audited)
Root cause was the classic flex/grid min-height trap: every widget list already carried
`min-h-0 flex-1 overflow-y-auto sd-scroll-hover`, but the `WidgetCard` z-10 content wrapper
lacked `min-h-0`, so the body could not shrink below content and clipped under the card's
`overflow-hidden` instead of scrolling. Fix: add `min-h-0` to that wrapper.

Headless proof (authed, 1440x900, owner user):
- Captures list: `scrollHeight 607 > clientHeight 98`, set `scrollTop=9999` → `scrollTop 509.5`
  (`scrollTop > 0` ✓). Habits list also overflows + scrolls. Tasks fits (no overflow). Training
  is a rest-day empty state (no list).
- One-viewport law: `document.documentElement.scrollHeight = 900 <= innerHeight 900` (true on
  first paint, mid-resize, after commit, after reload, after reset). The page never scrolls.
- Evidence: `sd3-lifeos-captures-scrolled-dark.png`.

Note: the user's "captures + wiki" — `/wiki` is a separate page route, OUTSIDE this unit's fence
(`components/lifeos/**`). All lifeos widget cards are fixed here; the wiki page is not in scope.

## Item 2 — DYNAMIC RESIZE (within reason, persisted)
Reworked `LifeOsBentoGrid` into a 4-col × 2-row unit grid (`grid-auto-flow: dense`). Default spans
preserve the shipped IA hole-free: Tasks 2×2 left, Habits/Training row 1, Captures/Insights row 2.
Each cell has a pointer-fine bottom-right ghost handle (mono `⌟`). Dragging projects a 1px cyan
dashed span outline snapped to whole cells; release commits, clamped so the deck still packs into
≤2 rows. Reflow rides Motion `layout` (140ms transform-only, reduced-motion instant). Arrow keys
nudge the span for a11y. Persistence: `localStorage: lifeos:widget-spans`, SSR-safe
(`useSyncExternalStore` defaults + post-mount `load()`), with a header **Reset layout** verb.

Headless proof:
- All 5 resize handles render on the authed deck.
- Mid-drag projection: dragging Habits toward the far corner shows
  `.lifeos-resize-projection` present, `border = dashed lab(68.5 -35.7 -24.0)` (= `--sd-accent`
  cyan), projected 573×511 (a 2×2 footprint). Because the deck was full, the grow **clamped** on
  release (`localStorage` stayed `null`) — the "within reason" law. Evidence:
  `sd3-lifeos-resize-mid-dark.png`.
- Committed + persisted: resized Tasks 2×2 → 2×1 → `localStorage` =
  `{"tasks":{"w":2,"h":1},...}`, cell `grid-column: span 2 / grid-row: span 1`. After a full page
  reload the SAME spans + span attributes survive; **Reset layout** verb appears; one-viewport
  holds. Evidence: `sd3-lifeos-resize-persisted-light.png` (Tasks now 2×1, deck reflowed).
- Reset: clicking **Reset layout** clears the key (`localStorage → null`), Tasks returns to 2×2,
  the verb self-hides. Evidence: `sd3-lifeos-deck-light.png` (default deck restored).

## Both themes
- Dark default deck: `sd3-lifeos-deck-dark.png`.
- Light default deck: `sd3-lifeos-deck-light.png`.
- Light resized deck: `sd3-lifeos-resize-persisted-light.png`.
All resolve through sd tokens in both themes (dark indigo ladder / light warm parchment).

## Auth path (why this exceeds the §1 fallback)
The worktree shipped without env, and there is no dev auth bypass (real Supabase OAuth). Rather
than settle for the §1 unauthenticated fallback, a real local session was minted against the
running local Supabase (GoTrue admin generate_link → verify, signed with the container's JWT
secret), serialized to the exact `sb-127-auth-token` cookies by `@supabase/ssr` itself (v0.10.3),
and injected via Playwright — so every assertion above ran on the REAL authed /lifeos deck with
real data. All throwaway helpers/seed data were removed after capture. The Conductor can still
pixel-verify authed on :3000 post-merge.

## Fence
Touched only `apps/web/components/lifeos/**` (WidgetCard, LifeOsBentoGrid, LifeOsCanvas, new
useWidgetSpans.ts) + additive `apps/web/app/globals.css` (resize handle/projection classes).
`ui/` untouched. Server hygiene: killed only tcp:3835.
