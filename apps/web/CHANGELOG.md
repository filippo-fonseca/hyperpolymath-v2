# Changelog

All notable changes to `apps/web` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Version numbers are omitted for pre-release phases; entries use `[Unreleased]` with
a phase date heading until the project ships a tagged release.

---

## [Unreleased]

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
