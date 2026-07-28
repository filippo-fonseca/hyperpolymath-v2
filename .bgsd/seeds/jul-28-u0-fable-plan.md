# U0 execution plan: cockpit shell + design foundation (Fable pre-plan)

Authored 2026-07-28 by the U0 design pre-planner. Binding inputs: `.bgsd/seeds/jul-28-seed.md`
section 2 (SDC-1) and the U0 brief in section 3; sealed decisions D3, D4, D10, D11;
risk register entries R1, R2, R3, R6, R10, R12, R15. Where this plan and the seed disagree,
the seed wins and the disagreement is a defect in this plan.

Path convention: paths are relative to `apps/web/` unless they start with `docs/`, `.bgsd/`,
or `apps/`. One correction to the seed's pathing: **`docs/DESIGN-SYSTEM.md` lives at the repo
root** (`/docs/DESIGN-SYSTEM.md`), not under `apps/web/docs/`. There is no `apps/web/docs/`
copy. Amend the root file.

This plan is a sequence of atomic commits. The build agent commits after each step with
explicit pathspecs (D2), records the hash on the control file, and runs the per-commit
verification listed under each step. The app must build and function after every commit;
no commit leaves a route broken.

---

## 0. Target architecture at a glance

New files U0 creates:

```
components/shell/cockpit/
  Rail.tsx                # wraps Sidebar + the tasks-fullscreen collapse
  Stage.tsx               # TopTabBar + scroll container + JarvisCommandBar
  RightSlot.tsx           # the arbitrated track: SidePanelHost or Dock
  right-slot-context.tsx  # provider + useSidePanel()/useRightSlot() state
  Dock.tsx                # composes registered widgets; chooser; persistence
  DockChooser.tsx         # popover listing registered widgets
  JarvisCommandBar.tsx    # persistent bar, streamJarvis consumer
  dock-registry.ts        # DockWidgetDef, defineDockWidget, getDockWidgets
components/dock-widgets/
  manifest.ts             # export const DOCK_WIDGETS = [...]
  today-counts.tsx
  home-devices.tsx
  next-event.tsx
components/ui/SidePanel.tsx
components/ui/PageScaffold.tsx
components/ui/EmptyState.tsx
lib/db/cached.ts
```

Files U0 rewrites: `components/shell/AppShell.tsx` (becomes a thin cockpit composition),
`app/globals.css` (tokens only, per SDC-1), `app/(app)/layout.tsx` (perf),
`lib/search/snapshot.ts` (consume cached wrappers), `lib/auth/get-user.ts` (cache wrap),
`components/shell/TopTabBar.tsx` (motion retimes only), `components/shell/JarvisSidePanel.tsx`
(micro-label cleanup only), `components/shared/EmptyState.tsx` and
`components/ui/explorer/EmptyState.tsx` (reduced to shims), `docs/DESIGN-SYSTEM.md`.

Deleted: `app/(app)/template.tsx`; the inline split-pane region `AppShell.tsx:118-138`
(functionality moves to the right slot, see C8).

Explicitly untouched: `components/shell/PersistentNav.tsx` (R3: U4 is inserting into it;
the rail imports it exactly as `Sidebar.tsx:276` does today), `components/shell/Sidebar.tsx`
internals beyond what C6 strictly needs (also R3), `lib/db/queries/*` bodies, `lib/db/client.ts`,
`next.config.ts`, every `router.refresh()` site (all U3), `components/jarvis/*` except reading
its exports, `GlobalJarvisDialog.tsx`, `GlobalHotkeys.tsx` (the bar registers its own listener;
see C11 for why we do not edit the Cmd+K path).

---

## 1. Commit sequence

### C1. Fix the dark sd cascade bug (globals.css only)

**What.** `.dark { --sd-app: hsl(235 15% 13%); ... }` at `globals.css:1446-1461` is clobbered
for `html.dark` by the later same-specificity `:root { --sd-app: var(--canvas); ... }` remap at
`globals.css:1562-1583` (both are specificity (0,1,0); source order decides; the remap comes
later and wins; dark `--canvas` is `oklch(15% 0.005 240)` at `globals.css:922`, which is why dark
paints near-black). Change the remap block's selector from `:root` to `:root:where(:not(.dark))`.
`:where()` contributes zero specificity, so the block keeps (0,1,0) and simply stops matching
`html.dark`; the `.dark` sd ladder wins again with no block moves and no specificity arms race.

**Files.** `app/globals.css` (one selector).

**Why first.** The seed orders it: verify dark before shipping anything else, because every
subsequent dark-theme screenshot is meaningless while the bug stands. It is also the smallest
possible commit, a clean revert point, and it changes zero light-theme pixels.

**Could break.** Nothing in light. In dark, surfaces shift from near-black to the intended
`hsl(235 15% 13%)` ladder; any component that accidentally depended on the near-black canvas
(there are none known; the seed calls the near-black a bug outright) shifts with it.

**Verify.** `pnpm typecheck` and `pnpm build` green. In a headless browser with `.dark` on
`<html>`: `getComputedStyle(document.documentElement).getPropertyValue('--sd-app')` returns the
hsl ladder value, not the oklch canvas. (After C2 the same probe must return the `#15171a`
family; at this commit the interim `hsl(235 15% 13%)` is the correct answer.)

### C2. The calmed token pass + type ladder + focus ring + DESIGN-SYSTEM amendments

**What.** All token-level; zero call-site edits (SDC-1 §2.3: units change tokens, not the
366 + 440 call sites).

1. Replace the light base palette at `globals.css:50-56` and the dark overrides at
   `globals.css:921-940` with the §2.3 values verbatim (light `--canvas #fbfaf8` ... dark
   `--canvas #15171a` ladder, `--ink 12.4:1 / 12.7:1`, `--edge`, `--edge-strong`, `--hover`,
   `--selected`, `--accent oklch(55% 0.09 225)` light / `oklch(74% 0.095 225)` dark). Add the
   new names that do not exist yet (`--ink-faint`, `--edge-strong`, `--hover`, `--selected`)
   to both theme blocks. Do not invent hex; the seed's values are pre-measured.
2. Re-point the sd remap so the whole `--sd-*` register resolves to the calmed ladder in BOTH
   themes. Replace the literal hsl values in the light remap (`globals.css:1562-1583`, now scoped
   `:root:where(:not(.dark))` from C1) and in the dark sd block (`globals.css:1446-1461` and
   `1585-1589`) with the §2.3 alias table: `--sd-app: var(--canvas)`, `--sd-box:
   var(--surface-raised)`, `--sd-dark-box: var(--surface)`, `--sd-line: var(--edge)`,
   `--sd-frame: var(--edge-strong)`, `--sd-ink: var(--ink)`, `--sd-ink-dull: var(--ink-muted)`,
   `--sd-ink-faint: var(--ink-faint)`, `--sd-accent: var(--accent)`, plus the natural extensions
   `--sd-hover: var(--hover)`, `--sd-selected: var(--selected)`, `--sd-input: var(--surface)`,
   `--sd-menu: var(--surface-raised)`, `--sd-menu-line: var(--edge)`, keeping the `color-mix`
   derivations for `--sd-darker-box` / `--sd-active` / `--sd-sidebar` but re-based on the new
   tokens. Once both theme blocks are pure aliases, the two blocks can collapse into one
   unscoped `:root` remap; keep the C1 scoping anyway as defense so a future literal in `.dark`
   can never be clobbered again. Leave `.wiki-explorer` (`globals.css:1465-1497`) alone: it
   redeclares its full ladder locally by design, and wiki visuals are U7's.
3. Retire the 4px double-cyan halo: `--ring-focus` at `globals.css:92` (and its dark twin)
   becomes `0 0 0 2px var(--canvas), 0 0 0 3.5px var(--accent)`. `--ring-doc` / `--ring-hud`
   keep aliasing it, so every consumer updates for free.
4. Register the §2.4 type ladder in `@theme` as real Tailwind text steps:
   `--text-display: 30px` with `--text-display--line-height: 1.2` and
   `--text-display--letter-spacing: -0.02em`, and likewise `title` 20px/1.35/-0.01em,
   `subtitle` 16px/1.45, `body` 14.5px/1.6, `meta` 13px/1.5, `micro` 11.5px/1.4. These emit
   `text-display` ... `text-micro` utilities for every unit. Weights and colours stay per-use
   (the ladder table); do not bake colour into the step.
5. Add the motion tokens: `--ease-collapse` already exists (`globals.css:1533`); add
   `--duration-micro: 160ms; --duration-enter: 220ms; --duration-panel: 260ms;
   --duration-collapse: 280ms` next to the easings so units consume names, not numbers.
6. Kill `.sd-stat-label`'s uppercase + tracking at `globals.css:1725` (named offender, and
   globals is U0-only).
7. Amend `docs/DESIGN-SYSTEM.md` (repo root) §2 (tokens), §3 (typography/tracking), §5 (chrome
   grammar radii), §7 (page scaffold), §14 (motion law) to state the SDC-1 values, in this same
   commit, so the doc is never silently stale.

**Files.** `app/globals.css`, `docs/DESIGN-SYSTEM.md`.

**Could break.** The Tailwind 4 scan gap (SDC-1 §2.12.3, doc §23): new `@theme` text steps are
utilities and only emit when a source file uses them; U0's own components (C3 onward) will be
the first consumers, so after C5 verify `text-title` exists in the compiled CSS. The color-mix
derivations must be checked in both themes (a bad base makes `--sd-selected` vanish). shadcn
`--color-*` bindings at `globals.css:103-128` reference the renamed values by var and survive
untouched.

**Verify.** Build green. Dark probe now returns the `#15171a` family for `--sd-app` (this is
the U0 acceptance assertion). Screenshot `/tasks` and `/lifeos` in both themes; expect visibly
lower contrast and a lighter dark canvas, no layout shifts.

### C3. EmptyState primitive + the two legacy shims

**What.** New `components/ui/EmptyState.tsx` per §2.10 (props, sizes `page|section|inline`,
centred `gap-3`, no border/card/serif/uppercase, `opacity 0→1` + `y 4→0` 220ms
`--ease-out-quart` guarded by `useReducedMotion()`). Then reduce
`components/shared/EmptyState.tsx` (9 consumers) and `components/ui/explorer/EmptyState.tsx`
(8 consumers) to thin shims: each keeps its OLD prop signature and internally renders the new
component, mapping props (the shared one's serif/`py-24` register maps to `size="page"`; the
explorer one's icon slot and `min-h-[240px]` map to `size="section"` with icon). 17 call sites
compile unchanged.

**Why here.** Zero-consumer new file plus behavior-preserving shims; lands the primitive before
the shell work so later commits (and wave 2) can use it. Independent of C1/C2 except that it is
the first consumer of `text-subtitle`/`text-meta`, which flushes the scan-gap question early.

**Could break.** Shim prop mapping. Diff the rendered DOM of one consumer of each legacy
component (e.g. an empty captures list) before/after; visual drift is expected (calmer), a
crash or missing title is not.

**Verify.** Typecheck; grep that no consumer file changed; screenshot one empty state.

### C4. PageScaffold primitive

**What.** New `components/ui/PageScaffold.tsx` per §2.9, with `PageScaffold.Section` and
`PageScaffold.MetaRow` as static members. Fixed anatomy: outer
`mx-auto w-full max-w-[1120px] px-8 pt-10 pb-24` (centred within the stage; the stage's scroll
container is the width reference, which C6 preserves), eyebrow → 8px → title row → 8px →
subtitle → 12px → meta; header has no border and no background; sections `mt-8`, optional
`border-t border-[var(--edge)] pt-8` when the page opts in. Status renders via `StatusPill`
from `components/lifeos/entity-card.tsx` (§2.11: reuse, do not reinvent). No consumers in U0;
wave-2 units adopt it (R6 requires it merged and frozen before they branch).

**Could break.** Nothing (no consumers). The one design risk is baking a variable anatomy;
resist props that vary spacing. Wave 2 units must not need to edit this file (R6), so implement
the full §2.9 surface now including `eyebrow`, `icon`, `actions`, `meta`.

**Verify.** Typecheck. Render it once in isolation (a throwaway story/scratch page is fine to
build but must not be committed).

### C5. SidePanel primitive + SidePanelHost + right-slot context (not yet mounted)

**What.** Three pieces in one commit because they are one contract:

1. `components/shell/cockpit/right-slot-context.tsx`: the state model (section 3 below).
2. `components/ui/SidePanel.tsx`: the declarative component per §2.8's exact prop type. At
   `lg` and above it renders nothing in place; it registers its props into the right-slot
   context. Below `lg` it renders `components/ui/sheet.tsx` with `overlay={false}` (§2.2.5,
   §2.8.7). No portal, no `fixed`, no backdrop, no shadow, no focus trap.
3. `SidePanelHost` (exported from `SidePanel.tsx`): renders the currently registered panel's
   chrome (header `h-12 px-4 border-b border-[var(--edge)]`, `text-title`, lucide `X` size-8
   radius 8; body `flex-1 overflow-y-auto p-4 sd-scroll-hover`; optional footer; surface
   `bg-[var(--surface)] border-l border-[var(--edge)]`, radius 0, `overflow-hidden min-w-0`;
   `role="complementary"` + `aria-label`). Inner content fades opacity 0→1 over 160ms delayed
   80ms; the panel itself never translates (§2.8.5).

The host is NOT mounted anywhere yet; that happens in C7. This commit is pure library code, so
the app cannot break.

**Why this order.** The host needs the cockpit grid to exist to be a grid sibling of the stage
(§2.8.1); the grid arrives in C6. Landing the contract first lets C6 and C7 be small.

**Verify.** Typecheck. Unit-test the context reducer if trivial to do with vitest (register,
replace, clear-on-unmount ordering); do not build a jsdom rig for the host.

### C6. The cockpit grid: AppShell becomes rail / stage / right-slot

**The risky commit. Keep it mechanical: move boxes, change no behavior.**

**What.** Rewrite `components/shell/AppShell.tsx` from the current flex root
(`AppShell.tsx:71`) into a three-track grid, extracting `Rail.tsx` and `Stage.tsx`:

```tsx
<div className="isolate grid h-screen w-screen overflow-hidden
                bg-[var(--canvas)] text-[var(--ink)]
                grid-cols-[auto_minmax(0,1fr)_var(--right-w)]"
     style={{ '--right-w': rightW }}>
  <AmbientGlow ... />           {/* stays exactly as AppShell.tsx:77 */}
  <ProductTour />
  <Rail ...sidebar props />     {/* track 1 */}
  <Stage>{children}</Stage>     {/* track 2 */}
  <RightSlot />                 {/* track 3; renders empty, width 0, until C7 */}
</div>
```

- **Rail** wraps the existing `AnimatePresence` tasks-fullscreen collapse
  (`AppShell.tsx:86-117`) and `<Sidebar/>` verbatim, including the `sidebarAnimating`
  overflow-clip dance (`AppShell.tsx:62`, comment at `:58-61`): the collapsed rail's hover-peek
  overlay is an absolute 230px panel that floats past the 56px rail, so the rail grid item must
  stay `overflow-visible` at rest and `relative z-40`. The rail track is `auto`; the Sidebar's
  own `w-14`/`w-[230px]` transition (`Sidebar.tsx:236-258`) sizes it, which is the existing
  mechanism and needs no new animation. `sidebar-collapsed` persistence stays inside Sidebar
  (`Sidebar.tsx:131-137`), untouched.
- **Stage** is a flex column, `min-w-0 overflow-hidden`: `DailyAutoOpen` → `TopTabBar` → the
  scroll container → (C11 adds the command bar here). The scroll container moves verbatim from
  `AppShell.tsx:121-129` and MUST keep the exact class set `@container/main min-h-0 flex-1`
  plus the wiki special case `onWikiHome ? "h-full overflow-hidden" : "overflow-auto"`: this is
  the app's ONLY `@container/main`, and every `@3xl/main` / `@4xl/main` variant in
  `components/tasks/KanbanBoard.tsx`, `KanbanColumn.tsx`, and
  `components/lifeos/LifeOsBentoGrid.tsx` resolves against it. Renaming or re-boxing it breaks
  three features silently.
- **Split-screen JARVIS panel**: in THIS commit, keep the `showPanel` aside
  (`AppShell.tsx:130-137`) rendering inside the Stage exactly where it is today, so C6 changes
  layout topology only for the root. It migrates to the right slot in C8.
- `--right-w` is `0px` in this commit; the third track exists but is empty. Grid note: a
  `grid-template-columns` transition interpolates per-track when the track-list length is
  unchanged; the rail track is `auto` on both sides of any right-slot transition (identical
  keyword, no interpolation needed), so the changing third track animates cleanly. This is why
  the root is one grid rather than nested flex: the U0 acceptance criterion literally asserts
  "exactly three top-level cockpit grid tracks" at 1440x900.

**Files.** `components/shell/AppShell.tsx`, new `components/shell/cockpit/Rail.tsx`,
`components/shell/cockpit/Stage.tsx`, new `components/shell/cockpit/RightSlot.tsx` (stub).
`app/(app)/layout.tsx` is NOT touched; it keeps importing `AppShell`.

**Could break.**
- The `@container/main` consumers (above); verify kanban columns and the LifeOS bento reflow.
- The hover-peek overlay clipping (grid item overflow).
- The `nav-active-pill` layoutId slide (`PersistentNav.tsx:170-176`) is untouched because
  PersistentNav and Sidebar internals are untouched.
- `isolate` must stay on the root so AmbientGlow's fixed negative-z layer keeps painting above
  the canvas and below content (comment at `AppShell.tsx:72-76`, R10).

**Verify.** Navigate `/tasks`, `/wiki`, `/wiki/<page>`, `/lifeos`, `/areas`, `/today`,
`/onboarding` (no chrome), toggle sidebar collapse + hover-peek, toggle tasks fullscreen,
toggle split-screen. Assert `getComputedStyle(root).gridTemplateColumns` has three tracks.
Both themes screenshots.

### C7. Right slot goes live: host mounted, arbitration, breakpoints, track transition

**What.** `RightSlot.tsx` becomes real and `right-slot-context`'s provider mounts in AppShell
(inside the grid, wrapping Stage + RightSlot so both read it):

- The third track's width is a single derived value (section 3): panel open → panel width
  (clamped 320 to 560, default 380); else dock state decides (after C9; until then `0px`).
- Transition: `transition: grid-template-columns 260ms var(--ease-collapse)` on the grid root;
  reduced motion gets an instant swap (§2.8.8). The sanctioned width animation is exactly this
  track (§2.7); nothing inside the slot animates width.
- `SidePanelHost` renders inside `RightSlot` as the panel occupant. Escape-to-close and
  close-on-route-change live in the host (window keydown that defers to `e.defaultPrevented`
  so Radix dialogs win; `usePathname` effect calling the registered `onClose`).
- Below `lg` (1024px) the track is `0px` always; `SidePanel` instances render the sheet
  degradation themselves (from C5), so the host renders null there.

**Could break.** Escape stealing from open dialogs (the defaultPrevented guard is the fix);
a panel whose feature forgets `onClose` wedging the slot open (the host clears its registration
on unmount regardless).

**Verify.** No consumer exists yet, so drive it with a scratch invocation during verification
only (or defer the interactive checks to C8, which ships the first real consumer). Assert the
stage `getBoundingClientRect().width` shrinks when a panel registers and restores on close;
`document.body.style.pointerEvents` untouched; no `position: fixed` element covering the stage.

### C8. Split-screen JARVIS panel becomes the first SidePanel consumer

**What.** Delete the inline aside (`AppShell.tsx:130-137` region as it now stands inside
Stage) and render the split-screen panel through the right slot instead: a small
`SplitJarvisPanel` client component (in `components/shell/cockpit/`) that reads
`useSplitScreen()` (`lib/ui/useSplitScreen.ts`) and renders
`<SidePanel open={splitOn && !onJarvis && !onOnboarding} onClose={() => setSplitOn(false)}
width={420} title="JARVIS">` wrapping the existing `<JarvisSidePanel/>`
(`components/shell/JarvisSidePanel.tsx`, untouched except C12's label cleanup). The
`agent-mode-scope` class moves onto the panel body wrapper so the HUD keyframes stay
quarantined (§2.7).

**Why.** Two birds: the legacy split pane was the fourth column risk (rail + stage + split +
future dock), and §2.2 says a SidePanel and the Dock share one track; routing split-screen
through the slot makes the JARVIS pane obey arbitration for free. It also gives C7's machinery
a real consumer inside U0, which the acceptance criteria need (`Escape` closes it, route
change to `/today` closes it via the existing `showPanel` condition, stage width shrinks).

**Could break.** `useSplitScreen`'s localStorage + window-event sync (`useSplitScreen.ts:20-53`)
is unchanged; TopTabBar's toggle keeps working because it writes the same store. The suppression
rules (`AppShell.tsx:64-68`: not on `/today`, not on `/onboarding`) move into the new component
verbatim. Below `lg` the old aside was `hidden lg:flex`; the new path degrades to a sheet
instead, which is an intentional behavior upgrade; note it in the report.

**Verify.** Toggle split on `/tasks`: dock-less right slot animates 0 → 420, JarvisConsole
loads lazily as before (`JarvisSidePanel.tsx:26-35` module cache), Escape closes and the
toggle in TopTabBar reflects off. Both themes.

### C9. Dock registry seam + Dock + chooser + persistence + first widget

**What.** D11's load-bearing seam, exactly as published in the U0 brief:

- `components/shell/cockpit/dock-registry.ts` exports the `DockWidgetDef<TData>` type,
  `defineDockWidget`, and `getDockWidgets()` verbatim from the brief (section 4 below adds the
  implementation notes; use `export function` declarations, not const arrows, because
  registry → manifest → widget → registry is a static import cycle and function declarations
  are hoisted at module instantiation, which makes the cycle safe).
- `components/dock-widgets/manifest.ts`: `export const DOCK_WIDGETS = [todayCountsWidget]`.
- `components/dock-widgets/today-counts.tsx`: the first widget through the seam (today's task
  counts; its `useData` is a `useQuery` reusing the tasks tableKey the app already invalidates,
  so realtime keeps it honest with zero new channels).
- `components/shell/cockpit/Dock.tsx`: renders in `RightSlot` when no panel is registered and
  viewport ≥ 1024. Composes `getDockWidgets()` filtered+ordered by the persisted choice; each
  entry renders inside a per-widget error boundary component that calls `def.useData()` and
  renders `def.Compact`, carries `data-dock-widget-id={def.id}`, and knows nothing else.
  Collapse toggle in the dock header; widths: expanded 280px, collapsed 44px (icons/titles
  only), auto-collapse below 1280px viewport (media-driven, does NOT write the persisted
  preference), absent below 1024px (§2.2.4).
- `DockChooser.tsx`: a popover from the dock header listing every registered widget with a
  check toggle; writes `cockpit-dock-widgets` (JSON array of ids, in order). Collapse writes
  `cockpit-dock-collapsed`. Both read in `useEffect` after mount with the Sidebar's
  invisible-until-mounted pattern (`Sidebar.tsx:115-137`, `:240-242`) so a collapsed dock never
  flashes open.

**Could break.** Hydration mismatch (the mounted pattern prevents it); the import cycle
(mitigated above; if the bundler still complains, `getDockWidgets` may lazy-require the
manifest via a registration callback the manifest invokes, but try the direct import first);
a widget whose hook throws (the error boundary contains it; the strip renders the others).

**Verify.** The U0 acceptance greps, at this commit: every strip entry has
`data-dock-widget-id` matching a manifest id; removing the entry from `manifest.ts` removes it
from the strip with no other edit; `grep -rn "today-counts" components/shell app` returns
nothing; `Dock.tsx` imports no widget module by name (only the manifest). Un-dock + reload
persists; collapse + reload persists. Opening the split JARVIS panel slides the Dock out and
closing restores its prior collapse state (§2.2.3).

### C10. Remaining wave-1 widgets: home devices, next event

**What.** `components/dock-widgets/home-devices.tsx` (compact device/light status; reuse the
data path behind `components/shell/SidebarHomeDevicesStrip.tsx` and `lib/govee/home-display.ts`
/ `lib/govee/home-state.ts` rather than refetching a second way) and
`components/dock-widgets/next-event.tsx` (next calendar event via
`app/api/device/calendar/route.ts`). Append both to the manifest. Sentence-case titles
(§2.4: never uppercase). `defaultDocked: true` for all three wave-1 widgets; `order` fields
10/20/30 so U11's habits widget can slot between without renumbering.

**Note.** Do NOT remove `SidebarHomeDevicesStrip` from the sidebar footer in this commit; that
is a design call the Conductor can make at integration (the strip at `Sidebar.tsx:344` is
inside U0's ownership, but removing it while the dock is below-1024-absent would lose the
feature on small windows; flag it in the report instead).

**Verify.** Same registry greps as C9 now pass with three ids. Widget errors (e.g. Govee API
down) degrade to the widget's own error state, not a dock crash.

### C11. The JARVIS command bar

**What.** `components/shell/cockpit/JarvisCommandBar.tsx`, mounted in `Stage.tsx` as the LAST
flex child, below the scroll container: a fixed-height (h-12, p-2 gutter) bar,
`border-t border-[var(--edge)] bg-[var(--surface)]`, containing the kiwi glyph
(`components/shared/KiwiIcon`), a single-line input, and a `kbd` hint. Because it is a flex
sibling of the scroll container, it can never overlap content and never fights the editors:
BlockNote/wiki surfaces live inside the scroll box above it and simply have ~48px less
viewport. It does not autofocus on mount or on route change (it would steal focus from
editors); focus is explicit.

Details, and what it must NOT duplicate:

- **Transport**: `streamJarvis` from `components/jarvis/jarvis-stream-client.ts:119` against
  the existing `POST /api/jarvis` SSE contract (`app/api/jarvis/route.ts:15-24`). Do not build
  a second SSE client, do not add a route. Maintain a module-local rolling history (last ~20
  turns) passed as `history`; `voiceActive` false, `sttDoneAt` null.
- **Streaming UI**: while a turn is in flight, an answer strip expands above the bar (inside
  the bar's own box, max-height ~40% of the stage, its own scroll), rendering text deltas, a
  compact line per `action` event ("created task ...", from the ExecutorResult name/summary),
  and the `clarification` question as plain text with the suggested options as buttons that
  resubmit. It does NOT render `JarvisReceipt`/`JarvisScrollback`; the full receipt UX belongs
  to the console surfaces. Post-action data refresh is free: executors write tables that
  realtime already invalidates.
- **Keyboard**: `Cmd/Ctrl+J` focuses the bar from anywhere (its own window listener; skip when
  a dialog is open via `e.defaultPrevented`, and do not touch `GlobalHotkeys.tsx`, whose
  Cmd+K → `focusJarvis()` and `GlobalJarvisDialog`'s Cmd+K palette behavior
  (`GlobalJarvisDialog.tsx:65-77`) stay exactly as they are). `Escape` collapses the answer
  strip, then blurs. `Enter` sends.
- **Expand**: an expand affordance (⤢ icon button, and `Cmd+Shift+J`) navigates to `/jarvis`,
  seeding `sessionStorage["jarvis-prefill"]` with any unsent draft (the exact mechanism
  `GlobalJarvisDialog.tsx:123-131` uses). Streamed turns are persisted server-side per turn, so
  the full page shows them without extra plumbing.
- **Suppression**: hidden on `/today` and `/jarvis` (those routes ARE the console; two live
  inputs to the same brain on one screen is the confusion D3 removes) and `/onboarding`.
- **What it must not duplicate from `GlobalJarvisDialog`**: the quick-create action list, the
  search dropdown, the dialog chrome, the Cmd+K binding. The dialog remains the palette; the
  bar is furniture for sending one sentence. If the bar and dialog ever both want a keystroke,
  the dialog wins and the bar yields.

**Could break.** Focus wars with editors (no autofocus is the rule); double-submit during an
in-flight turn (disable input until `done`/`error`, with the abort controller wired to an ✕);
the `/today` suppression must use the same prefix logic as `AppShell.tsx:64-65`.

**Verify.** The U0 acceptance: at 1440x900 on `/tasks`, the JARVIS input is present and
focusable at the bottom of the stage with no dialog open. Send "hello" against a dev server
and watch SSE text stream into the strip. Cmd+K still opens the palette; Cmd+J focuses the bar.

### C12. Motion retimes + micro-label cleanup in owned shell files

**What.** The §2.7 durations applied to the shell U0 owns, nothing else:

- `TopTabBar.tsx:199,224,267,284`: the 80ms and 50ms transitions become 160ms micro
  (`ease-out`). Nothing under 140ms.
- Rail collapse: the Sidebar aside transitions at `Sidebar.tsx:236,257` go 300ms →
  280ms `var(--ease-collapse)`; the AnimatePresence tasks-fullscreen collapse in Rail
  (ex `AppShell.tsx:93-97`) likewise 0.2s → 0.28s collapse timing. (This is the one sanctioned
  Sidebar.tsx edit beyond C6; PersistentNav still untouched.)
- `JarvisSidePanel.tsx:66,84`: the mono/uppercase/tracking-0.12-0.16 loading and error labels
  become `text-micro` sentence case (named offenders in §2.4).
- While in these files only: delete-on-sight items per §2.12.5 (`gap-2.5`→`gap-2` etc. where
  they appear in the hunks being edited; do not sweep the repo).

**Verify.** Tab hover/active still transitions (slower, calmer); collapse feels weightier, not
laggy; reduced-motion still snaps everywhere.

### C13. Perf 1: React.cache wrappers in lib/db/cached.ts (+ get-user in place)

**What.** New `lib/db/cached.ts` exporting `cache()`-wrapped re-exports of the layout-path
helpers: `getSidebarTree`, `getAllTasksForUser`, `getCapturesForUser`, `getPagesForUser`,
`getJournalEntriesForUser`, `getHashtagSuggestions`, `loadHabits`. The wrappers live in a new
file precisely so U3 can rewrite the helper bodies in `lib/db/queries/*` without conflict (R1).
Consume them in `app/(app)/layout.tsx:44-46` and `lib/search/snapshot.ts:29-36` (both U0-owned).
Wrap `getUserOrRedirect` IN PLACE in `lib/auth/get-user.ts:57` (`export const getUserOrRedirect
= cache(async (): Promise<AuthenticatedUser> => {...})`), which dedupes the double auth+user
query from `layout.tsx:32` plus `requireOnboarded()` (`get-user.ts:101-105`) in the same
request. Measured wins the scout already counted: `getSidebarTree` 3x → 1x per render,
`getAllTasksForUser` 2x → 1x on `/tasks`, `getUserOrRedirect` 2x → 1x.

**Why its own commit.** Independently revertable: if memoization surfaces a staleness bug, this
reverts without touching the shell or the snapshot change.

**Could break.** `React.cache` is per-request; nothing crosses requests. The one hazard is
wrapping a function whose arguments are non-primitive (all these take `(userId: string,
bool?)`, fine). `redirect()` inside a cached function still works (it throws; cache stores the
settled rejection for the request, which is the correct behavior for a repeated call).

**Verify.** Build green; log Postgres query count for one `/tasks` render before/after (dev
`DEBUG` drizzle logging or pg statement sampling); expect the duplicate getSidebarTree /
tasks fetches gone.

### C14. Perf 2: getSearchSnapshot off the blocking path

**What.** Remove `getSearchSnapshot(user.id)` from the `Promise.all` at
`app/(app)/layout.tsx:43,57` and stop passing `initialSnapshot` at `layout.tsx:66`. In
`components/search/SearchProvider.tsx`, U0 edits ONLY (R2): the props type
(`initialSnapshot?: SearchSnapshot`), the `initialData: initialSnapshot` line (undefined is a
legal TanStack "no initial data"), and the minimal guard the removal forces at `:60`
(`buildSearchIndex(data)` must tolerate `data === undefined`; `data ? buildSearchIndex(data) :
[]`). Everything else in that file (query options `:29-35`, subscriptions `:47-58`) is U3's;
if the guard cannot be expressed without touching those lines, raise a blocker instead of
editing. The client fetch path already exists (`queryFn: fetchSearchSnapshot`), so search
populates moments after paint and realtime keeps it fresh.

**Why after C13.** The wrappers make the residual layout queries cheap first; this commit then
removes 18 of 25 queries from the blocking path entirely. Separate commits keep each win
independently revertable, which the brief demands.

**Could break.** A route that assumed a warm index at first paint (Cmd+K search opened within
the first second returns empty briefly; acceptable and self-healing). The RSC payload also
shrinks substantially (the snapshot carried full page `content`, `snapshot.ts:62-69`).

**Verify.** The U0 acceptance: cold `/tasks` navigation waterfall shows no request carrying
the snapshot payload before first contentful paint. Cmd+K search still works after ~1s.

### C15. Perf 3: delete app/(app)/template.tsx

**What.** `git rm app/(app)/template.tsx` (D10 / s4 finding 7: it remounts the whole route
subtree every navigation and stacks a 150ms fade on an already slow transition; §2.7 seals the
override of s5's keep-the-fade recommendation). Perceived transition quality now comes from
`app/(app)/loading.tsx` (`GlobalLoader`) and per-route skeletons.

**Could break.** Two second-order effects to check, not assume:
1. Scroll position: the stage scroll container lives in AppShell (outside the template), so
   template deletion does not change scroll retention; but verify that navigating
   `/tasks` (scrolled) → `/wiki` lands at the top. If it does not, add a pathname-keyed
   `scrollTop = 0` effect in `Stage.tsx` (owned file, two lines), preserving per-route
   scroll-to-top without the remount.
2. Anything keying off template remounts for animation reset: grep found the fade is the
   template's only job (`template.tsx:22-37`).

**Verify.** The acceptance: `app/(app)/template.tsx` does not exist; navigation between
`/tasks` and `/wiki` reads as instant (no fade), no stale scroll, no double-flash from
loading.tsx.

---

## 2. Zone implementation spec (reference for C6/C7/C11)

- **One grid, three named tracks**: `grid-template-columns: [rail] auto [stage] minmax(0,1fr)
  [right] var(--right-w)`; single row, `h-screen w-screen overflow-hidden`. `--right-w` is the
  only animated template value; the rail sizes itself by content (the Sidebar's own width
  transition), and `minmax(0,1fr)` on the stage is what lets it genuinely reflow when the
  right track widens (§2.8.2 "content genuinely reflows").
- **Stage owns scroll**: the ONLY scroll container for route content is the `@container/main`
  div (moved verbatim, wiki special case preserved). The stage column is
  `min-w-0 overflow-hidden flex flex-col`; TopTabBar and JarvisCommandBar are fixed-height
  flex siblings above/below the scroll box, so neither ever overlaps content and the command
  bar cannot collide with editor surfaces, sticky toolbars, or BlockNote menus, all of which
  live inside the scroll box.
- **Right slot** is one track. Its occupant is decided by arbitration (section 3), never by a
  second column. `transition: grid-template-columns 260ms var(--ease-collapse)` on the grid
  element; `@media (prefers-reduced-motion: reduce)` kills the transition (also gate in JS via
  `useReducedMotion` for the inner fades).
- Breakpoints: ≥1280 dock may be expanded; 1024 to 1279 dock forced collapsed (44px);
  <1024 dock absent and SidePanel degrades to the overlay-less sheet. Use one
  `useMediaQuery`-style hook colocated in `right-slot-context.tsx` (mirror
  `components/shell/use-sidebar-breakpoint.ts`'s SSR-safe default-false pattern).

## 3. Right-slot arbitration: the state model

One provider, `RightSlotProvider`, mounted once in AppShell (C7). State:

```ts
type PanelRegistration = {
  id: string;                 // stable per SidePanel mount (useId)
  props: SidePanelProps;      // the full §2.8 prop object, children included
};
type RightSlotState = {
  panel: PanelRegistration | null;   // last registration wins
  dockCollapsed: boolean;            // persisted, 'cockpit-dock-collapsed'
  dockedIds: string[];               // persisted, 'cockpit-dock-widgets'
};
```

- **How a feature requests a panel without prop-drilling**: it renders `<SidePanel open={...}>`
  anywhere in its own tree. The component registers `{id, props}` into the provider via a
  `useLayoutEffect` on every render while `open` (children are React elements, i.e. plain
  objects; re-registering per render keeps them fresh), and clears on close/unmount if it is
  still the current owner. `SidePanelHost` (rendered by RightSlot) renders
  `state.panel.props.children` in place, as a true grid sibling of the stage: no portal, no
  fixed positioning. Context above AppShell (QueryProvider, SearchProvider,
  CurrentUserProvider, NuqsAdapter, all at `app/(app)/layout.tsx:61-69`) still wraps the host,
  so feature children keep their hooks working.
- **Last-open wins**: a second SidePanel registering replaces the first; the first's
  clear-on-unmount checks ownership by id so it cannot clobber the replacement.
- **The feature stays the source of truth for `open`**: the host never hides a panel
  unilaterally; Escape and route-change call the registered `onClose` so the feature flips its
  own state. A feature that ignores `onClose` is a bug in the feature; the host's
  unmount-clear is the backstop.
- **Arbitration**: derived, not stored. `occupant = panel ? 'panel' : (width >= 1024 ? 'dock'
  : 'none')`; `--right-w = panel ? clamp(320, panel.width ?? 380, 560)px : occupant === 'dock'
  ? (dockCollapsed || width < 1280 ? 44px : 280px) : 0px`. Closing a panel restores the dock
  to its prior collapse state automatically because `dockCollapsed` was never touched
  (§2.2.3).

## 4. Dock widget registry (D11) implementation notes

The published contract is verbatim from the brief; do not rename a field:

```ts
export type DockWidgetDef<TData = unknown> = {
  id: string;
  title: string;
  defaultDocked?: boolean;
  order?: number;
  useData: () => TData;
  Compact: React.ComponentType<{ data: TData }>;
  Expanded?: React.ComponentType<{ data: TData }>;
};
export function defineDockWidget<TData>(def: DockWidgetDef<TData>): DockWidgetDef<unknown>;
export function getDockWidgets(): DockWidgetDef<unknown>[];
```

- `defineDockWidget` is an identity function whose job is type erasure at the boundary.
- `getDockWidgets()` returns the manifest array sorted by `order ?? 100` then `title`. It
  imports `DOCK_WIDGETS` from `components/dock-widgets/manifest.ts`; the cycle
  (registry → manifest → widget → registry) is safe because both registry exports are hoisted
  function/type declarations. If Turbopack flags it anyway, invert: the manifest calls a
  `registerDockWidgets(DOCK_WIDGETS)` setter at module scope and Dock imports the manifest for
  side effects; keep the public API identical.
- The Dock renders each docked id through `<DockWidgetSlot def={...}>`: an error-boundary class
  wrapping a leaf that calls `def.useData()` and renders `def.Compact`. Hooks stay legal
  because each widget is its own component instance; undocked widgets never mount, so their
  hooks and subscriptions never run. `Expanded`, when present, renders in a per-widget
  disclosure inside the strip (not a modal, not the SidePanel; the slot is already arbitrated).
- Persistence: `cockpit-dock-widgets` holds the docked ids in order; absence of the key means
  "use `defaultDocked`". The chooser writes the full array on every toggle. Widget ids are the
  persistence keys, hence stable kebab-case forever.
- Shipping a widget is one new file under `components/dock-widgets/` plus one appended manifest
  line, zero shell edits; this is the exact surface U11 (habits, R15) and the XP system (#345)
  code against. Treat `DockWidgetDef` as published API: additive changes only.

## 5. Motion and feel: what animates, what snaps

Animates (all guarded by reduced motion):
- The right-slot track: 260ms `--ease-collapse` on `grid-template-columns`, the single
  sanctioned width animation (§2.7).
- SidePanel inner content: opacity 160ms, delayed 80ms after the track settles; the panel
  never translates.
- Rail collapse and tasks-fullscreen collapse: 280ms `--ease-collapse` (C12).
- The nav active pill layoutId slide (existing, 250ms, untouched).
- Micro state (hover ink, tab fills, dock chooser): 160ms `ease-out`.
- EmptyState entry: 220ms `--ease-out-quart`, opacity + 4px y.

Snaps, deliberately:
- **Route swaps.** No template, no fade, no slide, no stagger. The stage content replaces
  instantly; skeletons carry the wait. This is the single biggest "feels like Notion" lever.
- Dock widget mounting and reordering (no AnimatePresence in the strip; content pops).
- The command bar's answer strip collapse (height snap; only its text content fades in).
- TopTabBar tab switching (fill moves, nothing slides; retimed to 160ms in C12).
- First paint everywhere: `initial={false}` on every AnimatePresence (the `AppShell.tsx:86`
  convention carries into Rail).
- Never: hover scale, page-level slides, `layout` + `y` on one node (the wiki-tile droop root
  cause, §2.7), `hud-*` keyframes outside `.agent-mode-scope`.

## 6. Risks, order rationale, and per-commit verification summary

Order rationale in one paragraph: tokens first (C1/C2) because every later screenshot is
evidence only against the calmed scale and the dark bug poisons all dark evidence; primitives
next (C3/C4/C5) because they are zero-risk library code that wave 2 needs frozen (R6) and C6+
consumes; the grid flip (C6) is isolated to topology with zero behavior change so its diff
reviews as a pure move; the right slot (C7) then gains its first real consumer immediately
(C8) so the arbitration machinery is exercised inside U0 rather than on faith; the dock
(C9/C10) lands after arbitration exists because the dock is the slot's default occupant, not
its owner; the command bar (C11) comes late because it depends only on Stage and its risk
(focus, SSE) is orthogonal to layout; retimes (C12) after the shell is stable; the three perf
commits (C13/C14/C15) land last and contiguous so each is independently revertable and none is
entangled with shell topology.

Top risks, ranked:
1. **`@container/main` breakage** (C6): three features silently mis-lay-out. Mitigation: move
   the div verbatim; verify kanban + bento at 1440 and 1100 widths.
2. **R3 collision with U4 on the sidebar**: mitigated by not touching `PersistentNav.tsx` at
   all and keeping `Sidebar.tsx` edits to C6's wrapper needs plus C12's two duration values.
   Integration order is U0 then U4 regardless.
3. **Grid track transition not interpolating**: mitigated by keeping the track-list length
   constant and only `--right-w` changing; verified in C7 with a slow-motion recording (or
   `getComputedStyle` sampling mid-transition).
4. **SidePanel context/children pitfalls** (stale children, Escape wars): mitigated by
   re-register-per-render, ownership-checked clears, defaultPrevented deference; exercised by
   C8's real consumer.
5. **Search briefly empty after C14**: accepted; self-heals in ~1s; realtime keeps it fresh.
6. **Import cycle in the registry** (C9): fallback design specified.
7. **Focus stealing by the command bar** (C11): no autofocus ever; explicit keystroke only.

After every commit, the build agent runs: `pnpm typecheck` and `pnpm build` (report verbatim);
the commit's own "Verify" block above; and for any UI commit, screenshots of `/tasks`, `/wiki`,
`/lifeos` in BOTH themes (a light-only screenshot is not evidence, §2.12.4). Final unit
verification is the U0 acceptance list in the seed, run headless per D9, including the
reduced-motion no-track-transition check and the three registry greps.
