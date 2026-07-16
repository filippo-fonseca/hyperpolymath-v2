You are Scout C (recon, STRICTLY READ-ONLY — you must not edit, write, create, or delete any file; no git commands that mutate state) working in /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-sd-restyle (branch bgsd/sd-all-features).

Context: /lifeos was just rebuilt (greeting row, icon-left stat strip, segmented pill tab bar, widget cards v2, areas tree). The user now wants:
A. Widgets become the CENTRAL content of LifeOS — occupying the spot where the areas tree currently sits.
B. The whole page (greeting + stat strip + widgets) must fit ONE viewport with no scrolling.
C. A small view toggle: "view areas / view widgets" (areas tree becomes the alternate view).
D. On project pages you can only edit the title; the user wants Notion-like click-to-edit for the project ICON too (and "and stuff" — check what else is displayed but not editable).

MISSION (be very thorough):
1. Map /lifeos page composition: apps/web/app/(app)/lifeos/page.tsx + apps/web/components/lifeos/* — what renders in what order (greeting, stat strip, tab bar, bento grid, areas shell/tree), heights, and what currently forces vertical scroll at ~1440x900 and ~1512x982 (fixed heights, grid rows, widget heights). Which container owns the scroll.
2. Identify the cheapest structural change to make widgets the primary center content and the areas tree a toggled alternate view. What do the segmented pill tab bar's tabs switch today? Any existing per-user UI preference persistence (localStorage keys, settings table)?
3. Estimate what "fit one view" requires: which widgets can compress (row caps, denser paddings), whether the grid needs viewport-height-aware sizing (h-[calc(100dvh-...)]), and any widget whose content is unboundedly tall.
4. Project editing: find the project detail surface(s) (route + components, e.g. apps/web/components/projects/*). How is the title edited today (inline? dialog?)? Where does the project icon come from (icon field on the projects table? DynamicIcon name mapping?) — check the drizzle schema for projects (icon/emoji/color columns). Is there ANY existing icon-picker or emoji-picker component in the codebase that could be reused? List other project fields shown but not editable in place (color? area? description?).

Your final response IS the deliverable and is captured to a file. Output ONLY the compact markdown report: lifeos composition map with heights, the recommended structural approach for A/B/C (one paragraph), and for D: current edit flow, schema fields, reusable picker components, recommended pattern. No preamble, under ~120 lines.
