# Issue #215 — Allow users to delete areas

**Status:** shipped (single commit on `kiwi/auto/2026-07-06-issue-215`)

## What changed

- `apps/web/components/areas/AreaDetailHeader.tsx` — added a **Delete** button next
  to Edit / New project on the `/areas/[areaId]` header, with a confirmation dialog
  ("Any projects under it will be moved to the No Area bucket. Tasks and captures
  stay intact."). On confirm it calls the existing `deleteArea` server action, then
  navigates back to `/areas`.
- `apps/web/components/areas/AreaContextMenu.tsx` — fixed stale copy in the sidebar
  delete confirmation dialog: it previously claimed deletion was blocked when child
  projects exist, but the server action actually reassigns child projects to the
  per-user "No Area" bucket. Copy now matches `AreaCardMenu`.

## Why this scope

Both the server action (`deleteArea`) and the sidebar / `/areas` card menus already
implemented delete with confirmation — the missing surface per the acceptance notes
("delete accessible from the area detail or area management screen") was the area
detail page header. This is a small, additive UI change touching one component,
with an unambiguous acceptance criterion and no design questions, no new deps, no
migrations. The stale sidebar copy fix rides along because it directly contradicts
the shipped behavior and would confuse anyone using the new detail-page delete.

## Verification

- Typecheck: no new errors in either edited file (pre-existing failures in
  `tests/api-jarvis-tts.test.ts` are unrelated).
- Server behavior for `deleteArea` unchanged — reuses the existing action which
  handles the "No Area" bucket reassignment in a transaction and refuses to delete
  the sentinel itself.

## Follow-ups (out of scope, not blocking)

- Undo/trash was mentioned as one option in the acceptance notes ("or a clear
  warning is shown that deletion is permanent"). The delete is permanent and the
  dialog is explicit; a full undo/trash flow would be a larger, cross-surface
  design task. Left for later.
