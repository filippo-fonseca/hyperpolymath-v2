---
phase: 15
plan: 04
subsystem: training
tags: [training, management-ui, dialogs, sortable, dnd-kit, color-picker, completion-flow]
requires:
  - 15-01 schema (training_batches, training_activity_types, training_activities)
  - 15-02 Server Actions (createBatch/updateBatch/deleteBatch/reorderBatches, createType/updateType/deleteType/reorderTypes, completeActivity, updateActivity, deleteActivity)
  - 15-03 TrainingClient lifted manageOpen state + PlannerHeader onManageTypesClick prop
  - lib/training/palette.ts (TRAINING_PALETTE 16-color OKLCH array)
  - lib/training/distance.ts (kmToDisplay / displayToKm at IO boundary)
provides:
  - ManageTypesSheet — slide-over panel hosting BatchEditor + per-scope TypeEditor
  - BatchEditor — sortable batch list with optimistic-UUID create, inline rename, archive
  - TypeEditor — sortable type list with color popover, distance toggle, move-to-batch, archive
  - ColorPicker — 16-swatch OKLCH grid (no free hex input v1)
  - CompleteActivityDialog — Enter-to-submit-unchanged + single-click skip-logging (D-08, D-09)
  - ActivityEditDialog — full activity edit (type, title, notes, duration, distance) + 2-click delete
affects:
  - TrainingClient (mounts the four new surfaces, lifts completionActivity / editActivity state)
  - TrainingBoard (threads onCheckOff / onEdit props through to ActivityCard)
  - TrainingDayColumn (passes callbacks through)
  - ActivityCard (adds "Edit" kebab item)
tech-stack:
  added:
    - "@dnd-kit/sortable verticalListSortingStrategy for both batch + type reorder"
  patterns:
    - "Optimistic UUID (crypto.randomUUID) on create per RT-05 so Realtime echoes deduplicate"
    - "Pitfall 8 — dialog open-state lifted above useQuery data so realtime invalidations don't close mid-edit"
    - "Pitfall 6 — distance conversion only at the IO boundary; UI carries display values, server speaks km"
    - "shadcn Sheet (560px right side) for slide-over; shadcn Dialog with HudCornerCrops for modals"
    - "Form-wrapped inputs + autoFocus on primary button → Enter from any focus submits one-keystroke"
key-files:
  created:
    - apps/web/components/training/ColorPicker.tsx
    - apps/web/components/training/BatchEditor.tsx
    - apps/web/components/training/TypeEditor.tsx
    - apps/web/components/training/ManageTypesSheet.tsx
    - apps/web/components/training/CompleteActivityDialog.tsx
    - apps/web/components/training/ActivityEditDialog.tsx
  modified:
    - apps/web/components/training/TrainingClient.tsx
    - apps/web/components/training/TrainingBoard.tsx
    - apps/web/components/training/TrainingDayColumn.tsx
    - apps/web/components/training/ActivityCard.tsx
decisions:
  - "Use ad-hoc <input type=checkbox> for the per-type distance toggle (no shadcn Switch component in repo; checkbox is one line and matches the dense ManageTypes row)"
  - "Two-click inline delete on ActivityEditDialog (Delete → 'Click again to delete') instead of nested AlertDialog — fewer focus-trap layers, matches the journal density"
  - "Selecting a batch in BatchEditor scopes the TypeEditor below to that batch; '__ungrouped__' sentinel mediates the special null-batch scope so it threads cleanly through state without nullable surface-language"
  - "Form element wraps both inputs AND footer buttons in CompleteActivityDialog so Enter submits regardless of which control has focus (D-08 one-keystroke target)"
metrics:
  duration: "~25 min"
  tasks: 3
  files: 10
  completed: 2026-06-08
---

# Phase 15 Plan 04: Management Sheet + Completion Dialog Summary

Built the management surfaces that turn the planner board from a read-only week-view into the full Training UX: a slide-over Sheet for batch + type CRUD (sortable, color-pickable, archive-aware), a quick-completion Dialog (Enter submits, single-click skip), and a full-edit Dialog. All four ship wired into `TrainingClient` with state lifted high enough to survive Realtime invalidations.

## What Shipped

### ColorPicker (`ColorPicker.tsx`)
4×4 grid of 24px circular swatches sourced from `TRAINING_PALETTE` (16 curated OKLCH colors). Selected swatch shows a `ring-2 ring-[var(--ink)]` + inner Check glyph; tooltips reveal each swatch's name on hover. Wrapped in `<TooltipProvider delayDuration=300>` so hover names are discoverable without being noisy. No free-hex input — defer per RESEARCH Open Q.

### BatchEditor (`BatchEditor.tsx`)
`@dnd-kit/core` DndContext + `@dnd-kit/sortable` SortableContext with `verticalListSortingStrategy`. Each row carries:
- drag handle (`GripVertical`) revealed on group-hover
- click-to-select (scopes TypeEditor below), double-click-to-rename inline input
- per-batch type count
- kebab → Rename / Archive

Footer add-batch input pre-generates `crypto.randomUUID()` and passes to `createBatch({ id, name })` so the Realtime echo deduplicates (RT-05). An "Ungrouped" pseudo-row at the bottom is non-draggable and selects the `__ungrouped__` scope.

### TypeEditor (`TypeEditor.tsx`)
Same sortable pattern, scoped to the parent's selected batch. Each type row carries:
- drag handle
- color swatch (`Popover` opens `ColorPicker`)
- inline-editable name (double-click)
- ad-hoc `km` checkbox toggle for `hasDistance` (no shadcn Switch in repo yet — checkbox + label is one line and matches density)
- kebab → Rename / Move to batch ▶ (submenu of all batches + Ungrouped) / Archive

On archive, the server may return `{ success: false, error: "This type has N activities. Archive instead." }` — surfaced as a toast (RESEARCH Open Q4).

### ManageTypesSheet (`ManageTypesSheet.tsx`)
Right-side shadcn Sheet (`sm:max-w-[560px]`). Layout:
- Sticky header
- BatchEditor at the top
- A `border-t` divider
- A scope label ("Ungrouped types" or "Types in <batch>")
- TypeEditor scoped to the selected batch (or null/ungrouped)

Empty state (D-07) — when the user has zero types AND zero batches — renders a friendly prose CTA + an inline TypeEditor with no batch so the very first thing the user sees on a fresh install is "Create your first activity type." TrainingClient already auto-opens this Sheet when `types.length === 0`.

### CompleteActivityDialog (`CompleteActivityDialog.tsx`)
Pre-fills both number inputs from the activity's planned values, formatted to the user's `distance_unit`. Two buttons:
- **Mark done** (primary, `autoFocus`, `type="submit"`) — reads inputs, converts distance to km, calls `completeActivity({ id, actualDurationMin, actualDistanceKm })`. Wrapped in `<form onSubmit>` so Enter from any focus (including the autoFocused button) submits with the pre-filled planned values in one keystroke (D-08).
- **Skip logging — just mark done** (secondary, ghost) — calls `completeActivity({ id })` with no actuals, leaving `actual_*` columns null (D-09). The activity still transitions to `status='done'`.

### ActivityEditDialog (`ActivityEditDialog.tsx`)
Full edit surface: type Select (with color dot in each item), title input, description textarea, planned duration, planned distance (conditional on the *currently selected* type's `hasDistance`, not the original — so swapping type re-shows / re-hides the distance field). Delete button uses a two-click inline confirm (`Delete` → `Click again to delete`) to avoid nesting an AlertDialog inside an open Dialog (focus-trap nesting is fragile).

## Wiring (Task 3)

`TrainingClient` hosts two new state atoms:
```ts
const [completionActivity, setCompletionActivity] = useState<ActivityWithType | null>(null);
const [editActivity, setEditActivity] = useState<ActivityWithType | null>(null);
```

Both passed to `TrainingBoard` as `onCheckOff` / `onEdit`, threaded through `TrainingDayColumn` to `ActivityCard`. The card's kebab menu gains an "Edit" entry that calls `onEdit(activity)`. The card body's click-to-checkoff (already wired in 15-03) now opens the completion dialog.

The four new surfaces mount at the bottom of `TrainingClient`'s tree, all using the same Pitfall-8 pattern: state lives above the useQuery layer so realtime echoes refresh the underlying data without closing the open surface mid-edit.

## Dialog Focus Management (D-08 in Detail)

The "Enter submits unchanged" target is hit by:
1. **Pre-fill effect** — `useEffect([open, activity, distanceUnit])` populates `durationStr` / `distanceStr` from the activity's planned values on every (re-)open.
2. **Form wrapping** — both inputs AND the footer buttons live inside a single `<form onSubmit={...}>`. Enter from any focused descendant fires `onSubmit`, not just from inputs.
3. **`autoFocus` on primary button** — the very first key after the dialog opens lands on `Mark done`. Even Enter on the focused button triggers form submit because `type="submit"`.
4. **`e.preventDefault()` in onSubmit** — keeps the form from reloading.

Net result: open dialog → Enter → done. Total keystrokes: 1.

## Palette Usage

`ColorPicker.tsx` is the only consumer of `TRAINING_PALETTE`. New types default to the `cyan` palette entry (fallback to index 0 if palette ever empties). The picker is the single editing surface — changing a color elsewhere (Realtime, future API) writes the OKLCH string directly back to `training_activity_types.color` and the picker's selected-state ring lights the matching swatch on next open. No CSS variable indirection.

## Verification

- `pnpm exec tsc --noEmit` clean (training/* surfaces); only pre-existing test errors in `tests/api-jarvis-tts.test.ts` remain.
- `grep "setQueryData" apps/web/components/training/` returns no matches (CLAUDE.md Critical Pattern 3 — invalidate-only).
- `grep "from \"@dnd-kit/sortable\""` matches in BatchEditor + TypeEditor (modern lib, not HTML5).
- `grep "crypto.randomUUID"` matches in both editors (RT-05 optimistic UUID).
- `grep "TRAINING_PALETTE"` matches in ColorPicker.
- `grep "Sheet"` matches in ManageTypesSheet.
- `grep "completeActivity\|displayToKm\|autoFocus\|Skip logging"` all match in CompleteActivityDialog.
- `grep "updateActivity\|deleteActivity"` matches in ActivityEditDialog.

## Deviations from Plan

None — plan executed as written. Two minor implementation choices flagged as decisions above (ad-hoc switch via `<input type=checkbox>`, inline two-click delete confirm).

## Self-Check: PASSED
- apps/web/components/training/ColorPicker.tsx — FOUND
- apps/web/components/training/BatchEditor.tsx — FOUND
- apps/web/components/training/TypeEditor.tsx — FOUND
- apps/web/components/training/ManageTypesSheet.tsx — FOUND
- apps/web/components/training/CompleteActivityDialog.tsx — FOUND
- apps/web/components/training/ActivityEditDialog.tsx — FOUND
- Commit acf00ab — FOUND
- Commit 6a71e91 — FOUND
- Commit 49516e7 — FOUND
