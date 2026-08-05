---
task: craft-ui-v2
created: 2026-08-04
branch: feat/craft-ui-v2
status: in-progress
mode: quick (plan authored by orchestrator from Mobbin research + codebase map)
---

# Craft UI v2 — shell restructure + register propagation

**Goal.** Take the web app from "three glass islands" to Craft.do's real architecture:
one flat, calm canvas carrying all quiet chrome (borderless sidebar, minimal top bar
with a centered cmd-K pill, floating Jarvis pill, dock as a quiet card column), and a
single floating white content sheet where all elevation lives. Then propagate the
deepened register through LifeOS, Tasks, and Wiki. Light mode is primary; dark must
stay fully specified. All features/functions are preserved.

**Research inputs** (read these first):
- Craft design language: `/private/tmp/claude-501/-Users-filippofonseca-Developer-Projects-hyperpolymath-v2/1fbf8b3b-361b-4dac-b26d-63c10622fbd0/scratchpad/craft-design-language.md`
- Existing register: `apps/web/app/globals.css` lines ~2139-2459 ("craft register"), `apps/web/lib/tint.ts`
- Design docs: `docs/DESIGN-SYSTEM.md`, `apps/web/app/design/page.tsx` (living style guide — update in lockstep)

## Hard invariants (violating any of these is a defect)

1. `@container/main` lives only on Stage's scroll box. Do not rename or re-box it —
   kanban and the LifeOS bento resolve `@3xl/main` / `@4xl/main` against it.
2. `PageScaffold.tsx` and `SidePanel.tsx` are U0-frozen. Restyle internals only if
   needed; never change their contracts (no spacing props, SidePanel stays inline
   in the right slot, no portal/backdrop/focus-trap).
3. `.wiki-explorer` redeclares the whole `--sd-*` ladder locally (globals.css ~698,
   ~1556-1620) including a cyan accent. Only the Wiki unit touches that scope.
4. Accent budget: max two accent moments per viewport. Color is data (tints), not
   decoration. No hover borders, no per-row dots.
5. Sidebar rows keep NO hover fill (documented anti-goal; prevents strobing).
6. The only sanctioned width animation is the AppShell `grid-template-columns`
   transition. Everything else animates shadow/color/opacity only.
7. Nothing under 140ms; use the existing `--duration-*` / `--ease-*` tokens.
8. Type ladder only (`text-display/title/subtitle/body/meta/micro`); `text-[Npx]`
   stays banned. Uppercase stays banned outside kbd + sidebar eyebrows.
9. localStorage keys (`sidebar-collapsed`, `cockpit-dock-collapsed`,
   `cockpit-dock-widgets`, `hyperpolymath-theme`) and all keyboard shortcuts keep
   working. JarvisCommandBar never autofocuses and stays a flex sibling (never an
   overlay) so it can't cover BlockNote.
10. Every visual change must hold in `.dark` — each new/edited class gets its dark
    counterpart in the same commit.

## Design contract — register v2 class names (fixed API between units)

Unit 1 defines these in globals.css (light + dark). Later units consume them by name:

- `.craft-canvas-chrome` — chrome that sits directly ON the canvas: transparent
  background, no border, no shadow. Applied to Sidebar and Dock containers in place
  of `craft-glass rounded-panel`.
- `.craft-pill` — white pill chrome: `--surface-raised` bg, hairline `--edge`,
  `--shadow-card`, radius-full. For the top-bar search field and small floating
  chrome. Hover → `--shadow-card-hover`.
- `.craft-chip` / active state via `aria-pressed`/`data-active` — segmented filter
  chips: 28px tall pills, `--surface-raised` + `--edge` at rest; active = tinted
  fill using the generic `--tint-bg/--tint-ink` triple (compose with a `tint-*`
  class) or `--selected` neutral when untinted.
- `.craft-glass-pop` — frosted popover/menu/modal surface: translucent
  `--glass-panel-bg`-family bg, `blur(20px) saturate(160%)`, hairline light edge,
  `--shadow-pop`, `--radius-card`. `@supports` fallback to `--glass-panel-solid`.
  Wire into `.sd-menu-surface`, `.sd-modal-surface`, and the shadcn popover/
  dropdown/dialog/command surfaces via the existing cascade-upgrade section
  (globals.css 2437-2459 pattern) so ~all menus go glass without touching call sites.
- `.craft-day-tile` — small rounded canvas-gray tile (date + weekday stack), with
  `[data-today]` variant = `tint-sky` pastel fill + ink. For calendar/agenda later;
  define now so the API is stable.
- `.craft-backdrop` (edit) — calm it: keep the cream canvas, reduce the three
  radial pastels to a whisper (roughly half current alpha). Craft's canvas is
  almost flat; the wash should be felt, not seen.
- `.craft-card-hover` — unchanged, but propagated: every interactive `craft-card`
  gets it (33 call sites today, 1 uses hover).

## Units

### Unit 1 — Foundation: register v2 (serial, first)
Files: `apps/web/app/globals.css` (craft section + cascade upgrades only; do NOT
touch the `.wiki-explorer` scope), `apps/web/app/design/page.tsx` (+`TokenSwatches`
if needed), `docs/DESIGN-SYSTEM.md` (append a "craft v2" amendment section).
- Implement the design contract above, light + dark.
- Glass-ify menu/modal/popover surfaces via cascade upgrades.
- Add `/design` sections demoing: pill, chips (rest/active/tinted), glass-pop,
  day tile, canvas-chrome explanation, hover-lift on cards.
Commit: `feat(design): craft register v2 — canvas chrome, pills, chips, glass pops, day tiles`

### Unit 2 — Shell (serial, after Unit 1)
Files (Tier 1): `components/shell/AppShell.tsx`, `cockpit/Rail.tsx`, `Sidebar.tsx`,
`PersistentNav.tsx`, `TopTabBar.tsx`, `cockpit/Stage.tsx`, `cockpit/Dock.tsx`,
`cockpit/DockWidgetSlot.tsx`, `cockpit/JarvisCommandBar.tsx`, `cockpit/RightSlot.tsx`.
1. **Sidebar on canvas**: swap `craft-glass rounded-panel` → `craft-canvas-chrome`.
   Keep widths (230/56), collapse behavior, overlay-below-md, row grammar exports.
   Selected row = soft `--selected` pill (already close). Section eyebrows stay.
   Visual target: Craft's sidebar — chrome recedes, canvas shows through.
2. **Top bar**: TopTabBar's full-width segmented tabs are replaced by a Craft top
   bar living on the canvas above the sheet: left = NavArrows + current-route title
   (from ROUTE_META) as quiet breadcrumb text; center = a `craft-pill` search field
   ("Open anything… ⌘K") that opens the existing CommandMenu; right = split-screen
   toggle, JarvisUnreadBadge, ThemeToggle, existing status indicators as small
   ghost icon buttons. Navigation moves fully to the sidebar (it already lists
   every route). Keep the file name/exports; keep ROUTE_META.
3. **Jarvis pill**: restyle JarvisCommandBar's collapsed state as a centered
   floating-look pill (max-w ~640px, `craft-glass rounded-full`, centered in its
   shrink-0 box with transparent gutters) that expands to the current glass panel
   (rounded-2xl, response area) on focus/activity. Still a flex sibling; still
   never autofocuses. This is the Craft "Assistant" pill, promoted to our core
   input.
4. **Dock**: container `craft-canvas-chrome`; widgets remain `craft-card` +
   tint plates, now carrying all the elevation themselves. Add `craft-card-hover`
   to interactive widgets. Keep collapse/persist/width arbitration untouched.
5. **Stage**: keep `craft-sheet` + `@container/main` exactly; nudge presence —
   radius `--radius-panel`, ensure the float shadow reads on the calmer backdrop.
6. **AppShell**: keep the grid + gap mechanics; with sidebar/dock now chromeless
   the composition should read: canvas edge-to-edge, one floating sheet, quiet
   columns either side. Adjust padding/gaps only if composition demands (p-2.5 →
   up to p-3); do not touch the grid-template-columns transition.
Commits (one per numbered item, explicit pathspecs):
`feat(shell): sidebar becomes quiet canvas chrome` /
`feat(shell): craft top bar — breadcrumb, cmd-k pill, icon cluster` /
`feat(shell): jarvis command bar becomes the floating pill` /
`feat(shell): dock sheds its panel — widgets carry the elevation` /
`feat(shell): stage sheet presence on the calm canvas`

### Unit 3 — LifeOS (parallel with 4, 5)
Dir: `components/lifeos/` + `app/(app)/lifeos/page.tsx`. No globals.css edits —
report any needed additions in your summary instead.
- Bento tiles: `WidgetCard` moves from glass-tile toward Craft cards — white
  `craft-card` + `craft-card-hover`, tinted icon plates (tintFor), 13px meta.
  Keep `craft-glass-tile` only if the space-video backdrop is behind (Widgets
  view over video needs glass; Areas view over canvas uses cards). Choose per
  surface, don't blanket-swap.
- Hero: calmer — title + date + one accent moment; QuickSend restyled as a
  `craft-pill` input.
- Keep the never-scrolls contract, `useWidgetSpans`, section toggle, resize
  handles, and the `isolate` stacking fix.
Commit: `feat(lifeos): craft v2 pass — carded bento, pill quick-send, calm hero`

### Unit 4 — Tasks (parallel with 3, 5)
Dir: `components/tasks/` + `app/(app)/tasks/page.tsx`. No globals.css edits.
- Filters row → Craft segmented `craft-chip` pills (Inbox / Today / Upcoming /
  All + existing filters). Active chip tinted.
- List view → Craft Tasks hub: bare rows on the sheet (no per-row cards):
  checkbox + `text-body` title + trailing meta chips (date, project) right-aligned;
  small gray disclosure section labels; completed behind the existing toggle.
- Kanban: keep tinted wells + white cards (already Craft-like); add
  `craft-card-hover` lift to TaskCard; column headers as quiet labels with count.
- TaskDetailPanel (inline SidePanel): section spacing to Craft density, pill
  chips for status/priority using STATUS_TINT.
- TaskCreateInline → `craft-pill` styled input row.
Commit: `feat(tasks): craft v2 pass — chip filters, bare-row list, lifted board`

### Unit 5 — Wiki (parallel with 3, 4)
Dirs: `components/wiki/`, `components/pages/`, wiki CSS files, PLUS the
`.wiki-explorer` scopes in `globals.css` (this unit owns them exclusively).
- Retire the local cyan `--sd-*` ladder: re-point the `.wiki-explorer` scope at
  the app's base tokens/accent so the explorer joins the register (delete or
  neutralize the local redeclaration; verify nothing regresses to near-black in
  dark).
- Explorer grid: folder/page tiles → white `craft-card` + `craft-card-hover`,
  page-preview thumbs (PagePreviewCard) Craft-style: mini page render, title,
  breadcrumb + updated `text-micro` gray; pastel folder icon plates via tintFor.
- Explorer chrome (toolbar, inspector, context menus, new-menu): menus/popovers
  should inherit `craft-glass-pop` automatically via Unit 1; fix any that use
  bespoke surfaces. Toolbar → quiet ghost buttons + `craft-chip` view toggle.
- Editor (`PageDetailClient` + `PageBlockEditor`): the document reads as a Craft
  sheet — cover image bleeds to sheet edges with rounded top, centered ~700px
  column, EB Garamond display title, properties row as quiet pill chips.
  `page-block-editor.css` adjustments allowed.
- JournalRail cards → craft-card + day tiles (`craft-day-tile`).
Commits: `feat(wiki): retire the explorer's local ladder — join the craft register`
then `feat(wiki): craft v2 pass — carded explorer, sheet editor, glass menus`

### Unit 6 — Verify + polish (serial, last; orchestrator-led)
- `pnpm -C apps/web typecheck` (or repo equivalent) + production build green.
- Headless screenshots (playwright MCP, `pnpm verify:bootstrap` for auth) of
  /lifeos, /tasks (list + kanban), /wiki, /wiki/[page], light + dark; fix what
  reads wrong (shadow strength, contrast, spacing).
- Changelog entry + STATE.md quick-task row + SUMMARY.md.

## Execution notes for executors
- Read the research files and the target components before editing; match local
  idiom; state via existing patterns.
- Stage with explicit pathspecs only. Several agents share one working tree in
  Units 3-5: touch ONLY your assigned directories; if `git commit` hits a stale
  `index.lock`, wait 2-5s and retry (up to 5 times).
- Do not run the dev server or install anything; Unit 6 verifies.
- Report back: commits made (hash + subject), files touched, any globals.css
  additions you need, anything you deliberately left alone and why.
