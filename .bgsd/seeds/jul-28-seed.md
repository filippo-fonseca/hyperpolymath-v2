# jul-28 sesh seed: authoritative worker brief

Merged from seven scout reports plus `.bgsd/seeds/jul-28-decisions.md` (D1-D12, sealed).
Binding on all twelve units. Where this file and a scout report disagree, this file wins.
Where this file and the sealed decisions disagree, **the decisions win and the conflict is a
blocker**, not a judgement call.

Paths are relative to `apps/web/` unless the path starts with `apps/`, `packages/`,
`supabase/`, `tools/`, or `.bgsd/`.

---

## 1. SESSION INTENT

The app must feel simple, intuitive, clean and smooth, like moving between pages in Notion. Today
it does not: it is high-contrast (body ink at 14.4:1 light and 15.7:1 dark against Notion's 12.26
and 11.86, on a near-black `#090b0d` dark canvas that is itself a CSS cascade bug), it is cluttered
(813 `font-mono` and 589 `uppercase` micro-labels across eight competing tracking values, 622
sub-12px strings, 366 hairline borders nesting inside each other, 20 distinct radii, six different
page containers so left edges never line up between routes), and it is genuinely slow (every
`(app)` route render costs 25 to 34 serialized Postgres round-trips on a one-connection pool, and
32 `router.refresh()` sites re-run that entire 25-query layout on every mutation). Filippo's word
for the result is "vibecoded." This sesh fixes all three at once: a control-center cockpit shell
that gives the stage room to breathe, one calmed design contract that five parallel UI units build
against so the result reads as one system, a dedicated performance unit that removes the server
time the cockpit alone would not touch, and the feature work (wiki, tasks, areas, projects, LifeOS,
JARVIS over text) rebuilt inside that shell. The core value stays "type one sentence into Kiwi";
D3 makes Kiwi furniture at the bottom of the stage rather than a dialog you summon.

---

## 2. SHARED DESIGN CONTRACT (SDC-1, reconciled with D3)

This is the section that decides whether five parallel agents produce one app or five. Read it in
full before writing a line of UI. It supersedes `docs/DESIGN-SYSTEM.md` §2, §3 (tracking), §5
(radii), §7 (page scaffold) and §14 (durations); U0 amends that file in the same commit as the
token rewrite so it is never left silently stale.

### 2.0 Reference vibe

| Surface | Reference | What to take from it |
|---|---|---|
| Inline detail panel | **Shakuro CoCreate** | The panel is *part of the page*. Content reflows around it. No dim, no overlay, no shadow, no focus trap. You keep working with it open. |
| Areas / Projects register | **AturnDeck** | A calm register of entities: generous rows, plain-text meta separated by `·`, one quiet status pill, no chrome-on-chrome. |
| Cockpit shell | **the 3D-editor shot** (D3) | Three fixed zones with a persistent command line. The tool frame stays put; only the stage swaps. |

### 2.1 Zone model (D3, binding)

```
┌────────────────────────────────────────────────────────────┐
│ ┌────────┐ ┌──────────────────────────┐ ┌───────────────┐ │
│ │  RAIL  │ │          STAGE           │ │  RIGHT SLOT   │ │
│ │ nav +  │ │   active feature route   │ │ Dock (default)│ │
│ │  tree  │ ├──────────────────────────┤ │      OR       │ │
│ │        │ │  🥝 ask kiwi…          ⏎ │ │  SidePanel    │ │
│ └────────┘ └──────────────────────────┘ └───────────────┘ │
└────────────────────────────────────────────────────────────┘
```

- **RAIL**: the left sidebar. Feature nav plus the contextual tree for the active feature.
  Collapsible; collapse state persists (the existing `sidebar-collapsed` localStorage key at
  `components/shell/Sidebar.tsx:126-131` is reused, not replaced).
- **STAGE**: the only zone that swaps on navigation. Owns scroll.
- **JARVIS command bar**: persistent, pinned to the bottom of the stage, one keystroke away,
  expandable to the full `/jarvis` page.
- **RIGHT SLOT**: the Dock by default; a `SidePanel` when one opens.

### 2.2 Right-slot arbitration rule (binding, D3)

There are never four live columns. Rail + stage + dock + detail panel starves the stage to roughly
600px on a 14-inch screen, which is the exact cramped feeling this sesh exists to remove.

1. The right slot is **one** CSS grid track on the cockpit shell.
2. Default occupant: the **Dock**. Collapse state persists across sessions (localStorage key
   `cockpit-dock-collapsed`).
3. Opening a `SidePanel` slides the Dock out and the panel in, in the same track, in one
   `grid-template-columns` transition. Closing restores the Dock to its prior collapse state.
4. The Dock auto-collapses below **1280px** viewport width and is not rendered at all below
   **1024px**.
5. Below **1024px** a `SidePanel` degrades to a full-width overlay sheet
   (`components/ui/sheet.tsx` with `overlay={false}`).
6. Exactly one `SidePanelHost` exists in the app and it lives in the cockpit shell, owned by U0.
   No unit mounts a second one. No unit re-introduces a `fixed` detail panel.

### 2.3 Colour and contrast (calmed scale)

Do not invent hex. These values are pre-measured. U0 writes them into `app/globals.css`; every
other unit consumes `--sd-*` names and changes nothing here.

```css
/* LIGHT :root */
--canvas:         oklch(98.5% 0.003 75);  /* #fbfaf8 */
--surface:        oklch(96.8% 0.004 75);  /* #f6f4f1   1.05 vs canvas */
--surface-raised: #ffffff;                /* cards lift by being lighter */
--ink:            oklch(31.5% 0.012 60);  /* #36302c  12.4:1  (was 14.4) */
--ink-muted:      oklch(55.5% 0.010 60);  /* #78726d   4.6:1 */
--ink-faint:      oklch(66.5% 0.008 60);  /* #98938f   2.9:1  decorative only */
--edge:           oklch(91.8% 0.004 75);  /* #e5e3e1   1.22  Notion-parity hairline */
--edge-strong:    oklch(87.5% 0.005 75);  /* #d8d5d2   1.40  dividers that must read */
--hover:          oklch(95.5% 0.004 75);  /* #f2f0ed */
--selected:       oklch(93.5% 0.005 75);  /* #ebe9e6 */
--accent:         oklch(55% 0.09 225);    /* #277c99   4.53  desaturated, hue 225 not 210 */

/* DARK .dark */
--canvas:         oklch(20.5% 0.006 255); /* #15171a   NOT #090b0d */
--surface:        oklch(24.5% 0.007 255); /* #1e2124   1.10 */
--surface-raised: oklch(28.5% 0.008 255); /* #272a2e   1.25 */
--ink:            oklch(88.5% 0.006 255); /* #d6d9dd  12.7:1 (was 15.7) */
--ink-muted:      oklch(70.5% 0.008 255); /* #9da0a5   6.8:1 */
--ink-faint:      oklch(58.5% 0.008 255); /* #797c81   4.3:1 */
--edge:           oklch(30.5% 0.008 255); /* #2c2f33 */
--edge-strong:    oklch(36%  0.009 255);  /* #3a3d42 */
--hover:          oklch(26.5% 0.007 255);
--selected:       oklch(30%  0.008 255);
--accent:         oklch(74% 0.095 225);   /* #62b8d8 */
```

- **Fix the cascade bug first.** `.dark{--sd-app:hsl(235 15% 13%)}` at `globals.css:1447` is
  clobbered by the later same-specificity `:root{--sd-app:var(--canvas)}` at `globals.css:1563`,
  which is why dark actually paints near-black. Re-scope the `:root` sd remap block
  (`globals.css:1562-1583`) so it cannot override `.dark` (`globals.css:1446-1461`). Verify the
  computed value of `--sd-app` in dark is `#15171a` before shipping anything else.
- **Remap, do not rename.** `--sd-app→--canvas`, `--sd-box→--surface-raised`,
  `--sd-dark-box→--surface`, `--sd-line→--edge`, `--sd-frame→--edge-strong`, `--sd-ink→--ink`,
  `--sd-ink-dull→--ink-muted`, `--sd-ink-faint→--ink-faint`, `--sd-accent→--accent`. There are
  366 + 440 call sites; **units change tokens, not call sites**.
- **Accent budget: at most two accent-coloured elements per viewport.** Legal: the focus ring, one
  primary button, one active-state indicator, the primary data series. Illegal: hover borders, card
  borders, section headings, icon fills, a decorative dot on every row. Replace every
  `hover:border-[var(--sd-accent)]` with `hover:border-[var(--edge-strong)]`
  (`ProjectHeader.tsx:216,249` are the named offenders).
- **Focus ring becomes a single 2px ring**: `box-shadow: 0 0 0 2px var(--canvas), 0 0 0 3.5px
  var(--accent)`. Retire the 4px double-cyan halo at `globals.css:92`.
- Functional inks (`--ink-sage`, `--ink-amber`, `--ink-coral`) stay dots and 12%-alpha chips only.
  The existing 6px functional dot at `PersistentNav.tsx:186-215` is the canonical shape.

### 2.4 Type scale (one ladder; no arbitrary px)

Registered as Tailwind steps in `@theme` by U0. **New code may not use `text-[Npx]`.**

| step | size / line-height | weight | colour | use |
|---|---|---|---|---|
| `text-display` | 30px / 1.2, `tracking-[-0.02em]` | 600 | `--ink` | page H1 only |
| `text-title` | 20px / 1.35, `tracking-[-0.01em]` | 600 | `--ink` | section H2, panel header, card title |
| `text-subtitle` | 16px / 1.45 | 500 | `--ink` | H3, list-item primary |
| `text-body` | 14.5px / 1.6 | 400 | `--ink` | **default body, the new baseline** |
| `text-meta` | 13px / 1.5 | 400 | `--ink-muted` | secondary lines, meta rows, descriptions |
| `text-micro` | 11.5px / 1.4 | 500 | `--ink-faint` | counts, chips, timestamps. Sentence case. |

- Sans (Space Grotesk) for everything. **Mono is for dates, `kbd` hints and numeric units only**:
  never a label, heading, button, eyebrow, or empty state.
- **Uppercase is banned** except `kbd` hints and the sidebar section eyebrows (which keep the
  `SB_*` grammar at `Sidebar.tsx:70-89`). Reduce the 589 occurrences; never add one. Named
  offenders to kill on sight when you are in the file: `components/areas/AreasPageHeader.tsx:32`,
  `components/projects/ProjectHeader.tsx:245-255` and `:349-355`,
  `components/people/PeopleClient.tsx:98`, `components/shell/JarvisSidePanel.tsx:66,84`,
  `.sd-stat-label` at `globals.css:1725`.
- One surviving tracking value for the surviving uppercase case: `0.06em`. Delete
  `0.1 / 0.12 / 0.14 / 0.16 / 0.18 / 0.22em`.
- `font-serif` is a **no-op alias to Space Grotesk** (`globals.css:31-36`) with 91 dead usages.
  It is banned outside `components/ui/Logotype.tsx`; delete it in any file you touch.
- Numeric values get `tabular-nums`.
- H1 is `text-display` on every page. Today it is `text-4xl` at `TasksClient.tsx:710`,
  `AreaDetailHeader.tsx:91`, `ProjectHeader.tsx:324`; `text-3xl` at `PagesListClient.tsx:162`;
  `text-2xl` at `PeopleClient.tsx:97`; `text-[26px]` at `app/(app)/habits/page.tsx:69`.

### 2.5 Spacing and density

- 4px base. **Only these steps: 4, 8, 12, 16, 24, 32, 48** → `gap-1 gap-2 gap-3 gap-4 gap-6 gap-8
  gap-12`. `gap-0.5`, `gap-1.5`, `gap-2.5`, `gap-3.5` are banned in new code (today `gap-1.5` is
  the second most common gap in the repo at 232 uses).
- Interactive row min-height 32px (`h-8`); list rows 36px (`h-9`); nothing below 28px.
- Vertical rhythm: 32px between page sections (`gap-8`), 16px inside a section, 12px inside a card.
- Card padding 20px (`p-5`); panel padding 16px (`p-4`); page gutter 32px.
- Text blocks cap at `max-w-[68ch]`.

### 2.6 Surfaces, borders, radii, shadows

- **Radius ladder, exactly four values**: `4px` chips and badges; `8px` buttons, inputs, rows,
  small chrome; `12px` cards, panels, popovers, dialogs; `9999px` pills and avatars. Any other
  radius in new code is a defect. (`WidgetCard`'s 14px is grandfathered; new cards use 12px.)
  Delete `rounded-[9px]`, `[7px]`, `[5px]`, `[3px]` on sight.
- **Elevation is fill, not shadow.** canvas `--canvas` → card `--surface-raised` → popover
  `--surface-raised` plus `0 4px 16px rgb(0 0 0 / 0.06)` light, `/ 0.30` dark. Cards, panels and
  the inline SidePanel get **no shadow**. Delete `shadow-[0_12px_32px_...]` at `sheet.tsx:76` and
  `shadow-[-10px_0_24px_...]` at `InspectorShell.tsx:34`.
- **One border per nesting level.** If the parent has a border, the child does not. Chips inside
  cards lose their border and use `bg-[var(--hover)]`. The canonical offender is
  `TasksClient.tsx:744`, a bordered `--sd-box` plate wrapping a filter row directly above bordered
  cards.
- Section separation prefers whitespace, then a single `--edge` hairline. Never a bordered plate
  wrapping another bordered plate.
- Card hover: `border-color` → `--edge-strong` only. No scale, no lift, no glow, no accent.

### 2.7 Motion

- Durations: micro (colour, background, border, opacity) **160ms**; enter/exit **220ms**; layout and
  panel **260ms**; collapse **280ms**. Nothing under 140ms (retire the 80ms and 50ms tab
  transitions at `TopTabBar.tsx:199,224,267,284`), nothing over 320ms.
- Easings: enter/exit `--ease-out-quart` `cubic-bezier(0.25,1,0.5,1)`; layout, panel and collapse
  `--ease-collapse` `cubic-bezier(0.32,0.72,0,1)`; micro `ease-out`.
- **Animate `opacity`, `transform`, `color`, `background-color`, `border-color` only.** The one
  sanctioned width animation is the right slot, and it runs on `grid-template-columns`, never on
  `width` of a flex child.
- **Never animate**: hover scale, page-level slides, anything looping on a content surface. The 13
  `hud-*` keyframes (`globals.css:198-436`) stay quarantined inside `.agent-mode-scope` and must
  not appear on any page surface a unit builds.
- **Never put `layout` and a `y` transform on the same node.** This is the literal root cause of
  the drooping wiki tiles (`ExplorerGridView.tsx:127-134`). Motion's layout projection and the `y`
  animation both write `transform`; an interrupted animation settles at `translateY(4px)`.
- Every `motion` component guards with `useReducedMotion()`; every CSS animation guards with
  `@media (prefers-reduced-motion: reduce)`.
- Stagger: `min(i, 12) * 20ms`, capped at 240ms. The current wiki stagger
  (`ExplorerGridView.tsx:105`, `min(index+offset,24) * 0.01`, up to 240ms plus an 180ms duration)
  is out of contract.
- No transition on first paint: `initial={false}` on `AnimatePresence`, per `AppShell.tsx:86`.
- **Route transitions**: `app/(app)/template.tsx` is **deleted** (D10 / s4 finding 7). s5's "keep
  the 150ms route fade" is overridden by the sealed decision. Perceived transition quality comes
  from per-route skeletons, not a template remount.

### 2.8 `<SidePanel>` API and behaviour

New file, owned by U0: **`components/ui/SidePanel.tsx`**, plus `SidePanelHost` mounted once in the
cockpit shell. It generalizes `AppShell.tsx:118-138` (the split-pane that already resizes main
content) and `components/ui/explorer/InspectorShell.tsx`. It replaces the `fixed inset-0 z-40`
backdrop plus `fixed inset-y-0 right-0 z-50` panel at `TaskDetailPanel.tsx:758-773` and every
`Sheet` used to read or edit an entity.

```tsx
type SidePanelProps = {
  open: boolean;
  onClose: () => void;
  side?: 'right' | 'left';   // default 'right'
  width?: number;            // default 380, clamped 320-560
  title?: ReactNode;         // header slot
  actions?: ReactNode;       // right side of header
  footer?: ReactNode;
  children: ReactNode;
};
```

Hard requirements:

1. **No portal. No `position: fixed`. No overlay, no backdrop, no dimming, no shadow.** The panel
   is a sibling of the stage inside the cockpit grid.
2. Track transition: `grid-template-columns: minmax(0,1fr) 0px` → `minmax(0,1fr) var(--panel-w)`,
   `260ms var(--ease-collapse)`. Content genuinely reflows; it is never covered.
3. Chrome: `bg-[var(--surface)]`, `border-l border-[var(--edge)]` (`border-r` for `side="left"`),
   **radius 0** (it meets the viewport edge), `overflow-hidden`, `min-w-0`.
4. Header `h-12 px-4 border-b border-[var(--edge)]`, title at `text-title`, a lucide `X` icon button
   (`size-8`, radius 8) at the right. Body `flex-1 overflow-y-auto p-4` with `sd-scroll-hover`.
   Optional footer `border-t border-[var(--edge)] p-4`.
5. Inner content fades `opacity 0→1` over 160ms, delayed 80ms so it lands after the track settles.
   The panel itself does not translate.
6. Closes on `Escape` and on route change. **Does not trap focus, does not block scroll, does not
   make the page inert.** The user keeps working while it is open.
7. Below `lg` (1024px) it degrades to `components/ui/sheet.tsx` with `overlay={false}`.
8. `role="complementary"` plus `aria-label`. Reduced motion: instant track swap, no transition.
9. **Modals are reserved for destructive confirmation and blocking multi-field creation.** Anything
   that reads or edits an entity is a `SidePanel`.
10. It obeys §2.2: opening it collapses the Dock.

### 2.9 `<PageScaffold>` spec

New file, owned by U0: **`components/ui/PageScaffold.tsx`**. Every route a unit touches adopts it,
replacing the six ad-hoc containers in the repo today (`px-8 py-10` at `TasksClient.tsx:705`,
`px-6 pt-5` at `LifeOsCanvas.tsx:77`, `mx-auto max-w-[1080px] px-8 md:px-12 pt-6 pb-20` at
`habits/page.tsx:59`, plus `max-w-[920px]`, `[720px]`, `[760px]`, `[960px]`, `[1200px]`).

```tsx
<PageScaffold
  eyebrow?   // sentence case, text-micro, --ink-faint (breadcrumb / parent area)
  icon?      // 28px dimensional icon (nouns only), optical box size-8
  title      // required
  subtitle?  // one line, text-meta
  meta?      // <PageScaffold.MetaRow>
  actions?   // right-aligned; AT MOST ONE primary Button, the rest ghost or icon
  children   // <PageScaffold.Section> blocks
/>
```

Anatomy, fixed, do not vary:

- Outer: `mx-auto w-full max-w-[1120px] px-8 pt-10 pb-24`, centred **within the stage**, not within
  the viewport. One measure on every page so left edges line up across routes.
- Eyebrow → 8px → icon (own row, `size-8` optical box, 8px below it) → title row
  (`h1.text-display`, actions right-aligned) → 8px → subtitle → 12px → meta row.
- **Amended by F3 (Conductor adjudication, jul-28 sesh):** the icon never sits inline with the H1.
  The criterion behind the shared measure is that the H1 TEXT left edge is visually equal on every
  route; an inline icon slot shifted /habits' H1 text 44px right even though the scaffold measure
  agreed. A route that wants an icon keeps it, rendered on its own row above the title (or in the
  meta row), so the text always starts at the shared measure.
- Meta row: `flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-[var(--ink-muted)]`;
  separator is a `·` at `--ink-faint`, not a chip and not a border. Values are plain text; only
  status uses `StatusPill` from `components/lifeos/entity-card.tsx`.
- **No banner by default.** A route that already has one (`ProjectHeader.tsx:200-213`, 120px) keeps
  it flush and edge to edge above the scaffold, and it gains no chrome.
- **The header block has no border and no background.** It sits on the canvas. The first hairline
  on a page is the first section divider.
- `<PageScaffold.Section title? action?>`: `mt-8` between sections; optional `h2.text-title` plus a
  12px gap; optional `border-t border-[var(--edge)] pt-8` when a page has three or more sections.
  Section content owns its own internal layout.
- Inline-editable titles keep the click-to-edit pattern, but the edit underline is `--edge-strong`,
  not `--ink-amber` (`ProjectHeader.tsx:326`).

### 2.10 `<EmptyState>` spec

New file, owned by U0: **`components/ui/EmptyState.tsx`**. It consolidates the three that exist
today: `components/shared/EmptyState.tsx` (serif, `py-24`, 9 consumers),
`components/ui/explorer/EmptyState.tsx` (sans, icon slot, `min-h-[240px]`, 8 consumers), and the
inline one at `components/lifeos/entity-card.tsx:231`. The first two become thin re-export shims
for one release so 17 call sites do not break.

```tsx
type EmptyStateProps = {
  icon?: ReactNode;   // dimensional icon, 40px, 40% opacity
  title: string;      // text-subtitle, --ink, sentence case
  description?: string; // text-meta, --ink-muted, max-w-[46ch], 1-2 sentences
  action?: { label: string; onClick: () => void };  // ONE ghost-variant Button
  size?: 'page' | 'section' | 'inline';
};
```

- `page`: `py-24`. `section`: `py-16`. `inline` (inside a card): `py-8`, icon omitted, title drops
  to `text-meta` `--ink-faint`, no action.
- Centred, `gap-3`, `text-center`. **No border, no card, no background, no serif, no italic, no
  uppercase.**
- Motion: `opacity 0→1` plus `y 4→0`, 220ms `--ease-out-quart`, guarded by `useReducedMotion()`.

### 2.11 Reuse, do not reinvent

| Primitive | Path |
|---|---|
| Button (cva, 6 variants, 8 sizes) | `components/ui/button.tsx` |
| Card | `components/ui/card.tsx` |
| Dialog / AlertDialog | `components/ui/dialog.tsx`, `alert-dialog.tsx` |
| Explorer kit (Toolbar, Rail, Tile, ViewToggle, SortSelect, Breadcrumbs, ContextMenu) | `components/ui/explorer/` |
| WidgetCard / WidgetBody / WidgetFooter | `components/lifeos/WidgetCard.tsx` |
| entity-card anatomy (StatusPill, ActionLink, EntityCardHeader, MetaRow, CardDivider, ProgressRow, Chip, OverflowChip, ChipRow) | `components/lifeos/entity-card.tsx` |
| Dimensional icons (nouns only) | `components/ui/icons/`, recipe in `shared.ts` |
| AmbientGlow / FocalOrb | `components/ui/ambient/` |
| Sidebar row grammar (`SIDEBAR_SURFACE`, `SB_ROW`, `SB_ROW_ACTIVE`, `SB_GHOST`, `SB_FOCUS`) | `components/shell/Sidebar.tsx:70-89` |
| Split-pane state (the pattern SidePanel generalizes) | `lib/ui/useSplitScreen.ts` + `AppShell.tsx:118-138` |
| Spinner, RelativeTime, use-undo-toast, use-pending-action | `components/shared/` |

### 2.12 Cross-unit design rules

1. **Token-first.** Change `globals.css` variables, not the 800+ call sites. A new value is a
   token and goes in `@theme` / `:root` / `.dark` with **both** themes filled in.
2. **Only U0 edits `app/globals.css`.** No other unit touches it in either wave. If you need a
   token, raise a blocker.
3. **The Tailwind 4 scan gap is real** (`docs/DESIGN-SYSTEM.md:177-184`): an arbitrary utility used
   in exactly one file may not be emitted. Verify in computed styles; if it does not emit, use
   inline `style={{}}` rather than adding a class to `globals.css`.
4. **Both themes, every surface, every commit.** Dark is where the current palette is most broken;
   a light-only screenshot is not evidence.
5. Delete on sight while you are already in a file: `font-serif`, `uppercase` +
   `tracking-[0.1em]` and above, `border-[var(--sd-accent)]` hovers, off-ladder radii,
   `gap-1.5` / `gap-2.5`, `transition-all`.

---

## 3. PER-UNIT BRIEFS

### U0: Cockpit shell + design foundation
**Wave 1. Model: `claude-fable-5`. Lands directly on `next` as unit zero; every wave-2 unit
branches from a `next` that already contains it.**

**Goal.** Restructure the app into the rail / stage / dock / JARVIS-bar cockpit of D3, ship the
calmed token scale and the three shared primitives, and take the layout-critical-path perf items
that only the person rewriting the root layout can safely take.

**Deliverables.**
1. The three-zone cockpit per §2.1, with the right-slot arbitration rule of §2.2 implemented as one
   CSS grid track.
2. The JARVIS command bar: persistent at the bottom of the stage, focusable by keystroke,
   expandable to `/jarvis`. Per D3 this is the single most important piece, because the product's
   core value is "type one sentence into Kiwi", so Kiwi becomes furniture rather than a dialog you
   summon. Wire it to the existing entrypoint (`POST /api/jarvis`, SSE events `turn-start`, `text`,
   `ack`, `queued`, `clarification`, `action`, `done`, `error` at `app/api/jarvis/route.ts:15-24`);
   do not build a second client.
3. The Dock, built as a **widget registry seam, not a hardcoded strip** (D11). It is still a
   distinct quick-glance strip with its own purpose-built compact widgets and it still does **not**
   reuse LifeOS dashboard cards (D4). What changes is the shape: a widget declares its id, title,
   compact render, optional expanded render and its own data hook; the Dock composes whatever is
   registered; Filippo chooses which widgets are docked; and that choice persists across sessions
   alongside the collapse state (`cockpit-dock-collapsed` per §2.2, plus a new
   `cockpit-dock-widgets` key holding the docked ids in order).

   The seam is a new file, **`components/shell/cockpit/dock-registry.ts`**, exporting exactly this
   contract. U11 codes against it in wave 2, and the queued XP system (issue #345) is expected to
   use it next, so treat the type as published API:

   ```ts
   // components/shell/cockpit/dock-registry.ts
   export type DockWidgetDef<TData = unknown> = {
     id: string;                                       // stable kebab-case; this is the persistence key
     title: string;                                    // sentence case, never uppercase (§2.4)
     defaultDocked?: boolean;                          // shown to a user who has never chosen
     order?: number;                                   // tie-break among docked widgets, lower first
     useData: () => TData;                             // the widget's OWN hook; the Dock never fetches for it
     Compact: React.ComponentType<{ data: TData }>;    // required; renders in the strip
     Expanded?: React.ComponentType<{ data: TData }>;  // optional; renders when the widget is expanded
   };

   export function defineDockWidget<TData>(def: DockWidgetDef<TData>): DockWidgetDef<unknown>;
   export function getDockWidgets(): DockWidgetDef<unknown>[];
   ```

   Registration lives **outside `components/shell/`**: one file per widget under
   `components/dock-widgets/`, collected by a plain
   `export const DOCK_WIDGETS = [/* … */]` array in **`components/dock-widgets/manifest.ts`**.
   Shipping a widget is therefore one new file plus one appended manifest line, and zero edits to
   any shell file. The Dock calls `useData()` inside that widget's own boundary, so its fetching,
   its realtime subscription and its error state stay its own problem; the Dock renders `Compact`
   and knows nothing else about it. Wave-1 contents (device and light status, next event, today's
   counts) go through this seam like any other widget, not through bespoke JSX in the Dock.
4. The calmed token pass of §2.3, including the `globals.css:1447` vs `:1563` cascade fix, the
   type-scale steps of §2.4 registered in `@theme`, the radius ladder of §2.6, and the motion
   durations and easings of §2.7. Amend `docs/DESIGN-SYSTEM.md` §2, §3, §5, §7, §14 in the same
   commit.
5. `components/ui/SidePanel.tsx` (+ `SidePanelHost`), `components/ui/PageScaffold.tsx`,
   `components/ui/EmptyState.tsx` per §2.8, §2.9, §2.10, with the two legacy EmptyStates reduced to
   re-export shims.
6. Layout-critical-path perf, because U0 is rewriting the root layout anyway:
   - Remove `getSearchSnapshot()` from the blocking `Promise.all` at `app/(app)/layout.tsx:43,57`.
     It is 18 of the layout's 25 queries and nothing at first paint needs it. `SearchProvider`
     already has `useQuery({queryKey:["search-snapshot",userId], queryFn: fetchSearchSnapshot})` at
     `components/search/SearchProvider.tsx:29-35`, so this is mostly deletion: stop passing
     `initialSnapshot` at `layout.tsx:66` and make that prop optional.
   - Add `React.cache()` wrappers. `grep cache(` across `lib/db/queries`, `lib/auth`, `lib/search`
     returns zero hits today, and the cost is measured: `getUserOrRedirect()` runs twice per request
     (`layout.tsx:32` and again via `requireOnboarded()` at `get-user.ts:102`), `getSidebarTree()`
     runs three times (`layout.tsx:44`, `:45`, `snapshot.ts:30`), `getAllTasksForUser()` runs twice
     on `/tasks` (`snapshot.ts:31`, `tasks/page.tsx:34`). Put the wrappers in a **new**
     `lib/db/cached.ts` so U3 can rewrite the helper bodies in `lib/db/queries/*` without a
     conflict; wrap `getUserOrRedirect` in place in `lib/auth/get-user.ts` (U3 does not touch it).
   - Delete `app/(app)/template.tsx` (s4 finding 7: it remounts the subtree on every route change
     and adds a 150ms fade on top of an already slow transition).

**Scout evidence.**
- Layout round-trip census: `layout.tsx:32` `getUserOrRedirect` (1 + `getClaims`), `:44` and `:45`
  `getSidebarTree` (2 each), `:46` `getHashtagSuggestions` (1), `:47-55` inline projects select (1),
  `:56` `getAuthAvatar` (0 DB but 1 HTTP RTT to Supabase Auth), `:57` `getSearchSnapshot` (**18**).
  Total ~25 DB queries plus one Auth round-trip, per render (s4).
- `getSearchSnapshot` breakdown, `lib/search/snapshot.ts:29-36`: `getSidebarTree` 2,
  `getAllTasksForUser` 4, `getCapturesForUser` (limit 1000, `snapshot.ts:20`) 4, `getPagesForUser`
  5 (returns full page `content`, `snapshot.ts:65`), `getJournalEntriesForUser` 1, `loadHabits` 2.
  All of it is serialized into the RSC payload as `initialSnapshot` at `layout.tsx:66`.
- Current shell: `components/shell/AppShell.tsx:117` `<main className="flex flex-1 flex-col
  overflow-hidden">`, `:118` `DailyAutoOpen`, `:119` `TopTabBar`, `:121-127` the scroll container,
  `:77` the single `AmbientGlow intensity="whisper"`. `AppShell.tsx:122-127` carries the app's
  **only** `@container/main`, so every `@3xl/main` and `@4xl/main` variant in Areas, Projects and
  LifeOS resolves against it: preserve that container name and its box, or fix every consumer.
- Split-pane precedent to generalize: `AppShell.tsx:118-138` + `lib/ui/useSplitScreen.ts`.
- `layout.tsx:1-14` statically mounts nine client components on every route (`GlobalJarvisDialog`,
  `GlobalJarvisHandler`, `CommandMenu`, `JarvisListenerMount` and others). U3 owns making those
  dynamic; U0 must not regress it by adding more static client imports to the layout.
- Nav rows live at `components/shell/PersistentNav.tsx:88-123` (`MAIN_ITEMS`, `SYSTEM_ITEMS`), the
  row renderer at `:129-250`, the functional dot at `:186-215`. Keep this component's public
  surface intact: U4 is inserting into it in parallel.
- Dock data sources that already exist, to reuse rather than refetch: `components/shell/
  SidebarHomeDevicesStrip.tsx` and `lib/govee/home-display.ts` / `lib/govee/home-state.ts` for
  device and light status; `app/api/device/calendar/route.ts` for next event.

**OWNS.** `app/(app)/layout.tsx` (sole owner), `app/(app)/template.tsx` (deletes it),
`app/(app)/loading.tsx`, `components/shell/AppShell.tsx`, `components/shell/Sidebar.tsx`,
`components/shell/TopTabBar.tsx`, new `components/shell/cockpit/*` (Rail, Stage, Dock,
JarvisCommandBar, and `dock-registry.ts`), new `components/dock-widgets/*` (the manifest plus the
wave-1 widgets; wave-2 units add sibling files here and append to the manifest, they do not edit
U0's), `components/ui/SidePanel.tsx`, `components/ui/PageScaffold.tsx`,
`components/ui/EmptyState.tsx`, `components/shared/EmptyState.tsx` and
`components/ui/explorer/EmptyState.tsx` (reduced to shims), `app/globals.css`,
`docs/DESIGN-SYSTEM.md`, `lib/search/snapshot.ts`, `lib/auth/get-user.ts`, new `lib/db/cached.ts`.

**MUST NOT TOUCH.** `lib/db/queries/*.ts` bodies (U3), `lib/db/client.ts` (U3), `next.config.ts`
(U2 and U3), any `router.refresh()` call site (U3), `components/tasks/*` (U6),
`components/wiki/*` and `components/pages/*` (U1, U2, U7), `components/areas/*` (U8),
`components/projects/*` (U9), `components/lifeos/*` (U10), `components/shell/PersistentNav.tsx`
beyond what the rail restructure strictly requires (U4 is editing it; see the risk register).
In `components/search/SearchProvider.tsx` U0 edits **only** the props type and the `initialData`
line; U3 owns the query options and the subscriptions.

**Acceptance criteria (headless-verifiable).**
- At 1440x900, `/tasks` renders exactly three top-level cockpit grid tracks; the JARVIS input is
  present and focusable at the bottom of the stage without any dialog being opened.
- `getComputedStyle(document.documentElement).getPropertyValue('--sd-app')` in `.dark` resolves to
  the `#15171a` ladder, not `#090b0d`.
- Opening any `SidePanel` leaves `document.body.style.pointerEvents` untouched, adds no element
  with `position: fixed` covering the stage, and the stage's `getBoundingClientRect().width`
  **decreases**; closing restores it. The Dock is not visible while a panel is open.
- At 1000px viewport width, the Dock is absent and a `SidePanel` renders as a full-width sheet.
- `Escape` closes an open `SidePanel`; a route change closes it.
- **At least one widget reaches the Dock through the registry, not through Dock JSX**: every entry
  rendered in the strip has a `data-dock-widget-id` matching an id in
  `components/dock-widgets/manifest.ts`, and removing that entry from the manifest removes it from
  the strip with no other edit.
- **Adding a widget touches zero shell files**: `grep -rn` for any widget id across
  `components/shell/` and `app/` returns nothing, and `components/shell/cockpit/Dock.tsx` (or
  whatever the Dock component is named) imports no widget module by name.
- Un-docking a widget in the Dock's chooser and reloading keeps it un-docked; collapsing the Dock
  and reloading keeps it collapsed.
- The network waterfall for a cold `/tasks` navigation shows no request carrying the search
  snapshot payload before first contentful paint.
- `app/(app)/template.tsx` does not exist.
- Screenshots of `/tasks`, `/wiki`, `/lifeos` in both themes, with `prefers-reduced-motion: reduce`
  producing no track transition.

---

### U1: Wiki realtime + navigation + click-blocking
**Wave 1. Model: `claude-opus-5`.**

**Goal.** Make the wiki show the truth after every mutation, make breadcrumb navigation feel
instant, stop the folder tiles drooping, and make the inside of a wiki page clickable again.

**Deliverables and evidence.**

**(a) Stale contents after navigating back to `/wiki` or into a directory.** Three compounding
layers.
- `components/wiki/explorer-hooks/useExplorerMutations.ts` patches with `qc.setQueryData`
  (`:24-36`) and calls `invalidatePages()` / `invalidateFolders()` **only inside the `if
  (!r.success)` branch** (`:46-56, 58-68, 70-83, 85-145, 147-157`). Same in
  `useExplorerActions.ts` (create page `:52-85`, create folder `:87-101`, delete `:103-132`, rename
  folder `:134-152`). After a *successful* create, move, reorder or rename, the cache holds a
  hand-built row: `handleCreatePage` inserts `{title:"", positionKey:null, createdAt:now}` at
  `useExplorerActions.ts:55-77` and then `router.push("/wiki/<id>")`. Come back and you see the
  stub. Fix: invalidate after success too.
- `PageDetailClient.tsx:476-479` `handleDelete` never invalidates:
  `await deletePage(initialPage.id); router.push("/wiki")`. Contrast `save()` at `:390`,
  `handleToggleNoExport` at `:492`, `handleCoverChange` at `:519`, which all do. Add
  `queryClient.invalidateQueries({queryKey: tableKey("pages", userId)})`.
- Wiki home is the only surface overriding `refetchOnMount: true` (`PagesListClient.tsx:83,89,95,
  113`, rationale at `:68-78`) against the global `refetchOnMount: false` / `staleTime: 30_000` /
  `gcTime: 5min` (`components/providers/QueryProvider.tsx:14-24`). `true` (not `"always"`) only
  refetches when stale or invalidated, so there is a 30-second blind window, and browser Back
  restores the RSC payload from the client Router Cache so even `initialData` is stale. Move the
  four wiki-home queries to `refetchOnMount: "always"` or `staleTime: 0`.
- Not at fault: realtime subscriptions exist and the tables are in the publication (`pages`,
  `pages_projects` at `supabase/migrations/0031_pages.sql:102-108`, `page_folders` at
  `0033_page_folders.sql:78-80`, `folder_projects` at `0034_...:102-104`). Wiki is the only feature
  that does not use `lib/realtime/useOptimisticList.ts` (captures, tasks, calendar, training and
  projects all do: `CapturesClient.tsx:249`, `TasksClient.tsx:164`, `CalendarClient.tsx:314`,
  `TrainingClient.tsx:116`); adopting it is optional, invalidating on success is not.

**(b) Sluggish breadcrumb navigation.** The click itself does no fetching: `WikiExplorer.tsx:225-228,
239-243` only `setFolderId(id)` + `selection.clear()`, and nuqs defaults to `shallow: true`. All the
latency is client render cost:
- `MeasuringStrategy.Always` at `WikiExplorer.tsx:285`. dnd-kit re-measures every registered
  droppable on every `DndContext` render; each grid tile registers a droppable **and** a draggable
  (`ExplorerGridView.tsx:166-179`), plus one droppable per breadcrumb segment
  (`ExplorerHeaderControls.tsx:119-135`), plus the canvas. N tiles means N forced
  `getBoundingClientRect()` and a layout flush per keystroke or nav. Biggest single cost. Switch to
  `MeasuringStrategy.WhileDragging`.
- Staggered entry up to ~420ms to settle: `ExplorerGridView.tsx:105` `delay = min(index+offset,24)
  * 0.01` plus `duration: 0.18` at `:131`. Out of contract per §2.7; drop the per-item stagger or
  gate it on first mount only.
- `layout` on every tile and on the band section (`ExplorerGridView.tsx:97, 128`).
- `WikiExplorer.tsx:142-144` `useEffect(... if (folderId !== undefined) clearSelection())`:
  `folderId` is `string | null` and never `undefined`, so this fires on every folder change and
  costs an extra render pass.
- Minor: nuqs default 50ms `throttleMs` on the history write.

**(c) Folder cards droop.** The grid CSS is sound (`ExplorerGridView.tsx:101`
`grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2`, tiles `min-h-[154px]` at `:212`, labels
single-line `truncate` in `components/ui/explorer/Tile.tsx`). The root cause is the §2.7 violation
at `ExplorerGridView.tsx:127-134`: `layout={!reduceMotion}` plus `initial={{opacity:0, y:4}}` on the
same node. Motion's layout projection and the `y` animation both write `transform`; interrupted
items settle at `translateY(4px)`. Fix by dropping `layout` from the tile or moving the entry
animation to `opacity` only. Secondary: `AnimatePresence initial={false}` at `:44` wraps two
`ExplorerGridBand` *custom* components that `return null` when empty (`:95`), which
`AnimatePresence` cannot see as a removal, so exits never run and the band boxes pop.

**(d) Nothing clickable inside a wiki page except the breadcrumb.** Prime suspect,
`PageBlockEditor.tsx:474-498` `handleSurfaceMouseDown`, attached to the wrapper at `:507-513` that
contains the whole `<BlockNoteView>`:

```ts
if (target.closest(".bn-block-content") || target.closest(".bn-side-menu") ||
    target.closest(".bn-suggestion-menu") || target.closest(".bn-formatting-toolbar")) return;
...
e.preventDefault();   // :487
... editor.focus();   // :497
```

It is a whitelist that has not kept up with the surfaces BlockNote mounts: the link toolbar
(`.bn-link-toolbar`), the **file panel** (`.bn-file-panel`), the emoji picker, table handles, and
the JARVIS / entity inline pills' own controls all get `preventDefault()` plus a focus steal.
Secondary candidate: Radix `pointer-events: none` residue on `<body>` from overlapping modal layers
(`PageDetailClient.tsx:834-863` AlertDialog, `:869` and `PageProperties.tsx:358` Popovers,
`PageCoverImage.tsx:68,124` → `CoverImagePicker.tsx:129` a Dialog that is **always mounted**, plus
`ProjectLinker` and `FolderPicker`); that would kill every click including the breadcrumb, so it is
secondary, but the always-mounted Dialog is worth fixing regardless. **Verify first, in one shot**:
open a page and check (i) `getComputedStyle(document.body).pointerEvents`, and (ii) whether a click
on the toolbar fires at all versus fires-and-is-defaulted. That splits the two candidates. Ruled
out already: the sticky toolbar (`PageDetailClient.tsx:766`) is `self-end ml-auto` in a `flex-col`
so it is shrink-to-fit; `AmbientGlow` is `pointer-events-none -z-10`; `PageSearchBar` is a small
`absolute top-12 right-6 z-20` chip; nothing in `page-block-editor.css` sets a page-covering
`position: fixed`.

Fixing (d) is a hard prerequisite for U2: the BlockNote file panel is inside that same wrapper, so
until the whitelist is fixed, every click on the image upload UI is cancelled.

**OWNS.** `components/wiki/explorer-hooks/*`, `components/wiki/WikiExplorer.tsx`,
`components/wiki/explorer-views/ExplorerGridView.tsx`,
`components/wiki/explorer-parts/ExplorerHeaderControls.tsx`, `components/pages/PagesListClient.tsx`,
`components/pages/PageDetailClient.tsx`, `components/pages/PageCoverImage.tsx`,
`components/pages/CoverImagePicker.tsx`, and **lines 460-500 of
`components/pages/PageBlockEditor.tsx`** (the `handleSurfaceMouseDown` body only).

**MUST NOT TOUCH.** `PageBlockEditor.tsx` outside the `handleSurfaceMouseDown` body (U2 owns the
editor options at `:196-199` and the wrapper props at `:507-513`), `next.config.ts`,
`supabase/migrations/*`, `apps/web/drizzle/*`, wiki visual polish and folder-grid *alignment* (U7,
wave 2), `app/globals.css`, `app/(app)/layout.tsx`.

**Acceptance criteria (headless-verifiable).**
- Create a page from the explorer, navigate back to `/wiki` via browser Back within 5 seconds: the
  new page appears with its server title, not an empty-title stub.
- Delete a page from its detail view: `/wiki` no longer lists it without a hard reload.
- Rename a folder, then Back: the new name renders.
- Navigating three breadcrumb levels: no tile ends with a non-identity `transform` after 500ms
  (assert `getComputedStyle(tile).transform === 'none'` or a matrix with `f === 0` on every tile),
  and every tile's `getBoundingClientRect().top` within a row is equal.
- On a page detail view: `getComputedStyle(document.body).pointerEvents !== 'none'`; a click on the
  page title enters edit mode; a click on a formatting-toolbar button applies the mark; a click
  inside the BlockNote file panel is not prevented.
- Screenshots before and after in both themes.

---

### U2: Wiki image support (drag-drop, slash menu, Supabase Storage)
**Wave 1. Model: `claude-opus-5`.**

**Goal.** Make the `/` Image item actually insert an uploaded image, and make dragging or pasting an
image file into a wiki page upload and embed it.

**Deliverables and evidence.**
- **Why the slash item is inert.** `useCreateBlockNote({ schema, initialContent })` at
  `PageBlockEditor.tsx:196-199` passes **no `uploadFile`**. A repo-wide grep for `uploadFile`
  returns zero hits. Without it BlockNote's file panel has no upload tab, so picking "Image" inserts
  an empty image block whose only affordance is an "Embed URL" field. The item itself is real:
  `defaultBlockSpecs` already includes `image` / `video` / `audio` / `file`
  (`PageBlockEditor.tsx:56-64`), `BlockNoteView` runs with `slashMenu={false}` (`:518`) and a custom
  `SuggestionMenuController triggerCharacter="/"` (`:535-548`) whose items are
  `withSdSlashChrome(withSlashShorthand(getDefaultReactSlashMenuItems(editor)))` plus
  `insertCalloutItem`, `linkEmbedSlashItems`, `jarvisSlashItem`, and the Image row even gets a
  lucide icon at `slash-menu-chrome.tsx:59`.
- **No drag and drop exists.** The only `onPaste` on the wrapper is `linkPaste.onPaste`
  (`PageBlockEditor.tsx:512`, from `PageLinkEmbedControls.tsx`, URL unfurling only). There is no
  `onDrop` or `onDragOver` anywhere in the editor tree and no image handling in the paste path.
- **Storage pattern to copy verbatim** (two identical call sites):
  `components/settings/ProfileSection.tsx:75-105` and `components/people/PersonEditDialog.tsx:83-89`
  do client-side `createClient()`, a size guard (5MB), `supabase.storage.from("avatars").upload(
  path, file, {upsert:true, contentType:file.type, cacheControl:"3600"})`, then `.getPublicUrl(path)`
  with a `?v=${Date.now()}` cache-buster.
- **Bucket DDL to mirror**: `supabase/migrations/0014_user_profile_and_avatars.sql:25-73`
  (`INSERT INTO storage.buckets`, then public-read plus owner insert/update/delete policies keyed on
  `bucket_id` and the `<userId>/…` path prefix). There is **no wiki or page-image bucket yet**;
  `avatars` is the only bucket in the repo. Author a new idempotent migration in `apps/web/drizzle/`
  (and mirror it into `supabase/migrations/` following the existing convention) creating a
  `page-images` bucket with the same policy shape.
- **`next/image` host allow-list**: `next.config.ts:8-17` only allow-lists `images.unsplash.com`.
  Either add the Supabase Storage host to `images.remotePatterns`, or use `unoptimized` as
  `PageCoverImage.tsx:89` already does for arbitrary URLs. Prefer adding the host; if you edit
  `next.config.ts`, touch **only** the `images` key (U3 owns `experimental`).
- Enforce a size guard and an accepted-MIME guard; on rejection surface a toast rather than a silent
  no-op.

**Dependency.** U1 fixes `handleSurfaceMouseDown` (`PageBlockEditor.tsx:474-498`), which currently
cancels every click inside the BlockNote file panel. Build against the assumption that it is fixed;
if U1 has not merged when you verify, temporarily neutralize the handler **locally** to verify
upload behaviour, and do not commit that change.

**OWNS.** `components/pages/PageBlockEditor.tsx` lines `196-199` (editor options, `uploadFile`) and
`507-513` (wrapper drop/paste props) plus any new sibling module it adds under `components/pages/`
(for example `page-image-upload.ts`), a new migration in `apps/web/drizzle/` and its mirror in
`supabase/migrations/`, and the `images` key of `next.config.ts`.

**MUST NOT TOUCH.** The `handleSurfaceMouseDown` body (U1), any explorer file (U1, U7),
`PageDetailClient.tsx` (U1), the `experimental` key of `next.config.ts` (U3),
`drizzle/meta/_journal.json` (never), `app/globals.css`.

**Acceptance criteria (headless-verifiable).**
- In a wiki page, typing `/` then "image" and choosing Image opens a panel with a working **Upload**
  tab (assert the tab exists, not just the Embed field).
- A Playwright `setInputFiles` on that upload input results in an `<img>` in the document whose
  `src` points at the Supabase Storage public URL, and a page reload still renders it.
- `browser_file_upload` / a synthetic drop of a PNG onto the editor surface inserts an image block;
  a synthetic drop of a `.exe` does not, and surfaces a rejection toast.
- Pasting an image from the clipboard inserts an image block; pasting a URL still unfurls a link
  embed (no regression on `linkPaste`).
- The migration is idempotent: applying it twice is a no-op.

---

### U3: App-wide performance (everything U0 does not own)
**Wave 1. Model: `claude-opus-5`.**

**Goal.** Remove the server time and the re-render amplification that the cockpit restructure does
not touch, so the app is fast as well as prettier. Per D10 this unit is not optional: the shell and
the perf unit ship together, or the app is merely prettier and just as slow.

**Explicitly excludes** `app/(app)/layout.tsx` and `app/(app)/template.tsx`, `lib/search/snapshot.ts`,
`lib/auth/get-user.ts` and the `React.cache()` wrapper file: U0 owns all of those.

**Deliverables and evidence, in the scout's recommended order.**

1. **Verify the Supabase JWT signing key type first** (minutes of work, potentially a full Auth
   round-trip per navigation). `proxy.ts:4` → `lib/supabase/middleware.ts:27` calls `getClaims()` on
   every request matched by `proxy.ts:9-11`, which includes every RSC navigation payload fetch.
   `getClaims()` is local JWT verification **only if the project uses asymmetric signing keys
   (ECC/RSA)**; on the legacy HS256 shared secret it silently falls back to a network `getUser()`.
   Check the Supabase dashboard (prod ref `kzdphwebygqaaqcrufow`) and report the finding in the unit
   report even if no code change follows.
2. **The 32 `router.refresh()` call sites.** `grep -rn "router.refresh()" components app
   --include="*.tsx"`. Concentrated exactly where "clicking into entities feels sluggish":
   `components/areas/AreaCardMenu.tsx`, `AreaCreateDialog.tsx`, `MoveProjectDialog.tsx`,
   `AreaProjectCardMenu.tsx`, `AreaDetailHeader.tsx`, `components/projects/ProjectHeader.tsx`,
   `ProjectSettingsDialog.tsx`, `components/calendar/CalendarClient.tsx`, and 24 more. Each one
   refetches the current route from the server and re-renders **all** segments including the
   ~25-query layout, and produces a new `initialSnapshot` reference so
   `SearchProvider`'s `useMemo(() => buildSearchIndex(data), [data])`
   (`components/search/SearchProvider.tsx:60`) rebuilds the whole client index on the main thread.
   Replace with targeted `queryClient.invalidateQueries` where the data is already
   TanStack-Query-backed, and scope the server actions' `revalidatePath` to the specific route.
   Mechanical, individually low-risk, 32 sites: **commit these in batches by feature area, not as one
   commit.**
3. **Postgres pool.** `lib/db/client.ts:39,54` `max: isVercel ? 1 : 5`. With one connection the
   six-way `Promise.all` in the layout and the eight-way in `/lifeos` execute one query at a time at
   the database, so total latency is the sum, not the max. The comment at `client.ts:16-27`
   documents why `max: 1` was chosen (Supavisor connection exhaustion) and notes the same stall for
   JARVIS tool switching. Raise to 3-5 and **validate Supavisor headroom**; if validation is not
   possible headlessly, leave it at 1, say so in the report, and rely on items 2 and 5. The scout
   flags its own pipelining claim as directional and unmeasured: do not treat the pool bump as the
   main lever.
4. **Parallelize the hot query helpers.** `lib/db/queries/tasks.ts:48` `getAllTasksForUser` issues
   four sequential awaits: task rows (`:51`, `select()` with every column, **no limit and no
   status/archived filter**), then `tasksProjects ⋈ projects` (`:61`), then `tasksHashtags ⋈
   hashtags` (`:84`), then `peopleReferences ⋈ people` (`:107`). The last three depend only on
   `taskIds` and are independent of each other: one `Promise.all` wave turns 4 round trips into 2.
   Same shape at `lib/db/queries/captures.ts:194,207,221` and
   `lib/db/queries/pages.ts:132,158,186,193`. Also parallelize
   `app/(app)/areas/[areaId]/page.tsx:26,47,68` into one `Promise.all` (the project page already
   does this at `projects/[projectId]/page.tsx:53-88`).
5. **`SearchProvider` refetch config.** `SearchProvider.tsx:34` sets `refetchOnWindowFocus: true`,
   overriding the global `false` at `QueryProvider.tsx:19`, so every tab refocus re-runs the
   18-query snapshot. `SearchProvider.tsx:47-58` registers 12 `useTableSubscription` hooks that all
   fan out to `["search-snapshot", userId]`, so any write to tasks, captures, hashtags, pages,
   journal, projects, areas, habits or their join tables triggers the same 18-query refetch. Set
   `refetchOnWindowFocus: false`, raise `staleTime`, and debounce the realtime-driven refetch. The
   realtime layer itself is fine (singleton channel per `(table, userId)` with refcounting,
   `lib/realtime/useTableSubscription.ts:38-40`); the problem is the cost of the invalidation
   target.
6. **Router cache and `force-dynamic` cleanup.** `next.config.ts` (read in full, lines 1-89) has no
   `experimental.staleTimes`, so the default `staleTimes.dynamic: 0` means client router cache
   entries for dynamic routes are never reused and every back/forward re-hits the server. Set
   `experimental.staleTimes: { dynamic: 30 }` and validate that stale data on back-nav is acceptable
   given realtime. Drop the redundant `dynamic = "force-dynamic"` exports on the 17 `(app)` pages
   that are already dynamic through Supabase cookie reads: `/lifeos:22`, `/today:24`, `/jarvis:35`,
   `/insights:16`, `/calendar:68` (plus `revalidate = 0`), `/graph:20`, `/habits:14`, `/health:5`,
   `/journaling:19`, and six under `/settings`.
7. **Dynamic imports for the heavy always-mounted client surfaces.** `next/dynamic` the JARVIS and
   command-menu surfaces so they load on first open rather than on every page:
   `GlobalJarvisDialog` (pulls `SearchDropdown`, `SearchResults` and the search engine via
   `SearchProvider`), `GlobalJarvisHandler` (pulls the JARVIS streaming client, voice settings, the
   sentence splitter), `CommandMenu` (pulls `CaptureComposer`), `JarvisListenerMount`. **Do this by
   editing the component modules and their own barrels, and coordinate with U0**, which owns the
   layout file that imports them: if the change requires editing `layout.tsx`, raise a blocker
   rather than editing it. Bundle context: `.next/static/chunks` totals 6.9MB raw (build dated
   Jul 17, stale), largest chunks 424 / 396 / 372 / 372 / 296 KB; the genuinely heavy libraries are
   already route-scoped (`recharts` to 7 files under `components/insights/` and
   `components/nutrition/`, `d3` to `components/captures/CaptureGraphView.tsx` and
   `app/(app)/graph/GraphExplorer.tsx`, `@blocknote` to 7 files under `components/pages/`, `@tiptap`
   to 13 files); `motion/react` appears in 66 files. Bundle work is the **last** item, not the first.
8. Optional, cheap: cache the sidebar avatar on the `public.users` row instead of the
   `supabase.auth.getUser()` HTTP round trip at `lib/auth/get-user.ts:34-35`. **`get-user.ts` is
   U0's file**, so if you want this, raise it as a blocker for U0 rather than editing it.

**Not the problem, do not spend time here** (all four verified by the scout): indexes
(`lib/db/schema.ts` declares 81, including `tasks_user_status_idx:245`, `tasks_user_due_idx:246`,
`captures_user_created_desc_idx:319`, a GIN index on capture content `:320`,
`pages_user_updated_desc_idx:469`); SQL-level N+1 (helpers batch correctly with `inArray`);
realtime channel leaks; the global TanStack Query config; `revalidatePath("/", "layout")` (only
3 call sites, all in rarely-hit profile and onboarding actions).

**OWNS.** `lib/db/queries/*.ts`, `lib/db/client.ts`, `components/search/SearchProvider.tsx` (query
options and subscriptions), the `experimental` key of `next.config.ts`, every `router.refresh()`
call site and the server actions whose `revalidatePath` scope changes with them,
`app/(app)/areas/[areaId]/page.tsx` query parallelization only, the `force-dynamic` export lines,
`proxy.ts` / `lib/supabase/middleware.ts` if the signing-key check requires a change.

**MUST NOT TOUCH.** `app/(app)/layout.tsx`, `app/(app)/template.tsx`, `lib/search/snapshot.ts`,
`lib/auth/get-user.ts`, `lib/db/cached.ts`, `app/globals.css`, the `images` key of `next.config.ts`,
any component's visual output. **This is a behaviour-preserving unit**: if a change alters what is
on screen, it belongs to a different unit.

**Acceptance criteria (headless-verifiable).**
- With the dev DB logger enabled (`lib/db/client.ts:77-84`, currently `undefined` in production),
  a cold `/tasks` navigation logs materially fewer statements than the ~34 baseline, and the report
  states the before and after counts.
- Renaming a project from `ProjectHeader` issues **no** RSC payload request for the layout segment
  (assert via `browser_network_requests`); the rename still appears immediately.
- `grep -rn "router.refresh()" components app --include="*.tsx"` returns a count, stated in the
  report, materially below 32, with each remaining site justified.
- Refocusing the tab issues no `search-snapshot` request.
- Back/forward between `/tasks` and `/lifeos` within 30 seconds serves from the router cache (no
  new RSC document request).
- `pnpm typecheck` and `pnpm build` green; no visual diff in the screenshots of `/tasks`,
  `/lifeos`, `/areas/<id>` against the pre-change baseline.

---

### U4: Calendar not-connected indicator in the sidebar
**Wave 1. Model: `sonnet`. Smallest unit; keep the patch surface minimal because U0 is
restructuring the same component tree.**

**Goal.** Make a dropped or absent Google Calendar connection visible on the Calendar nav row
itself, not only on Settings.

**Evidence: the infrastructure already exists; only the surfacing is missing.**
- Status derivation: `lib/db/queries/gcal-connection.ts` `getGcalConnectionStatus(userId)`, type
  `GcalConnectionStatus = "connected" | "not_connected" | "expired"`. It reads
  `users.gcalRefreshTokenEncrypted` (`lib/db/schema.ts:76`): NULL means `not_connected`, non-null
  means `connected`. `"expired"` is reserved and not surfaced eagerly (module doc explains why).
- Route: `app/api/gcal/status/route.ts` `GET /api/gcal/status` → `{ status }`, a thin JSON route
  chosen deliberately over a Server Action because the consumer renders on every page.
- Hook: `lib/gcal/useGcalConnectionStatus.ts`, `queryKey: ["gcal-connection-status"]`,
  `staleTime: 60_000`, `refetchOnWindowFocus: true`, returns `"not_connected"` on any non-OK
  response (deliberate bias toward a false positive).
- Consumer today: `components/shell/PersistentNav.tsx:276-291` `SidebarSystemNav` computes
  `showGcalBadge = gcalStatus !== undefined && gcalStatus !== "connected"` and passes
  `badge={item.href === "/settings" && showGcalBadge}`. The comment at `:271-274` says the Settings
  badge exists so there is a one-click path back "even when the user is nowhere near /calendar".
- The gap: the Calendar row is in `MAIN_ITEMS` (`PersistentNav.tsx:114`
  `{ href: "/calendar", label: "Calendar", icon: Calendar }`), rendered by `PersistentNav` at
  `:280-286` with **no `badge` prop at all**. The badge renderer already exists in both collapsed
  and expanded forms (`:186-195` and `:208-215`, 6px dot, `--ink-coral`, `aria-label="Google
  Calendar disconnected"`).
- Auth entry point for the fix-it path: `app/api/gcal/auth/route.ts`; token lifecycle and the
  revoke path that nulls the columns is `lib/gcal/token.ts:115-131,171`.

**Deliverables.**
1. Lift `useGcalConnectionStatus()` so both `PersistentNav` and `SidebarSystemNav` can read it
   without two subscriptions (a shared parent or a tiny context), and pass `badge` on the
   `/calendar` row when the status is not `"connected"`. Keep the `undefined` means no badge rule so
   there is never a red-dot flash before the hook resolves.
2. Give the indicator a tooltip explaining what is wrong and a path to fix it (Settings, or
   `/api/gcal/auth` directly). Both collapsed and expanded rail states.
3. Design contract: the dot is a functional ink (`--ink-coral`), 6px, per §2.3. No accent, no
   uppercase label, no new radius.
4. Keep the whole change inside `PersistentNav.tsx` plus at most one new small component file. Do
   not restructure the nav item types, do not rename the exported components, do not move the
   `MAIN_ITEMS` / `SYSTEM_ITEMS` constants. U0 is rewriting the surrounding rail in parallel and the
   integrator needs your patch to be a single re-appliable insertion.

**OWNS.** `components/shell/PersistentNav.tsx`, optionally one new
`components/shell/GcalStatusIndicator.tsx`, `lib/gcal/useGcalConnectionStatus.ts` if a shared-read
change is needed.

**MUST NOT TOUCH.** `components/shell/Sidebar.tsx` (U0), `components/shell/AppShell.tsx` (U0),
`app/(app)/layout.tsx` (U0), `app/globals.css` (U0), anything under `lib/db/queries/` (U3),
`app/api/gcal/*` route behaviour (read only).

**Acceptance criteria (headless-verifiable).**
- With `users.gcal_refresh_token_encrypted` NULL, the rail's Calendar row renders an element with
  `aria-label` naming the disconnected Google Calendar state, in both expanded and collapsed rail
  states; its computed `background-color` resolves to `--ink-coral`, not `--accent`.
- With a non-null token, no such element exists on the Calendar row.
- The dot never appears during the loading state: intercept `/api/gcal/status` with a delay and
  assert no badge is in the DOM before the response resolves.
- Hovering the row shows a tooltip whose text names Google Calendar and offers a reconnect path.
- Screenshots of the rail expanded and collapsed, both themes, both states.

---

### U5: JARVIS over Twilio SMS/MMS, channel-agnostic core
**Wave 1. Model: `claude-opus-5`.**

**Goal.** Let Filippo text JARVIS from anywhere and get the same assistant he gets on the web,
behind a channel-agnostic core, over Twilio Programmable SMS/MMS.

**Sealed decision D6 governs this unit.** Twilio SMS/MMS, green bubble, not blue. The S6 scout
recommends the self-hosted iMessage loop instead; that recommendation is **overruled**. Build the
channel-agnostic seam such that a self-hosted iMessage bridge can be added later behind the same
seam without touching the core. Do not build the iMessage path in this unit.

**Deliverables and evidence.**

**(a) The seam already exists at the engine level; the duplication is one level up.** All four
production entrypoints call the same `runJarvisTurnStream` (`lib/jarvis/run-turn.ts:329`, options
contract at `:105-194`): the web console (`app/api/jarvis/route.ts:235`), voice
(`app/api/jarvis/voice/transcript/route.ts:311`), paired-device text
(`app/api/jarvis/voice/text/route.ts:203`), in-document (`app/api/jarvis/in-document/route.ts:221`),
and routines (`lib/jarvis/routine-runner.ts`). `runJarvisTurnStream` takes a userId, a message
array and callbacks and knows nothing about HTTP, SSE, or a device: **it needs no refactor.**

The real refactor is that `app/api/jarvis/voice/text/route.ts:101-283` duplicates roughly 180 lines
of `app/api/jarvis/route.ts:155-208` (the `META_QUESTION_RE` / `toolChoice` / hint-injection block is
copy-pasted verbatim, and both files carry a "keep the two in sync" comment). Extract:

```ts
// lib/jarvis/run-channel-turn.ts  (NEW)
export async function runChannelTurn(opts: {
  userId: string; text: string; deviceLabel: string;   // → source.device
  history?: Msg[];                                     // default buildRecentHistory(userId)
  onDelta?: (d: string) => void; onAction?: (…) => void;
}): Promise<{ turnId: string; text: string; actions: Action[] }>
```

It resolves the BYOK key (run-turn never reads env; the caller resolves, `run-turn.ts:107-112`),
does hint injection and `toolChoice`, persists both `jarvis_turns` rows (`lib/db/schema.ts:725`),
awaits the stream, and returns the joined final text. `/voice/text` becomes a thin wrapper that adds
its three bus emits (`:143`, `:183`, `:217-224`); the SMS route is a second thin wrapper. Use
`lib/jarvis/join-stream-text.ts` `joinStreamTextChunks` for the join (it fixes the missing-space glue
between Anthropic text blocks around `tool_use`). Memory is shared across channels via
`lib/jarvis/recent-history.ts:70` `buildRecentHistory(userId, now?)`, the channel-agnostic memory
primitive. Provenance is already channel-shaped: `source: {device, input}` (`run-turn.ts:162`)
denormalizes into rows, and `captures.source_channel` (`schema.ts:270`) already carries values like
`"email"` (`lib/agentmail/process-email.ts:243`); add `sourceChannel: "sms"` the same way.

Do **not** mistake `POST /api/agentmail/webhook` → `lib/agentmail/process-email.ts:187` for the
seam: it is a bespoke one-shot Haiku extraction, not `run-turn`.

**(b) Webhook signature verification.** Mirror `lib/agentmail/webhook.ts:38` `verifySvixSignature`
exactly in shape: read `req.text()` **raw** before any JSON parse
(`app/api/agentmail/webhook/route.ts:69`), enforce a replay window (`webhook.ts:51-52`), compare with
`timingSafeEqual` plus a length guard (`:76`), and **fail closed with a 500 when the secret is
missing** (`route.ts:71-77`), never open. For Twilio use
`twilio.validateRequest(authToken, req.headers['x-twilio-signature'], absoluteUrl, params)` over the
raw body. Keep an env escape hatch for tests mirroring `AGENTMAIL_SKIP_WEBHOOK_VERIFICATION`
(`webhook.ts:64`).

**(c) Async ack.** Return `{accepted:true}` immediately and run the turn in `after(async () => …)`
from `next/server`, per `app/api/agentmail/webhook/route.ts:120-128`. Essential given Twilio's
webhook timeout.

**(d) Idempotency ledger.** New table mirroring `agentmail_ingest_events` (`schema.ts:870`): PK on
Twilio's `MessageSid`, columns `{from, to, turn_id, status: received|ignored_sender|disabled|done|
error, error, created_at, processed_at}`. Pattern from `process-email.ts:193-206`:
`insert(...).onConflictDoNothing().returning()`, and an **empty return means duplicate, return
early**. Adjacent idioms: `app/api/imessage/ingest/route.ts:114` `onConflictDoNothing` on
`(userId, chatJid, externalId)`; the cron once-per-day lock via `cron_runs` unique
`(job_name, run_date)` (`schema.ts:851`).

**(e) Phone-number-to-user mapping.** Three layers, in order: an explicit allowlist mirroring
`getAllowedAgentMailSenders()` / `isAllowedAgentMailSender()` (`webhook.ts:19-36`) under a new
`JARVIS_SMS_ALLOWED_SENDERS` env, E.164-normalized, defaulting to the owner's own number, with any
other sender recorded as `ignored_sender`; the owner gate `lib/auth/owner.ts` `isOwnerUser(userId)`
/ `OWNER_EMAIL` (env `JARVIS_OWNER_EMAIL`); and `lib/jarvis/find-single-user.ts` `findSingleUserId()`
as the last-resort fallback. **Never trust the phone number alone as auth**: SMS sender IDs are
spoofable, so the allowlist is a filter and the Twilio signature is the auth.

**(f) Streaming to a single message.** Text channels have no streaming. Call `runChannelTurn` with
`isVoice: false`, `source: {device: "sms", input: "text"}`, history from `buildRecentHistory`.
On done, strip system tags with `lib/jarvis/strip-system-tags.ts`; if the joined text is empty (a
pure tool turn), fall back to a receipt line built from the accumulated actions via
`lib/jarvis/receipt-summary.ts`. Split on 1500 characters at sentence boundaries and send as few
messages as possible. Two guards: a per-turn watchdog that sends an interim acknowledgement if the
turn exceeds roughly 20 seconds and the final on completion, and a loop-breaker so an outbound reply
can never re-trigger a turn (assert it in the ledger, do not rely on the transport alone).

**(g) Settings toggle gating outbound replies** (D6), following the canonical pattern exactly
(the Pages-backup toggle, issue #142):
1. `lib/db/schema.ts` on `users`: `smsJarvisEnabled: boolean("sms_jarvis_enabled").notNull()
   .default(false)` (**default off**: an accidentally auto-replying assistant is the bad failure
   mode), plus `smsJarvisLastReplyAt` / `smsJarvisLastStatus` / `smsJarvisLastError` telemetry
   columns mirroring `schema.ts:118-123`.
2. An idempotent migration in `apps/web/drizzle/`. Never touch `drizzle/meta/_journal.json`. Do not
   apply it to prod.
3. Read query mirroring `lib/db/queries/pages-backup.ts` `getPagesBackupSettings(userId)`.
4. Server action in a new `app/(app)/settings/messaging-actions.ts`, copied from
   `app/(app)/settings/backup-actions.ts:53`: `"use server"`, Zod-parse the arg, `requireUserId()`
   via `getClaims()` (`:38-47`), `db.update(users).set(...)`, `revalidatePath("/settings")`, return
   a `{success}` envelope.
5. `components/settings/MessagingSection.tsx` ("use client") rendering the toggle plus the
   allowlisted numbers, built from `components/settings/sd-primitives.tsx` (`SettingsCard`,
   `CardTitle`, `CardDescription`) and following the §2 design contract. Adjacent precedent for a
   channel section: `components/settings/GoveeDevicesSection.tsx` + `app/actions/govee-devices.ts`.
6. Page wiring: a new `<section id="messaging" className="scroll-mt-24">` in
   `app/(app)/settings/page.tsx` (see `:199-215` for the existing shape), and
   `{id:"messaging", label:"Messaging"}` in `components/settings/SettingsSectionNav.tsx:6-16`.
7. **Gate placement**: check the flag in the inbound handler **before spending a turn**, not just
   before sending. Flag off means ledger status `disabled` and no Anthropic call.
Web only; note mobile parity as a follow-up (D6).

**(h) New tools, if any, must be registered in `buildToolValidators(voiceActive)`
(`run-turn.ts:200-251`)**: every tool name maps to a Zod schema there and a tool missing from it is
rejected outright.

**OWNS.** New `lib/jarvis/run-channel-turn.ts`, new `app/api/jarvis/sms/route.ts` (or equivalent),
new `lib/twilio/*`, the thin-wrapper rewrite of `app/api/jarvis/voice/text/route.ts:101-283` and the
corresponding de-duplication in `app/api/jarvis/route.ts:155-208`, `lib/db/schema.ts` (users columns
plus the new ledger table), a new migration in `apps/web/drizzle/`, new
`app/(app)/settings/messaging-actions.ts`, new `components/settings/MessagingSection.tsx`,
`components/settings/SettingsSectionNav.tsx`, `app/(app)/settings/page.tsx`.

**MUST NOT TOUCH.** `lib/jarvis/run-turn.ts` behaviour (it needs no refactor; extracting the
duplicated wrapper logic happens **above** it), `lib/jarvis/executor.ts`,
`packages/jarvis-core/src/tools/*` unless a genuinely new tool is required, any UI outside
`components/settings/`, `app/globals.css`, `app/(app)/layout.tsx`, the cockpit JARVIS bar (U0 owns
that surface and consumes the same existing `/api/jarvis` route).

**Acceptance criteria (headless-verifiable).**
- A POST to the SMS webhook with an invalid `X-Twilio-Signature` is rejected; with the signing
  secret env var unset the route returns 500, not 200.
- A valid POST returns within the webhook budget with an accepted-style body, and the turn is
  processed after the response (assert a `jarvis_turns` row appears for the userId).
- Replaying the identical `MessageSid` produces exactly one `jarvis_turns` user row and one ledger
  row.
- A POST from a number outside `JARVIS_SMS_ALLOWED_SENDERS` creates a ledger row with status
  `ignored_sender` and zero Anthropic calls.
- With the settings toggle off, an allowlisted inbound message creates a ledger row with status
  `disabled` and zero Anthropic calls. Toggling it on in `/settings#messaging` and re-sending
  produces a reply.
- A turn started over SMS is visible in the web JARVIS history (shared `buildRecentHistory`), and a
  reply that is a pure tool call still sends a non-empty receipt line.
- `/settings` renders the Messaging section and it appears in `SettingsSectionNav`.
- The migration is idempotent; `drizzle/meta/_journal.json` is unmodified.

---

### U6: Tasks overhaul: list + kanban + inline side panel + segment by project/area
**Wave 2. Model: `claude-fable-5`. Branches from a `next` that already contains U0.**

**Goal.** Turn `/tasks` from seven stacked chrome regions into a calm list-or-kanban surface with an
inline `SidePanel` detail and first-class segmentation by project or area.

**Deliverables and evidence.**

**(a) Detail becomes an inline `SidePanel`, not an overlay.** Today `TaskDetailPanel.tsx:299` is a
right-anchored floating panel: a full-screen transparent backdrop at `:761-767`
(`fixed inset-0 z-40`) plus the panel at `fixed inset-y-0 right-0 z-50`, 340px wide (`:776`), sliding
`x:24→0` over 220ms via `components/ui/explorer/InspectorShell.tsx:7`. Radix `Sheet` was
deliberately removed (comment at `TaskDetailPanel.tsx:677-681`); do not reintroduce it. Migrate to
U0's `SidePanel` per §2.8, honouring §2.2 (the Dock slides out). Keep the deep-link contract: the
open task is a URL param, not a route (`useQueryState("task", parseAsString)` at
`TasksClient.tsx:212`, documented at `lib/entity-href.ts:12` as `/tasks?task=<id>`). Create mode is
a second instance fed a synthetic `__draft__` task (`TasksClient.tsx:662-680`, rendered `:1027`);
collapse both mounts into one panel host.

**(b) Kill the two always-mounted TipTap editors.** `TaskDetailPanel.tsx:337-393` calls `useEditor`
unconditionally in the component body (StarterKit plus 3 Mention extensions plus 2 decoration
plugins plus 2 suggestion plugins), and `TasksClient.tsx:982` and `:1027` mount two
`TaskDetailPanel`s at all times. `InspectorShell` unmounts its *children* when closed
(`InspectorShell.tsx:21-43`) but the editor lives in the parent, so the cost is paid on every
`/tasks` load with both panels closed. Gate on `open`, or `dynamic()`-import the panel. There are
**no dynamic imports anywhere in the tasks surface** today (`grep dynamic( components/tasks` returns
zero), so `@tiptap/*` (6 packages, `package.json:38-43`), `@dnd-kit/*` and `motion/react` all ship
in the initial `/tasks` bundle.

**(c) Segment by project or area: this is greenfield.** There is no group-by anywhere; the only
grouping keys in the codebase are status (kanban columns, `KanbanBoard.tsx:122-134`) and due date
(`OverdueTasksPanel.tsx:147`, `TaskOverviewView.tsx:50-56`). Project appears only as a filter
dimension (`TaskFilters.tsx:211-237`), a truncated chip on the card (`TaskCard.tsx:233-238`) and a
multi-select in the detail panel. Area is fetched (`tasks/page.tsx:48-55`) and threaded through
`TasksClient` → `TaskDetailPanel` → `ProjectAutocomplete` purely to support inline project creation
(`TasksClient.tsx:112-143`); it is never a filter, never a grouping, never on a card. The data is
already shaped for it: `tasks/page.tsx:36-47` returns `areaName` and `areaEmoji` per project, and
`TaskWithProjects.projects` is `{id,name}[]`. Add a `group` URL param in `TasksClient`, derive groups
from the already-computed `filtered` list (`TasksClient.tsx:282-334`), and **decide and document the
rule for multi-project and zero-project tasks** (tasks are many-to-many with projects via
`tasks_projects`). Recommended rule, unless you find a better one: a task appears once per project
it belongs to under group-by-project, and zero-project tasks land in an explicit "No project" group
pinned last. State the rule in the unit report.

**(d) De-clutter.** On a default kanban load the user currently sees, stacked vertically: page
header plus stats (`TasksClient.tsx:708-739`), a five-control toolbar (`:744-838`), the Overdue
panel and Inbox side by side at 50/50 (`:871-900`), the DaySwitcher (`:909`), a board-level "View"
popover row (`KanbanBoard.tsx:192-242`), the Not-Started tray (`:317-449`), then four columns.
Three of those are view-preference toggles sitting at the same visual weight as the filters, and
"Show lesno" is `disabled` in the default view (`TasksClient.tsx:753`), a permanently dead control.
Filter chips are `flex-wrap` siblings of the view toggles (`TaskFilters.tsx:100` inside
`TasksClient.tsx:744`), so adding a chip reflows the whole toolbar: layout shift by design. Adopt
`PageScaffold` (§2.9), demote view preferences out of the filter row, and remove the bordered plate
per §2.6.

**(e) Re-render and drag cost.** No component in `components/tasks/` is `React.memo`'d (`grep memo(`
returns zero), so any `TasksClient` state change re-renders every card.
`KanbanBoard.tsx:122-134` rebuilds five filtered arrays on every render without `useMemo`, so all
five columns get new array identities. `TaskOverviewView.tsx:73` runs `tasks.filter(...)` inside a
7-row `.map`. `OverdueTasksPanel` recomputes groups on every `overdueTasks` identity change (`:147`),
and `overdueTasks` is rebuilt at `TasksClient.tsx:363-373` with `optimisticTasks` in its deps, which
`useOptimisticList` recreates on every canonical change (`useOptimisticList.ts:203-243`). Two
surfaces write React state on **every** `dragover` event: `TasksClient.tsx:913-917` and
`TaskOverviewView.tsx:79-83`. The correct pattern already exists in-repo (direct DOM style writes,
no state) at `KanbanColumn.tsx:82-90` and `KanbanBoard.tsx:342-352`; apply it to the other two.
Also: `layout` on every list row (`TaskListRow.tsx:171-177` inside `AnimatePresence
mode="popLayout"` at `TaskList.tsx:133`) and `initial/animate/exit` plus an inline `opacity` write
on every card (`TaskCard.tsx:114, 142-176`), across six simultaneous `AnimatePresence` surfaces
(`TaskList.tsx:133`, `KanbanColumn.tsx:155`, `InboxColumn.tsx:139`, `OverdueTasksPanel.tsx:253` and
`:299`, `TaskOverviewView.tsx:135`, `InspectorShell.tsx:21`). Bring all of it into §2.7.
There is no virtualization anywhere; virtualizing is **optional** for this unit, but if the list
still janks at a few hundred tasks, say so in the report rather than silently leaving it.

**(f) Filter round-trips.** `TaskFilters.tsx:47` and `TasksClient.tsx:261` both use
`useQueryStates(..., { shallow: false })`, so adding or removing one chip re-runs all five server
queries in `tasks/page.tsx` even though filtering is already 100% client-side
(`TasksClient.tsx:282-334`). Drop `shallow: false` on both. Note the duplicated read: the two hooks
declare the identical schema and both subscribe; the SSR seed at `tasks/page.tsx:65-70` threads
`initialFilters` to `TasksClient` only, so the two hooks momentarily disagree on first paint when
the URL has filters. Unify them. Also fix the localStorage-to-URL sync effect at
`TasksClient.tsx:265-277`, which can rewrite `view` after first paint (a visible view flip on load).

**(g) Write amplification.** Every mutation does optimistic dispatch, server action, then
`await queryClient.invalidateQueries(tableKey("tasks"))`, and then the realtime echo of the same
write fires a **second** invalidation (`useTableSubscription("tasks")` and `("tasks_projects")` at
`TasksClient.tsx:156-157`, echo at `useTableSubscription.ts:110`). One drag equals one write plus
two full-table refetches. Explicit invalidate sites: `TasksClient.tsx:393, 445, 478, 524, 553, 589,
650, 1013` and `KanbanBoard.tsx:181`. Rely on the echo or the explicit invalidate, not both.
The underlying refetch is unbounded (`getTasksForCurrentUser` at `app/actions/tasks.ts:706-714`
re-runs `getAllTasksForUser`, every column, no limit, no status or archived filter); **U3 owns the
query helper**, so do not edit `lib/db/queries/tasks.ts`.

**(h) Note the duplication with projects.** `components/projects/ProjectTasksSection.tsx:339,357,398`
reuses these components with roughly 200 lines of `TasksClient` orchestration copied. U9 owns that
file. Coordinate through shared component props: if you change a `TaskList` / `KanbanBoard` /
`TaskCard` prop signature, say so explicitly in your report so U9 can absorb it.

**OWNS.** `components/tasks/*`, `app/(app)/tasks/page.tsx`.
**MUST NOT TOUCH.** `components/projects/*` (U9), `lib/db/queries/tasks.ts` and
`app/actions/tasks.ts` query shape (U3), `components/ui/SidePanel.tsx` / `PageScaffold.tsx` /
`EmptyState.tsx` (U0: consume only, raise a blocker if they need a change), `app/globals.css`,
`components/shell/*`.

**Acceptance criteria (headless-verifiable).**
- Opening a task narrows the stage (`getBoundingClientRect().width` decreases) rather than covering
  it; no `fixed inset-0` backdrop exists; the Dock is not visible while the panel is open.
- On a cold `/tasks` load with no task open, zero ProseMirror instances exist in the DOM (assert
  `document.querySelectorAll('.ProseMirror').length === 0`).
- A `group=project` URL param groups the board and list; a task in two projects appears under both;
  tasks with no project appear under an explicit "No project" group. `group=area` works the same.
- Adding a filter chip issues no RSC document request (assert via `browser_network_requests`) and
  does not change the toolbar's height.
- Dragging a card across columns issues exactly one tasks refetch, not two.
- No control in the default view is rendered `disabled`.
- Screenshots of list, kanban, grouped-by-project and grouped-by-area, panel open and closed, both
  themes.

---

### U7: Wiki UI polish + folder grid alignment
**Wave 2. Model: `claude-fable-5`.**

**Goal.** Bring the wiki explorer and page detail onto the shared design contract, and make the
folder grid read as a clean register rather than a jittery board.

**Deliverables and evidence.**
- Adopt `PageScaffold` (§2.9) on `/wiki` and `/wiki/[pageId]`, replacing the ad-hoc container
  (`PagesListClient.tsx:162` H1 is `text-3xl`; it becomes `text-display`).
- Grid alignment: the CSS at `ExplorerGridView.tsx:101`
  (`grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2`, tiles `min-h-[154px]` at `:212`, labels
  single-line `truncate` in `components/ui/explorer/Tile.tsx` with `labelLines` defaulting to 1) is
  sound and **is not the cause of the drooping**; U1 fixes the `layout` + `y` transform conflict.
  Your job is the visual register: gap on the §2.5 ladder (`gap-2` is legal, `gap-1.5` is not), tile
  radius on the §2.6 ladder, hover to `--edge-strong` only, no accent borders, no shadow.
- Kill the mono-uppercase chrome in the wiki surfaces per §2.4, including
  `components/shell/JarvisSidePanel.tsx:66,84` if it renders inside a wiki context, and any
  `font-serif` in files you touch (it is a dead alias to Space Grotesk, `globals.css:31-36`).
- One border per nesting level (§2.6) across `ExplorerHeaderControls.tsx` (breadcrumbs, search,
  controls), `ExplorerCanvasBody.tsx`, `ExplorerListView.tsx`, `ExplorerSearchResults.tsx`,
  `ExplorerInspectorPanel.tsx`, and the journal rail (`components/wiki/journal/JournalRail.tsx` plus
  `journal-rail.css`).
- Empty states: replace ad-hoc wiki empties with U0's `EmptyState` (§2.10).
- `ExplorerInspectorPanel` should consume `SidePanel` (§2.8) rather than `InspectorShell`'s
  260px `motion.aside`, so wiki and tasks share one detail affordance and one right-slot.
- Per-feature CSS files you may touch: `components/pages/page-block-editor.css`,
  `components/wiki/journal/journal-rail.css`, `components/pages/blocks/link-embed-block.css`. These
  are **not** `globals.css` and are yours; keep changes token-driven.

**OWNS.** `components/wiki/**` visual layers, `components/ui/explorer/*` (Tile, Toolbar, Rail,
ViewToggle, SortSelect, Breadcrumbs, ContextMenu, InspectorShell), `components/pages/*.css`,
`components/pages/PagesListClient.tsx` presentation.

**MUST NOT TOUCH.** Explorer *behaviour* hooks (`components/wiki/explorer-hooks/*`, U1),
`PageBlockEditor.tsx` (U1, U2), `app/globals.css` (U0), `components/tasks/*` (U6).
Note `components/ui/explorer/EmptyState.tsx` is a U0-owned shim after wave 1: consume, do not edit.

**Acceptance criteria (headless-verifiable).**
- Every tile in a row shares the same `getBoundingClientRect().top` and `height`.
- No element under `/wiki` has `text-transform: uppercase` except `kbd` hints; no element uses
  `font-family` resolving through `--font-serif`.
- No computed `border-color` under `/wiki` resolves to `--accent`.
- Every computed `border-radius` under `/wiki` is one of 4px, 8px, 12px, 9999px (14px grandfathered
  only on `WidgetCard`, which does not appear here).
- The wiki inspector narrows the stage rather than overlaying it; the Dock is hidden while it is
  open.
- An empty folder renders the shared `EmptyState`, not a bordered card.
- Screenshots of `/wiki` grid, list and search, and a page detail, both themes.

---

### U8: Area page redesign
**Wave 2. Model: `claude-fable-5`.**

**Goal.** Make `/areas/[areaId]` a calm AturnDeck-style register of the area's work, with the
surfaces it is missing today.

**Evidence: what the page is now.** `app/(app)/areas/[areaId]/page.tsx` (108 lines):
`<main className="min-h-full bg-[var(--canvas)]">` at `:75`, container
`mx-auto w-full max-w-[1080px] px-8 md:px-12 pt-6 pb-20` at `:76`, breadcrumbs at `:77`,
`components/areas/AreaDetailHeader.tsx` (218 lines, header `mt-2 mb-10 space-y-2` at `:83`, emoji
plus h1 plus [Edit area][New project][Delete], project-count line at `:125`, Edit dialog at `:131`),
an `<h2>Projects</h2>` at `:92-96`, then `components/areas/AreaProjectList.tsx` (402 lines) with
Active/Archived tabs (`:161-175`), a hide-classes filter (`:177`), a Grid|Timeline segment (`:313`),
a grid at `:215` (`grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3 gap-4`), an empty state at
`:204-213`, and `components/projects/timeline/ProjectsTimeline.tsx`.

**What is missing** (scout s3 §3): no tasks surface (area-level rollup across its projects does not
exist anywhere), no captures surface, no pages surface (both of which the project page has), no area
description or notes rendered (only the count line at `AreaDetailHeader.tsx:125`), no stats, no
recent activity, and **no realtime on the page's own data**: the RSC fetch at `page.tsx:47` is static
per navigation, and while `AreaProjectList.tsx:98` subscribes to `projects`, an area rename from the
sidebar does not live-update the `<h1>`. The fix pattern already exists at
`components/projects/ProjectDetailClient.tsx:81-86` (collection-key plus `select`, which lets a soft
nav paint the name instantly from the cached `["areas", userId]` tree).

**Deliverables.**
1. Adopt `PageScaffold` (§2.9): eyebrow is the Areas breadcrumb, icon is the area emoji, title is
   the area name (`AreaDetailHeader.tsx:91` is `text-4xl` today and becomes `text-display`), meta
   row carries project count and any dates as plain text separated by `·`, actions carry **at most
   one** primary button (New project) with Edit and Delete demoted to ghost or an overflow menu.
2. Add the missing surfaces as `PageScaffold.Section` blocks: an area-level tasks rollup across its
   projects, and captures. Pages are optional; if you skip them, say so in the report.
3. Adopt the `ProjectDetailClient.tsx:81-86` collection-key + `select` pattern so the header name
   live-updates on a sidebar rename.
4. Project cards adopt the AturnDeck register: `EmptyState` from §2.10 for the empty case, one
   border per nesting level, plain-text meta with `·` separators, one `StatusPill` for
   Class/Archived/Ended rather than three chips, hover to `--edge-strong`.
5. Kill `components/areas/AreasPageHeader.tsx:32` mono-uppercase per §2.4.
6. Query parallelization on `app/(app)/areas/[areaId]/page.tsx:26,47,68` belongs to **U3**. If U3
   has landed it before you branch, keep it; do not re-do or revert it. A route-level
   `app/(app)/areas/[areaId]/loading.tsx` rendering a header-plus-card skeleton is yours to add (it
   makes the prefetched shell meaningful instead of a spinner, since App Router prefetch for a
   dynamic route only warms up to the nearest loading boundary).

**OWNS.** `app/(app)/areas/[areaId]/page.tsx` (presentation and composition; not the query
parallelization), a new `app/(app)/areas/[areaId]/loading.tsx`, `components/areas/*`.
**MUST NOT TOUCH.** `components/projects/*` (U9) except read-only reuse of
`components/projects/timeline/ProjectsTimeline.tsx`, `components/tasks/*` (U6: consume the
components, do not edit them), `lib/db/queries/*` (U3), `app/globals.css` (U0),
`components/ui/PageScaffold.tsx` (U0).

**Acceptance criteria (headless-verifiable).**
- The page's outer container computes to `max-width: 1120px` with 32px gutters, matching
  `/projects/<id>` and `/tasks` exactly (assert equal `getBoundingClientRect().left` on the H1
  across all three routes at the same viewport).
- Renaming the area from the sidebar updates the page H1 without a reload.
- An area with zero projects renders the shared `EmptyState` (no border, no card).
- The tasks rollup section lists tasks belonging to the area's projects, and is empty-stated when
  there are none.
- Exactly one primary-variant button exists in the header.
- No uppercase text outside `kbd`; no `--accent` border colours.
- Screenshots at 1440x900 and 1280x800, both themes.

---

### U9: Project page redesign (kanban width, empty states, section spacing)
**Wave 2. Model: `claude-fable-5`.**

**Goal.** Fix the three named layout defects on `/projects/[projectId]` and bring the page onto the
contract.

**Deliverables and evidence.**

**(a) The kanban board is squeezed narrow and hugs the left edge.** Root cause,
`components/projects/ProjectTasksSection.tsx:334-337`:

```tsx
<div id="project-tasks-body"
  className={cn(view === "kanban" ? "h-[560px] min-h-0 flex" : "", "rounded-lg")}>
```

The `flex` makes this a **row** flex container. `KanbanBoard`'s root
(`components/tasks/KanbanBoard.tsx:189`) is `<div className="flex flex-col gap-4">` with no
`w-full`, no `flex-1`, no `basis`, so as the sole flex item it gets `flex: 0 1 auto`, meaning
shrink-to-fit max-content width, left-aligned by the default `justify-content: flex-start`. And its
max-content is *small* because the columns row (`KanbanBoard.tsx:265`,
`flex flex-col @4xl/main:flex-row gap-3`) gives each column
`w-full @4xl/main:flex-1 @4xl/main:basis-0 @4xl/main:min-w-0` (`KanbanColumn.tsx:101`): with
`basis-0` and `min-w-0` the columns contribute almost nothing to intrinsic width, so the board
collapses to roughly its card text width instead of the available ~984px. The container query is
**not** the bug: `@4xl/main` is 896px measured against `AppShell.tsx:124`'s `@container/main`, and it
does fire on desktop. The working reference is `components/tasks/TasksClient.tsx:948-950`, which
wraps the same component in `<div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">`, a
**block** container, so the board's root fills 100% width. Use that shape.

**(b) List view with zero tasks renders nothing.** `components/tasks/TaskList.tsx:94`
`if (tasks.length === 0) return null;`, and `ProjectTasksSection.tsx:348-352` renders `<TaskList>`
unconditionally with no fallback, so the body div (which in list view carries only `rounded-lg`, no
height) collapses to 0px and the user sees a bare header reading `(0)`. This is an asymmetry inside
one page: `ProjectCapturesSection.tsx:140-141` guards with an `EmptyCaptures` at `:171-179`,
`ProjectPagesSection.tsx:519-523` has its own copy, and `AreaProjectList.tsx:204-213` has one.
Tasks is the only section without one. Fix with U0's `EmptyState` at `size="section"`.

**(c) Huge vertical gap between Tasks and Captures.** `ProjectTasksSection.tsx:336` `h-[560px]` is a
hard, content-independent height applied whenever `view === "kanban"`. A project with a handful of
tasks yields a ~100-200px board inside a 560px box, leaving 360-460px of dead space rendered inside
the Tasks `<section>` directly above the divider. Additive: `ProjectDetailClient.tsx:152`
`gap-12` (48px) twice around the divider is 96px, plus `ProjectTasksSection.tsx:270`
`<section className="flex flex-col gap-4">` adds 16px. Worst case is roughly 570px of whitespace,
and `h-[560px]` is the dominant term. **Note it fails in both directions**: there is no
`overflow-y-auto` on that box, so a task-heavy board overflows 560px and collides with the divider
at `ProjectDetailClient.tsx:161`. Replace the fixed height with a content-driven height plus a
`max-h` and `overflow-y-auto`, and bring the section rhythm to the §2.5 ladder (32px between
sections, not 48px).

**(d) Contract adoption.** `ProjectDetailClient.tsx:108-192`: the breadcrumbs strip
(`mx-auto max-w-[1080px] px-8 md:px-12 pt-4 pb-6` at `:113`) and the body container
(`mx-auto max-w-[1080px] px-8 md:px-12 pb-24 pt-2 flex flex-col gap-12` at `:152`) both become
`PageScaffold` (§2.9, `max-w-[1120px] px-8`). `ProjectHeader.tsx` (397 lines): keep the 120px banner
flush and edge to edge above the scaffold with no added chrome (`:200-213`); the area pill at `:235`
and the "Edit class" control at `:349-355` lose their mono-uppercase treatment; the h1 at `:335`
(serif 36px) becomes `text-display` sans; the inline-edit underline moves from `--ink-amber` to
`--edge-strong` (`:326`); hover borders at `:216` and `:249` move from `--sd-accent` to
`--edge-strong`. Also render the project description on the page (it exists in the data model and is
shown on area cards at `AreaProjectList.tsx:259` but never on the project's own page).

**(e) Coordinate with U6.** `ProjectTasksSection.tsx:339,357,398` duplicates roughly 200 lines of
`TasksClient` orchestration, and U6 is rewriting the components it consumes. **You own
`ProjectTasksSection.tsx`; U6 owns `components/tasks/*`.** Do not edit `components/tasks/*`. If U6
changes a prop signature, absorb it on your side. Do not attempt to de-duplicate the orchestration
in this sesh: raise it as a queue item instead.

**OWNS.** `app/(app)/projects/[projectId]/page.tsx`, `components/projects/*` (including
`ProjectDetailClient.tsx`, `ProjectHeader.tsx`, `ProjectTasksSection.tsx`,
`ProjectCapturesSection.tsx`, `ProjectPagesSection.tsx`, `ProjectSettingsDialog.tsx`).
**MUST NOT TOUCH.** `components/tasks/*` (U6), `components/areas/*` (U8), `app/globals.css` (U0),
the shared primitives (U0), `lib/db/queries/*` (U3). Note U3 is rewriting `router.refresh()` sites
inside `components/projects/ProjectHeader.tsx` and `ProjectSettingsDialog.tsx` in wave 1: those land
in `next` before you branch, so keep them.

**Acceptance criteria (headless-verifiable).**
- In kanban view, the board's `getBoundingClientRect().width` equals the scaffold content width
  (within 2px), and its `left` equals the H1's `left`.
- With a project that has 3 tasks, the vertical distance between the bottom of the last kanban card
  and the top of the Captures heading is under 120px.
- With a project that has 60 tasks, the board scrolls internally and does not overlap the divider.
- List view with zero tasks renders a visible `EmptyState` with non-zero height.
- Exactly one primary-variant button exists in the header; no uppercase outside `kbd`; no `--accent`
  border colours; the H1 left edge matches `/tasks` and `/areas/<id>` at the same viewport.
- Screenshots: kanban with few tasks, kanban with many, list empty, list populated, both themes.

---

### U10: LifeOS polish + self-hosted space video background
**Wave 2. Model: `claude-fable-5`.**

**Goal.** Bring `/lifeos` onto the contract and give it a self-hosted space video background,
scoped to that page only.

**Deliverables and evidence.**

**(a) The background, per D5.** A free-license space video loop (CC0 / Pexels / Coverr),
**self-hosted under `public/`**, muted autoplay loop with a poster frame, a `prefers-reduced-motion`
fallback to a static frame, and a hard budget on file size. **The licence and the source URL must be
recorded in the unit report.** The background belongs to the LifeOS page only, never app-wide:
full-bleed video behind a text-heavy journal UI hurts both readability and performance.

Scout s3 §4 mapped exactly what this involves.
- **No background media layer exists**: grep for `<video`, `.mp4`, `.webm` across `app/` and
  `components/` returns zero hits. The only background layer is `AmbientGlow`
  (`components/ui/ambient/AmbientGlow.tsx:118`, `pointer-events-none overflow-hidden fixed inset-0
  -z-10`) mounted once globally. `public/lifeos-hero.png` exists but is referenced nowhere: dead
  asset, delete it or use it as the poster.
- **The opaque background to pierce**: `app/(app)/lifeos/page.tsx:98`
  `<main className="h-full bg-[var(--sd-app)] text-[var(--sd-ink)]">`. It needs `relative` and the
  fill removed or replaced with a translucent scrim. `AppShell.tsx:124`'s wrapper is transparent
  (fine), but `app/globals.css:103` sets `--color-background: var(--canvas)` on `body`, so a
  `fixed` video would sit behind an opaque body: **mount the video layer inside the lifeos `<main>`,
  not as a fixed sibling.**
- **Layer shape**: mirror `AmbientGlow`'s contract, `absolute inset-0 -z-10 pointer-events-none
  overflow-hidden` inside a `relative` `<main>`, with
  `<video autoPlay muted loop playsInline className="h-full w-full object-cover">` plus a scrim div
  for text contrast. Because `<main>` is `h-full` inside the already-clipped AppShell content
  wrapper, `absolute inset-0` gives true full-bleed of the route region below the top chrome. A
  `fixed inset-0` variant would bleed under the rail and the dock: **choose `absolute`.**
- **Stacking**: `AmbientGlow` already occupies fixed `-z-10`. A `-z-10` layer inside the stacking
  context created by `relative` on `<main>` will not collide; do not switch to `fixed`.
- **Legibility**: deck surfaces read `--sd-box` / `--sd-input` / `--sd-line`, but `LifeOsHero` text
  sits directly on the canvas with **no plate** (`LifeOsHero.tsx:222` comment: "canvas only, no plate
  (§4)"). Over video the hero needs a scrim or a reinstated plate, and `WidgetCard` /
  `LifeOsBentoGrid` cells need opaque or backdrop-blurred fills. Re-check contrast against §2.3
  targets **over the video**, not over the canvas.
- **Client component required** for the reduced-motion guard (`useReducedMotion`, already used at
  `LifeOsCanvas.tsx:37`) and for a poster or pause control; the `<video>` element itself renders
  fine from the RSC.
- **Asset and perf**: `public/` has only mp3s and images and there is no video pipeline. Self-hosting
  from `public/` ships through Vercel's static edge with no transcoding: set `poster`,
  `preload="none"` or `"metadata"`, cap the file size, and state the final byte size in the report.

**(b) Contract adoption for the page.** `LifeOsCanvas.tsx:77`
`<div className="flex h-full flex-col overflow-hidden px-6 pt-5">`: hero `shrink-0` at `:78`,
quick-send at `:79`, a toggle row at `:84` (Widgets|Areas segmented pill at `:144` with a sliding
`layoutId` indicator, contextual right slot), and the single swapped region at `:99`
(`relative min-h-0 flex-1 pb-1`) where exactly one of Widgets / Areas mounts (`:100-108`, Areas
lazy-mounted on first switch at `:41,:106`). The page never scrolls (`h-full` + `overflow-hidden`);
Areas owns its own scroll in `LifeOsAreasShell.tsx`. Keep that architecture. Bring the surfaces onto
§2.3 to §2.7: `LifeOsHero` (321 lines, greeting row, FocalOrb, 6-cell stat strip) loses
`.sd-stat-label`'s mono-uppercase (`globals.css:1725` is U0's to change; use a non-uppercase class
on your side), the bento grid (`LifeOsBentoGrid.tsx:129-134`, 4-col by 2-row dense grid with
per-cell spans persisted via `useWidgetSpans.ts` and a drag/keyboard resize handle at `:299-300`)
keeps its mechanics but adopts the radius, border and hover rules, and empty widget bodies use
`EmptyState` at `size="inline"`.

**(c) D4 boundary.** The Dock is a distinct quick-glance strip with its own compact widgets, owned
by U0. LifeOS remains the full dashboard, the deep view, with the video. Two widget sets, each
designed for its own density. **Do not make the Dock consume `WidgetCard`, and do not make LifeOS
consume the Dock widgets.**

**OWNS.** `app/(app)/lifeos/page.tsx`, `components/lifeos/*`, the new video asset and poster under
`public/`, a new video-layer component under `components/lifeos/`.
**MUST NOT TOUCH.** `components/ui/ambient/AmbientGlow.tsx` (U0's shell surface),
`components/shell/*` (U0), `app/globals.css` (U0), `components/areas/*` (U8) beyond read-only reuse
of `AreasTree`, `components/tasks/*` (U6). The `dynamic = "force-dynamic"` export at
`lifeos/page.tsx:22` is U3's to remove; do not fight it.

**Acceptance criteria (headless-verifiable).**
- `/lifeos` contains exactly one `<video>` element; it is `muted`, `loop`, `playsInline`, has a
  `poster`, and its computed `position` is `absolute` (not `fixed`).
- No other route in `(app)` contains a `<video>` element.
- With `prefers-reduced-motion: reduce` emulated, the video does not play (assert `video.paused` is
  true or the element is replaced by the static poster image).
- The asset under `public/` is within the stated byte budget, and the report names the licence and
  the source URL.
- Hero text over the video meets the §2.3 contrast intent: measure the rendered text against the
  composited background in a screenshot, not against the token value.
- The page still does not scroll; the Areas branch still lazy-mounts on first switch.
- Screenshots of Widgets and Areas views, both themes, plus one with reduced motion.

---

### U11: Habits overhaul + dock widget
**Wave 2. Model: `claude-fable-5`. Branches from a `next` that already contains U0.**

**Goal.** D12, in Filippo's words: Habits "does not feel like it's too usable", and he wants it "on
the persistent bar on the side as well so it's more integrated into my routine". Two deliverables in
one unit. (a) Rebuild `/habits` on the stage, inside the cockpit, against §2: marking today's habit
done is **one tap, optimistic, with no `router.refresh()`**, and today's remaining plus streak state
are legible at a glance **without interaction**. (b) Ship a compact habits widget registered through
U0's dock seam (D11), so the daily loop costs zero navigation. The two surfaces share one mutation,
one cache key and one streak function, so they can never disagree.

**Deliverables and evidence.**

**(a) What the page is today.** `app/(app)/habits/page.tsx` (92 lines) is a `force-dynamic` server
page (`:14`) running four parallel queries (`:40-52`), one of which is the archive list nobody asked
for. It renders `components/habits/HabitsClient.tsx` (991 lines, `"use client"`) as three tabs behind
a `TabButton` strip plus "New habit" (`:340-371`): TodayTab (`:421-583`) with a day navigator
(`:467-524`, `MiniCalendar.tsx` in a Popover at `:492-501`), a `ProgressRow` plate (`:527-539`) and
`DayHabitRow` (`:585-621`) carrying `CheckCircle` (`:866-916`) and `StreakChip` (`:624-631`);
ManageTab / `ManageHabitRow` (`:637-788`) with `HabitFrequencyBadges`
(`HabitFrequencySelector.tsx:92-132`), a 7-dot history strip (`:757-779`) and `HabitRowMenu`
(`:918-963`); ArchiveTab (`:794-855`); and `HabitDialog.tsx` (267 lines) for create and edit.
Entry points are thin: `components/shell/TopTabBar.tsx:24` is the only shell reference, habits appear
in **no** command-menu action and **no** quick-create action (zero hits in
`useQuickCreateActions.tsx` and `CommandMenuContent.tsx`), and there is no hotkey (s7 §1).

**(b) The check-off path is already optimistic; do not regress it.** `grep router.refresh
components/habits components/lifeos/TodayHabitsWidget.tsx` returns **zero hits** (s7 §2), and
completion is a Server Action, `toggleHabitCompletion` (`app/actions/habits.ts:368-412`, ownership
check then `INSERT … ON CONFLICT DO NOTHING` or `DELETE`). The page's toggle
(`HabitsClient.tsx:248-284`) is the better of the two implementations: `sfx.play("habitCheck")` fires
first, then `lib/realtime/useOptimisticList.ts` holds the row until canonical catches up (the RT-06
anti-flash), then action, then invalidate. Keep that shape. The widget's plain `Map` overlay
(`TodayHabitsWidget.tsx:65-103`) is the wrong one: it is cleared the instant `invalidateQueries`
resolves, which is exactly the read-after-write race `useOptimisticList` exists to kill, so under
pooler lag the check flickers off then back on (s7 §3). Your dock widget uses `useOptimisticList`
with the `habitId::date` id convention from `HabitsClient.tsx:223-246`, never a bare `Map`.
Round-trip budget: today the toggle costs an action RTT, a refetch RTT, **and** a third invalidation
from the realtime echo on `habit_completions` (`TodayHabitsWidget.tsx:51`). Rely on the echo or the
explicit invalidate, not both.

**(c) The usability defects to fix, all from s7 §4.** These are the substance of "not too usable":

1. **Unscheduled habits are counted.** `TodayHabitsWidget.tsx:106-107` uses `habits.length` and all
   habits with no `daysOfWeek[today]` filter, rendering `habits.slice(0,6)` (`:146`). The Today tab
   *does* filter (`HabitsClient.tsx:451-457`). So a Monday-only habit shows on Sunday and
   permanently drags "3/7" down. **Fix it server side once** (see (d)) so the dock cannot repeat it.
2. **Three streak definitions for the same habit.** `HabitsClient.computeStreak:125-150`
   (schedule-aware, forgives today, hard-capped at 14 by the loop bound at `:135`),
   `lib/db/queries/analytics.ts:369-383` (schedule-aware, 365 days, does **not** forgive today, so it
   shows 0 every morning), `lib/context/nodes/habits.ts:29-39` (calendar-consecutive, ignores
   `daysOfWeek` entirely). Collapse them into a shared **`lib/habits/streak.ts`** consumed by the
   page, the dock and the context node. Document the chosen semantics (forgive-today or not, window
   length) in the unit report; it is a product decision and you own it.
3. **Streak truncates at 14** because the page only loads a 14-day window (`page.tsx:32-43`,
   `computeStreak` comment at `:134`). A 40-day run renders "14". Widen the window the streak
   function reads, or compute the streak server side; do not ship a number you know is wrong.
4. **Streak is invisible until day 2**: `StreakChip` returns null when `streak < 2`
   (`HabitsClient.tsx:625`). Day one is exactly when reinforcement matters. Show it from day 1.
5. **Create and edit do not refresh the list except by luck.** `HabitDialog` calls `onSaved?.(id)`
   (`:105`) but `HabitsClient.tsx:398-412` passes no `onSaved`, and the dialog never invalidates
   `tableKey("habits")`. The toast says "Habit added." while the list may still be empty; the row
   only appears when the realtime echo lands. Wire `onSaved` to an invalidate.
6. **Manage row is a five-way cram**: name-as-edit-button, description, area line, 7 frequency
   badges, 7 history dots and a kebab on one 44px row (`ManageHabitRow:726-787`). The history dots
   are `aria-hidden` with `title`-only tooltips (`:763-767`), so there is no keyboard or
   screen-reader access and no legend: cyan-fill vs hairline-outline vs faint-outline is guesswork.
   The daily surface is check-off only; editing, archiving and analytics stay off it (s7 §7).
7. **Completion rate is nowhere on `/habits`**, only behind `/insights?tab=habits`
   (`HabitsInsightsPanel.tsx`). Remaining-today, current streak and an n-day rate belong in one
   header line, read without a click.
8. **Delete is instant, unconfirmed and cascading** (`handleDelete:320-335` →
   `deleteHabit`, `app/actions/habits.ts:349-361`, hard delete). Add a confirmation or an undo toast
   (`components/shared/use-undo-toast`, §2.11). Per §2.8 rule 9 destructive confirmation is one of
   the two legitimate uses of a modal.
9. **Future check-off writes a real completion row** dated in the future, which then feeds streaks,
   under ambiguous copy ("check-off is enabled but won't change today's counts",
   `HabitsClient.tsx:543-546`). Decide the rule, state it in the report, make the copy match.
10. **Dead tri-state.** `habit_completions.status` exists with a CHECK of
    `in_progress|almost_done|done` (`lib/db/schema.ts:1150-1170`,
    `supabase/migrations/0016_habit_completions_status.sql`) and is read by analytics
    (`analytics.ts:166,356`), but `toggleHabitCompletion` never writes it and
    `getHabitCompletionsInRange` (`app/actions/habits.ts:173-203`) drops it from the projection.
    "Partially done" is modelled and unreachable. Either surface it or say in the report that you
    deliberately left it dead; do not silently leave a third state half-wired.

Out of scope, note it and queue it rather than building it: a Kiwi habit tool. There is none in
`packages/jarvis-core`, `lib/jarvis/`, or any `app/api/*` route except the device bearer twin
(`app/api/device/habits/route.ts`), so Kiwi can read habits from the context snapshot but cannot
complete one (s7 §4.12).

**(d) The dock widget, registered through U0's seam.** One new file,
`components/dock-widgets/habits.tsx`, exporting a `DockWidgetDef` via `defineDockWidget` from
`components/shell/cockpit/dock-registry.ts`, plus one appended entry in
`components/dock-widgets/manifest.ts`. **You edit nothing under `components/shell/`.**

- **Data.** A compact row needs only `{ id, name, daysOfWeek }` plus the set of `habitId` completed
  for the client's local ISO date; areas, description, icon and orderIndex render nothing in a
  one-tap strip (s7 §5). The existing actions are usable but wasteful:
  `getHabitsForCurrentUser()` (`app/actions/habits.ts:86-121`) runs a second full
  `habits_areas ⨝ areas` query whose output the dock discards, and
  `getArchivedHabitsForCurrentUser()` (`:128-164`) repeats that same user-wide join
  (`habits.ts:99` and `:142`). Add one narrow action, **`getHabitDockToday(todayISO)` →
  `{ habits: {id,name,daysOfWeek}[]; doneIds: string[] }`**: a single habits select with no area
  join plus the one-day completions select, with the `daysOfWeek[dow]` and `createdAt <= today`
  filtering done **server side** so defect 1 cannot recur. The client passes the local ISO date,
  which is the whole codebase's timezone contract (`components/habits/date-utils.ts`).
  `getHabitCompletionsInRange(today, today)` (`:173-203`) is already exactly right and index-covered
  by `habit_completions_user_date_idx`.
- **Cache and realtime are free; reuse them, do not invent.** Key on
  `[...tableKey("habit_completions", userId), todayISO, todayISO]`, **identical** to
  `TodayHabitsWidget.tsx:44-48`, so the dock and the LifeOS tile dedupe and invalidate as one cache
  entry. Subscribe with `useTableSubscription("habits", userId)` and `("habit_completions", userId)`;
  the channels are singleton and refcounted (`lib/realtime/useTableSubscription.ts:38-40`) and both
  tables are already in the publication (`supabase/migrations/0015_habits.sql:131-141`).
- **Write path.** Keep calling the existing `toggleHabitCompletion`. **No new write path, no
  migration.** This unit ships zero SQL.
- **Content.** Show what the page hides: today's scheduled habits only, one row each, one large tap
  target on the left, remaining-today, the streak from day 1 and a small n-day rate in a single
  header line, and a visible terminal state when the list is finished rather than an empty list
  (s7 §7). `Compact` fits the strip; if a `7`-dot trail or the rate needs room, put it in the
  optional `Expanded` render, not in `Compact`.
- **Midnight rollover.** `HabitsClient.tsx:185-191` re-syncs the current date only on window
  `focus`. That is survivable for a page you navigate to and fatal for a widget that sits on screen
  for eighteen hours: the dock widget needs a real timer that fires at local midnight and refetches
  (s7 §4.13). Guard it so it does not fire while the tab is hidden and then fire on wake.

**(e) Contract adoption for the page (§2).** Adopt `PageScaffold` (§2.9), replacing the ad-hoc
container `mx-auto max-w-[1080px] px-8 md:px-12 pt-6 pb-20` at `habits/page.tsx:59`; the H1 at
`habits/page.tsx:69` is `text-[26px]` today and becomes `text-display` (§2.4). The `ProgressRow`
plate at `HabitsClient.tsx:527-539` is a bordered box inside a bordered surface: one border per
nesting level (§2.6). Empty days and an empty habit list use U0's `EmptyState` (§2.10), not an
ad-hoc block. Radii onto the four-value ladder, hover to `--edge-strong` only, no `--accent`
borders, no uppercase outside `kbd`, motion durations and easings per §2.7.
`AnimatePresence mode="popLayout"` on the day list (`HabitsClient.tsx:561`) is keyed by id so
toggles do not re-animate the list: keep that, and do not add `layout` plus a `y` transform to the
same node (§2.7, the wiki-tile root cause).

**(f) Perf notes you may act on, and one you may not.** The archive list is fetched on every visit
for a tab most sessions never open (`page.tsx:40-52` → `getArchivedHabitsForCurrentUser()`); load it
on tab activation instead. Fourteen days of completions are fetched (`page.tsx:32-43`) to render a
check state that needs one day, the extra thirteen existing only for the streak chip and Manage's
dots; if the shared streak function changes that need, adjust the window deliberately and say so.
**The `dynamic = "force-dynamic"` export at `habits/page.tsx:14` is U3's to remove** (U3 item 6
names `/habits:14`); it lands in `next` in wave 1, so keep it removed and do not fight it. Not your
problem in this unit, but worth a line in the report: `lib/context/nodes/habits.ts:57-65` selects
**every completion row the user has ever written** with no date bound, on the Kiwi snapshot path,
and it grows forever.

**OWNS.** `app/(app)/habits/page.tsx` (presentation and composition; not the `force-dynamic` line),
`components/habits/*`, `app/actions/habits.ts`, new `lib/habits/streak.ts`, the streak function body
at `lib/db/queries/analytics.ts:369-383` **only** (rewired to the shared helper, preserving whatever
U3 landed around it), `lib/context/nodes/habits.ts` streak call site, new
`components/dock-widgets/habits.tsx`, and one appended entry in `components/dock-widgets/manifest.ts`.

**MUST NOT TOUCH.** `components/shell/*` including the whole of `components/shell/cockpit/` and
`dock-registry.ts` (U0: consume the seam, raise a blocker if `DockWidgetDef` cannot express your
widget), `components/ui/SidePanel.tsx` / `PageScaffold.tsx` / `EmptyState.tsx` (U0), `app/globals.css`
(U0), `components/lifeos/*` including `TodayHabitsWidget.tsx` and `app/(app)/lifeos/page.tsx` (U10:
read `TodayHabitsWidget.tsx:44-48` for the cache key, do not edit the file), `lib/db/queries/*.ts`
beyond the one streak function named above (U3), `lib/db/client.ts` (U3), any `router.refresh()` call
site (U3), `components/tasks/*` (U6), `supabase/migrations/*` and `apps/web/drizzle/*` (this unit
ships no SQL).

**Acceptance criteria (headless-verifiable).**
- On `/habits`, marking today's habit done is **one click** from page load: the check reflects
  immediately (assert the checked state within 100ms of the click, before the action resolves), and
  `browser_network_requests` shows **no RSC document request** for the route.
- After that click, exactly **one** completions refetch is issued, not two (the explicit invalidate
  and the realtime echo do not both fire).
- Without any interaction, `/habits` displays today's remaining count, a streak value and a
  completion rate as text in the DOM. A habit completed for the first time today shows a streak of
  1, not an absent chip.
- A habit whose `daysOfWeek` excludes today does **not** appear in the day list and is **not**
  counted in the denominator, on the page and in the dock widget alike.
- A habit with a run longer than 14 days reports its true streak, not `14`, and the same habit
  reports the **same** number on `/habits` and in the dock widget.
- Creating a habit from `HabitDialog` makes it appear in the list before any realtime echo (block
  the realtime socket and assert the row still appears).
- Deleting a habit requires a confirmation or offers an undo; a habit is not removed by a single
  unconfirmed click.
- The dock widget renders in the Dock at 1440x900 with a `data-dock-widget-id` matching its manifest
  entry; clicking its check toggles the same habit, and `/habits` in a second tab reflects it
  without a reload.
- Toggling from the dock widget and from `/habits` writes to the same query cache entry: after a
  dock toggle, the page's completions query is not refetched a second time with a different key.
- `grep -rn "router.refresh()" components/habits components/dock-widgets app/\(app\)/habits` returns
  **zero**, and the report states it.
- `git diff --name-only` for the unit contains no file under `components/shell/`, none under
  `components/lifeos/`, and no migration.
- No uppercase text on `/habits` outside `kbd`; no computed `border-color` resolves to `--accent`;
  every computed `border-radius` is 4px, 8px, 12px or 9999px; the H1's `getBoundingClientRect().left`
  matches `/tasks` at the same viewport.
- Screenshots: `/habits` with habits remaining, `/habits` with the day finished, the dock widget
  docked and expanded, all in **both themes**, plus one with `prefers-reduced-motion: reduce`.

---

## 4. UNIVERSAL WORKER CONTRACT

Binding on every unit, U0 through U11. A violation is a protocol violation, not a style preference.

**Commits (D2).**
- Commit **often and atomically**: one focused commit per logical unit of work, as soon as that unit
  is done. A unit normally produces several commits, never one.
- Stage with **explicit pathspecs only**. Never `git add -A`, never `git add .`.
- **Push the unit branch.** Record every commit hash on the unit control file as it is made, not at
  the end.
- Batching a whole unit into one end-of-run commit is a protocol violation. If you notice work has
  piled up uncommitted, split it by logical unit (`git reset --mixed <base>`, then stage and commit
  each group) rather than dumping it in one commit.

**Branching (D1).**
- Branch from **fresh `origin/next`** (`git fetch origin && git checkout -b <branch> origin/next`).
  An isolated worktree can start on a stale base; fetch first, every time.
- Wave-2 units branch from a `next` that already contains U0. If it does not yet, wait or raise a
  blocker; do not build the cockpit yourself.
- **Never write `main`.** Never touch another unit's worktree. Units merge into `next`; the
  Conductor cuts `jul-28` off `next` afterwards; `next → main` stays human-only.

**Migrations.**
- Author **idempotent** SQL in `apps/web/drizzle/`, mirroring the existing DDL style:
  `CREATE TABLE IF NOT EXISTS`, foreign keys wrapped in
  `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`, `CREATE INDEX IF NOT EXISTS`,
  and `--> statement-breakpoint` between statements.
- **Never touch `drizzle/meta/_journal.json`.** The repo applies migrations by hand, idempotently.
- **Do not apply migrations to prod.** The migration rides along in the PR; the Conductor applies it
  on merge.

**Gates.**
- **Typecheck and build must be green before the unit reports done.** Run `pnpm install` first if
  the worktree has no `node_modules`. Report both results verbatim in the unit report.
- Verification runs headless per D9 (`verification.usage_testing` true, `verification.headless`
  true): the full Tester ladder including the Playwright/computer-use rung, capturing screenshots as
  evidence. No unit reaches done without a verified pass.
- Every UI unit produces screenshots in **both themes**. A light-only screenshot is not evidence.

**Deviation.**
- **Raise a blocker rather than unilaterally deviating from a sealed decision or from this seed's
  file-ownership split.** If you believe a decision is wrong, say so in the report and stop on that
  point; do not decide it yourself. This applies especially to D3 (the cockpit and the right-slot
  rule), D5 (LifeOS-only background), D6 (Twilio, not iMessage) and D10 (perf is not optional).
- If you need a shared primitive (`SidePanel`, `PageScaffold`, `EmptyState`) or a token to change,
  that is a blocker for U0, not an edit you make.

**Reporting.**
- The report starts with a verdict/summary line, then commits with hashes, then gate results one per
  line, then assumptions, then defects and evidence paths. Everything goes under the run record; do
  not scatter artifacts.

---

## 5. RISK REGISTER

**R1. U0 vs U3 on the root layout.** Both are wave 1 and both are performance work on overlapping
symptoms. Defused by a hard file split: **U0 is the sole owner of `app/(app)/layout.tsx` and
`app/(app)/template.tsx`**, and it also takes `lib/search/snapshot.ts`, `lib/auth/get-user.ts` and a
**new** `lib/db/cached.ts` for the `React.cache()` wrappers. U3 takes the query helper bodies in
`lib/db/queries/*`, `lib/db/client.ts`, the 32 `router.refresh()` sites, `next.config.ts`
`experimental`, the `force-dynamic` exports and `proxy.ts`. The wrappers live in a separate file
precisely so U0 can memoize `getAllTasksForUser` while U3 rewrites its body: different files, no
conflict. U3's dynamic-import work (item 7) is the one place it would want `layout.tsx`; the brief
tells it to raise a blocker instead of editing.

**R2. U0 vs U3 on `components/search/SearchProvider.tsx`.** U0 must make `initialSnapshot` optional
to stop passing it; U3 owns `refetchOnWindowFocus`, `staleTime` and the 12 subscriptions. These are
disjoint hunks (props type and `initialData` at the top versus query options at `:29-58` and
subscriptions at `:47-58`), so git merges them cleanly. Integration rule if it does conflict: take
U0 for the props type, U3 for everything else.

**R3. U0 vs U4 on the sidebar.** U0 is rewriting the rail while U4 inserts a badge into
`components/shell/PersistentNav.tsx`. Defused by scope discipline: U4's brief forbids restructuring
the nav item types, renaming the exported components, or moving `MAIN_ITEMS` / `SYSTEM_ITEMS`, and
U0's brief forbids touching `PersistentNav.tsx` beyond what the rail restructure strictly requires.
U4 is deliberately the smallest unit on the cheapest model so that if a conflict does occur, the
integrator re-applies a single insertion inside U0's Rail rather than untangling two rewrites.
**Integration order: U0 first, then U4.**

**R4. U1 vs U2 on `components/pages/PageBlockEditor.tsx`.** Both wave 1, same file. Split by region:
U1 owns the `handleSurfaceMouseDown` body (`:474-498`), U2 owns the editor options (`:196-199`) and
the wrapper props (`:507-513`). The regions are adjacent but not overlapping. There is also a real
functional dependency: until U1 fixes the whitelist, every click inside the BlockNote file panel is
cancelled, so U2's upload UI cannot be verified. U2's brief tells it to neutralize the handler
locally for verification and not commit that change. **Integration order: U1 first, then U2 rebases.**

**R5. `next.config.ts` three ways.** U2 needs `images.remotePatterns` (Supabase Storage host), U3
needs `experimental.staleTimes`. Different top-level keys in the same object literal, so the textual
conflict (if any) is trivial and the integrator takes both. Each brief names its key and forbids the
other's.

**R6. Wave-2 units all wanting the shared primitives.** U6, U7, U8, U9 and U10 all consume
`SidePanel`, `PageScaffold` and `EmptyState`, and all five will discover something the primitives do
not do. If any of them edits `components/ui/SidePanel.tsx`, `PageScaffold.tsx` or `EmptyState.tsx`,
five branches diverge on the file every other branch depends on, and the merge is unresolvable by
inspection. Defused two ways: (i) those three files plus `app/globals.css` are U0-owned and
**read-only in wave 2**; a needed change is a blocker for U0, not an edit. (ii) They land in `next`
as one foundation commit **before** wave 2 branches, so every wave-2 unit builds against an
identical, already-merged version. This is also why `globals.css` has a single owner: two units
editing the token file in parallel conflict on every hunk.

**R7. U6 vs U9 on the tasks components.** `components/projects/ProjectTasksSection.tsx:339,357,398`
consumes `TaskList`, `KanbanBoard` and `TaskCard` with roughly 200 lines of `TasksClient`
orchestration copied. U6 owns `components/tasks/*` and is changing those components; U9 owns
`ProjectTasksSection.tsx` and is fixing its container. Both are wave 2 and parallel. Defused by
ownership (neither edits the other's directory) plus an explicit protocol: U6 must report any prop
signature change so U9 absorbs it. De-duplicating the copied orchestration is **out of scope for this
sesh** and goes to the bgsd queue; attempting it would put both units in both directories.

**R8. U8 vs U3 on `app/(app)/areas/[areaId]/page.tsx`.** U3 parallelizes the three sequential
queries at `:26,:47,:68` in wave 1; U8 redesigns the same file's presentation in wave 2. Because U3
lands first, U8 branches from a `next` that already has the `Promise.all` and simply keeps it. U8's
brief says so explicitly so it does not re-do or revert the change.

**R9. U9 vs U3 on the projects components.** U3 rewrites `router.refresh()` sites inside
`components/projects/ProjectHeader.tsx` and `ProjectSettingsDialog.tsx` (wave 1); U9 redesigns those
files (wave 2). Same defusal: U3 lands first, U9 branches on top and preserves the invalidation
changes rather than reverting to `router.refresh()`.

**R10. U10 vs U0 on background layers.** `AmbientGlow` is mounted once globally at
`AppShell.tsx:77` at fixed `-z-10`, and U0 is rewriting `AppShell`. U10 mounts its video at
`absolute inset-0 -z-10` **inside** a `relative` lifeos `<main>`, which creates its own stacking
context and cannot collide with the global fixed layer. The brief forbids the `fixed` variant
specifically for this reason, and forbids U10 editing `AmbientGlow.tsx`.

**R11. U5 vs the sealed transport decision.** The S6 scout recommends the self-hosted iMessage loop
and argues Twilio is the wrong shape for one person texting their own assistant. D6 sealed Twilio.
The risk is a worker reading the scout, finding it persuasive, and building the iMessage path. The
brief states the override explicitly and requires the channel-agnostic seam to leave iMessage
addable later behind the same seam. A worker that still disagrees raises a blocker; it does not
switch transports.

**R12. U5 vs U0 on the JARVIS surface.** U0 builds the cockpit JARVIS command bar; U5 builds the
text channel. Both touch "JARVIS", neither touches the same file: U0 consumes the existing
`POST /api/jarvis` SSE contract from the client, U5 works server-side at and above
`runJarvisTurnStream` plus the settings surface. `lib/jarvis/run-turn.ts` is verified
channel-agnostic already (`run-turn.ts:329`, options at `:105-194`), so U5's refactor sits in a new
`lib/jarvis/run-channel-turn.ts` and in the two route wrappers, not in the engine.

**R13. Migration collisions.** U2 (page-images bucket) and U5 (users columns plus the SMS ledger)
both add migrations in `apps/web/drizzle/`. Filename collision is possible if both pick the next
sequential number. Every migration is idempotent and none is applied to prod by a worker, so the
integrator renumbers on merge. Neither may touch `drizzle/meta/_journal.json`.

**R14. Design drift across five parallel UI units.** The genuine risk that no file-ownership split
can fix: five agents interpreting "calm" differently. Defused by §2 being prescriptive rather than
directional (actual token values, an exact type ladder, exactly four radii, named durations and
easings, a banned list), by every UI unit having an acceptance criterion that is a **computed-style
assertion** (no `--accent` borders, no off-ladder radius, no uppercase outside `kbd`, H1 left edges
equal across routes) rather than a matter of taste, and by U0 landing the tokens and primitives
before any of them branches.

**R15. U11 vs U0 on the dock seam.** U11 is the first consumer of the D11 widget registry, so both
units have a claim on "the dock". Split by file, not by feature: **U0 owns the seam and the shell**,
meaning `components/shell/cockpit/dock-registry.ts` (the `DockWidgetDef` type, the compose logic,
the chooser and the `cockpit-dock-collapsed` / `cockpit-dock-widgets` persistence) and everything
else under `components/shell/`. **U11 owns exactly one widget**, `components/dock-widgets/habits.tsx`,
plus one appended entry in `components/dock-widgets/manifest.ts`. U11 never edits the registry, the
Dock component, or any file under `components/shell/`; if `DockWidgetDef` cannot express the habits
widget, that is a blocker for U0 under §4, not an edit. Sequencing does the rest, exactly as R6: U0
lands in `next` as unit zero before wave 2 branches, so U11 codes against an already-merged
interface rather than a moving one. The manifest is the single file two units both write, and an
append-only one-line entry merges without inspection. This is also the reason the seam exists: the
queued XP system (issue #345) becomes the third consumer without re-opening shell code.

**R16. U11 vs U3 on habits queries and refresh sites.** Three touchpoints, all defused the same way
R8 and R9 are, by U3 landing in wave 1 first and U11 branching on top. (i) The
`dynamic = "force-dynamic"` export at `app/(app)/habits/page.tsx:14` is on U3's removal list (U3
item 6 names `/habits:14`). U11 owns that file's **presentation only** and keeps U3's change; it does
not re-add the export while adopting `PageScaffold`. (ii) The streak duplication crosses into
`lib/db/queries/analytics.ts:369-383`, which is U3's directory. U3 is behaviour-preserving and only
parallelizes helper bodies, so in wave 2 **U11 takes that one function** and repoints it at the new
shared `lib/habits/streak.ts`, preserving whatever U3 did around it; every other file under
`lib/db/queries/` stays U3's, and `lib/db/client.ts` is untouched by U11. (iii) `router.refresh()`:
the scout verified **zero** sites under `components/habits/` and in
`components/lifeos/TodayHabitsWidget.tsx` (s7 §2), so there is nothing for U3 to rewrite there and
nothing for U11 to preserve. The only rule is that U11 may not introduce one, and its acceptance
criteria assert the count stays zero. U11's new `getHabitDockToday` lives in `app/actions/habits.ts`,
which is not in U3's ownership list, so the narrow query lands without touching U3's files at all.

**R17. U11 vs U10 on `components/lifeos/TodayHabitsWidget.tsx`.** Habits defect 1 (the LifeOS tile
counts habits not scheduled today, `TodayHabitsWidget.tsx:106-107,146`) and the matching hero stat
(`app/(app)/lifeos/page.tsx:78-79`, `habitsTotal = initialHabits.length`) live in **U10's** files,
and U10 and U11 are both wave 2, so neither can rebase onto the other. Ownership is not split inside
those files: **U10 keeps `components/lifeos/*` and `app/(app)/lifeos/page.tsx` whole.** U11 fixes the
schedule filter once, server side, in `getHabitDockToday`, and reports the two remaining LifeOS call
sites with their line numbers as a defect for U10 or the queue. The surfaces still cannot disagree
about **completion state**, because U11's widget deliberately reuses the cache key at
`TodayHabitsWidget.tsx:44-48` and the same `toggleHabitCompletion` action, so one write invalidates
one entry for both; they can only disagree about the scheduled-today denominator until the LifeOS
side adopts the shared helper. Reading that file for the key is not editing it, and U11's acceptance
criteria assert no `components/lifeos/` file appears in its diff.
