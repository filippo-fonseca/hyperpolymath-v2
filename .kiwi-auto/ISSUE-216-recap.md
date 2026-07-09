# Issue #216 — skipped

**Title:** Areas & Projects: Modal UI overhaul — real-time updates, auto-close on creation, and consistent neumorphic design

## Why skipped

This issue fails the doability rules for a 45-minute unattended slot on multiple axes:

1. **Multi-surface, app-wide scope.** Acceptance explicitly requires the new neumorphic modal to be applied to Area creation, Project creation, "and all other modal dialogs in the app." That's an unknown number of surfaces (likely 6+ across areas, projects, tasks, captures, calendar, people, etc.) and cannot be bounded to "one or a few files."

2. **New shared/reusable component required.** Acceptance calls for a "Neumorphic modal component implemented as a shared/reusable component" — that's a small design-system decision, not a localized bug fix. Introducing a new primitive plus threading it through every existing modal is architectural, not focused.

3. **Design judgment required.** "Consistent neumorphic design" and "high quality standards" are open design questions. The neumorphic register in this app is canonical (`.glass-tile` / `.glass-button`) but what a full modal chrome looks like in that register (backdrop, border, shadow depth, close affordance, header treatment, form field styling) is unspecified and would need Filippo's direction.

4. **Three bundled concerns.** Real-time list update, auto-close-on-success, and full modal redesign are three separable pieces. The first two are localized bugs; the third is a redesign. Bundling them makes atomic commits messy and blows the time budget.

5. **Overlap with #213.** Issue #213 covers the same Areas-page bugs (real-time UI + modal close + neumorphic modal unification app-wide). Doing #216 unattended risks a divergent implementation from whatever #213 lands.

## Recommendation

Split into narrower issues before an unattended slot picks it up:
- A single-file fix for the Areas realtime invalidation + auto-close (small, tractable).
- A single-file fix for the Projects modal auto-close.
- A separate, attended design pass for the neumorphic modal primitive with Filippo present to make register calls.

Branch left untouched.
