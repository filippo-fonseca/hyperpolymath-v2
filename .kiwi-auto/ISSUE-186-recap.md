# Issue #186 — skipped

**Status:** skipped (not attempted). Branch left untouched aside from this recap.

## Issue
"Improve pill styling for tags, mentions, and similar labels (better shadows, refined look)" — labels: enhancement, kiwi-drafted, ui.

## Why skipped (doability rules)

This issue fails the "small, self-contained, certain" bar for an unattended 45-minute session:

1. **Multi-surface, not localized.** The acceptance notes explicitly require consistency "across all usage contexts (tags, mentions, and any similar label components)." A quick grep across `apps/web/components` surfaces pill/badge/chip patterns in dozens of files — tasks (`PriorityChip`, `TaskCard`, `TaskListRow`, `TaskFilters`, kanban), training (`ActivityCard`, `TrainingMonthView`, activity dialogs), shell (`TopTabBar`, `SidebarTree`, `HudStatusPill`), captures/mentions (`inline-markdown.tsx`, `strip-receipts-pill`), plus the shared `ui/badge.tsx`. There is no single canonical pill primitive that all callers route through, so a real fix is either (a) a design-system refactor to introduce one and migrate callers, or (b) a coordinated restyle across many files. Both are too large and risky for unattended work.

2. **Design/UX judgment required.** "Polished, modern look inspired by high-quality design references (glassy/frosted pill aesthetics)" is subjective and open-ended. There is no locked reference, no token spec, no before/after mock. Memory notes flag that this codebase already has a refined neumorphic register (`.glass-tile` / `.glass-button`) and a Phase 6.1 visual-redesign initiative with directional anchors still being resolved — restyling pills unattended could easily land in the wrong register and would need to be redone.

3. **Cross-cutting theme + a11y verification.** Acceptance requires light and dark themes plus WCAG contrast compliance across every restyled pill variant. That's a manual verification loop (visual + contrast checks per surface) that an unattended agent cannot reliably close inside 45 minutes.

4. **Better handled deliberately.** This belongs in the Phase 6.1 visual-redesign track (already in flight per project memory), where pill styling can be specced once against the locked directional anchors and rolled out with proper review.

## Recommendation
Defer to Phase 6.1. When picked up, first decide whether to introduce a single `Pill` primitive (and migrate) or restyle `ui/badge.tsx` + inline pill classNames in place; then lock a token spec (shadow, radius, bg, border, typography) against the Stark-HUD-through-Linear-discipline anchor before touching callers.
