# Phase 19: Tasks Redesign — Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 9 files to be modified / 1 new component
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/components/tasks/TasksClient.tsx` | orchestrator/component | event-driven, CRUD | self (major refactor) | exact |
| `apps/web/components/tasks/KanbanDayHeader.tsx` | component | event-driven | self (lift + split) | exact |
| `apps/web/components/tasks/InboxColumn.tsx` (new) | component | CRUD, event-driven | `TasksClient.tsx` inbox tray (lines 548-591) | role-match |
| `apps/web/components/tasks/TaskOverviewView.tsx` (new) | component | request-response | `TaskDayView.tsx` | role-match |
| `apps/web/components/tasks/TaskDetailPanel.tsx` | component | CRUD | self (restyle + new field control) | exact |
| `apps/web/components/tasks/TaskCard.tsx` | component | event-driven | self (glass restyle) | exact |
| `apps/web/components/tasks/TaskList.tsx` | component | CRUD | self (add day-scoping) | exact |
| `apps/web/lib/jarvis/executor.ts` | service | request-response | self (flip default-due policy) | exact |
| `packages/jarvis-core/src/tools/create-task.ts` | utility/schema | request-response | self (voice_summary path update) | exact |
| `apps/web/app/globals.css` | config | — | self (no change needed; tokens already exist) | exact |

---

## Pattern Assignments

### `apps/web/components/tasks/TasksClient.tsx` (orchestrator, major refactor)

**Analog:** Self — this file is the refactor target. All patterns below are extracted from the current implementation.

**nuqs URL state pattern** (lines 102–106):
```typescript
const [view, setView] = useQueryState("view", parseAsString.withDefault("kanban"));
const [dateYmd, setDateYmd] = useQueryState("date", parseAsString.withDefault(toYmd(new Date())));
```
Phase 19 change: add `"overview"` to the view toggle array (line 480); remove `"day"` as a standalone mode. The `dateYmd` state is already global — no structural change needed there.

**showLesno localStorage pattern** (lines 138–145):
```typescript
const [showLesno, setShowLesno] = useState(false);
useEffect(() => {
  if (typeof window === "undefined") return;
  setShowLesno(localStorage.getItem("tasks-show-lesno") === "true");
}, []);
useEffect(() => {
  if (typeof window !== "undefined") localStorage.setItem("tasks-show-lesno", String(showLesno));
}, [showLesno]);
```
Phase 19: add a parallel `tasks-expanded` key for the fullscreen toggle using the same pattern.

**lesno filter predicate** (line 181 — the line to loosen):
```typescript
if (!showLesno && t.status === "lesno" && !filters.status.includes("lesno")) return false;
```
Phase 19 change: in day-scoped views, bypass this gate for tasks where `t.dueDate === dateYmd` — those completed tasks should show for the day.

**YMD string comparison pattern — DO NOT change** (lines 226–233):
```typescript
const dayFilteredTasks = useMemo(
  () => filtered.filter((t) => t.dueDate === dateYmd),
  [filtered, dateYmd]
);
const inboxTasks = useMemo(
  () => filtered.filter((t) => !t.dueDate && t.status !== "lesno"),
  [filtered]
);
```
Use `t.dueDate === dateYmd` (string equality) everywhere day filtering occurs. Never round-trip through `new Date()`.

**Cross-surface drag state lift pattern** (lines 126–127, 288–326):
```typescript
const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
// ...
const handleKanbanDrop = useCallback(async (targetStatus: TaskStatus) => {
  const t = draggedTask;
  setDraggedTaskId(null);
  if (!t) return;
  const needsStatus = t.status !== targetStatus;
  const needsDate = t.dueDate !== dateYmd;
  // optimistic update first, then updateTask server action
}, [...]);
```
Phase 19: add `handleInboxDrop` mirroring this shape — target is `dueDate: null` instead of a status column. Wire `InboxColumn` as a drop target that receives `draggedTaskId` via the same lifted state.

**Bulk action server call + optimistic pattern** (lines 258–285):
```typescript
const handleBulkMove = useCallback(async (newDueDate: string | null) => {
  const ids = Array.from(selectedIds);
  startTransition(() => {
    for (const id of ids) {
      addOptimistic({ type: "update", id, patch: { dueDate: newDueDate } });
    }
  });
  const r = await bulkUpdateTaskDueDate({ ids, dueDate: newDueDate });
  if (!r.success) { toast.error(r.error); return; }
  await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) });
  toast.success(`${ids.length} task${ids.length === 1 ? "" : "s"} moved to Inbox`);
}, [...]);
```
The `handleInboxDrop` for single-card drag-to-inbox reuses `bulkUpdateTaskDueDate` with `ids: [id], dueDate: null` — no new server action needed.

**Inbox tray AnimatePresence pattern** (lines 537–591 — to be promoted into `InboxColumn`):
```typescript
<AnimatePresence initial={false}>
  {inboxOpen ? (
    <motion.div
      key="inbox-tray"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="overflow-hidden"
    >
```
Phase 19: the Inbox becomes always-present (no AnimatePresence needed for the column itself). Motion transitions remain for drag-target highlight changes.

**View toggle pill pattern** (lines 479–497):
```typescript
<div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)] shrink-0">
  {(["kanban", "list", "day"] as const).map((v) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "px-2.5 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer",
        "transition-colors duration-150 ease-out",
        view === v
          ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      )}
    >
      {v}
    </button>
  ))}
</div>
```
Phase 19: replace `["kanban", "list", "day"]` with `["kanban", "list", "overview"]`.

---

### `apps/web/components/tasks/InboxColumn.tsx` (new component, role: component, data-flow: event-driven + CRUD)

**Analog:** Current inline inbox tray in `TasksClient.tsx` (lines 548–591) + `KanbanDayHeader.tsx` Inbox pill.

**Glass panel wrapper pattern** — copy from `TasksClient.tsx` lines 548–551:
```typescript
<div
  className={cn("mb-4 rounded-xl p-3", "glass-tile")}
  role="region"
  aria-label="Tasks without a due date"
>
```
Phase 19: this becomes the `InboxColumn` root. Add drag-target active state via data attribute or local state:
```typescript
// Drag-over active class override (S-1 spec):
// [--glass-glow-color:var(--hud-cyan)] [--glass-border:color-mix(in_oklch,var(--hud-cyan)_50%,transparent)] ring-1 ring-[var(--hud-cyan)]/30
```

**Section label + count badge pattern** — copy from `TasksClient.tsx` lines 552–558:
```typescript
<div className="mb-2 flex items-center justify-between px-1">
  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
    Inbox · undated
  </p>
  <p className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
    {inboxTasks.length}
  </p>
</div>
```
Note: upgrade `tracking-[0.08em]` to `tracking-[0.18em]` per UI-SPEC S-1 (section header variant).

**Card wrap grid** — copy from `TasksClient.tsx` lines 565–581 minus the `slice(0, 24)` truncation:
```typescript
<div className="flex flex-wrap gap-2">
  {inboxTasks.map((t) => (
    <div key={t.id} className="min-w-[220px] max-w-[260px] flex-1">
      <TaskCard
        task={t}
        onClick={onTaskClick}
        draggable
        onDragStart={(id) => onDragStart(id)}
        onDragEnd={onDragEnd}
        isDragging={draggedTaskId === t.id}
        selectionActive={selectedIds.size > 0}
        isSelected={selectedIds.has(t.id)}
        onToggleSelected={onToggleSelected}
      />
    </div>
  ))}
</div>
```
Remove the `slice(0, 24)` and the "+N more" fallback — Decision 1 removes the truncation.

**HTML5 native DnD drop target pattern** — copy from `KanbanBoard.tsx` column drop handlers (existing pattern already used for kanban columns). Apply to the Inbox surface:
```typescript
onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
onDragLeave={() => setIsDragOver(false)}
onDrop={async (e) => {
  e.preventDefault();
  setIsDragOver(false);
  if (!draggedTaskId) return;
  // call bulkUpdateTaskDueDate({ ids: [draggedTaskId], dueDate: null })
  // then addOptimistic({ type: "update", id: draggedTaskId, patch: { dueDate: null } })
}}
```

---

### `apps/web/components/tasks/KanbanDayHeader.tsx` (refactor — lift day nav, remove inbox toggle)

**Analog:** Self. The full current implementation is at lines 1–129.

**Day nav pattern to lift to `TasksClient`** (lines 38–106):
```typescript
<div className="flex items-center gap-2">
  <div className="flex items-center gap-1">
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
      onClick={() => onDateChange(toYmd(addDays(date, -1)))}
      aria-label="Previous day">
      <ChevronLeft size={14} strokeWidth={1.5} />
    </Button>
    <Button variant="ghost" size="sm"
      className={cn("h-7 px-2 font-mono text-[11px] uppercase tracking-[0.06em]", isToday && "text-[var(--ink-muted)]")}
      onClick={() => onDateChange(toYmd(today))}
      disabled={isToday}>
      Today
    </Button>
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
      onClick={() => onDateChange(toYmd(addDays(date, 1)))}
      aria-label="Next day">
      <ChevronRight size={14} strokeWidth={1.5} />
    </Button>
  </div>
  {/* Hidden native date picker trigger */}
  <button type="button"
    className="relative font-serif text-base text-[var(--ink)] hover:text-[var(--ink)] cursor-pointer-always"
    onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.focus()}>
    {format(date, "EEEE, MMMM d, yyyy")}
    <input ref={pickerRef} type="date" value={dateYmd}
      onChange={(e) => { if (e.target.value) onDateChange(e.target.value); }}
      className="absolute left-0 top-full h-0 w-0 opacity-0"
      aria-hidden tabIndex={-1} />
  </button>
</div>
```
Phase 19: Extract this block into a `DaySwitcher` sub-component or inline it directly in `TasksClient` above the view toggle toolbar (S-2 spec: "rendered above the view toggle toolbar"). Remove the Inbox pill (lines 108–126) from `KanbanDayHeader` — the Inbox is always-visible now.

---

### `apps/web/components/tasks/TaskOverviewView.tsx` (new component, role: component, data-flow: request-response)

**Analog:** `apps/web/components/tasks/TaskDayView.tsx` (day-section grouping pattern).

**Day-section grouping pattern from `TaskDayView.tsx`** — read that file for the section-per-date pattern, then adapt: instead of showing ONE day's tasks in sections (Overdue / Today / No-due-date), show MULTIPLE days as collapsible rows.

**Day group row closed** (S-6 spec):
```typescript
<button
  type="button"
  className={cn(
    "flex items-center justify-between px-4 py-2.5 rounded-lg cursor-pointer-always w-full",
    "border border-[var(--edge)] hover:border-[var(--edge-hud)] transition-colors duration-150"
  )}
  onClick={() => toggle(day)}
>
  <span className="font-serif text-base text-[var(--ink)]">{format(dayDate, "EEEE, MMMM d")}</span>
  <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">{count}</span>
</button>
```

**Day group body (AnimatePresence expand)** — copy the motion pattern from `TasksClient.tsx` lines 537–545 but adapted:
```typescript
<AnimatePresence initial={false}>
  {isOpen && (
    <motion.div
      key={day}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="overflow-hidden"
    >
      <div className="glass-tile rounded-xl p-3 mt-1 mb-2 space-y-1">
        {/* TaskCards here, compact variant */}
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

**YMD generation for 7 days** — use `toYmd` from `@/lib/tasks/date-shortcuts` (already imported in `KanbanDayHeader.tsx` line 8) + `addDays` from `date-fns`:
```typescript
import { addDays } from "date-fns";
import { toYmd } from "@/lib/tasks/date-shortcuts";
const days = Array.from({ length: 7 }, (_, i) => toYmd(addDays(today, i)));
```

---

### `apps/web/components/tasks/TaskDetailPanel.tsx` (restyle + add inline clear affordance)

**Analog:** Self. Key sections:

**SheetContent glass restyle** (line 394 — current):
```typescript
<SheetContent side="right" className="w-[420px] p-0 flex flex-col" showCloseButton={false}>
```
Phase 19: add `glass-tile` or manually apply `--glass-*` tokens. Because `SheetContent` is a Radix overlay (not a positioned element on the canvas), `backdrop-filter: blur(12px)` applies to the panel's own interior, not the content behind it — this is intentional per S-3 spec. Add:
```typescript
<SheetContent side="right" className="w-[420px] p-0 flex flex-col [background:var(--glass-bg)] [backdrop-filter:blur(12px)]" showCloseButton={false}>
```

**Header border restyle** (line 398 — current):
```typescript
<SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--edge)]">
```
Phase 19: change `border-[var(--edge)]` to `border-[var(--glass-border)]`.

**Due-date field — existing structure** (lines 458–471):
```typescript
<FieldSection label="Due date">
  <div className="flex items-center gap-2">
    <Input type="date" value={form.dueDate}
      onChange={(e) => set("dueDate", e.target.value)}
      className="font-sans text-[13px] h-8 flex-1" />
    <MoveToMenu variant="inline" allowClear onPick={(ymd) => set("dueDate", ymd ?? "")} />
  </div>
</FieldSection>
```
Phase 19: inline the clear affordance BEFORE `MoveToMenu` (or replace `MoveToMenu` entirely for the primary clear path):
```typescript
{form.dueDate && (
  <button
    type="button"
    onClick={() => set("dueDate", "")}
    title="Clear due date (move to Inbox)"
    className="p-0.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] cursor-pointer-always transition-colors duration-150"
  >
    <X size={12} strokeWidth={1.5} />
  </button>
)}
{/* Below the field, when cleared: */}
{!form.dueDate && task?.dueDate && (
  <p className="font-mono text-[11px] text-[var(--ink-muted)]">Will move to Inbox</p>
)}
```
The `set("dueDate", "")` call maps to `dueDate: null` on save via the existing null-save path at line 274: `dueDate: form.dueDate || null`.

**FieldSection label pattern** (search the file for FieldSection — it's a local wrapper). The label style per S-3:
```typescript
// The FieldSection wrapper uses this label class:
"font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]"
```

**Save / cancel footer** (lines 496–535):
```typescript
<Button type="button" variant="ghost" size="sm" onClick={handleCancelClick}>Cancel</Button>
<Button type="button" size="sm" onClick={() => startTransition(() => void handleSave())} disabled={!dirty || isPending}>
  {isCreate ? "Create task" : "Save changes"}
</Button>
```
Phase 19: restyle Save to `glass-button` per S-3: `className="glass-button rounded-md px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"`.

---

### `apps/web/components/tasks/TaskCard.tsx` (glass restyle)

**Analog:** Self + `apps/web/app/(app)/settings/page.tsx` glass-tile usage.

**Glass-tile application pattern from settings** (line 80):
```typescript
const tile = "glass-tile p-6 space-y-4 rounded-xl";
// Per-callsite accent override example:
className="glass-tile [--glass-glow-color:var(--ink-amber)]"
```

Phase 19 card base class (S-4):
```typescript
// Replace current surface-raised bg + border with:
"glass-tile rounded-lg px-3 py-2.5"
// Dragging state (preserve existing pattern):
isDragging && "opacity-50 scale-95"
// Selected state (new):
isSelected && "[--glass-glow-color:var(--ink-amber)] ring-1 ring-[var(--ink-amber)]/40"
```

**Lesno card treatment** (S-8 spec — add to existing card conditional logic):
```typescript
isLesno && "opacity-70"
// Title element:
isLesno && "line-through text-[var(--ink-muted)]"
```

---

### `apps/web/components/tasks/TaskList.tsx` (add day-scoping)

**Analog:** Self + `TasksClient.tsx` `dayFilteredTasks` computation pattern.

**Current state:** `TaskList` receives `filtered` (all tasks post-filter) and renders all of them.

**Phase 19 change:** `TasksClient` passes `dayFilteredTasks` instead of `filtered` to `TaskList` (same pattern used for `KanbanBoard` at line 593). No changes needed inside `TaskList.tsx` itself — the day-scoping is enforced at the call site in `TasksClient`.

Call site change in `TasksClient.tsx` (line 521–523, current):
```typescript
// current:
<TaskList tasks={filtered} onTaskClick={setOpenTaskId} addOptimistic={addOptimistic} />
// phase 19:
<TaskList tasks={dayFilteredTasks} onTaskClick={setOpenTaskId} addOptimistic={addOptimistic} />
```

---

### `apps/web/lib/jarvis/executor.ts` (flip default-due policy)

**Analog:** Self. The policy lives at lines 132–150.

**Current default-due policy** (lines 132–150 — the block to remove/replace):
```typescript
// Default-due policy (2026-06-11): a task with no explicit due date
// lands TODAY in the user's timezone — undated tasks were vanishing
// into limbo instead of surfacing on the Today view.
const todayInTz = new Intl.DateTimeFormat("en-CA", {
  timeZone: ctx.userTimezone,
}).format(new Date()); // YYYY-MM-DD
// ...
dueDate: input.due ? dateInUserTz(input.due, ctx.userTimezone) : todayInTz,
```

**Phase 19 replacement:**
```typescript
// No-date → Inbox policy (Phase 19): a task with no explicit due date
// lands in the Inbox (dueDate = NULL). The model must emit an explicit
// due date when the user specifies one; silence means Inbox.
dueDate: input.due ? dateInUserTz(input.due, ctx.userTimezone) : null,
```

Also update the receipt block (lines 163–179). Current receipt emits a due date even for undated tasks:
```typescript
// current:
due: input.due ?? new Date(new TZDate(`${todayInTz}T00:00:00`, ctx.userTimezone).getTime()).toISOString(),
allDay: input.due ? undefined : true,
// phase 19 replacement:
due: input.due ? dateInUserTz(input.due, ctx.userTimezone) : undefined,
// Add:
inbox: !input.due,  // signals the receipt formatter to use "Added to your Inbox."
```

**voice_summary receipt copy** (I-7 spec): The receipt copy at whatever line emits the user-facing message needs to branch on `inbox`:
- `inbox === true` → `"Added to your Inbox."`
- `inbox === false` → existing `"Added to tasks for {date}."` pattern

---

### `packages/jarvis-core/src/tools/create-task.ts` (voice_summary update)

**Analog:** Self — full file read above (35 lines).

**Current schema** (lines 18–34):
```typescript
export function zCreateTaskFor(opts: { voiceActive?: boolean }) {
  return z.object({
    title: z.string().min(1).max(500),
    priority: PrioritySchema.optional(),
    status: StatusSchema.optional(),
    due: z.iso.datetime({ offset: true }).optional(),
    project_ids: z.array(z.uuid()).optional(),
    ...(opts.voiceActive
      ? { voice_summary: z.string().min(1).max(200) }
      : {}),
  });
}
```

Phase 19: no schema change required. The `due` field is already optional — when Claude omits it, executor now routes to Inbox (null). The planner should verify the system prompt / tool description for `create_task` includes an instruction like:
```
"If the user does not specify a date or says 'no date', omit the `due` field entirely.
 Omitting `due` creates the task in the user's Inbox (undated).
 Do NOT default to today when no date is mentioned."
```
This instruction lives in the tool description block, not in the Zod schema file. The schema itself is correct as-is.

---

## Shared Patterns

### Glass Surface System
**Source:** `apps/web/app/globals.css` lines 562–598
**Apply to:** `InboxColumn`, `TaskDetailPanel` interior, `TaskCard`, `TaskOverviewView` day group bodies

Core class: `glass-tile` (translucent + backdrop-filter:blur(12px) + specular edges + inset cyan glow).
Per-callsite accent override: `[--glass-glow-color:var(--ink-amber)]` for selected cards, `[--glass-glow-color:var(--hud-cyan)]` for Inbox drag-target active state.
Control tier: `glass-button` for the Save button in the detail panel footer.

### Section Header Typography
**Source:** `apps/web/app/(app)/settings/page.tsx` line 83
**Apply to:** Inbox column label, overview day group headers, lesno "Done" section label
```typescript
"font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-muted)] pl-1 pt-2"
// (UI-SPEC uses text-[11px] — use 11px per spec, consistent with existing KanbanDayHeader)
```

### YMD Date Comparison (non-negotiable)
**Source:** `TasksClient.tsx` lines 226–233
**Apply to:** All day-filter predicates in `TasksClient`, `TaskList`, `InboxColumn`, `TaskOverviewView`
```typescript
// ALWAYS use string equality:
t.dueDate === dateYmd
// NEVER:
isSameDay(new Date(t.dueDate), new Date(dateYmd))  // introduces UTC drift
```

### Optimistic Update + Server Action Pattern
**Source:** `TasksClient.tsx` lines 258–285 (`handleBulkMove`)
**Apply to:** `handleInboxDrop` (new), any new mutations in `InboxColumn`
```typescript
startTransition(() => {
  addOptimistic({ type: "update", id, patch: { dueDate: null } });
});
const r = await bulkUpdateTaskDueDate({ ids: [id], dueDate: null });
if (!r.success) { toast.error(r.error); return; }
await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) });
```

### localStorage Ephemeral Preference Pattern
**Source:** `TasksClient.tsx` lines 138–145 (`showLesno`)
**Apply to:** `tasks-expanded` fullscreen toggle state (S-7)
```typescript
const [expanded, setExpanded] = useState(false);
useEffect(() => {
  setExpanded(localStorage.getItem("tasks-expanded") === "true");
}, []);
useEffect(() => {
  localStorage.setItem("tasks-expanded", String(expanded));
}, [expanded]);
```

### Motion Expand Pattern
**Source:** `TasksClient.tsx` lines 537–545
**Apply to:** `TaskOverviewView` day group expand/collapse (S-6), transition duration 160ms per UI-SPEC
```typescript
<AnimatePresence initial={false}>
  {isOpen && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="overflow-hidden"
    >
```

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| Expand/fullscreen sidebar-hide mechanism | layout/context | No existing sidebar-collapse-from-child-page pattern exists. Planner must decide: React context flag read by the root layout's sidebar, or a CSS `data-expanded` attribute set on a shared ancestor. Check `apps/web/app/(app)/layout.tsx` for the sidebar wrapper. |

---

## Metadata

**Analog search scope:** `apps/web/components/tasks/`, `apps/web/app/(app)/settings/`, `apps/web/app/globals.css`, `apps/web/lib/jarvis/executor.ts`, `packages/jarvis-core/src/tools/`
**Files read:** 9 source files
**Pattern extraction date:** 2026-06-13
