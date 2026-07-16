# Unit: unit-devtab — DEV tab full rebuild in the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, live sd exemplars on this branch (ALL 12 units merged): components/lifeos/WidgetCard.tsx + LifeOsCanvas.tsx (grid grammar), components/nutrition/* (stats plates + chart tokens), components/jarvis/* (console/mono density), /design. Offense inventory: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/scouts/scout-A-report.md.

NOTE: any .planning/fable-plan-*.md for another unit is inherited history — ignore them. THIS file is your seed.

## Mission
SEALED Conductor decision: the DEV tab (insights/development surface — the Kiwi auto-dev pipeline view with captures→issues→PR flow, Anthropic spend panel, etc.) gets a FULL REBUILD in the sd register, not a reskin. Same data sources and features; redesigned layout. This is a developer console — it may run the densest mono of the app (jarvis-adjacent register): mono tables, functional state pills (open/merged/failed = cyan/ink/coral), hairline grids.

## Fence
- The DEV/insights tab's own components + route (locate under apps/web/components/insights/** or components/dev/** + its app route; LIST every file in your report).
- globals.css ADDITIVE only. ui/ primitives OUT. Other units' surfaces OUT.

## Register requirements
- Layout: sd plate grid (WidgetCard v2), 11px uppercase eyebrows, mono stat readouts (font-black tabular-nums), hairline separators.
- Pipeline flow (captures → drafted issues → PRs): stage columns or a mono ledger table — pick the stronger layout and justify in one line; functional pills for state; timestamps mono.
- Spend/inert panels: keep graceful-degraded states (the Anthropic admin-key panel is known-inert — style its empty state calmly, do not remove it).
- Charts if any: cyan primary series, token grids, mono axes (nutrition stats = exemplar).
- Single cyan accent + functional amber/coral. No glass/blur/serif/gradients/glow. Motion 120-160ms; reduced-motion collapses. Tailwind scan gap (§0). Server hygiene §3: kill only tcp:3834.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3834: DEV tab dark+light 1440x900 + one crop of the pipeline ledger/columns. Auth-blocked → §1 fallback (throwaway preview route sanctioned, delete after, clean tree). Evidence under .planning/ with sd3- prefix + verification note. status=awaiting_review, WAIT.
