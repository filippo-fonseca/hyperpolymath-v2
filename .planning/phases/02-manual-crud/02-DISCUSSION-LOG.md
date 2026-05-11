# Phase 2: Manual CRUD - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-05-10
**Areas discussed:** Sidebar tree & nav, Tasks UI (kanban + list), Captures feed UX, Project detail page

---

## Sidebar tree & nav

| Q | Selected | Other options |
|---|----------|--------------|
| Sidebar default state | **Always visible + collapsible** (~260px → ~64px icon-only) | Always visible (no collapse), Pull-out drawer |
| Persistent nav above tree | **Today, All Tasks, Captures, Calendar (disabled)** (multi-select) | (Calendar shown but greyed until Phase 4) |
| Tree reorder | **Drag-reorder areas + projects via @dnd-kit** | Context menu, edit modal order field |
| Archive UX | **Hidden + 'Show archived' toggle in sidebar footer** | Separate /archive page, greyed-in-tree |

## Tasks UI (kanban + list)

| Q | Selected | Other options |
|---|----------|--------------|
| Default view | **Kanban (5 columns matching status enum)** | List, Remember last |
| Drag library | **@dnd-kit** | react-dnd, framer-motion Reorder |
| Edit UX | **Inline-first + Linear-style right-side detail panel** | Modal-only, Always-on row form |
| Filters | **Top toolbar with chip pills + URL search params** | Sidebar facets, Cmd+K palette |

## Captures feed UX

| Q | Selected | Other options |
|---|----------|--------------|
| Composer placement | **Top of feed (sticky) + Cmd+K shortcut modal** | Top only, FAB modal |
| Hashtag UX | **Autocomplete on # + colored chip pills** | Autocomplete + plain text, No autocomplete |
| Edit/delete | **Hover → ⋯ menu** | Always-visible icons, Click → detail panel |
| Search | **Persistent search bar in feed header** | Cmd+K only, Both |

## Project detail page

| Q | Selected | Other options |
|---|----------|--------------|
| Icon picker | **Lucide icon library (curated ~150)** | Emoji only, Both emoji+Lucide |
| Banner | **Color/gradient picker (~16 curated)** | Image upload (Storage), Both, Skip |
| Tasks + Captures layout | **Two columns side-by-side (stacks below ~960px)** | Combined feed, Tabs |
| Class metadata | **Inline header line + 'Edit class' button → modal** | Separate Class info card, Project edit modal with conditional fields |

---

## Claude's Discretion

See CONTEXT.md `<decisions>` final subsection. Notable: shadcn primitives to install, the 16-color/gradient palette, the curated 150 Lucide icons, contenteditable vs Lexical/TipTap for chip composer, URL filter param schema, optimistic update strategy.

## Deferred Ideas

See CONTEXT.md `<deferred>` section. 18+ items including: realtime (Phase 3), calendar (Phase 4), Kiwi (Phase 5), theme/Sentry/telemetry (Phase 6), image upload, capture-to-task affordance, bulk ops, mobile breakpoints, link previews, saved filter views, hashtag rename tools, keyboard shortcuts, Phase 5 quick-add tokens.
