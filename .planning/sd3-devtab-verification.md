# unit-devtab — verification note (sesh-sd3-allfeatures)

**Status:** awaiting_review
**Branch:** `sd3/unit-devtab`
**Scale:** feature · **Port:** 3834

## Mission
Full sd-register REBUILD of the DEV/insights tab (the Kiwi auto-dev pipeline
console: captures→issues→PR flow, Anthropic/Claude spend, manual triggers) — not
a reskin. Densest mono register in the app (jarvis-adjacent): mono tables,
functional state pills, hairline plates.

## Fence (every file touched)
- `apps/web/components/insights/development/dev-chrome.tsx` — NEW. Local console
  primitives: `DevPanel` (widget-card v2 plate, §9, dark inset hairline),
  `Eyebrow` (11px uppercase mono), `DevPanelHeader`, `StatReadout` (font-black
  tabular-nums), `StatePill` (functional cyan/coral/idle), `DevEmpty`, and
  `CHART` (var-based recharts tokens).
- `apps/web/components/insights/DevelopmentTabPanel.tsx` — rebuilt: console header
  stat strip + **mono pipeline ledger** (see layout decision).
- `apps/web/components/insights/development/AnthropicApiPanel.tsx` — replated;
  var-based chart (cyan primary spend series); calm known-inert empty state.
- `apps/web/components/insights/development/ClaudeSubscriptionPanel.tsx` — replated;
  cyan usage bars.
- `apps/web/components/insights/development/ManualTriggerPanel.tsx` — replated;
  cyan-hover "RUN NOW" ghost buttons, functional ok/err readout pill.
- `apps/web/components/insights/life/ClaudeCodePanel.tsx` — DEV-EXCLUSIVE (only
  DevelopmentTabPanel imports it; LifeTabPanel dropped it) so it is inside the
  functional DEV fence though it lives under `life/`. Replated; var-based chart
  (amber functional series to read distinct from the cyan API spend).

globals.css UNTOUCHED (existing `--sd-*` tokens sufficient). No `components/ui/`
edits. No other unit's surface touched.

## Layout decision (justification, one line)
The pipeline is a **mono ledger table**, not stage columns: `DevRun[] →
DevRunItem[]` is a time-ordered per-issue outcome log (status / #issue / title /
PR link), not live WIP flowing between stages, so a CI-log-style ledger shows the
real captures→issue→PR provenance without the emptiness of mostly-idle kanban
columns. State pills: done = cyan, skipped = idle grey, failed/timed-out = coral.

## Register compliance
- sd plate grid (WidgetCard v2), 11px uppercase mono eyebrows, font-black
  tabular-nums stat readouts, hairline separators — all present.
- Single cyan accent (`--sd-accent`) + functional amber/coral only. No
  glass/blur/serif/gradient/glow. Motion: guarded stagger entrance on run groups
  (opacity/transform, 160ms, `useReducedMotion` collapses).
- Charts: cyan primary series (Anthropic spend, subscription), amber Claude Code
  series, `var(--sd-*)` grid/axis + mono axis labels — nutrition exemplar.
- **Both-theme fix:** charts now resolve `var(--sd-*)` (recharts reads them as SVG
  presentation attributes; proven by the shipped nutrition MacroTrendChart),
  retiring the old light-only hex literals (`#22b8cf`/`#d4cfc4`/`#7c7669`) that
  mis-rendered identically in dark. Verified per-theme in the screenshots.
- Tailwind scan gap (§0): avoided opacity-on-arbitrary-var and `calc()` arbitrary
  utilities; used tokens/standard breakpoints. Verified visually in compiled CSS.

## Gates
- `pnpm --filter web typecheck` → **exit 0, 0 TS errors** (clean tree).
- `pnpm --filter web build` → **green**: "Compiled successfully", 38/38 static
  pages, `/insights` route present.
  - Note: env files (`apps/web/.env`, `.env.local`) were not propagated into the
    fresh worktree (only `.example` stubs). Copied them from the sd-restyle repo
    root per BGSD env.propagate; both remain gitignored (`git check-ignore`
    confirms) and never staged.

## Evidence (both themes, 1440-wide)
- `.planning/evidence/sd3-devtab-light.png` — full DEV tab, light (warm parchment).
- `.planning/evidence/sd3-devtab-dark.png` — full DEV tab, dark (indigo ladder).
- `.planning/evidence/sd3-devtab-ledger-crop-dark.png` — pipeline ledger crop.

## Verification method (§1 fallback)
The real DEV tab is owner-gated (auth + `GITHUB_ISSUE_USER_EMAIL === user.email`),
so per §1 a sanctioned THROWAWAY preview route (`app/devtab-preview/page.tsx`)
rendered `DevelopmentTabPanel` with seed data (all four item statuses, PR/branch
links, healthy spend + subscription + Claude Code series) for both-theme headless
capture on :3834, then **deleted**. Tree is clean (only the intended fence files
committed; preview + env untracked/removed). Browser: headless, lock protocol
honored (reclaimed a >15min stale lock whose owner PID was dead), released
immediately after capture. Server on :3834 stopped by port only.

## Assumptions / notes for Conductor
- `tile-style.ts` was already migrated to a flat sd plate during sd2; Scout A's
  report reflects the pre-sd2 state. Left untouched (shared across life/habits/
  jarvis insights).
- The Anthropic admin-key panel stays intentionally inert until a real admin key
  is set; its empty state is styled calmly ("Admin key not connected → Settings"),
  not removed.
- Conductor should pixel-verify the authed DEV tab on :3000 post-merge (owner
  session) since the preview used seed data.
