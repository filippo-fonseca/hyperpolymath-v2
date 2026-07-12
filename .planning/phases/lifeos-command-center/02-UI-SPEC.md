# Life OS command center — UI spec

## Intent

Make `/lifeos` feel like an operational command deck: a compact orientation
header, one obvious command input, a readable system map, then dense today
signals and a capture/insights tail. The surface should be useful in seconds,
quiet in both themes, and legible without relying on hover, motion, or glow.

## Composition

- Page canvas: `--deck-app`, sans operational chrome, 16–40px responsive gutters,
  one clipped ambient orb placed behind the hero only.
- Hero: date eyebrow, greeting, a short plain-language status line, and a
  wrapping KPI rail composed from the Unit 1 `KpiRail`/`StatChip` primitives.
  KPI links remain real links and use tonal selection/focus states.
- Quick Send: the primary command surface immediately below the hero. Keep the
  existing `LiteJarvisComposer` contract: Cmd/Ctrl+Enter writes
  `sessionStorage['jarvis-prefill']`, then routes to `/today`; Escape cancels.
- System map: `AreasTree` stays the central visual, but uses flat tonal panels,
  hairlines, legible sans controls, and responsive wrapping. The existing area,
  project, archive, and collapse storage contracts remain unchanged.
- Today/work: a 12-column desktop layout collapses to one column below the
  container's wide breakpoint. Tasks get the dominant tile; habits and training
  are compact supporting panels; captures become a readable stream; insights is
  a small gateway rather than a dashboard-within-a-dashboard.
- Cards: compose `DeckPanel`, `SectionHeader`, `DenseListRow`, `EmptyState`,
  and `HairlineDivider`; no duplicated spacedrive primitives, heavy glass, or
  passive cyan hover glow. Only overlays may use blur.

## Interaction and accessibility

- Every action is a native `button` or `Link`; no interactive descendants inside
  an overlay link. Focus-visible rings are at least as legible as hover states.
- Capture `→ Task`, area collapse, task completion, habit completion, view
  toggles, and all header actions are visible on keyboard focus and usable on a
  coarse pointer.
- Areas SVG feed `animateMotion` and root avatar pulse are omitted/static when
  `useReducedMotion()` is true. All section/card/list animation follows the
  same policy and uses `--dur-*` tokens.
- At 320/375/768/1024/1440px and 200% zoom, primary actions wrap or stack; no
  page-level horizontal scrolling or clipped controls.

## Data invariants

Preserve server auth/data loading, date semantics, `tableKey` query shapes,
all five realtime islands, optimistic task/habit mutation and rollback,
`jarvis-prefill`, `/today`, and these storage namespaces exactly:
`areas-tree-hide-all-projects`, `areas-tree-show-archived`,
`areas-tree-collapsed-<id>`, `lifeos:areas:collapsed`, and
`lifeos:widgets:collapsed`.

## Scout evidence

The authoritative scout map is available at
`/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor/.bgsd/runs/sesh-1783863067187/research/lifeos-surface-map.md`.
It confirms the eight-way server load, the five exact query-key shapes and
realtime subscription islands, the optimistic task/habit rollback semantics,
the two collapse-storage namespaces, and the existing AreasTree motion and
capture-action accessibility debt. Implementation and verification should use
those anchors alongside this spec and the handoff.
