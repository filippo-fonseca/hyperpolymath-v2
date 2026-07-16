# Unit: unit-training — /training + /training/stats to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1 bind you), docs/DESIGN-SYSTEM.md, and live sd exemplars on this branch: components/lifeos/WidgetCard.tsx + TodayTrainingWidget.tsx (training row/hatched-progress grammar exists there — match it), components/tasks/* (list/kanban register), /design.

NOTE: any .planning/fable-plan-sd3.md in this worktree is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
/training was never sd-tokenized (Scout A: zero `--sd-` in ~4900 dir lines; neutral-but-off-register; stats cards each carry glass/backdrop-blur: stats/AdherenceCard.tsx:15, DurationTrendChart.tsx:29, BatchTotalsTable.tsx:26, TrainingStatsClient.tsx:43). The user singled training out by name. Full surface pass: same features and data flow, sd skin.

## Fence
- apps/web/components/training/** and apps/web/app/(app)/training/**
- globals.css ADDITIVE only. ui/ primitives OUT (already sd on your branch — consume).
- NOTHING else.

## Register requirements
- Page scaffold: sd title row with the dimensional training icon (components/ui/icons), 11px uppercase eyebrows, mono stats.
- Day columns / activity cards: WidgetCard v2 plates or mini entity-cards (icon chip + name + meta chips); hatched progress; status pills h-24; single cyan accent + functional amber/red only.
- Stats surfaces (AdherenceCard, DurationTrendChart, BatchTotalsTable, TrainingStatsClient): strip glass/blur, sd plates, chart strokes/fills through sd tokens (cyan primary series, ink-dull grids 1px --sd-line), mono tabular-nums numerics, 11px uppercase axis/legend labels. Charts must read in BOTH themes through tokens.
- Dialogs' content styling to sd (shell comes from ui/dialog — don't edit it).
- Motion: zero-jank micro only; reduced-motion collapses.
- Tailwind scan gap (§0): reuse emitted utilities/real classes; verify new arbitrary utilities in compiled CSS.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3827: /training dark+light 1440x900, /training/stats dark+light, one dialog open. If authed capture is impossible in your env, run the token-audit fallback (0 banned classes, 0 legacy tokens in changed files) + compiled-CSS proof and note that Conductor pixel-verifies on :3000 per §1. Commit evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
