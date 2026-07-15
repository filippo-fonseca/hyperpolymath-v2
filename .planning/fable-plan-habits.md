# Unit: unit-habits — /habits to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1 bind you), docs/DESIGN-SYSTEM.md, and the live sd exemplars on this branch: components/lifeos/WidgetCard.tsx + TodayHabitsWidget.tsx (the habits DONUT + row grammar already exist there — match them), components/shell/Sidebar.tsx (row grammar), /design route.

NOTE: .planning/fable-plan-sd3.md in this worktree is ANOTHER unit's inherited seed (orb-sfx) — ignore it. THIS file is your seed.

## Mission
/habits is fully OLD register (Scout A: HabitsClient.tsx = 908 lines, the largest single component in the app; backdrop-blur :71, glass-tile :75 + amber-glow tile :538, 87 old `--ink` token refs; HabitDialog.tsx 257; MiniCalendar). Rebuild the SURFACE styling to Spacedrive: same features, same data flow, new skin. The user singled habits out by name — this page must feel like LifeOS's TodayHabitsWidget grew into a full page.

## Fence
- apps/web/components/habits/** and apps/web/app/(app)/habits/**
- globals.css ADDITIVE only. ui/ primitives are OUT (unit-primitives owns them — consume as-is; dialogs will become sd underneath you).
- lib/ui/sfx.ts exists on your branch: fire `habitCheck` on habit completion per .planning/SFX-WIRING.md. That one call-site wiring is IN fence.

## Register requirements
- Page scaffold: title row per sd grammar (dimensional habits icon 24-28px from components/ui/icons — the bright-ringed donut used in the sidebar/stat strip; 11px uppercase eyebrows; mono stats).
- Habit cards/rows: WidgetCard v2 plate grammar or mini entity-card rows (match TodayHabitsWidget's rows: icon chip + name + hatched progress + streak chip). Kill ALL glass/blur/glow; the amber "streak" tile becomes functional-amber chip accents only, everything else single cyan.
- Progress: hatched progress bars (existing pattern), donut rings where the widget uses them; tabular-nums mono for counts/streaks.
- MiniCalendar: sd-tokenized heatmap-style — `--sd-box` cells, cyan intensity fill, 1px `--sd-line` grid, both themes through tokens (white-alpha literals are dark-only; parchment must resolve).
- HabitDialog: content styling to sd (inputs `--sd-input`, chip pickers, section headers) — the dialog SHELL comes from ui/dialog (don't edit it).
- Motion: check-off micro-interaction (opacity/transform ~140ms, satisfying but zero-jank) + fire sfx.habitCheck. Reduced-motion collapses.
- Beware Tailwind scan gap (§0): reuse emitted utilities/real classes; verify any new arbitrary utility in compiled CSS.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3826: /habits dark+light 1440x900 full page, a habit check-off state, dialog open, MiniCalendar crop both themes. Commit frames under .planning/ with sd3- prefix. Then status=awaiting_review and WAIT.
