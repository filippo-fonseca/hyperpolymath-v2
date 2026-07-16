# Verification — unit-fix-people-sidebar

Branch `sd3/unit-fix-people-sidebar`. Two user-ordered pre-merge fixes, each atomic.

## Commits
- `5340a2a2` sd3(people): bring person detail sheet to sd register
- `8aec7e65` sd3(people): align roster card tag chips to the sd filter-rail grammar
- `f7333be4` sd3(sidebar): reveal full wordmark on collapsed-rail hover

## Item 1 — Person detail modal → sd
The detail surface is the `Sheet`-based `PersonDetailPanel` (opened from a
`/people` card). It was cramped, edge-to-edge, centered, with a low-contrast
`--sd-box` plate sitting on the `--sd-box` sheet. Reworked to the sd form
grammar, same data/features:
- Padded body; left-aligned identity header (avatar + name + **mono** email).
- Tag chips → mono/uppercase, border-only — identical to the `/people` filter
  rail (`PeopleClient`) chip grammar. `PersonCard` roster chips aligned to the
  same grammar so tags read identically across the whole people surface.
- Mono/uppercase (11px, tracking .12em) section eyebrows for Phone / Bio /
  References / Linked.
- Phone rendered mono + tabular-nums.
- Inner plates (references stat, linked rows) moved to `--sd-input` so they read
  raised against the `--sd-box` sheet; mono per-type counts + big tabular count.
- Sheet shell (`components/ui/sheet.tsx`, already sd) consumed, not edited.

## Item 2 — Collapsed-rail hover wordmark
On a fine-pointer hover of the 56px collapsed rail, the top logo zone reveals
the full EB Garamond "Hyperpolymath" wordmark as a floating plate anchored at
the rail's top-left (solid `--sd-box`, hairline `--sd-line` border, 6px offset
shadow), 140ms opacity + 4px translate; the "H" monogram cross-fades out so the
top reads as a single mark. Absolutely positioned → overlays rather than
expands the rail; the `aside` width stays tied to the real collapsed state, so
no layout shift. Gated to `@media (pointer: fine)` (no touch hover artifacts);
`prefers-reduced-motion: reduce` collapses both transitions to an instant cut.
- Implemented as real classes in `globals.css` (`.sidebar-logo-flyout` /
  `.sidebar-logo-mono`) to sidestep the Tailwind scan gap (§0). Confirmed
  present in the compiled CSS: base hidden state (`opacity:0; transform:
  translate(-4px)`), the `pointer:fine` reveal (`.group\/sidebar:hover
  .sidebar-logo-flyout{opacity:1;transform:translate(0)}` + mono fade), and the
  reduced-motion `transition:none` guard.
- Uses the existing `Logotype` component (inline `font-family` per its scan-gap
  note). No `ui/` primitive edited.

## Gates
- `pnpm --filter web typecheck` — green.
- `pnpm --filter web build` — green (compiled + page data collected; env copied
  from the main checkout for the DB-backed page-data pass).

## Headless evidence (:3834, 1440×900, both themes)
Auth blocks `/people`, so per §1 the surfaces were rendered through a temporary
`app/preview-people-sidebar` route (mock person; faithful collapsed-rail markup
using the real classes), screenshotted, then the route was **deleted**. One
headless browser, global lock acquired/released around capture.
- `sd3-people-modal-dark.png`, `sd3-people-modal-light.png` — detail sheet, both themes.
- `sd3-sidebar-flyout-dark.png`, `sd3-sidebar-flyout-light.png` — collapsed rail
  with hover flyout revealed (hover synthesized via Playwright), both themes.

Console during capture: only the pre-existing `DialogContent`
`aria-describedby` warning from the Sheet primitive (not introduced here) and a
500 on a preview-route metadata sub-resource (present even on the panel-less
rail view → not from the changed components). No runtime errors from the
changed code.

Note for the Conductor: authed `/people` (roster card chips + opening the detail
sheet + real collapsed-sidebar hover) is best pixel-verified on :3000 post-merge.
