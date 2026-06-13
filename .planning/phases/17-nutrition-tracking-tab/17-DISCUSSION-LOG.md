# Phase 17: Nutrition tracking tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 17-nutrition-tracking-tab
**Areas discussed:** Food database & search UX, Serving & quantity model, Logging flow, Targets scope, Stats & heat map, Glassy treatment extent

---

## Food database & search UX

| Option | Description | Selected |
|--------|-------------|----------|
| Open Food Facts | Huge, free, barcode-friendly, messier data | ✓ |
| USDA FoodData Central | Clean, US-centric, generic foods | |
| Both | USDA for whole foods, OFF for branded | |

**User's choice:** Open Food Facts ("open food facts is fine")
**Notes:** User also requested a GitHub issue for a mobile barcode scanner → created as issue #24.

## Serving & quantity model

| Option | Description | Selected |
|--------|-------------|----------|
| Grams-only | Simple, precise | |
| Native servings | "1 medium pineapple" with gram conversion | |
| Both | Base grams/ml + product serving units with quantity multiplier | ✓ |

**User's choice:** Both — grams final for food, ml for liquids; product serving sizes selectable with quantities of that unit, "like MyFitnessPal"

## Logging flow

| Option | Description | Selected |
|--------|-------------|----------|
| Per-meal inline "+ add" | MFP-style, under each slot | |
| Global quick-add composer | One bar with meal picker | |
| Both | Shared search surface, two entry points | ✓ |

**User's choice:** Both

## Targets scope

| Option | Description | Selected |
|--------|-------------|----------|
| One global target set | Calories + protein/carb/fat % in settings | ✓ |
| Variable targets | Per-day-of-week / training-vs-rest variants | |

**User's choice:** One global set for now

## Stats & heat map

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-style year grid | Contribution-style heat map | ✓ |
| Month view | Calendar-style | |

**User's choice:** GitHub-style; remaining stats delegated — "other stats idk u figure it out"

## Glassy treatment extent

**User's choice:** Glassy/neumorphic like the settings menu pill bar, but keeping the app's established look. "look at setting menu bar for what i mean by glassy. but keep our look yeah. but neumorphic"

## Claude's Discretion

- Stats beyond the heat map; heat map cell encoding
- Recents vs frequents ordering; copy-yesterday / duplicate-meal shortcuts
- Storing extra nutrients (fiber/sugar/sodium) from OFF data

## Deferred Ideas

- Mobile barcode scanner → GitHub issue #24
- JARVIS nutrition tools (needs explicit confirmation before building)
- Variable/periodized targets
