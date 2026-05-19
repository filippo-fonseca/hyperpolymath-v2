---
phase: 06-polish
plan: 01
subsystem: ui
tags: [next-themes, tailwind-4, neumorphic, dark-mode, typography, design-tokens, jarvis-blue]

# Dependency graph
requires:
  - phase: 06-polish
    provides: 06-UI-SPEC.md design contract (typography 4-size/2-weight, neumorphic shadow tokens, JARVIS-blue agent accent, cursor:pointer universal rule, mode taxonomy)
provides:
  - next-themes 0.4.6 wiring with attribute="class" + storageKey="hyperpolymath-theme" + defaultTheme="system"
  - Tailwind 4 @variant dark declaration paired with .dark class on <html>
  - JetBrains Mono 400 loaded via next/font/google as --font-jetbrains-mono and bound to --font-mono
  - EB Garamond collapsed from 5 weights to 2 (400/600) per UI-SPEC §4b
  - Inter font fully removed from layout
  - Full neumorphic shadow token set in both light and dark themes (surface, button, button-hover, button-active, input, focus-journal, focus-agent)
  - JARVIS-blue agent accent tokens (--color-accent-jarvis, --color-accent-jarvis-glow) in both themes
  - Universal cursor:pointer rule (D-09) covering button, [role=button], a, [data-clickable], label[for], select
  - .agent-glow-passive utility class for static blue glow on agent surfaces
  - ThemeToggle component with two variants (header icon-only + settings 3-button segmented)
  - ThemeToggle mounted in sidebar footer (header variant) and /settings Appearance Card (settings variant)
  - recharts 3.8.1 installed (consumed downstream by 06-04 /insights)
affects: [06-02-resilience, 06-03-jarvis-polish, 06-04-telemetry, 06-05-a11y]

# Tech tracking
tech-stack:
  added: [next-themes@0.4.6, recharts@3.8.1, JetBrains_Mono next/font]
  patterns:
    - "ThemeProvider client wrapper in app/providers.tsx; wrapped at root layout with suppressHydrationWarning on <html>"
    - "Tailwind 4 @variant dark must precede any dark: utility — declared immediately after @import 'tailwindcss'"
    - "Neumorphic depth via box-shadow tokens (light + dark) — no border-radius coupling, no filter:blur"
    - "Mount guard (useEffect setMounted) on next-themes consumers to avoid SSR hydration mismatch"
    - "Agent-mode surfaces use --color-accent-jarvis (#00d4ff) reserved-for-list; never applied to Journal routes"

key-files:
  created:
    - apps/web/app/providers.tsx
    - apps/web/components/shell/ThemeToggle.tsx
    - .planning/phases/06-polish/06-01-SUMMARY.md
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/app/layout.tsx
    - apps/web/app/globals.css
    - apps/web/components/shell/Sidebar.tsx
    - apps/web/app/(app)/settings/page.tsx

key-decisions:
  - "ThemeProvider configured with attribute='class' + defaultTheme='system' + storageKey='hyperpolymath-theme' (D-05/D-06)"
  - "Universal cursor:pointer rule (D-09) lives in globals.css just after body{} block — single global selector list covers native + custom interactive elements"
  - "JARVIS-blue (#00d4ff) hex identical in light + dark themes; only the glow opacity differs (0.15 light, 0.12 dark) per UI-SPEC §2b"
  - "Neumorphic shadow tokens applied via CSS variables (consumed via inline style={{ boxShadow: 'var(--shadow-nm-button)' }}); no Tailwind-class proxy added"
  - "ThemeToggle settings variant uses 3-button segmented control (Light/Dark/System) not a binary swap — preserves user-explicit 'system' choice"

patterns-established:
  - "Design tokens land in @theme {} block when they're a design contract; dark overrides land in .dark {} block (Tailwind 4 idiom)"
  - "Client-only providers wrapper at app/providers.tsx is the canonical home for next-themes (and any future React contexts that must wrap the whole tree)"
  - "Neumorphic depth consumed via CSS var inline style, not Tailwind utility — explicit cross-token references via box-shadow"

requirements-completed: [AES-01, AES-02, AES-06, SET-03]

# Metrics
duration: ~5min
completed: 2026-05-19
---

# Phase 06 Plan 01: Design System Foundation Summary

**Phase 6 design contract locked: next-themes dark mode toggle wired across sidebar + settings, full neumorphic shadow token set + JARVIS-blue agent accent tokens live in both themes, EB Garamond collapsed to 400/600, JetBrains Mono loaded, universal cursor:pointer rule active.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T02:19:28Z
- **Completed:** 2026-05-19T02:24:27Z
- **Tasks:** 4
- **Files modified:** 6 (+ 2 created)

## Accomplishments

- next-themes 0.4.6 wired end-to-end: ThemeProvider in `app/providers.tsx`, `suppressHydrationWarning` on `<html>`, Tailwind 4 `@variant dark` paired with `.dark` class
- Typography contract enforced: EB Garamond reduced from 5 weights (400/500/600/700/800) to 2 weights (400/600) per UI-SPEC §4b; JetBrains Mono 400 loaded as `--font-jetbrains-mono` and bound to `--font-mono`; Inter fully removed from `app/layout.tsx`
- Full neumorphic shadow token set defined in both light and dark themes — `--shadow-nm-surface`, `--shadow-nm-button`, `--shadow-nm-button-hover`, `--shadow-nm-button-active`, `--shadow-nm-input`, `--shadow-nm-focus-journal`, `--shadow-nm-focus-agent` (D-07)
- JARVIS-blue agent accent tokens (`--color-accent-jarvis: #00d4ff`, `--color-accent-jarvis-glow`) live in both themes plus `.agent-glow-passive` utility (D-08)
- Universal cursor:pointer rule (D-09) covers `button`, `[role="button"]`, `a`, `[data-clickable]`, `label[for]`, `select`, `.cursor-pointer-always`
- ThemeToggle component with two variants (header icon-only + settings 3-button segmented control) mounted in sidebar footer and /settings Appearance Card
- Production build succeeds; typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + JetBrains Mono + Inter removal** — `6686379` (feat)
2. **Task 2: Providers + ThemeToggle** — `a6ba541` (feat)
3. **Task 3: globals.css token contract** — `2e72d82` (feat)
4. **Task 4: Mount ThemeToggle in Sidebar + Settings** — `0839cfa` (feat)

## Files Created/Modified

**Created:**
- `apps/web/app/providers.tsx` — Client-only `<Providers>` wrapper exporting `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `storageKey="hyperpolymath-theme"`
- `apps/web/components/shell/ThemeToggle.tsx` — Two-variant theme toggle (`header` icon-only, `settings` 3-button segmented) with `useEffect` mount guard to prevent SSR hydration mismatch

**Modified:**
- `apps/web/package.json` + `pnpm-lock.yaml` — Added `next-themes@0.4.6` + `recharts@3.8.1` (recharts pre-installed during Wave 1 for consumption by 06-04 /insights)
- `apps/web/app/layout.tsx` — Replaced Inter with JetBrains Mono; collapsed EB Garamond weights to `["400", "600"]`; added `suppressHydrationWarning` on `<html>`; wrapped `<body>` children with `<Providers>`
- `apps/web/app/globals.css` — Added `@variant dark` after `@import "tailwindcss"`; bound `--font-mono` to `var(--font-jetbrains-mono)`; added JARVIS-blue + 7 neumorphic shadow tokens to `@theme` (light); mirrored all 9 tokens inside `.dark {}` (dark theme); inserted universal `cursor: pointer` rule after `body {}`; appended `.agent-glow-passive` utility at end
- `apps/web/components/shell/Sidebar.tsx` — Imported and mounted `<ThemeToggle variant="header" />` in footer container; renders correctly in both collapsed (justify-center) and expanded (justify-start) states
- `apps/web/app/(app)/settings/page.tsx` — Imported `<ThemeToggle variant="settings" />` and added a new Appearance section between Graduation year and Integrations cards; Appearance Card uses `boxShadow: var(--shadow-nm-surface)` with `border: none` override

## Tokens Added to globals.css (Full List)

**Light theme (@theme block):**
- `--color-accent-jarvis: #00d4ff`
- `--color-accent-jarvis-glow: rgba(0, 212, 255, 0.15)`
- `--shadow-nm-surface: 4px 4px 10px hsl(38 20% 86%), -4px -4px 10px hsl(0 0% 100%)`
- `--shadow-nm-button: 3px 3px 8px hsl(38 20% 86%), -3px -3px 8px hsl(0 0% 100%)`
- `--shadow-nm-button-hover: 5px 5px 12px hsl(38 20% 84%), -5px -5px 12px hsl(0 0% 100%)`
- `--shadow-nm-button-active: inset 2px 2px 6px hsl(38 20% 86%), inset -2px -2px 6px hsl(0 0% 100%)`
- `--shadow-nm-input: inset 2px 2px 6px hsl(38 20% 88%), inset -2px -2px 6px hsl(0 0% 100%)`
- `--shadow-nm-focus-journal: 0 0 0 2px hsl(42 18% 97%), 0 0 0 4px hsl(38 72% 52%)`
- `--shadow-nm-focus-agent: 0 0 0 2px hsl(42 18% 97%), 0 0 0 4px #00d4ff`

**Dark theme (.dark block):**
- `--color-accent-jarvis: #00d4ff`
- `--color-accent-jarvis-glow: rgba(0, 212, 255, 0.12)` (slightly more transparent on dark)
- `--shadow-nm-surface: 4px 4px 10px hsl(30 8% 7%), -4px -4px 10px hsl(30 8% 16%)`
- `--shadow-nm-button: 3px 3px 8px hsl(30 8% 7%), -3px -3px 8px hsl(30 8% 16%)`
- `--shadow-nm-button-hover: 5px 5px 12px hsl(30 8% 6%), -5px -5px 12px hsl(30 8% 18%)`
- `--shadow-nm-button-active: inset 2px 2px 6px hsl(30 8% 7%), inset -2px -2px 6px hsl(30 8% 16%)`
- `--shadow-nm-input: inset 2px 2px 6px hsl(30 8% 7%), inset -2px -2px 6px hsl(30 8% 16%)`
- `--shadow-nm-focus-journal: 0 0 0 2px hsl(30 8% 10%), 0 0 0 4px hsl(38 65% 58%)`
- `--shadow-nm-focus-agent: 0 0 0 2px hsl(30 8% 10%), 0 0 0 4px #00d4ff`

**Global rules:**
- `@variant dark (&:where(.dark, .dark *));` (immediately after `@import "tailwindcss"`)
- Universal `cursor: pointer` rule on `button, [role="button"], a, [data-clickable], label[for], select, .cursor-pointer-always`
- `.agent-glow-passive { box-shadow: 0 0 12px 2px rgba(0, 212, 255, 0.08); }`

## ThemeProvider Configuration

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  storageKey="hyperpolymath-theme"
>
```

- `attribute="class"`: toggles `.dark` class on `<html>` (required for Tailwind 4 `@variant dark`)
- `defaultTheme="system"`: first load follows OS preference (D-05)
- `enableSystem`: enables the "system" preset surface and OS-change tracking
- `storageKey="hyperpolymath-theme"`: localStorage key for persisted explicit choice (overrides system once toggled)

## ThemeToggle Anchor Locations

| Anchor | Variant | File | Notes |
|---|---|---|---|
| Sidebar footer | `header` (icon-only, binary swap) | `apps/web/components/shell/Sidebar.tsx` | Renders even when sidebar is collapsed (36px icon fits 16-wide rail). Uses `--shadow-nm-button` resting; transitions via `transition-shadow`. |
| /settings → Appearance section | `settings` (3-button Light/Dark/System segmented) | `apps/web/app/(app)/settings/page.tsx` | Card wrapper uses `--shadow-nm-surface` with explicit `border: none` override. Active button uses `--shadow-nm-button-active` (inset). |

## Decisions Made

- **next-themes attribute="class" (not "data-theme")** — Tailwind 4's `@variant dark (&:where(.dark, .dark *))` activates from `.dark` class. Using `data-theme` would require a different variant declaration and break the dark: utility flow.
- **defaultTheme="system" with enableSystem=true** — Honors D-05 ("first page load follows system, toggle persists"). The 3-button settings segmented control keeps "system" reachable for users who want to revert from an explicit pick.
- **JARVIS-blue same hex in both themes** — Per UI-SPEC §2b: electric blue reads equally on parchment and near-black. Only the glow alpha differs (0.15 → 0.12 on dark) to compensate for already-luminous dark surface.
- **Neumorphic tokens consumed via inline `style={{ boxShadow: 'var(--shadow-nm-...)' }}`** — No Tailwind utility proxy added. The tokens are first-class CSS variables; inline style is the lowest-friction path and matches the Tailwind 4 "CSS-first" philosophy.
- **ThemeToggle mount guard returns dimension-matched placeholder** — `h-9 w-9` for header, `h-9 w-32` for settings — prevents both hydration mismatch and layout shift while waiting for `useEffect` to run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance criteria correction] Plan acceptance criterion overcounted `shadow-nm-button` occurrences**
- **Found during:** Task 3 (globals.css extension)
- **Issue:** Acceptance criterion stated `grep -c "shadow-nm-button" returns at least 8 (button + hover + active across light + dark)`. Actual canonical UI-SPEC §3a + §3b specifies exactly 3 button-related tokens (`--shadow-nm-button`, `--shadow-nm-button-hover`, `--shadow-nm-button-active`) × 2 themes (light + dark) = 6 occurrences total. The "8" target is unreachable without adding non-spec'd duplicates.
- **Fix:** Followed the UI-SPEC §3a/§3b token list exactly (6 occurrences). Plan acceptance criterion treated as miscalibrated; canonical UI-SPEC is the source of truth.
- **Files modified:** `apps/web/app/globals.css` (canonical 6 button-token occurrences across light + dark blocks)
- **Verification:** `grep -n "shadow-nm-button" apps/web/app/globals.css` returns 6 distinct lines matching exactly the UI-SPEC §3 specification
- **Committed in:** `2e72d82` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (acceptance criterion miscount; canonical spec preserved)
**Impact on plan:** Zero functional impact — UI-SPEC is followed exactly. All token names, values, and theme overrides match §3a + §3b verbatim. The miscalibrated criterion targeted a count higher than the spec itself defines.

## Issues Encountered

None — all four tasks executed cleanly. Typecheck passed after every code-changing task; production build succeeded after Task 4.

## Self-Check: PASSED

All 3 created files exist on disk. All 6 modified files exist on disk. All 4 task commit hashes (`6686379`, `a6ba541`, `2e72d82`, `0839cfa`) verified present in `git log --oneline --all`.

## Open Items Downstream

- **Neumorphic shadow tokens are DEFINED but only consumed so far by `ThemeToggle`.** Plans 06-02 (resilience), 06-03 (JARVIS polish), and 06-05 (a11y sweep) will apply them to receipt panels (`JarvisReceipt`), `error.tsx` buttons, JARVIS Console input field, settings tile Cards (Account, Graduation year, Integrations, JARVIS Memory), and `/insights` chart panel wrappers.
- **Universal `cursor:pointer` rule covers all native interactive elements globally.** Per-element audit (UI-SPEC §10 checklist of 19 specific elements — kanban cards, task rows, capture items, hashtag chips, calendar event tiles, slash command items, etc.) ships in 06-05.
- **`recharts@3.8.1` pre-installed** for /insights (06-04). No imports yet — bundle impact deferred until 06-04 starts consuming it.
- **JARVIS-blue contrast caveat:** UI-SPEC §11b notes `#00d4ff` may fail 3:1 contrast on parchment light-mode backgrounds. 06-05 a11y sweep will verify each agent surface in light mode and substitute `#009bb5` (UI-SPEC light-mode safe alternative) at any location that fails.
- **AES-04 (brand voice copy) and AES-05** are NOT covered by this plan — empty-state and error-page copy ships in 06-02; voice/copy audit closes the loop.
- **AES-03 (motion baseline)** — `motion/react` is already installed; this plan didn't add `app/(app)/template.tsx` page transition or the `prefers-reduced-motion` global CSS block. Both ship in 06-03 (JARVIS polish) or 06-05 (a11y sweep) per UI-SPEC §6.

## User Setup Required

None — no external service configuration required. Theme toggle is fully client-side; localStorage handles persistence.

## Next Phase Readiness

- **All Phase 6 design tokens live and ready to consume.** 06-02 (resilience surfaces — `error.tsx`, empty states, brand voice) can immediately reference `--shadow-nm-button`, `--shadow-nm-button-active`, `--shadow-nm-surface` for the "Copy error report" + "Reload page" CTAs and the EmptyState component.
- **Dark mode is the bedrock for every downstream visual change.** 06-03 (JARVIS polish — queued shimmer, streaming caret, scan-reveal wipe) consumes `--color-accent-jarvis` and `--shadow-nm-focus-agent` already in place.
- **06-04 (telemetry /insights)** has `recharts@3.8.1` pre-installed and `.agent-glow-passive` utility ready for chart panel wrappers.
- **No blockers.** Production build green; typecheck clean.

---
*Phase: 06-polish*
*Completed: 2026-05-19*
