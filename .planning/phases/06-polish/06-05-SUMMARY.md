---
phase: 06-polish
plan: 05
subsystem: a11y-audit
tags: [cursor-pointer, focus-visible, kbd-hint, grab-cursor, agent-mode-scope, partial-execution, deferred-to-6.1]
status: partial
execution_outcome: tasks 1+2 shipped; task 3 (manual visual walkthrough) deferred to Phase 6.1

# Dependency graph
requires:
  - phase: 06-polish
    provides: neumorphic focus tokens (--shadow-nm-focus-journal, --shadow-nm-focus-agent), .agent-mode-scope hook (06-01-SUMMARY.md, 06-03-SUMMARY.md)
provides:
  - cursor-pointer Tailwind class applied to TaskCard (kanban + drag-overlay variant), TaskListRow, CaptureCard, and SlashCommandPopover items (UI-SPEC §10)
  - cursor-grab at rest + cursor-grabbing during drag on kanban TaskCard sortable wrapper (UI-SPEC §10)
  - cursor-pointer for .rbc-event in calendar grid (UI-SPEC §10)
  - focus-visible ring system in globals.css — amber neumorphic ring for Journal mode + JARVIS-blue neumorphic ring for Agent mode via .agent-mode-scope (UI-SPEC §11a)
  - .agent-mode-scope wrapper on JarvisConsole so all focusable elements inside the console pick up the blue ring (UI-SPEC §11a)
  - ⌘K kbd hint chip in JarvisInput footer (md:+ only, right-aligned, opacity-50, mono font) signaling the global shortcut bound in GlobalHotkeys (UI-SPEC §8b)
deferred:
  - Task 3 (Phase 6 end-to-end human verification): 22-scenario manual walkthrough covering AES-01..AES-07 visual contract. Skipped because the user rejected the Phase 6 visual contract (neumorphic + JARVIS-blue accent palette per UI-SPEC §3-5) at the checkpoint on 2026-05-19 and asked for a research-first redesign. Running the walkthrough would have produced cosmetic gap-fix plans against a contract that Phase 6.1 will replace wholesale.
affects: [06.1-visual-redesign-jarvis-notion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-scoped focus ring via .agent-mode-scope parent wrapper — :focus-visible default uses amber Journal shadow; .agent-mode-scope :focus-visible overrides to JARVIS-blue. Avoids per-component prop drilling and keeps the rule in globals.css alongside the underlying tokens."
    - "cursor: grab → cursor: grabbing transition driven by dnd-kit's isDragging on the SortableTaskCard wrapper, not the inner TaskCard — keeps the cursor state co-located with the drag listener."
    - "⌘K kbd hint pattern — semantic <kbd> elements with mono font + opacity-50, hidden via hidden md:flex so mobile UI isn't cluttered. Hint visibility is decoupled from the actual shortcut binding (which is unconditional via GlobalHotkeys)."

key-files:
  modified:
    - apps/web/components/tasks/TaskCard.tsx
    - apps/web/components/tasks/TaskListRow.tsx
    - apps/web/components/captures/CaptureCard.tsx
    - apps/web/components/jarvis/SlashCommandPopover.tsx
    - apps/web/app/globals.css
    - apps/web/components/jarvis/JarvisInput.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
  created:
    - .planning/phases/06-polish/06-05-SUMMARY.md
  deferred-to-6.1:
    - apps/web/components/shell/Sidebar.tsx (visual contract change — defer)
    - apps/web/components/shell/AppShell.tsx (visual contract change — defer)
    - apps/web/components/calendar/CalendarClient.tsx (brand-voice copy + visual — defer)

key-decisions:
  - "Plan-path mismatch: 06-05-PLAN.md referenced TaskKanbanCard.tsx and CaptureItem.tsx (do not exist). Actual files are TaskCard.tsx and CaptureCard.tsx; Rule 3 applied — audit committed against the real files."
  - "Task 3 deferral is not a verification failure of the audit work itself — tasks 1 and 2 shipped cleanly with typecheck + build + 237/237 tests green. The deferral is a deliberate scope cut because the user rejected the underlying visual contract, making a full visual walkthrough wasted effort."
  - "Sidebar.tsx / AppShell.tsx / CalendarClient.tsx in the plan's files_modified list were not touched in this partial execution. They were slated for brand-voice copy + cursor-pointer audit; brand-voice waits for Phase 6.1's new copy register, and cursor-pointer on those surfaces is already covered by 06-01's universal `body { cursor: pointer }` fallback rule on interactive elements."

requirements-completed:
  - RES-03 (reinforcement): focus-visible rings ensure all interactive surfaces remain perceivable in both themes
  - "Partial — AES-04: brand-voice copy pass NOT executed (deferred to 6.1 to align with new voice direction)"
  - "Partial — AES-07: 768px responsive verification NOT executed (deferred to 6.1's verification pass)"

verification:
  automated: typecheck clean; build green; 237/237 tests pass; commits f381ce5 + 52509ad present in main
  manual: deferred — see Phase 6.1 plan when ready

# Commits
- f381ce5 — feat(06-05): cursor pointer audit on kanban/list rows + capture + slash commands (UI-SPEC §10)
- 52509ad — feat(06-05): focus-visible ring system + .rbc-event cursor + ⌘K hint + agent-mode-scope (UI-SPEC §8b/§10/§11a)
---

# Plan 06-05 Summary — partial close

## What shipped

**Task 1 — Cursor-pointer audit (commit `f381ce5`)**
Added `cursor-pointer` to the four clickable surfaces flagged in UI-SPEC §10 that weren't covered by the universal `body { cursor: pointer }` fallback because they're root-level interactive divs in their own clickable region: TaskCard (kanban + drag-overlay branches), TaskListRow, CaptureCard, and the option rows in SlashCommandPopover. The kanban TaskCard also gained `cursor-grab` at rest + `cursor-grabbing` during drag via dnd-kit's `isDragging` flag.

**Task 2 — Focus-visible ring + ⌘K hint + `.agent-mode-scope` (commit `52509ad`)**
Installed the mode-scoped focus-ring system in `globals.css`:

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-nm-focus-journal); /* amber */
}
.agent-mode-scope :focus-visible {
  box-shadow: var(--shadow-nm-focus-agent); /* JARVIS-blue */
}
```

`.rbc-event` (react-big-calendar event) gained `cursor: pointer` since it's a third-party generated element outside our Tailwind sweep. `JarvisConsole` was wrapped in `.agent-mode-scope` so every focusable element inside (input, send button, slash popover items) gets the blue ring. `JarvisInput` gained a ⌘K kbd hint chip in its footer — `hidden md:flex`, right-aligned, mono, opacity-50 — signaling the global shortcut bound in `GlobalHotkeys`.

## What was deferred (and why)

**Task 3 — End-to-end human verification (22 scenarios across theming / error+undo / JARVIS polish / telemetry / a11y / responsive / brand voice).**

The user reviewed the Phase 6 visual contract live at the Task 3 checkpoint and rejected it: *"I do not like the UI. Needs to look like as if the UI for JARVIS from Tony Stark had a baby with Notion."* They asked for a research-first redesign as a new phase before Phase 7.

Running the 22-scenario walkthrough would have:
- produced cosmetic gap-fix plans against UI-SPEC §3-5 (neumorphic + JARVIS-blue accent palette)
- which Phase 6.1's new UI-SPEC will replace wholesale

So Task 3 is **deferred to Phase 6.1**, where it becomes a verification of the *new* visual contract. The mechanical audit work in tasks 1+2 carries forward — focus rings and cursor states are visual-direction-agnostic (any theme needs them).

Three files in the plan's `files_modified` list were not touched: `Sidebar.tsx`, `AppShell.tsx`, `CalendarClient.tsx`. Their slated work (brand-voice copy + cursor sweeps) is rolled into Phase 6.1 so the copy register aligns with the new voice and the cursor sweep happens against the new component surface (which may not include all current components).

## Deviations

1. **Plan-path mismatches (Rule 3, auto-fixed):**
   - Plan said `apps/web/components/tasks/TaskKanbanCard.tsx`; actual file is `apps/web/components/tasks/TaskCard.tsx` (kanban + drag-overlay variant wrapped by SortableTaskCard). Audit applied to the real file.
   - Plan said `apps/web/components/captures/CaptureItem.tsx`; actual file is `apps/web/components/captures/CaptureCard.tsx`. Audit applied to the real file.

2. **Scope cut at Task 3 boundary** — see "What was deferred" above. This is the visible deviation from a clean 3/3 task plan; documented in frontmatter and rolled forward to Phase 6.1.

## Quality gates (Tasks 1+2 only)

- `pnpm --filter web typecheck` exits 0
- `pnpm --filter web build` succeeds (all 13 routes register)
- `pnpm --filter web test` 237 passed, 1 skipped (no regressions vs Wave 3 baseline)
- Both commits present in `main`

## Next

Phase 6 closes here on functional plumbing. Phase 6.1 picks up the visual layer with a fresh UI-SPEC via `/gsd:ui-phase 6.1`.
