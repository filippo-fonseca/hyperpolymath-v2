# Unit: unit-calendar — /calendar to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1 bind you), docs/DESIGN-SYSTEM.md, live sd exemplars: components/tasks/* (list/row register), components/lifeos/WidgetCard.tsx, /design.

NOTE: any .planning/fable-plan-sd3.md here is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
/calendar is OLD register (Scout A: CalendarClient.tsx 874 lines w/ backdrop-blur :769 + glass-tile :774; CalendarFilters.tsx :100/:104; EventDetailPanel 9 font-serif; EmptyState). Full surface pass to sd: same features and gcal data flow, new skin. Events live in Google Calendar exclusively — do not touch data logic.

## Fence
- apps/web/components/calendar/** and apps/web/app/(app)/calendar/**
- globals.css ADDITIVE only. ui/ primitives OUT (already sd — consume).

## Register requirements
- Page scaffold: sd title row + dimensional calendar icon (components/ui/icons), 11px uppercase eyebrows, mono date labels.
- Month/week grids: `--sd-box` cells on 1px `--sd-line` grid, today = 1px cyan ring, event chips per chip grammar (h-20-24, rounded-[6-8px], `--sd-input` bg + hairline, 12px medium; calendar-source colors may tint the chip's leading dot ONLY — surfaces stay sd, single cyan accent law otherwise).
- CalendarFilters: sd ghost segmented controls/chips, no glass-button.
- EventDetailPanel: side panel as solid `--sd-box` plate (match tasks' InspectorShell grammar if reusable), no serif, mono time stamps, functional pills for status.
- EmptyState: calm sd empty grammar (faint dimensional icon + 12px ink-dull line).
- Motion: 140ms view/day transitions, zero-jank, reduced-motion collapses.
- Tailwind scan gap (§0) applies: emitted utilities/real classes only; verify new arbitrary utilities in compiled CSS.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3829: /calendar month view dark+light 1440x900, event chips crop, detail panel open, filters row. If authed capture impossible, token-audit fallback + compiled-CSS proof per §1 (Conductor pixel-verifies on :3000). Evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
