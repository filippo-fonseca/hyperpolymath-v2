# Changelog

All notable changes to `apps/web` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Version numbers are omitted for pre-release phases; entries use `[Unreleased]` with
a phase date heading until the project ships a tagged release.

---

## [Unreleased]

### Phase 3 — The Bottega (W-01 through W-16, 2026-07-06)

The Meridian Ring came down. In its place, the Studiolo grew hands: a workbench
arc of holographic drafting-paper panels — Tasks, Captures, Agenda, Habits,
Journal — standing where you can swipe between them, grab and rearrange them,
and work in them for real through the exact same server actions and query keys
as the 2D app. The Tree keeps its place as the room's centerpiece, framed
dead-ahead down the aisle between the benches.

**What shipped:**

- **The demolition** (`W-01`): the `meridian/` directory — the ring structure,
  event tablets, plumb-line, T-15 toll scheduler + positional audio, the
  zoetrope wheel-scrub, ~4,100 LOC in all — is deleted at the file level. Its
  surviving pure logic (`classifyTablet` → `classifyEvent`, `linkEventToProject`,
  `calendarDotColor`) was extracted verbatim into `panels/agenda/agendaLogic.ts`
  before the burn. The gcal data bridge survives wholesale, renamed
  `meridian` → `calendar` throughout the provider/SSR chain.
  `public/world/sfx/ring-toll.mp3` is intentionally kept on disk, reserved for
  a future generic reminder chime.

- **The `<WorldPanel>` primitive** (`WorldPanel.tsx`): everything `TodayPanel`
  proved, generalized once — the deep-vellum uikit skin, ONE shared brass-rail
  frame mesh drawn with one of two module-singleton `makeHologramMaterial`
  instances (idle/focused rim-lift, zero shader recompile on swap), the
  full/placard LOD split, and the connection/empty honesty states. `TodayPanel`
  itself is deleted.

- **The bench** (`widgetLayout.ts`, `WidgetRig.tsx`): a pure, deterministic arc
  solver placing ≤7 panel slots around the standing point with a central aisle
  that keeps the Tree framed dead-ahead. Navigation via two-finger/trackpad
  swipe (horizontal-dominant wheel gesture), `←`/`→` keys, `C` to summon the
  Agenda panel, or a direct click — every path resolving through
  `focusStack.push({kind:"widget"})` and the existing `cameraBus` flight
  authority (~700 ms glide). The panel-LOD law caps full-content rendering at 3
  panels (focused + neighbors); everything else is a placard (frame + one SDF
  title).

- **Grab-and-move** (`useWidgetDrag.ts`): the phase's one new `useFrame` —
  self-invalidating while dragging/settling, idle-zero at rest. Grab a panel's
  header grip, carry it along the bench arc (ray → vertical-cylinder yaw math),
  watch the other panels preview-shift out of the way, and drop — the new order
  persists to `localStorage` (`widgetLayoutStore.ts`) and survives a reload.
  One `two-note` dock chime on settle. `Esc` cancels mid-drag without
  persisting; reduced motion collapses the whole mechanic to a frame-only ghost
  outline and an instant-cut drop.

- **Five widgets on the bench**: `TasksWidget` (TodayPanel's content reborn —
  the real `updateTaskStatus` completion → the same ember-ascent loop),
  `CapturesWidget` (newest-first inbox with hashtag chips, real `deleteCapture`
  row action), `AgendaWidget` (a flat, read-only Today/Tomorrow calendar on the
  surviving gcal bridge, with area-hue accents and a one-shot shimmer on a
  Jarvis-created event), `HabitsWidget` (today's habit grid with a trailing
  7-day tick strip, real `toggleHabitCompletion`), and `JournalWidget` (a
  plain-text preview of today's entry + an "Open on the Page" affordance that
  reuses `ModeToggle`'s one `Cmd+\` doorway — no in-world editing this phase).

- **The focused-panel hero glass** (`FocusedPanelGlass.tsx`): the one true
  glass moment — a single `heroGlass` backplate mounted behind whichever panel
  is focused, occupying the transmission slot freed by the Meridian zenith
  tablet's demolition. Swap-on-focus (never double-mounts); fades in/out via
  one damped `useFrame` that unmounts (and frees the registry slot) on full
  fade-out.

- **The widget registry + layout persistence** (`widgetRegistry.ts`,
  `widgetLayoutStore.ts`): the single place the bench roster grows (a
  `WidgetId → {title, component}` map, Conductor-populated like `WorldScene`'s
  mount list) and a versioned, self-healing `localStorage` store for the arc
  order (unknown ids dropped, missing ids appended, corrupt JSON falls back to
  default — never crashes the world).

- **The greeting** (`Litany.tsx`): boot copy shifts from studiolo-contemplative
  to bottega-workshop diction. The Litany's timeline and keyframes are
  untouched — only strings changed.

**Contracts amended (orchestrator amendment commit, W-01):**

- `worldEvents` returns to 5 names: `"meridian-toll"` is removed with its
  emitter and consumers.
- `FocusLevel` loses `{ kind: "ring"; eventId? }`; gains
  `{ kind: "widget"; widgetId: WidgetId }` (rank 1, sibling of `bough`).
- `WorldData.meridian` is renamed `WorldData.calendar` (shape byte-identical);
  `WorldData` additively gains `habits: HabitsData`, `journal: JournalTodayData`,
  and `hashtags: HashtagWithCount[]`.

**New frozen contracts (Phase 3, frozen at Wave W1 close):**

- `widgetBus: WidgetBus` — the module-singleton pub/sub carrying ONLY the
  grab-and-move lifecycle (`drag-start`/`drag-move`/`drag-drop`/`docked`);
  focus/navigation state stays in `focusStack` (`panels/widgetBus.ts`).
- `solveBenchLayout`, `neighborOf`, `nearestSlotIndex`, `BenchConfig`,
  `BenchSlot` — the pure arc solver (`panels/widgetLayout.ts`,
  `panels/widgetTypes.ts`).
- `WorldPanelProps`, `DragHandleProps`, `PANEL_ROW_CAP` — the panel primitive's
  contract (`panels/WorldPanel.tsx`).
- `WidgetLayoutV1`, `useWidgetLayout`, `DEFAULT_LAYOUT` — the layout
  persistence contract (`panels/widgetLayoutStore.ts`).
- `WidgetSpec`, `WIDGET_REGISTRY`, `WidgetComponentProps` — the widget roster
  contract (`panels/widgetRegistry.ts`).

**Draw-call ceiling:** ≤170 (ring in frame) → ≤190 (bench in view). Bench layer
≤90 draw calls (≤3 full panels + placards + one hero backplate + SDF titles).
Transmission registry stays 3/3 (focused lantern + Jarvis ribbon +
focused-panel backplate — the Meridian zenith tablet's old slot).

**No new npm dependencies.** uikit, uikit-default, maath, and troika were all
already installed. Zero new Postgres tables; zero new API routes. Google
Calendar remains the sole source of truth for events.

See `components/world/README.md § The Workbench (Phase 3 — The Bottega)` for
the full module map, contracts, spatial model, and the "how to add a widget"
recipe.

---

### Phase 2 — The Meridian Ring (M-01 through M-14, 2026-07-06)

Google Calendar rendered as a great slow brass-and-glass annulus turning overhead —
canted like an armillary sphere's ecliptic, the day mapped onto a 24-hour dial.

**What shipped:**

- **Meridian Ring structure** (`MeridianRing`): canted brass annulus at y 8.5 m,
  ecliptic tilt 28°. One `InstancedMesh` of 24 hour ticks + 96 quarter ticks.
  Engraved Garamond inner-face strip. Fixed zenith pointer. Dial group y-rotation =
  `ringRotationFor(now, scrubOffsetMs, tz)` — a pure function; evaluated only on
  demanded frames (the Meridian Idle Rule: 1 demanded frame per minute while idle).

- **Event tablets** (`EventTablets`): Google Calendar events as glass hologram
  tablets riveted to the ring — ONE `InstancedMesh` (cap 128) with a `aTabletState`
  instanced attribute driving the full state grammar. Past events hang behind zenith
  in Sepia Ink ("the journal already written"). Upcoming = parchment calm. Imminent
  (T-15) = Candleflame rim lift > 1 (blooms) + 25° deferential lean-down. Current
  = the one true glass at zenith. All-day events render as thin outer-lip bands (ONE
  `InstancedMesh`, cap 8). Overlap handling: ≤2 radial lanes; ≥3 concurrent →
  merged stacked tablet with count badge.

- **Now-plumb-line** (`PlumbLine`): emissive Candleflame shaft falling from the
  zenith pointer to trunk-apex clearance (y ≈ 4.2 — never touches the Tree).
  Wrapped by an additive god-ray cone (`makeGodRayMaterial`). Opacity breathes ±15%
  during the 4 s post-interaction window only (zero new rAF demand source).

- **T-15 positional toll** (`TollScheduler` + `MeridianAudio`): exactly one low
  brass bell per event per session, played through drei `PositionalAudio` parented
  at the ring's zenith so the reminder literally arrives from overhead (audible pan
  as you orbit). Gesture-gated via the world's shared `isAudioUnlocked()` flag;
  silenced by the shared `isMuted()` / `localStorage['world:muted']` global mute.
  Timer deduped via a session `Set<eventId>`; re-armed on data change and
  `visibilitychange`. Zero rAF impact.

- **Zoetrope wheel-scrub with brass momentum** (`useRingScrub`): while the ring is
  framed (`focusStack.push({ kind:"ring" })`), two-finger swipe / trackpad wheel
  spins the dial with heavy brass deceleration (exponential decay ~350 ms half-life,
  soft 30-minute detent). `snapToNow()` returns with a critically-damped spring
  (~700 ms). Self-invalidating frame loop — exits when settled, returning to the
  1-frame/min idle regime. Offset clamped to the loaded ±7-day slab with
  rubber-band at the edges.

- **Look-up camera ritual** (`meridianPoses.ts` + amended `useWorldKeys`): `C` key
  pushes `{ kind:"ring" }` → camera arcs low on the dais (y 1.1, z 7.0) so the
  ring fills the upper frame and looms. Click a tablet → `{ kind:"ring", eventId }`
  → ~2.5 m reading distance, camera below the tablet (T-15 lean reads correctly from
  here). Esc walks tablet → ring → vestibule; popping the last ring level awaits
  `meridianBus.snapToNow()` before the camera glides home.

- **Engraved Garamond hour numerals + date line + next-event Ledger clause**
  (`MeridianLabels` + amended `Ledger`): 8 old-style figures every 3 h, sepia-on-
  brass, parented inside the dial group (they rotate with time); `visible` only when
  ring-focused or camera pitch > ~35° up. One italic date line under the zenith
  pointer, re-composed from the scrub center via `meridianBus.subscribe` (troika
  mutation, not React state). Hover caption (title · time range · calendar-color
  dot) + zenith caption for the current/imminent tablet. `composeLedgerLine()` gains
  a "next event" clause — *"Lecture at two."* — omitted when disconnected or no
  remaining events today.

- **Connection-state honesty** (amended M-12): `not_connected` / `expired` →
  ring renders dark petrified brass (emissive 0, metalness up), no tablets, no
  plumb-line, one Garamond line: *"The ring is dark. Connect Google Calendar on the
  Page."* (or *"Reconnect"* wording for expired/revoked). The world never initiates
  OAuth; `Cmd+\` is always the path. Flip within 60 s of disconnecting in Settings
  (shared `["gcal-connection-status"]` query key). Empty-but-connected day → bright
  ring, no tablets, plumb-line still falls.

- **Reduced-motion collapse** (amended M-12): `worldPrefersReducedMotion()` /
  `useWorldPrefs()` wired to every new meridian animation surface. Scrub → discrete
  1-hour steps; lean-down → instant state-color change; snap → instant; ring
  fade-in → instant crossfade; god-ray breathe → off. Toll still sounds
  (audio is not gated by motion preference — Phase-1 precedent).

**Contracts amended (orchestrator amendment commit, M-01):**

- `worldEvents` expanded from 5 → 6 names: `"meridian-toll": { eventId, title, startIso }`.
- `FocusLevel` gains `{ kind:"ring"; eventId?: string }` (rank 1 when no `eventId`;
  rank 2 when `eventId` present — sibling levels of `bough`/`lantern`).
- `WorldData.meridian: MeridianData` added (additive; all Phase-1 fields
  byte-identical). `MeridianData` carries `status`, `events`, `calendars`,
  `timezone`, `windowStartMs`, `windowEndMs`.

**New frozen contracts (Phase 2, frozen at Wave M1 close):**

- `meridianBus: MeridianBus` singleton + `__registerMeridianBusImpl` registration
  seam (`meridian/meridianBus.ts`).
- `tabletHoverBus: TabletHoverBus` hover-to-label seam (`meridian/meridianHover.ts`).
- Full dial-math contract: `MeridianConfig`, `TabletSlot`, `TabletState`,
  `TabletPlacement`, `timeToAngle`, `ringRotationFor`, `solveMeridianLayout`,
  `visibleSlots`, `classifyTablet`, `linkEventToProject`, `resolveOverlaps`
  (`meridian/meridianLayout.ts`).
- `TABLET_VISUALS` state→light grammar + `TABLET_STATE_ID` encoding
  (`meridian/meridianMappings.ts`).
- `RING_VIEW_POSE` + `tabletFocusPose()` (`meridian/meridianPoses.ts`).
- `isAudioUnlocked()` + `isMuted()` seam exposed from `audio/synth.ts`.

**Draw-call ceiling raised:** ≤150 → ≤170 (ring in frame). Meridian layer ≤20
draw calls. Transmission registry now FULL at 3/3 (focused lantern + Jarvis ribbon
+ zenith tablet).

**No new npm dependencies.** `@date-fns/tz` was already installed; drei ships
`PositionalAudio`. Zero new Postgres tables; zero new API routes. Google Calendar
remains the sole source of truth for events — events are never persisted.

---

### Phase 1 — The Studiolo MVP (U-01 through U-21, 2026-07-06)

See `components/world/README.md § Changelog` for the full Phase-1 entry (the `/world`
route, the Tree, Kiwi, the Litany, the Jarvis Ring, the chimes, and the data bridge).
