# unit-calendar — verification report (sd3-allfeatures)

**VERDICT: PASS (gates green) — status=awaiting_review.** /calendar moved fully to
the Spacedrive register across all 8 surfaces; data/gcal logic untouched. Authed
`/calendar` capture is impossible from this lane (no dev-auth bypass; route
307→/sign-in), so per UI-CONTRACT-SD3 §1 this report ships the sanctioned
token-audit + compiled-CSS + boot-clean fallback. **Conductor pixel-verifies the
authed surfaces on :3000 post-merge.**

## Gates
- `pnpm --filter web typecheck` — GREEN (tsc --noEmit, exit 0).
- `pnpm --filter web build` — GREEN (✓ Compiled successfully in 20.7s; 38/38 static
  pages incl. /calendar). NOTE: build requires network for `next/font/google`
  (space_grotesk/jetbrains_mono); in-sandbox it fails at font fetch (env-only, root
  layout, outside fence), passes with egress.
- Boot — CLEAN. Dev server on :3829 ready in 317ms; `/` 200; `/calendar` 307→/sign-in
  (correct auth gate). Console log from capture: only React DevTools notice + HMR
  connected + Vercel Analytics debug. ZERO errors/warnings.

## Register audit (fence: apps/web/components/calendar/** + app/(app)/calendar/**)
- BANS clear inside fence: `grep font-serif` → none; `glass-tile`/`glass-button`/
  `backdrop-blur` → none; `hud-cyan` → none.
- Tailwind scan gap (§0): calendar uses ZERO arbitrary bracket utilities
  (`bg-[…]`/`border-[…]`/`ring-[…]` count = 0). All sd tokens routed through inline
  `style={{}}` var lookups, so the scan gap is sidestepped entirely, not merely
  avoided.
- Compiled-CSS proof: every `--sd-*` token the calendar consumes (box, line, ink,
  ink-dull, ink-faint, accent, input, hover, app, selected) is defined in the built
  CSS chunk. Both themes resolve through tokens — dark `.dark` bg = near-black indigo
  (lab 3.05), light `.light` bg = warm parchment (lab 96.5), verified live via
  computed style flip.

## What shipped (8 atomic commits, this unit)
- `30a0e152` feat: local dimensional `CalendarIcon` consuming the shared
  `DimensionalSvg`/`BodyGradient`/`SheenGradient` recipe (no fence violation — ui/icons
  belongs to unit-primitives; this is a local consumer). Accent only in drop-target
  frame, indigo+white body per recipe.
- `e4783aac` CalendarClient header → sd title row + eyebrow + dimensional icon + mono
  count; toolbar off glass-tile onto `--sd-box`; New-event → sd accent-ghost; dropped
  inline `--hud-cyan` for `--sd-accent`.
- `2d689876` DayWeekToggle → sd tokens + mono date label.
- `d0a57cac` CalendarFilters → sd register, dropped glass-button/glass-tile popover.
- `91dbbd77` CalendarGrid → `--sd-box` cells on 1px `--sd-line` grid; today = 1px cyan
  ring; chip grammar `--sd-input` + hairline + calendar-source color on leading dot
  ONLY (surfaces stay sd); no serif; now-line deglowed (crisp 1px cyan bar+dot, no
  shadow-glow).
- `df093aa2` EventDetailPanel → solid `--sd-box` plate; no serif; mono time/tz;
  functional pill for recurring status.
- `a82abfcb` DisconnectBanner (sd tokens, coral functional edge kept) + EmptyState
  (calm sd empty grammar, faint dimensional icon + ink-dull line).
- `3cc11f64` docs: recorded the sd3 seed plan.

Data/gcal flow untouched (events live in Google Calendar exclusively) — confirmed by
diff scope: only the 8 calendar view/skin files changed.

## Fence integrity
`git diff --name-only 15fb7059..HEAD` outside `calendar/` + `.planning/` → NONE.
globals.css NOT touched. ui/ primitives consumed, not edited.

## Evidence (under .planning/, sd3- prefix)
- `sd3-calendar-fallback-signin-dark.png` — boot-clean fallback, dark tokens (1440×900).
- `sd3-calendar-fallback-signin-light.png` — boot-clean fallback, light tokens (1440×900).
- (authed /calendar month/week grid, chip crop, detail panel, filters row → Conductor
  on :3000; this lane cannot authenticate Google OAuth.)

## Assumptions carried (see control file)
Seed = fable-plan-calendar.md; no month view exists in this codebase (hand-rolled
day/3day/week time-grid) so none added — features preserved; chip source-color tints
the leading dot only under the single-cyan-accent law; now-line deglowed per §0.

## Next
WAIT for Conductor. Do not merge/PR/alter production branch.
