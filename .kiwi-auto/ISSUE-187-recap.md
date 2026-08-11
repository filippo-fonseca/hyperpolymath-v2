# Issue #187 — skipped

**Title:** Mentions autocomplete dropdown missing across all input fields

## Why skipped

This issue fails the unattended-doability rules on multiple axes:

1. **Multi-surface, not localized.** The bug spans four distinct input contexts (⌘K modal, main Jarvis screen inline typing, Capture text field, Files text field). Each surface likely has its own input implementation, so a proper fix touches several components and their shared mention infrastructure — not one or a few files.

2. **Ambiguous scope.** The report says the dropdown is "either absent or not functioning correctly" without pinning down which. Root cause could be a missing portal/z-index issue, a broken suggestion query, a regressed keyboard handler, a shared component not mounted on those surfaces, or all of the above. No single unambiguous acceptance criterion.

3. **Design/UX judgment required.** The proposed behavior asks for a "consistent, properly rendered" dropdown across every surface, plus edge cases (empty results, slow network, rapid typing). Getting consistency right needs product judgment about the mention component's canonical behavior — not a mechanical fix.

4. **Likely architectural.** "Consistent behavior across every input surface" strongly implies extracting or consolidating a shared mentions component and wiring it into each surface. That's a real planning phase, not a 45-minute unattended slice.

## Recommendation

Break this into a small planning pass first: (a) audit which mention component (if any) is shared, (b) reproduce on each surface and record the specific failure mode per surface, (c) decide whether the fix is "wire the existing component into missing surfaces" or "rebuild the shared component," then (d) file focused sub-issues per surface. Handle interactively with /gsd:discuss-phase or /gsd:plan-phase rather than an unattended auto-dev slot.

## Actions taken

None. Branch left untouched aside from this recap.
