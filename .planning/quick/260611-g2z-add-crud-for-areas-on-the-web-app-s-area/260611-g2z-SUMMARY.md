---
quick_id: 260611-g2z
status: awaiting-human-verify
completed_tasks: 3
total_tasks: 4
remaining: Task 4 — manual verification (checkpoint:human-verify)
---

# Quick 260611-g2z: Add CRUD for Areas on the Web App's Area Pages

## One-liner

Full sidebar-free Area + Project CRUD on /areas and /areas/[areaId], with deleteArea reassigning child projects to a per-user "No Area" sentinel instead of blocking.

## Tasks Executed

| Task | Status | Commit |
|------|--------|--------|
| 1 — Rewrite deleteArea + document locked decisions | Done | cd8a506 |
| 2 — CRUD UI on /areas page | Done | fb90ba0 |
| 3 — CRUD UI on /areas/[areaId] page | Done | 2f1f6ca |
| 4 — Manual verification | AWAITING HUMAN |  |

## Files Touched

| File | Why |
|------|-----|
| `apps/web/app/actions/areas.ts` | Added ensureNoAreaBucket helper + rewrote deleteArea with sentinel reassign path. Added isNull import. |
| `apps/web/app/actions/projects.ts` | Added locked-decision #2 JSDoc comment on deleteProject (no behavior change). |
| `apps/web/components/areas/AreaCreateDialog.tsx` | Made addOptimisticArea + currentAreaCount optional; added router.refresh() fallback when dispatcher absent. Sidebar backwards-compatible. |
| `apps/web/components/areas/AreasPageHeader.tsx` | New — standalone New Area button for /areas page. No sidebar dependency. |
| `apps/web/components/areas/AreaCardMenu.tsx` | New — per-area ⋯ dropdown (Edit name+emoji / Delete) for /areas Manage section. |
| `apps/web/app/(app)/areas/page.tsx` | Added AreasPageHeader in header, Manage areas section with AreaCardMenu per row. Sentinel rows labeled "(auto-created bucket)". |
| `apps/web/components/areas/AreaDetailHeader.tsx` | New — header component for /areas/[areaId] with Edit area dialog + New project button (ProjectCreateDialog pre-scoped). |
| `apps/web/components/areas/MoveProjectDialog.tsx` | New — area picker dialog wired to moveProjectToArea action. |
| `apps/web/components/areas/AreaProjectCardMenu.tsx` | New — per-project ⋯ dropdown (Rename / Edit details / Move / Delete) for /areas/[areaId] project cards. |
| `apps/web/app/(app)/areas/[areaId]/page.tsx` | Wires AreaDetailHeader + AreaProjectCardMenu; fetches allActiveAreas for pickers. |

## The "No Area" Sentinel Pattern

**When created:** On the first deleteArea call where the victim area has child projects. The ensureNoAreaBucket helper runs inside a db.transaction — it SELECT-first-then-INSERT to avoid race-condition duplicates.

**How identified:** `name === 'No Area' AND emoji IS NULL`. This combination is the sentinel signature. No new schema column is introduced — a pure application-level convention.

**How the page treats it:** The /areas Manage section labels sentinel rows with a small italic "(auto-created bucket)" badge beside the name. The AreaCardMenu calls deleteArea, which server-side rejects deletion of the sentinel with "Can't delete the No Area bucket." — so the Delete menu item is visible but gracefully fails with a toast.

**orderIndex = 9999:** Sorts the sentinel last in both the sidebar tree and the Manage section without disturbing existing area ordering.

## Locked Decisions Verified

| Decision | Implementation | Traceable via |
|----------|---------------|---------------|
| #1: deleteArea reassigns children to sentinel | ensureNoAreaBucket + reassign path in deleteArea | `apps/web/app/actions/areas.ts` JSDoc |
| #2: junction CASCADE preserves tasks/captures | existing behavior, documented | JSDoc on deleteProject |
| #3: zero JARVIS changes | grep confirms no edits under jarvis/ | git diff |
| #4: MoveProjectDialog wired to moveProjectToArea | direct import + call | MoveProjectDialog.tsx |
| #5: only existing CSS tokens + shadcn primitives | no new hex literals or bg-gradient in new files | new files inspection |
| #6: areas page has create/edit/delete | AreasPageHeader + AreaCardMenu | /areas page |
| #7: detail page has create/rename/edit/delete/move | AreaDetailHeader + AreaProjectCardMenu | /areas/[areaId] page |

## Deferred Ideas

- **Per-area color** — not in scope (schema has no color column; would need migration). Future phase item.
- **Per-area icon picker** — not in scope (schema has no icon column beyond emoji). Future phase item.
- **Optimistic UI for /areas CRUD** — pages use router.refresh() settle path instead of optimistic dispatch. Acceptable for a single-user app; could be upgraded in a future phase if latency is noticeable.
- **Bulk area reorder from /areas page** — AreasTree already supports drag-reorder via sidebar; the Manage section is read-only order-wise.

## Test Commands

```bash
# Typecheck (new files)
cd apps/web && pnpm tsc --noEmit
# Result: 0 errors in any of the new/modified areas/projects files.
# Pre-existing unrelated errors: Sidebar.tsx JSX tag (unstaged working tree change,
# not introduced by this quick task) + api-jarvis-tts.test.ts NextRequest type
# (pre-existing test file issue).
```

No vitest tests were added for this quick task (UI-only components; plan called for manual verification in Task 4).

## Awaiting: Task 4 Manual Verification

Start the dev server and verify the full CRUD loop per the plan's Task 4 checklist:

**On /areas:**
1. "New Area" button → create area with emoji → appears in tree + Manage list.
2. ⋯ → Edit → rename + change emoji → updates after refresh.
3. ⋯ → Delete on area with projects → area disappears; "No Area" bucket appears with orphaned projects.
4. ⋯ → Delete on "No Area" bucket → toast "Can't delete the No Area bucket."

**On /areas/[areaId]:**
1. "New project" button → creates project pre-scoped to area.
2. Card ⋯ → Rename → name updates.
3. Card ⋯ → Edit details → description + icon update.
4. Card ⋯ → Move to another area → card disappears from source, appears in destination.
5. Card ⋯ → Delete → card removed; linked tasks still exist on /tasks.

**Aesthetic check:** fonts, edges, surface tokens match the rest of the app; no new visual language.

Type "approved" or describe issues to resume.
