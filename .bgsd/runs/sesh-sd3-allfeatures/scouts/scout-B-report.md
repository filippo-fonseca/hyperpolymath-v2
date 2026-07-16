# Scout B — Sidebar defect recon (`bgsd/sd-all-features`)

## Root-cause summary
Two of the three bugs share one mechanism: **Tailwind is not emitting utility classes that are used *only* in the shell rewrite** (`bg-[var(--sd-sidebar)]` and `font-logotype`). Verified against the compiled CSS: `bg-[var(--sd-darker-box)]`, `bg-[var(--sd-box)]` etc. are emitted, but `background-color: var(--sd-sidebar)` appears in **no** `.css` chunk, and there is **no `.font-logotype` utility** (only `--font-logotype` the variable). Classes shared with other files render; classes unique to `Sidebar.tsx`/`Logotype.tsx` do not. That single gap produces the transparent sidebar *and* the Space-Grotesk wordmark.

---

## BUG 1 — collapse/re-expand is a trap (state-machine defect)
**State:** `collapsed` owned by `Sidebar` (`Sidebar.tsx:113`), persisted to localStorage `sidebar-collapsed` (read `:118-124`, written in `toggleCollapsed` `:132-137`). Transient `hovered` (`:116`). `effectiveCollapsed = collapsed && !hovered` (`:130`). `toggleCollapsed` is the **only** mutator, wired solely into `WorkspacePill` (`:205`).

**Rendering:** the pill's variant is gated on `effectiveCollapsed` (`:203`). Collapsed branch = a plain one-click "pin open" button (`:313-325`). Expanded branch = a Radix **DropdownMenu** whose "Collapse / Pin open" item calls `onToggleCollapsed` (`:333-380`, item `:364`).

**Why it breaks (the loop):**
1. Panel `onMouseEnter` sets `hovered=true` when collapsed (`:186-188`); `onMouseLeave` sets it false (`:189`).
2. In collapsed mode, moving the pointer onto the rail to click the pin-open button flips `hovered→true` → `effectiveCollapsed→false` → panel hover-expands to 230px overlay (`:195`) **and the pill re-renders into the dropdown branch** — so the one-click pin button (needs `effectiveCollapsed=true`) is never actually clickable; hover mutates it into a menu.
3. Clicking the chevron opens `DropdownMenuContent` in a Radix **portal on `document.body`, outside the sidebar div**. Moving the pointer onto the menu leaves the sidebar rectangle → `onMouseLeave` → `hovered=false` → `effectiveCollapsed = true` → pill re-renders into the collapsed branch, which **does not render `<DropdownMenu>` at all** → the open menu unmounts mid-click and vanishes. Hence "you can't uncollapse" and "the dropdown just closes the sidebar."

(When the sidebar is *genuinely* pinned open, `collapsed=false`, so hover/mouseleave don't touch `effectiveCollapsed`; the menu survives. The breakage is specific to the collapsed + hover-overlay state.)

**Minimal fix:** decouple the pill variant and the collapse control from the transient `hovered`. Gate `WorkspacePill`'s branch on `pinnedCollapsed` (the real `collapsed`), not `effectiveCollapsed`, so the rail is always a direct one-click toggle and never mutates into a self-destructing portal. Cleanest: replace the Radix menu with a plain always-mounted collapse icon-button (see Design) — that removes the portal/branch-swap entirely and eliminates the loop.

---

## BUG 2 — transparent sidebar over content on refresh
The visible panel is the **absolutely-positioned** inner div `absolute inset-y-0 left-0 … SIDEBAR_SURFACE` (`Sidebar.tsx:185-201`); the `<aside>` only reserves flow width (`:174-183`). `SIDEBAR_SURFACE = "bg-[var(--sd-sidebar)]"` (`:66`) — but that utility is **never emitted** (proven above), so the panel has **no background → transparent**. Because the panel is absolute (not in-flow itself), a transparent fill shows the canvas/content through it, and in the collapsed-hover state the panel is a 230px `z-50` overlay over a 56px rail (`:197-200`), floating directly over `main` — exactly "transparent, over content, not in-flow." "On refresh" fits: a hard reload drops any HMR-injected style and exposes the missing rule. (`--sd-sidebar` itself is validly defined — it aliases `--sd-darker-box`, `globals.css:1537`; the break is the missing Tailwind utility, not the token.)

**Minimal fix:** stop depending on the un-emitted arbitrary utility. Either set `SIDEBAR_SURFACE = "bg-[var(--sd-darker-box)]"` (identical color, and that utility *is* emitted), or give the panel `style={{ background: "var(--sd-sidebar)" }}`, or add a real `.sidebar-surface{background:var(--sd-sidebar)}` rule in `globals.css`. Root-cause follow-up worth checking: why Tailwind isn't scanning class tokens unique to `components/shell` / `components/ui` (content-source detection in the monorepo) — same gap that hits the font below.

---

## DESIGN — workspace pill: remove switcher, fix wordmark font
Clicking the pill (expanded) opens a 2-item Radix dropdown: "Collapse sidebar / Pin sidebar open" + "Settings" (`Sidebar.tsx:363-379`); with the status dot + wordmark + chevron (`:336-361`) it reads as a workspace switcher. **Removing the dropdown breaks only the collapse toggle** — Settings is already duplicated in SYSTEM nav (`PersistentNav.tsx:113`), the utility strip (`Sidebar.tsx:595-601`), and the identity block (`:518`). Relocate collapse to a dedicated always-mounted `PanelLeftClose`/`PanelLeftOpen` icon-button beside the wordmark (this also fixes BUG 1).

**Wordmark font:** rendered via `<Logotype />` (`Sidebar.tsx:353`; collapsed monogram `:324`). `Logotype.tsx:20` already applies `font-logotype` — correct intent — and `--font-logotype → --font-eb-garamond` is defined (`globals.css:35`) with EB Garamond loaded (`layout.tsx:17-23`). But the **`.font-logotype` utility is not emitted** (same scan gap), so the class is inert and the wordmark inherits app-wide Space Grotesk. **Fix:** apply the family via inline style in `Logotype.tsx` — it already has a `style` block for `letterSpacing`, so add `fontFamily: "var(--font-logotype)"`; guarantees EB Garamond regardless of utility generation.

---

## Item 4 — mobile/responsive
There is **no** mobile sheet/drawer/overlay branch. `AppShell` renders `<Sidebar>` unconditionally inside the `motion.div` (`AppShell.tsx:86-117`); only the JARVIS side panel is `hidden lg:flex` (`:131-133`). No `fixed`/media-query/`translate` variant exists in the sidebar or `globals.css`. So the overlay bug is **not a mobile branch leaking into desktop** — it is the always-`absolute` panel (`Sidebar.tsx:191`) rendered transparent (BUG 2) plus the collapsed hover-expand `z-50` overlay (`:197-200`).
