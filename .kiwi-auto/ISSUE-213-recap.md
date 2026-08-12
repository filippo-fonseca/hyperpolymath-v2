# Issue #213 recap — skipped

**Status: skipped** (BAD fit for an unattended 45-minute quick slot)

## Why skipped

Issue #213 bundles three items, and while two are self-contained, the third
turns the ticket into an app-wide, design-judgment task:

1. Real-time UI update on Area creation — localized, doable.
2. Auto-close creation modal on success — localized, doable.
3. **Unify neumorphic modal design app-wide** — architectural, multi-surface,
   design/UX judgment call, no clear acceptance criterion.

Acceptance note 3 explicitly asks for "A shared/reusable neumorphic modal
component (or design token set) applied app-wide." That means:

- touching every modal call site across the app (Areas, Projects, Tasks,
  Captures, People, Calendar, settings, etc.),
- picking a canonical neumorphic register (there is memory context that the
  refined `.glass-tile` / `.glass-button` neumorphic register is now canonical,
  but the shared *modal* primitive still needs to be designed and adopted),
- regression-testing every existing modal flow (edit, delete, other entity
  types) per acceptance note 4.

That is multi-surface, requires product/design judgment, and cannot be
verified unattended inside a 45-minute cap without significant risk of
shipping a half-migrated modal system. Per the doability rules ("when in
doubt, treat the issue as too big and leave it out"), this is a skip.

There is also a near-duplicate umbrella issue (#216 "Areas & Projects: Modal
UI overhaul — real-time updates, auto-close on creation, and consistent
neumorphic design") which reinforces that this belongs in a planned
milestone, not an unattended quick pass.

## What a good split would look like

Filing separate, tractable follow-ups would make each piece a good quick-slot
candidate:

- **Areas: real-time list update after create** (single file, TanStack Query
  invalidate on create mutation success, or Realtime channel wiring already
  used elsewhere).
- **Areas: auto-close create modal on success** (single component; move
  `setOpen(false)` into the mutation's `onSuccess`).
- **Design: canonical neumorphic `<Modal>` primitive** — dedicated planned
  phase, not a quick task; roll out call-site by call-site behind the shared
  primitive.

## Actions taken

- No code changes.
- No commits other than this recap on the current branch.
- Branch left untouched.
