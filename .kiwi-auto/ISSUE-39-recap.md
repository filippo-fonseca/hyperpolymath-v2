# Issue #39 recap — Show associated area in project assignment dropdown on tasks

**Status:** shipped
**Branch:** `kiwi/auto/2026-06-15-issue-39`
**Code commit:** `181ed64` — `feat(260615-n2d): show parent area inline in task project-assignment dropdown`
**Closes:** [#39](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/39)

## What changed
`ProjectAutocomplete` (the project-assignment dropdown inside `TaskDetailPanel`, used by both `/tasks` and the project-detail "Tasks" section) now shows each project's parent area inline. The area renders right-aligned at 12px in `--ink-muted`, so the row reads: `[icon] Project name      🎓 School`. Projects without an area (defensive only — `projects.areaId` is currently NOT NULL) get an italic 70%-opacity "No area" placeholder so layout stays uniform. The dropdown's search box now also matches against the area name.

## Files touched (7)
- `apps/web/app/(app)/tasks/page.tsx` — `projectRows` LEFT JOIN `areas` + select `areaName`, `areaEmoji`
- `apps/web/app/(app)/projects/[projectId]/page.tsx` — same JOIN/select for `activeProjectsForComposer`
- `apps/web/components/tasks/ProjectAutocomplete.tsx` — extend `ProjectOption`, render the right-aligned area span, broaden `CommandItem.value` so search matches area too
- `apps/web/components/tasks/TaskDetailPanel.tsx` — extend `ProjectOption` interface
- `apps/web/components/tasks/TasksClient.tsx` — extend `Props.projects` shape
- `apps/web/components/projects/ProjectTasksSection.tsx` — extend `Props.projects` shape
- `apps/web/components/projects/ProjectDetailClient.tsx` — extend `Props.activeProjectsForComposer` shape

## Acceptance check (per issue body)
- ✅ Area visible without extra interaction.
- ✅ "No area" placeholder renders gracefully if a project ever has no area.
- ✅ Visual weight kept low — 12px, muted, no badges/borders.

## Verification
- `pnpm typecheck` — no errors in any of the modified files. Remaining errors are all in `tests/`, pre-existing and unrelated (`NextRequest` typing in voice/tts route tests).
- Searched all consumers of `ProjectAutocomplete` and every SSR query producing its `projects` prop; updated each shape in lockstep so the new fields flow end to end.
- `TaskFilters` consumes a narrower `{ id, name }` shape; structural subtyping keeps it compatible without edits.
- The global `CommandMenu` palette in `app/(app)/layout.tsx` is a separate composer surface — intentionally untouched, since issue #39 scopes to the task-view dropdown only.

## What was NOT done
- Did not push. (`CLAUDE.md` global rule: never push without explicit user approval, and the harness explicitly forbids push for this run.)
- Did not run the dev server / browser smoke test — the worktree didn't ship with `node_modules`, so I installed deps and confirmed via `pnpm typecheck` only. A manual visual pass on `/tasks` → open a task → "Link projects" dropdown is recommended before merging.
- Did not touch the global `CommandMenu`/capture composer (out of scope).

## Worktree config
- Per harness instruction this run committed directly on `kiwi/auto/2026-06-15-issue-39`; no inner GSD worktree isolation was used. `workflow.use_worktrees` is not set in repo config, so the GSD default would normally apply — bypassed here by skipping the inner-worktree dispatch path of `/gsd:quick` and doing the edits + commit directly on the current branch.

## Quick task artifact
- `.planning/quick/260615-n2d-show-associated-area-in-project-assignme/260615-n2d-PLAN.md`
- `.planning/quick/260615-n2d-show-associated-area-in-project-assignme/260615-n2d-SUMMARY.md`
- `.planning/STATE.md` row added under "Quick Tasks Completed".
