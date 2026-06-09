---
phase: 999.13
title: Split-screen — JARVIS + active tab side-by-side
status: backlog
filed: 2026-06-08
---

# Split-screen — JARVIS and the active tab side-by-side

## The idea

The top tab bar (left = current sidebar destination, right = JARVIS) ships
with single-tab visibility — only the active tab's content renders. The
follow-up is true browser-like split screen: drag the JARVIS tab out (or
press a "split" affordance) and the viewport divides 50/50 (resizable)
so JARVIS is always co-resident with whatever I'm actually working on.

## Why

- Most JARVIS use is contextual — I'm on /tasks and want to ask "what
  did I capture about this project this week", not switch away.
- Single-tab visibility is a temporary constraint to avoid building
  layout machinery before the tab abstraction stabilizes.
- Browser-style "drag to split, drag back to merge" is a familiar
  mental model and pairs nicely with the desktop-app vibe.

## Rough shape

- Layout state owned by `AppShell` (or a dedicated `useTabLayout` hook):
  `{ left: route, right: route | null, splitRatio: 0..1 }`.
- Tab bar gains a grip handle on each tab — drag the JARVIS tab to the
  right edge to split, drag back to the title bar to merge.
- Each pane is an independent route renderer (Next 16 Parallel Routes
  or a custom client-side router that mounts the route's RSC tree).
- Vertical resizer between panes (`react-resizable-panels` or homegrown
  pointer-event handler) with min-width clamps so neither side collapses.
- Persist split state per-user in localStorage; restore on refresh.

## Open questions

- Do non-JARVIS tabs also split (e.g., /tasks + /calendar)? Probably yes
  later, but JARVIS pairing is the primary use case.
- How do route-segment Suspense boundaries (`loading.tsx`) compose when
  two RSC trees mount in parallel? May need wave-based hydration.
- Mobile: probably skip split — stack tabs instead.

## Triggers

Open after the top tab bar lands and JARVIS-tab UX feels right in
single-pane form (a week or two of real use).
