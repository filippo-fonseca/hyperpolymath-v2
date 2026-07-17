# PLAN — u7-mobile-shell (mobile-progressive app shell)

Run: sesh-1784257742502 · Unit: unit-u7-mobile-shell-progressive-shell-77aa · Model: claude-opus-4-8

## Problem
The app-shell sidebar (`components/shell/Sidebar.tsx`, `w-[230px]` expanded) never
collapses below `md`. At 390px the route gets ~160px, so the /areas timeline zoom
toolbar (Quarters/Today) clips. Root cause is the shell yielding no width; the fix
is shell-only. Do NOT touch `components/projects/timeline/**` or the areas page
components — the toolbar unclips itself once the shell yields width.

## Approach
Below `md` the sidebar defaults to the collapsed rail and expansion becomes the
existing z-50 hover-peek OVERLAY (float over content, zero layout push), opened by
the collapse toggle (coarse pointers have no hover), closed by tap-outside /
Escape / navigation. Breakpoint collapse is DERIVED (matchMedia on the exact
48rem `md` query) composed with the persisted `sidebar-collapsed` value, and NEVER
writes that preference. At `>= md` behavior is byte-for-byte today's.

## Steps
1. **`components/shell/use-sidebar-breakpoint.ts`** (pure, unit-testable):
   - `useIsBelowMd()` — SSR-safe (default false = desktop-first, matches SSR);
     reads `matchMedia("(min-width: 48rem)")` in an effect and subscribes to
     `change`. Below md === `!mql.matches`.
   - `deriveSidebarLayout({ belowMd, collapsed, hovered, overlayOpen })` →
     `{ railMode, effectiveCollapsed, peeking }`. railMode = belowMd || collapsed;
     effectiveCollapsed = belowMd ? !overlayOpen : (collapsed && !hovered);
     peeking = railMode && !effectiveCollapsed.
   - `planToggle({ belowMd, collapsed, overlayOpen })` → decision with
     `persistCollapsed` false below md (proves "no persistence write below md").
2. **`Sidebar.tsx`**: add `overlayOpen` state + `belowMd`; outer aside width from
   `railMode`, inner div from `effectiveCollapsed`, z-50 float from `peeking`;
   `toggleCollapsed` routes through `planToggle`; gate `onMouseEnter` peek to
   `!belowMd`; close overlay on outside pointerdown / Escape / pathname change and
   whenever the viewport crosses back to `>= md`; width tweens gated to
   `!belowMd && !reduceMotion` (overlay snaps, §14; reduced motion honored);
   `SidebarHeader` receives `collapsed={railMode}` `peeking={peeking}` (identical
   at `>= md`, since railMode === collapsed there).
3. **390px sweep**: `TopTabBar` pills had `min-w-[220px]` + `px-9`, which pushed
   the +/split controls off a ~334px route and clipped labels; gate both to md+
   (`min-w-0 md:min-w-[220px]`, `px-3 md:px-9`). No other shell fixed-width
   breakers found (JARVIS panel is `hidden lg:flex`; breadcrumb width is a `max-`).
4. **Test** `tests/sidebar-breakpoint.test.tsx`: mocked matchMedia → useIsBelowMd
   true below md + reacts to change; deriveSidebarLayout forces the rail below md;
   planToggle below md → persistCollapsed=false. Keep `sidebar-areas-nav` green.
5. **Gates**: `npx vitest run tests/sidebar-areas-nav.test.tsx
   tests/sidebar-breakpoint.test.tsx`; `npx tsc --noEmit` (both from apps/web).
6. **Evidence** (prod build, both themes, `.planning/evidence/`, prefix `u7-`):
   /areas timeline 390px (toolbar UNCLIPPED), 390px overlay open, 768px, captures
   390px.

## Canon
§14 (no width tween on the overlay; reduced-motion guard), §16 (no new hex
literals — all `color-mix`/tokens reused), §18 (both themes). Existing Tailwind
breakpoints + coarse-pointer semantics only; no bespoke px media queries. u2
branding/lockup, Areas pill, and focus order preserved (untouched).

## Assumptions
- Tailwind `md` = 48rem (Tailwind 4 default; no `@theme` override found).
- Below-md expansion keys off the breakpoint (a narrow desktop window behaves
  like mobile: rail + toggle overlay). This also covers coarse pointers (no hover).
- The full `<Sidebar>` is not unit-tested (heavy realtime/query/theme mocks); the
  two properties that matter (below-md default rail; no persistence write) are
  proven via the extracted pure helpers + matchMedia-mocked hook.
