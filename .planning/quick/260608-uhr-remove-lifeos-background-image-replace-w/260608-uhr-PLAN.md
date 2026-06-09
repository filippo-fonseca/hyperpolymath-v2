---
phase: 260608-uhr-remove-lifeos-background-image-replace-w
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/components/lifeos/LifeOsWallpaper.tsx
  - apps/web/components/lifeos/CursorParallaxStarfield.tsx
  - apps/web/app/(app)/lifeos/page.tsx
  - apps/web/lib/shell/use-split-screen.ts
  - apps/web/components/shell/AppShell.tsx
  - apps/web/components/shell/SplitScreenToggle.tsx
  - apps/web/components/shell/PersistentNav.tsx
  - apps/web/components/jarvis/JarvisConsole.tsx
autonomous: true
requirements:
  - QUICK-260608-uhr
must_haves:
  truths:
    - "Navigating to /lifeos shows no LifeOsWallpaper image — only canvas + tonal parallax stars"
    - "Moving the cursor across /lifeos shifts star layers subtly (GPU transform), no jank"
    - "prefers-reduced-motion disables parallax; stars remain static"
    - "Pressing ⌘\\ (Cmd+\\ on Mac, Ctrl+\\ elsewhere) toggles split-screen on any /app route"
    - "When split is ON, route content renders ~60% width left, JarvisConsole docks ~40% right with a thin divider"
    - "Split-screen state persists across navigation AND across full page reload (localStorage)"
    - "Below md breakpoint the split is forced OFF and the toggle is hidden/disabled"
  artifacts:
    - path: "apps/web/components/lifeos/CursorParallaxStarfield.tsx"
      provides: "Tonal cursor-parallax starfield client component"
      contains: "translate3d"
    - path: "apps/web/lib/shell/use-split-screen.ts"
      provides: "useSplitScreen hook (localStorage-backed boolean + toggle + ⌘\\ binding)"
      exports: ["useSplitScreen"]
    - path: "apps/web/components/shell/SplitScreenToggle.tsx"
      provides: "Sidebar button calling useSplitScreen().toggle()"
    - path: "apps/web/components/shell/AppShell.tsx"
      provides: "Split-screen layout — main + docked JarvisConsole"
      contains: "JarvisConsole"
  key_links:
    - from: "apps/web/components/shell/AppShell.tsx"
      to: "apps/web/lib/shell/use-split-screen.ts"
      via: "useSplitScreen() hook call"
      pattern: "useSplitScreen"
    - from: "apps/web/components/shell/PersistentNav.tsx"
      to: "apps/web/components/shell/SplitScreenToggle.tsx"
      via: "import + render"
      pattern: "SplitScreenToggle"
    - from: "apps/web/components/shell/AppShell.tsx"
      to: "apps/web/components/jarvis/JarvisConsole.tsx"
      via: "docked variant render"
      pattern: "JarvisConsole.*variant"
---

<objective>
Two locked design changes for the LifeOS surface and app shell:

1. Replace `LifeOsWallpaper` (warm parchment + paper-grain SVG) with a tonal, cursor-parallax starfield. Whisper-quiet, no brand accent, GPU-only motion, reduced-motion safe.
2. Add a persistent split-screen Jarvis toggle to the app shell so any route can dock JarvisConsole at ~40% on the right. State persists across navigation and reloads via localStorage. Hotkey ⌘\\ on Mac, Ctrl+\\ elsewhere. Mobile forced OFF.

Purpose: align LifeOS with "atmospheric mood only" (restraint > theatrics per user memory — both HUD-heavy and neumorphic attempts were rejected) and make Jarvis a one-keystroke companion to any view instead of a destination.

Output: starfield component + LifeOS rewire + `useSplitScreen` hook + AppShell split layout + sidebar toggle button + minimal JarvisConsole `variant="docked"` knob.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@apps/web/app/(app)/lifeos/page.tsx
@apps/web/components/lifeos/LifeOsWallpaper.tsx
@apps/web/components/shell/AppShell.tsx
@apps/web/components/shell/PersistentNav.tsx
@apps/web/components/jarvis/JarvisConsole.tsx
@apps/web/app/(app)/today/page.tsx

<interfaces>
<!-- Current LifeOsWallpaper export: `export function LifeOsWallpaper()` and default export. Imported by lifeos/page.tsx as `<LifeOsWallpaper />` directly under `<main className="relative">`. -->

<!-- JarvisConsole props (from JarvisConsole.tsx Props interface) — when rendering a docked instance, the same props are required:
  userTimezone: string
  initialProjects: ProjectSource[]   // { id, name, icon? }[]
  initialHashtags: HashtagSource[]   // { id, name, displayName }[]
  + initialTurns is also currently passed in /today/page.tsx
-->

<!-- AppShell currently:
  function AppShell({ userId, activeAreas, allAreas, graduationYear, profile, children })
  Layout: <div flex h-screen> <Sidebar/> <div flex-1 flex-col> <TopTabBar/> <main flex-1 overflow-auto>{children}</main> </div> </div>
  We will wrap the inner column so {children} renders in a left pane (~60%) and JarvisConsole renders in a right pane (~40%) when split is ON. Below md, split forced OFF.
-->

<!-- Hotkey: navigator.platform / userAgent check for Mac vs other.
     Mac: e.metaKey && e.key === '\\'
     Other: e.ctrlKey && e.key === '\\'
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace LifeOS background image with tonal cursor-parallax starfield</name>
  <files>
    apps/web/components/lifeos/CursorParallaxStarfield.tsx (new)
    apps/web/components/lifeos/LifeOsWallpaper.tsx (rewrite)
    apps/web/app/(app)/lifeos/page.tsx (no structural change — keeps `<LifeOsWallpaper />`)
  </files>
  <action>
    Create `apps/web/components/lifeos/CursorParallaxStarfield.tsx`:
    - `"use client"` component, default + named export `CursorParallaxStarfield`.
    - Renders a single absolutely-positioned `<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">` containing 3 layered `<div>`s — one per depth layer (back / mid / front).
    - On mount, for each layer, generate a deterministic-ish set of dots via a seeded RNG (small inline mulberry32 with hardcoded seed so SSR/CSR match; positions stable across renders). Counts: back ~80, mid ~50, front ~25. Sizes: 1px / 1.5px / 2px.
    - Render dots as `box-shadow` strings on a single 1px element per layer (classic CSS starfield trick — one element, many shadows). This avoids 100+ DOM nodes per layer.
    - Color: use `currentColor` so the parent can set ink/white via CSS. On the wrapper, set `color: var(--ink)` and use Tailwind `opacity-[0.08] dark:opacity-[0.15]` (per locked spec: ~8% light, ~15% dark).
    - Parallax: attach a single `pointermove` listener on `window` inside `useEffect`. Compute normalized cursor `(nx, ny)` in range [-0.5, 0.5]. Use a `requestAnimationFrame` throttle (store latest values in refs, schedule one rAF if not pending). Inside rAF, set `transform: translate3d(...)` on each layer ref directly (NOT via React state). Translation magnitudes: back 4px, mid 10px, front 18px (each multiplied by nx/ny).
    - On unmount: remove listener, cancel any pending rAF.
    - Respect reduced motion: read `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at mount, store in a ref; if true, never attach the pointermove handler — dots render static. Also listen for changes to that media query and refresh accordingly.
    - No per-frame React state. No brand color. No animation libraries.

    Rewrite `apps/web/components/lifeos/LifeOsWallpaper.tsx`:
    - Replace ALL existing content (radial gradients + SVG grain) with a thin wrapper that renders only `<CursorParallaxStarfield />` over the canvas:
      ```tsx
      export function LifeOsWallpaper() {
        return (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div className="absolute inset-0" style={{ background: "var(--canvas)" }} />
            <CursorParallaxStarfield />
          </div>
        );
      }
      export default LifeOsWallpaper;
      ```
    - Keep absolute (not fixed) so it stays scoped to the /lifeos `<main>` and never paints over sidebar.
    - Update the JSDoc header to describe the new tonal starfield (atmospheric mood only, no brand accent, reduced-motion safe).

    Do NOT change `apps/web/app/(app)/lifeos/page.tsx` structurally — it already mounts `<LifeOsWallpaper />` under `<main className="relative ...">`. Just confirm `relative` parent + child `absolute inset-0` still works.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | tail -20 && pnpm lint --filter web 2>&1 | tail -5 || true</automated>
    Manual: Navigate to /lifeos in dev. Confirm (a) no warm parchment / paper grain visible, (b) faint tonal dots visible against canvas, (c) moving the cursor shifts the layers subtly, (d) DevTools → emulate `prefers-reduced-motion: reduce` → dots become static.
  </verify>
  <done>
    LifeOsWallpaper renders only canvas + CursorParallaxStarfield. Dots tonal (no cyan / no amber), opacity 8% light / 15% dark. Cursor parallax works via GPU translate3d, no React re-renders during pointermove. Reduced-motion disables parallax. Type-check passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add useSplitScreen hook + SplitScreenToggle + AppShell split layout wiring JarvisConsole</name>
  <files>
    apps/web/lib/shell/use-split-screen.ts (new)
    apps/web/components/shell/SplitScreenToggle.tsx (new)
    apps/web/components/shell/AppShell.tsx (modify — add split layout + dock JarvisConsole)
    apps/web/components/shell/PersistentNav.tsx (modify — mount SplitScreenToggle)
    apps/web/components/jarvis/JarvisConsole.tsx (modify — add optional `variant?: "full" | "docked"` prop)
  </files>
  <action>
    1) Create `apps/web/lib/shell/use-split-screen.ts`:
       - Exports `useSplitScreen()` returning `{ enabled: boolean; toggle: () => void; setEnabled: (v: boolean) => void; isMobile: boolean }`.
       - localStorage key: `hp:split-screen:v1`.
       - On mount: read from localStorage (default `false`); subscribe to a `matchMedia('(min-width: 768px)')` to derive `isMobile = !matches`. When `isMobile`, expose `enabled = false` regardless of storage (do not mutate storage — when user returns to desktop the preference comes back).
       - Bind a global `keydown` listener: when `(navigator.platform.toLowerCase().includes('mac') ? e.metaKey : e.ctrlKey) && e.key === '\\'` and not `isMobile`, call `e.preventDefault()` and toggle.
       - Persist on change via `localStorage.setItem`. Wrap all `window`/`localStorage`/`navigator` access in `typeof window !== 'undefined'` checks (SSR safety).
       - Use a module-level event emitter (tiny custom event on `window` like `'hp:split-screen-change'`) so multiple components calling `useSplitScreen()` stay in sync without lifting state. Pattern: on toggle/setEnabled, write storage + dispatch event; in `useEffect`, listen for the event and re-read.

    2) Create `apps/web/components/shell/SplitScreenToggle.tsx`:
       - `"use client"`. Imports `useSplitScreen`. Uses lucide-react `Columns2` (or `PanelRightOpen` / `PanelRightClose`) icon.
       - Mirrors the visual pattern of the existing "About Kiwi" button in PersistentNav (ghost row, mono-tonal, no cyan glow). Accepts `collapsed: boolean` prop matching the rest of PersistentNav buttons.
       - Hidden entirely when `isMobile` is true.
       - aria-pressed reflects enabled state. Tooltip says `"Toggle split-screen (⌘\\)"` on Mac, `"Toggle split-screen (Ctrl+\\)"` otherwise.

    3) Modify `apps/web/components/jarvis/JarvisConsole.tsx`:
       - Add optional prop `variant?: "full" | "docked"` defaulting to `"full"`. When `"docked"`, the only behavioral change is rendering with `h-full w-full` and slightly tighter outer padding — DO NOT fork the component, do NOT change any logic. If the current root container has fixed sizing tied to a viewport assumption, swap that for `"h-full w-full"` under the docked variant. Minimal, surgical edit.

    4) Modify `apps/web/components/shell/AppShell.tsx`:
       - Convert to a client component (it already is — has `"use client"`).
       - Call `const { enabled, isMobile } = useSplitScreen();` (effective enabled = `enabled && !isMobile`).
       - Change layout: keep `<Sidebar/>` and the inner column. Inside the inner column, after `<TopTabBar/>`, render a flex row that contains:
         - `<main className="flex-1 min-w-0 overflow-auto" style={{ width: effective ? '60%' : '100%' }}>{children}</main>` — with a 200ms `transition-[width]` (or use motion via `motion/react` `<motion.main animate={{ width: ... }} transition={{ duration: 0.2 }}>`).
         - When effective: a vertical divider `<div className="w-px bg-[var(--edge)]" />` + a right pane `<aside className="h-full overflow-hidden" style={{ width: '40%' }}>` containing a docked `<JarvisConsole variant="docked" ... />`.
       - The docked JarvisConsole needs `userTimezone`, `initialProjects`, `initialHashtags`. These are NOT currently passed into AppShell. Add three new optional props to AppShell: `jarvisUserTimezone?: string; jarvisInitialProjects?: ProjectSource[]; jarvisInitialHashtags?: HashtagSource[];` (import types from `@/components/jarvis/JarvisConsole`). When any are undefined and split is effective, render the docked aside with a minimal placeholder: `<div className="p-6 text-sm text-[var(--ink-muted)]">JARVIS unavailable on this route.</div>` (i.e., gracefully degrade — wiring data into AppShell from every route layout is out of scope for this quick).
       - Plumb the three new optional props through wherever `<AppShell>` is rendered ONLY for the `(app)/layout.tsx` server boundary if it currently fetches them. If `(app)/layout.tsx` does not already fetch Jarvis data, leave the placeholder path — do not refactor every route. (User can extend later; locked decision is the persistent toggle, not universal data hydration.)

    5) Modify `apps/web/components/shell/PersistentNav.tsx`:
       - Import `SplitScreenToggle`. Render it just above the "About Kiwi" `KiwiAboutDialog` row, passing `collapsed`.
       - No other layout changes.

    Honor CLAUDE.md: TypeScript strict (no `any`), Tailwind utility classes (no inline styles except dynamic width %), Motion via `motion/react` if used, no neumorphic shadow, no brand accent glow on the toggle.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | tail -30</automated>
    Manual: (1) Press ⌘\\ on /lifeos → route shrinks to 60%, Jarvis appears on right (or placeholder if data not hydrated). (2) Navigate to /tasks → split persists. (3) Full reload → split persists. (4) Resize browser below md → split collapses, toggle hides. (5) Resize back → preference restored. (6) On /today (where Jarvis data is hydrated), docked render shows actual JarvisConsole.
  </verify>
  <done>
    useSplitScreen hook persists to localStorage, syncs across components via window event, exposes ⌘\\ / Ctrl+\\ hotkey, forces off on mobile. SplitScreenToggle visible in PersistentNav above About Kiwi, hidden on mobile. AppShell renders 60/40 split with thin divider and 200ms width transition when enabled. JarvisConsole gains a non-breaking `variant?: "full" | "docked"` prop. Type-check passes.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && pnpm tsc --noEmit` → 0 errors
- `pnpm lint` (or `pnpm biome check`) for changed files → clean
- Visual: /lifeos has no parchment/grain; faint tonal stars present; cursor parallax visible; reduced-motion disables motion
- Functional: ⌘\\ toggles split anywhere in (app); persists across nav + reload; mobile forces off; docked Jarvis renders on /today
- No new client-side errors in console on /lifeos or after toggling split
</verification>

<success_criteria>
- LifeOS background image (warm parchment + SVG grain) is gone; replaced by tonal cursor-parallax starfield (8% light / 15% dark, GPU-only, reduced-motion safe)
- Persistent split-screen toggle works on any route, persists across navigation AND reload, hotkey ⌘\\ / Ctrl+\\ bound, mobile force-off
- JarvisConsole reused as docked panel via single non-breaking `variant` prop (no fork)
- No regression to existing /today JarvisConsole render or LifeOS widget data fetching
- All edited files type-check under strict mode
</success_criteria>

<output>
After completion, create `.planning/quick/260608-uhr-remove-lifeos-background-image-replace-w/260608-uhr-SUMMARY.md` documenting: starfield approach (one-element-many-shadows, rAF throttle), localStorage key + event-bus sync pattern for useSplitScreen, JarvisConsole variant prop semantics, and any AppShell prop additions for downstream route layouts to extend later.
</output>
