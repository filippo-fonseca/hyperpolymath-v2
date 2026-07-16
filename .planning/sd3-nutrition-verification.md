# unit-nutrition — sd3 verification

`/nutrition` + `/nutrition/stats` brought fully to the Spacedrive register.

## Gates (both green)
- `pnpm --filter web typecheck` → `tsc --noEmit` exit **0**, zero errors (the earlier
  "Cannot find module" cascade was purely the worktree lacking `node_modules`;
  resolved after `pnpm install --frozen-lockfile`).
- `pnpm --filter web build` → exit **0**; `/nutrition` and `/nutrition/stats` both
  compiled as dynamic (ƒ) routes. Clean boot on the dev server (Ready in ~0.4s).

## Fence sweep
Zero remaining register offenders across `components/nutrition/**` +
`app/(app)/nutrition/**` (`glass-tile`/`glass-button`/`lifeos-glass`/`backdrop-blur`/
`font-serif`/`shadow-glow`/`hover:scale`/`--ink`/`--ink-muted`/`--ink-sage`/`--surface*`/
`--edge`/`--hud-*`/`--ring-hud`/`--ring-doc`). Only `--ink-coral`/`--ink-amber` remain,
which are the sanctioned functional tokens (also used by the sd Button/Input primitives).

## Frames (headless, 1440×900, global browser lock held only during capture)
- `sd3-nutrition-day-dark.png` / `sd3-nutrition-day-light.png` — full day view, both
  themes: sd title row (dimensional NutritionIcon + mono "FUEL · MACROS" eyebrow +
  "Nutrition." with cyan period), ghost DayNavigator + Meals/Stats verbs, sticky macro
  stat strip, segmented meal tabs, WidgetCard-v2 meal plate with chip food rows + ghost
  ADD FOOD verb.
- `sd3-nutrition-macrostrip-dark.png` / `sd3-nutrition-macrostrip-light.png` — macro
  strip crop, both themes: mono CALORIES eyebrow, font-black tabular-nums readout,
  remaining/over counter, hatched-cyan progress toward P/C/F targets.
- `sd3-nutrition-serving-dark.png` — ServingPicker open: sans food name (no serif),
  sd Select + sd Input fields, mono live macro preview, accent cyan LOG + ghost CANCEL
  Buttons.
- `sd3-nutrition-stats-dark.png` — `/nutrition/stats`: mono section labels, WidgetCard
  plates, heat map cyan ramp (--sd-hover → --sd-accent), MacroTrendChart cyan primary
  series (protein) + functional amber/coral (carbs/fat) + 1px --sd-line grid + mono
  axes, PersonalBests strip (mono labels, tabular font-mono-stats values).

## Auth fallback (per UI-CONTRACT-SD3 §1)
Both surfaces are auth-gated (`requireOnboarded()` + the `(app)` layout
`getUserOrRedirect` gate), so they can't be screenshotted headless without a session.
Per §1 the sanctioned fallback (same as unit-habits) was used: a temporary
`app/nutrition-preview/page.tsx` rendered the presentational nutrition components with
mock data, wrapped in the real `QueryProvider`, theme driven by the `.dark`-class
wrapper. **The route was deleted after capture; the working tree is clean.** The
Conductor pixel-verifies the authed surfaces on :3000 post-merge.

## Note
The small "N" ring at the bottom-left of full-frame shots is the Next.js dev-tools
button (dev-only overlay), not part of the nutrition UI.
