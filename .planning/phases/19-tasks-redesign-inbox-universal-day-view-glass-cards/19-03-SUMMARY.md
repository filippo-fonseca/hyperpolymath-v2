---
phase: 19
plan: 03
subsystem: tasks-ui
tags: [glass, tasks, detail-panel, card, clear-date, inbox]
requires:
  - "glass-tile / glass-button classes + --glass-* tokens (globals.css)"
  - "updateTask null-save path (dueDate: form.dueDate || null)"
provides:
  - "Glass-restyled TaskCard with amber-glow selected state + dimmed/struck lesno state"
  - "Glassy TaskDetailPanel interior + inline clear-date affordance (→ Inbox)"
affects:
  - "apps/web/components/tasks/TaskCard.tsx"
  - "apps/web/components/tasks/TaskDetailPanel.tsx"
tech-stack:
  added: []
  patterns:
    - "Per-callsite glass accent override ([--glass-glow-color:var(--ink-amber)])"
    - "Reversible inline field control (no confirm dialog) reusing existing null-save path"
key-files:
  created: []
  modified:
    - "apps/web/components/tasks/TaskCard.tsx"
    - "apps/web/components/tasks/TaskDetailPanel.tsx"
decisions:
  - "Save button switched to variant=ghost + glass-button class so shadcn default bg does not fight the glass treatment"
  - "Selected card ring switched from cyan to amber to honor the guardrail reserving cyan for drag-over/focus"
metrics:
  duration: "~3m"
  completed: "2026-06-13"
  tasks: 2
  files: 2
---

# Phase 19 Plan 03: Glass Cards + Glassy Detail Panel + Inline Clear-Date Summary

Restyled `TaskCard` and `TaskDetailPanel` to the settings-page glass language and added a one-click inline clear-date affordance that routes a task to the Inbox via the existing null-save path — no new server action, no new data egress.

## What Was Built

**Task 1 — TaskCard glass restyle (`82fd912`)**
- Replaced the `var(--surface-raised)` background + inline box-shadow with the `glass-tile` class on `rounded-lg px-3 py-2.5` (cards use 8px radius vs panels' 12px — distinction preserved).
- Selected treatment changed from a cyan ring to the S-4 amber glow + ring: `[--glass-glow-color:var(--ink-amber)] ring-1 ring-[var(--ink-amber)]/40`. This honors the guardrail that cyan is reserved for drag-over/focus.
- Lesno (completed) cards now render `opacity-70` (was 80) with the existing strikethrough muted title (S-8).
- Dragging state (`opacity-50`) and the inherited `glass-tile:hover` cyan border tint preserved; no default cyan border added; no neumorphic paired shadows introduced.

**Task 2 — Glassy detail panel + inline clear-date (`e1880fd`)**
- `SheetContent` gains `[background:var(--glass-bg)] [backdrop-filter:blur(12px)]` (intentional interior blur on the Radix overlay, per S-3); `w-[420px] p-0 flex flex-col` and `showCloseButton={false}` preserved.
- `SheetHeader` and footer top borders switched from `--edge` to `--glass-border`.
- Save button restyled to `glass-button rounded-md px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]` (switched to `variant="ghost"` so the shadcn default background does not override the glass treatment); Cancel/Delete ghost treatment kept.
- `FieldSection` label tracking widened from `0.08em` to `0.18em` per S-3.
- Added the inline X clear button on the Due-date field (rendered only when `form.dueDate` is set), wired to `set("dueDate", "")` with `title="Clear due date (move to Inbox)"`. A `Will move to Inbox` hint appears below the field when the date is cleared but the task originally had one. No confirm dialog (I-2: reversible). `MoveToMenu` retained as the secondary clear path.
- AlertDialog/Dialog copy aligned to the UI-SPEC contract: discard body → "Your edits haven't been saved.", confirm → "Discard changes"; delete title → "Delete task?" (body "This can't be undone." and confirm "Delete task" were already correct).

## Verification

- Per-task automated greps passed: `glass-tile rounded-lg`, `ink-amber`, `line-through` (card); `backdrop-filter:blur(12px)`, `glass-button`, `set("dueDate", "")`, `Will move to Inbox`, `glass-border` (panel).
- `npx tsc --noEmit` reports no errors in `TaskCard.tsx` or `TaskDetailPanel.tsx`.
- Aesthetic guardrails respected: no neumorphic paired shadows added, cyan not used on default card/panel borders (only inherited hover tint + the reserved amber selected ring).

## Deviations from Plan

None — plan executed as written. Two implementation choices noted in frontmatter `decisions` (ghost-variant Save button so glass-button styling wins; amber selected ring per guardrail) are clarifications consistent with the plan/UI-SPEC, not deviations.

## Deferred Issues

- Pre-existing `tsc` errors in `apps/web/tests/api-jarvis-tts.test.ts` (`Request` vs `NextRequest` type mismatch, 6 occurrences). Out of scope for this presentational plan — not caused by these changes. Not fixed.

## Self-Check: PASSED
