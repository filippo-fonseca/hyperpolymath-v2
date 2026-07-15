# Unit: unit-sidebar-fixes — sidebar bug trio + dropdown removal [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1 law binds you) and docs/DESIGN-SYSTEM.md.

## Mission
Fix the three user-reported sidebar defects and remove the workspace dropdown. Scout forensics (verified, trust it): two bugs share one root cause — Tailwind does not emit arbitrary utilities that appear ONLY in shell files (`bg-[var(--sd-sidebar)]` and `.font-logotype` are absent from compiled CSS).

## Fence
- apps/web/components/shell/Sidebar.tsx
- apps/web/components/ui/Logotype.tsx
- apps/web/app/globals.css (ADDITIVE only: real CSS classes if needed)
- tailwind/css config ONLY if you find + fix the scan-gap root cause cheaply
- NOTHING else. PersistentNav/TopTabBar/AppShell are out unless a one-line import fix demands it (log the assumption).

## Work
1. BUG 2 (transparent overlay): `SIDEBAR_SURFACE` at Sidebar.tsx:66 uses `bg-[var(--sd-sidebar)]` which is never emitted → panel transparent. Fix by real CSS class in globals.css (e.g. `.sd-sidebar-surface { background: var(--sd-sidebar); }`) or inline style. Investigate WHY Tailwind misses shell-only tokens (content globs / @source in the Tailwind 4 CSS config); root-fix if it's a one-liner, else document in notes.
2. BUG 1 (collapse trap): `effectiveCollapsed = collapsed && !hovered` gates the WorkspacePill variant (Sidebar.tsx:130, :203), so hover mutates the control and the Radix dropdown unmounts itself on mouseleave (portal outside the sidebar rect). Fix: DELETE the dropdown entirely (sealed decision §2). Replace with: plain wordmark (no chevron, no menu, not a button that collapses) + a dedicated ALWAYS-MOUNTED collapse icon-button (lucide PanelLeftClose/PanelLeftOpen, 16px, ghost style per sd row grammar) beside the wordmark. Gate any variant rendering on the REAL `collapsed`, never on hover. Hover-peek of a collapsed sidebar may remain, but controls must not change identity under the pointer. Verify the full cycle: collapse → rail → re-expand works first click, state persists across refresh.
3. Wordmark font: Logotype.tsx:20 uses `font-logotype` (inert — never emitted). Add `fontFamily: "var(--font-logotype)"` to its existing style block so EB Garamond ALWAYS applies. Confirm the sidebar wordmark + collapsed monogram render EB Garamond in computed styles.
4. While in the file: keep the cyan status dot if it looks right without the pill chrome; kill anything that still reads "workspace switcher".

## Verification (floor per §1)
typecheck + build green; headless captures (lock protocol!) on your port: expanded dark+light, collapsed rail, hover-peek, post-refresh (hard reload — the transparency repro), computed background + fontFamily assertions in notes. Commit frames under .planning/. Then status=awaiting_review and WAIT.
