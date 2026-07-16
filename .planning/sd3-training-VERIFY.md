# sd3-training — verification evidence

Unit: `unit-training` · run `sesh-sd3-allfeatures` · branch `sd3/unit-training`
Seed: `.planning/fable-plan-training.md` · Contract: `specs/UI-CONTRACT-SD3.md` (§0/§1) + `docs/DESIGN-SYSTEM.md`

## Scope delivered
Full sd-register pass over `/training` + `/training/stats` — same features and data
flow, sd skin. Fence: `apps/web/components/training/**` + `apps/web/app/(app)/training/**`.
No globals.css edits (all needed utilities/classes already shipped). `components/ui/`
primitives consumed, never edited.

### Commits
- `3d33c764` sd3(training): stats surfaces to the sd register
- `b05fc3c9` sd3(training): planner surfaces to the sd register
- `46f05f30` sd3(training): dialog + editor content to the sd register

### What changed (register)
- **Stats plates** (AdherenceCard, DurationTrendChart, BatchTotalsTable,
  TrainingStatsClient): `glass-tile`/backdrop-blur → the shipped `.sd-panel`
  primitive. Chart strokes/fills + heatmap labels resolve through sd tokens in both
  themes (cyan primary series via `--sd-accent`, ink-dull grids/hairlines via
  `--sd-line`). Numerics stay mono `tabular-nums`; 11px uppercase eyebrows.
- **Zero-jank fixes (§14/§16)**: AdherenceCard bar `transition-[width]` →
  `scaleX` transform (reduced-motion guarded); DurationTrendChart bars
  `transition-[height]` → static layout + colour-only hover; TrainingHeatmap cell
  `hover:scale-[1.4]`/shadow → instant `box-shadow` outline + `focus-visible`
  accent ring. No hover-scale anywhere in the fence.
- **Planner**: PlannerHeader + stats page gain an sd title row (dimensional
  `TrainingIcon` + mono eyebrow + Space Grotesk title); adherence → sd status pill.
  ActivityCard → mini entity-card plate (`--sd-box`, hairline, dark-only inset,
  hover-border-only); done rides cyan, delete goes coral. Day columns, inline
  composer, month grid all tokenized both themes; today marker + drop highlight use
  `--sd-accent`.
- **Dialogs/editors**: every body token-mapped onto `--sd-*`; dead `font-serif`
  dropped (Space Grotesk); `--danger` → `--ink-coral`; `--edge-hud` hover borders →
  `--sd-accent`. Dialog/sheet shells consumed from `components/ui/*`, untouched.

## Gates

### typecheck — GREEN
`pnpm --filter web typecheck` → `tsc --noEmit`, 0 errors. (Ran `pnpm install`
first; the worktree shipped without node_modules.)

### build — GREEN
`pnpm --filter web build` → exit 0. Both `/training` and `/training/stats`
present in the route manifest (ƒ dynamic).

### Token audit (§0) — 0 banned, 0 legacy
Across the full fence (`apps/web/components/training/**` +
`apps/web/app/(app)/training/**`):
- Banned classes (`glass-tile|glass-button|lifeos-glass|backdrop-blur|shadow-glow|
  bg-gradient|font-serif|hover:scale|transition-[width]|transition-[height]`): **0**
- Legacy tokens (`--ink|--ink-muted|--edge|--edge-hud|--surface|--surface-2|
  --surface-raised|--bg|--canvas|--hud-cyan|--danger`): **0**
- Straggler sweep: every `var(--…)` in the fence is `--sd-*` or a sanctioned
  functional ink (`--ink-coral/-amber/-sage/-violet/-blue`).

### Compiled-CSS proof (§0 Tailwind scan gap)
Grepped the built CSS chunks (`apps/web/.next/static/chunks/*.css`) — every
utility/class introduced in this unit is emitted:
- Real classes: `.sd-panel`, `.sd-progress`, `.sd-progress-fill`,
  `.sd-progress-hatched` — EMITTED.
- Novel arbitrary utilities: `color-mix(... var(--sd-accent) 70% ...)`,
  `color-mix(... var(--sd-line) 60% ...)`, `color-mix(... var(--sd-ink) 18% ...)`,
  `box-shadow:0 0 0 1px var(--sd-ink)`, `box-shadow:0 0 0 2px var(--sd-accent)` —
  EMITTED.
- Token utilities: `var(--sd-box|--sd-input|--sd-hover|--sd-selected|--sd-accent)`,
  `var(--ink-coral)` — EMITTED.

## Browser verification — auth-blocked in this env (documented fallback)
`/training` and `/training/stats` are behind `requireOnboarded()` → `getClaims()`
(no dev-auth bypass exists in `lib/auth/get-user.ts`). This headless env has no
Supabase session, so an authed pixel-capture of the surfaces is not possible here.
Per UI-CONTRACT §1 + the seed's explicit fallback, I ran the token-audit + compiled-
CSS proof above in lieu of authed frames. The dev server boots clean on port 3827;
smoke test (node fetch, redirect:manual): `GET /training → 307 → /sign-in` and
`GET /training/stats → 307 → /sign-in` (clean auth redirect, no 500 / no compile
error in the dev log). Dev server was then killed by port only (`kill $(lsof -ti
tcp:3827)`). The global browser lock was held by another live unit throughout; I
did not acquire or reclaim it (no headed capture attempted).
**The Conductor pixel-verifies the authed surfaces in both themes on :3000 post-merge.**

Status → `awaiting_review`.
