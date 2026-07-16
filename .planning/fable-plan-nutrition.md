# Unit: unit-nutrition — /nutrition + /nutrition/stats to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, live sd exemplars on this branch: components/habits/* (just merged — freshest full-page sd reskin, mirror its scaffold grammar), components/lifeos/WidgetCard.tsx, /design.

NOTE: any .planning/fable-plan-sd3.md here is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
/nutrition is the widest OLD surface (Scout A: 37 files, 19 glass offenses, 148 legacy --ink refs; NutritionClient.tsx glass-button toolbar :108/:114; DailyMacroSummary glass-tile :37/:57; ServingPicker glass-button :10/:180; MealSlot, FoodSearch, MealsManagerSheet, NutritionTargetsForm, DayNavigator). Full pass to sd: same features and data flow, new skin.

## Fence
- apps/web/components/nutrition/** and apps/web/app/(app)/nutrition/**
- globals.css ADDITIVE only. ui/ primitives OUT (already sd on your branch — consume; sheet/dialog shells come from ui).

## Register requirements
- Page scaffold: sd title row + dimensional nutrition icon (components/ui/icons), mono eyebrow, segmented day tabs like habits.
- DailyMacroSummary: icon-left stat strip grammar (like LifeOS hero stats) — macro values font-black tabular-nums, 11px uppercase labels, hatched progress toward targets, single cyan + functional amber/red for over/under only.
- MealSlot cards: WidgetCard v2 mini plates; food rows as chip rows (name + qty mono + kcal mono); add-food verb ghost.
- FoodSearch + ServingPicker: `--sd-input` fields, sd list rows (active = bg tint), no glass-button steppers — sd ghost steppers.
- MealsManagerSheet + NutritionTargetsForm: content styling sd (shell from ui/sheet); mono numerics, cyan focus.
- Stats: sd plates, chart strokes via tokens (cyan primary series, 1px --sd-line grids), mono axis labels, both themes.
- DayNavigator: same sd segmented/ghost grammar as journaling's (consistency across features).
- Motion zero-jank; reduced-motion collapses. Tailwind scan gap (§0). Server hygiene §3: kill only tcp:3831.

## Verification
typecheck + build green. Headless (lock protocol) on port 3831: /nutrition dark+light 1440x900, macro strip crop both themes, serving picker open, /nutrition/stats dark. Authed-impossible fallback per §1 (mock-preview route like unit-habits used is sanctioned — delete it after, verify clean tree). Evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
