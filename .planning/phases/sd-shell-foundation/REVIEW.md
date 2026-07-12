---
phase: sd-shell-foundation
reviewed: 2026-07-12
depth: deep
files_reviewed: 21
findings:
  critical: 0
  high: 0
  medium: 0
  low: 2
  total: 2
status: clean
---

# Code Review — bgsd unit "sd-shell-foundation"

**Diff range:** `e205d7b6..HEAD` (12 commits) over `apps/web/`
**Verdict:** Clean. No behavioral, correctness, security, a11y, or token-layer defect introduced by this unit. Two Low test-quality notes only.

## Summary

This unit adds a `--deck-*` alias layer + `--dur-*` motion tokens to `globals.css`, a net-new `components/spacedrive/**` primitive family (13 components across 11 files), a register-only restyle of six `components/shell/**` files, and two net-new test files. I reviewed all four priority areas: frozen-contract preservation, token-layer correctness, primitive correctness/a11y, and test quality.

All 18 new tests pass locally. I independently compiled the two Tailwind utility forms in question through the repo's own Tailwind 4.3 to confirm CSS output, and traced every `--deck-*` alias to its backing token definition.

## Priority 1 — Frozen-contract preservation (shell) — PASS

The six restyled shell files (`AppShell`, `Breadcrumbs`, `NavArrows`, `PersistentNav`, `Sidebar`, `TopTabBar`) change only typography (`font-serif`→`font-sans`, size/tracking), motion durations (hardcoded `duration-150/200` → `--dur-hover`/`--dur-panel` tokens), and comments. I verified mechanically that NO added or removed line in the shell diff contains any of: `href`, `aria-*`, `role=`, a localStorage key, a `window.*`/`addEventListener`/`dispatchEvent` call, a `data-tour` value, `useTableSubscription`, or `tableKey`.

- localStorage keys (`sidebar-collapsed`, `sidebar-show-archived`, `tasks-expanded`, `top-tab-last-route`, `top-tab-today-route`, `split-screen-on`) — untouched; the files that own the event/route contracts (`SidebarTree.tsx`, `ProductTour.tsx`, `GlobalHotkeys.tsx`) are not in the diff at all.
- `AppShell.tsx:85-89` — only the non-reduced-motion branch duration changed `0.2`→`0.22` (comment: matches `--dur-panel`). The `reduceMotion ? { duration: 0 }` gate, `onAnimationStart/Complete` handlers, and easing curve are byte-identical. The collapsed hover-overlay mechanism, split-screen 70/30, and panel suppression logic are not in any changed hunk.
- Reduced-motion gating is preserved everywhere it existed.

The behavior freeze holds.

## Priority 2 — Token layer correctness — PASS

- Every `--deck-*` alias resolves to an existing token. Verified definitions in `globals.css`: `--sd-*` surface/hairline/state tokens ARE defined app-wide at `:root` (L1404-1419) and `.dark` (L1421-1436) — the deck surface/line/state aliases resolve correctly in both themes. The claim in the alias-block comment ("`--sd-*` ... IS defined app-wide") is accurate.
- Accent aliases (`--deck-accent`/`-faint`/`-deep`) point at `--hud-cyan`/`--hud-cyan-dim`/`--hud-cyan-light` — all defined at `:root` (L44-47) and `.dark` (L1068-1071). Correctly NOT the `.wiki-explorer`-scoped `--sd-accent*`.
- Ink aliases (`--deck-ink`/`-dull`) point at semantic `--ink`/`--ink-muted` (theme-aware app-wide), correctly NOT the wiki-scoped `--sd-ink*`.
- No existing token value was changed; the additions are purely new `--dur-*` and `--deck-*` declarations plus the `.sd-motion` reduced-motion reset inside the existing `@media (prefers-reduced-motion: reduce)` block.
- `color-mix(in oklch, var(--ink-muted) 65%, transparent)` for `--deck-ink-faint` is valid.

## Priority 3 — Primitive correctness + a11y — PASS

- **DenseListRow** (`DenseListRow.tsx`): Enter and Space both activate; Space calls `event.preventDefault()` (L37) to suppress page scroll. `role="button"`/`tabIndex=0`/`aria-pressed` only when interactive; inert (no role) without `onActivate` — both paths test-covered. `focus-visible:[box-shadow:var(--ring-focus)]` ring present.
- **ModeStrip** (`ModeStrip.tsx`): real `<button type="button">` toggles with `aria-pressed={active}`; `<fieldset aria-label>` exposes the implicit `group` role (confirmed by passing test at L143). `onChange` fires with the mode value.
- **AmbientOrb** (`AmbientOrb.tsx`): reduced-motion branch returns a static `<div>` with `opacity: ceiling` and no animation; `aria-hidden`; gradient is self-authored from `--deck-accent`/`--hud-cyan` (no Spacedrive asset); only transform+opacity animate on a 14s loop; `intensity` clamped to [0,1] via `Math.max/min`. Honors both `useReducedMotion()` and `.sd-motion`.
- **HairlineDivider** uses native `<hr>` (implicit `separator` role) with `aria-orientation`. **DeckPanel** polymorphic `as` + tone-backed `backgroundColor`. All `--ring-focus`, `--font-sans`, `--font-mono` tokens used by primitives are defined.
- **Motion-token utility form verified:** the primitives use `duration-[var(--dur-hover)]` (Tailwind `duration-*` arbitrary value) where the shell uses `[transition-duration:var(--dur-hover)]` (arbitrary property). I compiled `duration-[var(--dur-hover)]` through this repo's `tailwindcss@4.3.0` and it emits `transition-duration: var(--dur-hover)` (plus a harmless `--tw-duration` var). Both forms produce working motion — no silent no-op.

## Priority 4 — Test quality — PASS with two Low notes

The load-bearing behavioral assertions are real: the `tasks-expanded-change` cross-subscriber sync test (`shell-sidebar-contract.test.tsx:55-66`) genuinely renders two independent `useTasksExpanded` hooks and asserts the second reacts to the first's `setExpanded`, which is the exact mechanism the AppShell relies on. The AmbientOrb reduced-motion test asserts the static branch (`aria-hidden` + `opacity === "0.5"`). ModeStrip and DenseListRow contracts are exercised for real.

---

## Low findings (test completeness only — no shipped-code defect)

### LO-01: DenseListRow Space test does not assert `preventDefault`

**File:** `apps/web/tests/spacedrive-primitives.test.tsx:166-168`
**Issue:** The Space-key case fires `fireEvent.keyDown(row, { key: " " })` and only asserts `onActivate` was called 3 times. It never verifies the `event.preventDefault()` that `DenseListRow.tsx:37` performs for Space (the guard against page scroll when a listrow has focus). The component behavior is correct; the test just doesn't cover that half of the Space contract, so a regression that dropped the `preventDefault` would pass silently.
**Failure scenario:** A future edit removes the `if (event.key === " ") event.preventDefault();` line. Space still activates the row, the test stays green, but focused rows now scroll the page on Space.
**Fix:** Assert on a spied event, e.g. dispatch a real `KeyboardEvent` for Space and check `defaultPrevented`:
```tsx
const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
row.dispatchEvent(evt);
expect(evt.defaultPrevented).toBe(true);
```

### LO-02: sidebar-collapsed/show-archived "serialization guard" is tautological

**File:** `apps/web/tests/shell-sidebar-contract.test.tsx:76-88`
**Issue:** This test round-trips `localStorage` directly (`setItem(key, String(true))` then `getItem(key) === "true"`) without ever importing or rendering `Sidebar`. It asserts that `String(true) === "true"` and `localStorage` echoes what you put in — both properties of the platform, not of the Sidebar. It does not actually guard the Sidebar's `"true"/"false"` protocol; a refactor that switched Sidebar to `"1"/"0"` would leave this test green.
**Failure scenario:** Someone changes `Sidebar.tsx` L110-120 to persist `"1"/"0"`. The intended contract-break tripwire never fires because the test doesn't touch Sidebar.
**Fix:** Either drop the test (the comment's stated intent isn't met) or exercise the real component — render `Sidebar`, toggle collapse/archived, and assert `localStorage.getItem("sidebar-collapsed") === "true"` from the component's own write path.

---

_Reviewed: 2026-07-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
