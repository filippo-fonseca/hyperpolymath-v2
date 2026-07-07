# THE STUDIOLO — PHASE 2 BUILD PLAN: THE MERIDIAN RING

> Architect: Fable. Executors: Opus engineering pipeline (parallel agents, atomic commits).
> Sealed inputs: `VISION.md` §3/§4/§5/§6-V/§8, `TECH.md`, `PLAN.md` (Phase-1 contract),
> `apps/web/components/world/README.md` (the frozen world contracts).
> Every data-contract claim below was verified against the live codebase on 2026-07-06
> (`listEventsForUser`, `GcalEventDTO`, `eventsQueryKey`, `invalidateCalendar`,
> `useGcalConnectionStatus`, `getValidGcalToken`, `listCalendarsForUser`, `users.timezone`,
> `users.gcalVisibleCalendarIds` all confirmed at the named paths).
> This is the SINGLE Fable plan for Phase 2 — per directive, there are NO per-wave Fable
> seeds this phase. Opus executors build directly from this document + the frozen contracts.

---

## 0. PHASE THESIS & THE SHIPPABLE SLICE

**Thesis.** Phase 1 gave the Studiolo its ground — the Tree, the embers, the familiar. Phase 2
gives it its **sky**: Google Calendar rendered as a great slow brass-and-glass annulus turning
overhead, canted like an armillary sphere's ecliptic. The day is a 24-hour dial; *now* is always
at zenith, marked by a plumb-line of light falling toward the trunk; events are glass tablets
riveted to the ring, sized by duration, approaching you all morning and swinging behind you into
sepia once they pass. Fifteen minutes before an event, the Ring **tolls once — from above**
(positional audio), and the event's tablet leans down out of the ring toward your eyeline. Look
up (`C`) and the ring fills your vision; two-finger swipe and you scrub time itself with brass
momentum. Time in every other app is a grid you look at. Here it is a wheel you put your hand on.

**The shippable slice (the Gate demo):**
Stand on the dais at 1:45pm with a 2pm lecture on your Google Calendar. Look up — the lecture
tablet is sliding toward zenith, tinted with its class's bough hue. At 1:45 exactly, the Ring
tolls once from overhead and the tablet leans down toward you. Press `C` — the camera arcs
skyward and the ring fills the view, today engraved along its inner face in Garamond old-style
figures. Two-finger swipe — the ring spins through tomorrow and the week with heavy, satisfying
brass deceleration; this morning's events hang behind zenith in sepia like a journal already
written. Esc — the ring snaps back to *now* and you glide home to the dais. `Cmd+\` — the 2D
`/calendar` grid is untouched, showing the exact same events. **One truth, two theatres.**

**In the slice:**
- The Meridian Ring structure (brass annulus, canted, hour ticks, engraved numerals).
- Event tablets for a rolling ±7-day window (one `InstancedMesh`), duration-sized, area/class
  hue tint when linkable, past-events-sepia, T-15 imminent state.
- The now-plumb-line god-ray at zenith.
- Look-up framing (`C` key / click the ring), hover caption, click-a-tablet fly-to focus.
- The zoetrope scrub **within the loaded window** (±7 days): wheel/two-finger swipe while
  ring-focused, angular momentum with brass deceleration, Esc snaps back to now.
- The T-15 toll — drei `PositionalAudio`, sound literally from above — plus the tablet
  lean-down.
- Connection honesty: not-connected/revoked → the ring renders as quiet, dark brass with a
  one-line Garamond nudge; never a crash, never a fetch loop.
- Reduced-motion honesty for every new animation.

**Explicitly OUT of the slice (deferred, stated so no executor builds them speculatively):**
- **Month-scale zoetrope flicker** (day-streak LOD, windowed refetch past ±7 days, catch-a-day)
  — specced as stretch unit M-15, Gate decides.
- **Drag-to-reschedule / any event mutation from the world** — belongs to Phase 4's
  Cartographer's Table. The world READS the calendar in Phase 2; the Page (and Jarvis) write it.
- **Event create/edit UI in-world** — the Page's `EventDetailPanel` remains the only editor.
- **The Litany "ring swings up out of darkness" boot beat** — the ring simply fades in gated on
  `boot-complete` this phase; the cinematic swing-up is Phase-6 polish (open question Q4).
- **Per-project private meridian arcs** (Forge feature) — Phase 3.
- **Room tone / full sound family** — Phase 6. Phase 2 adds exactly ONE sound: the toll.

---

## 1. THE VERIFIED DATA CONTRACT (real routes, hooks, keys — reuse, never reinvent)

**The prime constraint, restated as law: Google Calendar is the ONLY source of truth for
events. Events are NEVER persisted in Postgres.** (Confirmed everywhere in the code: no events
table in `lib/db/schema.ts`; `/calendar/page.tsx` header comment "gcal is the source of truth
(CAL-07 — no Postgres mirror)"; `gcal-events.ts` "NEVER call Next.js' path-revalidation helper —
events live in gcal, not Postgres".) The Meridian Ring is a **pure projection** of live gcal
data through the existing fetch layer. No new API routes. No new tables. No new deps.

### 1.1 What exists (verified 2026-07-06, with paths)

| Concern | Artifact | Path | Shape |
|---|---|---|---|
| Events read | Server Action `listEventsForUser({ calendarIds, timeMin, timeMax })` | `apps/web/app/actions/gcal-events.ts` | `ActionResult<GcalEventDTO[]>` = `{ success:true, data } \| { success:false, error, kind:"revoked"\|"not_connected"\|"unknown" }`. Internally pages `events.list` with `singleEvents:true`, `orderBy:"startTime"`, `timeZone:users.timezone`, 250/page. |
| Event DTO | `GcalEventDTO` | `apps/web/lib/gcal/event-dto.ts` | `{ id, calendarId, title, start, end, allDay, description, colorId, recurringEventId, htmlLink }`. `start`/`end` are ISO-with-offset (timed) or `YYYY-MM-DD` (all-day). |
| Events query key (2D) | `eventsQueryKey` in `CalendarClient.tsx` | `apps/web/components/calendar/CalendarClient.tsx` (~line 264) | `["calendar-events", userId, visibleCalIds.join(","), timeMin, timeMax]` — `staleTime: 30_000`, `refetchOnWindowFocus: true`, `initialData` from SSR. |
| Invalidation fan-out | `invalidateCalendar(qc, userId)` | `apps/web/lib/jarvis/invalidate-after-action.ts` | Invalidates the **prefix** `["calendar-events", userId]` → every slice (any calIds/date-range) refetches. Called by `invalidateAfterJarvisAction` after Jarvis event mutations. |
| Calendars metadata | Server Action `listCalendarsForUser()` / server helper `listCalendars(cal)` | `apps/web/app/actions/gcal-calendars.ts` / `apps/web/lib/gcal/calendars.ts` | `GcalCalendarMeta` = `{ id, summary, backgroundColor, foregroundColor, primary, accessRole }`. |
| Connection status | `GET /api/gcal/status` + `useGcalConnectionStatus()` | `apps/web/app/api/gcal/status/route.ts` + `apps/web/lib/gcal/useGcalConnectionStatus.ts` | `{ status: "connected" \| "not_connected" \| "expired" }`; hook query key `["gcal-connection-status"]`, `staleTime 60_000`. |
| OAuth connect flow | `GET /api/gcal/auth`, `GET /api/gcal/callback` | `apps/web/app/api/gcal/{auth,callback}/route.ts` | Page-side only. The world NEVER initiates OAuth; it nudges to the Page. |
| Token layer | `getValidGcalToken(userId)` | `apps/web/lib/gcal/token.ts` | Server-only; throws typed `GcalNotConnectedError` / `GcalTokenRevokedError`. Every gcal call funnels through it. |
| User prefs | `users.timezone` (IANA), `users.gcalVisibleCalendarIds` (text[], NULL = all), `users.gcalDefaultCalendarId` | `apps/web/lib/db/schema.ts` (~lines 64–71) | Read server-side; the world page SSR mirrors `/calendar/page.tsx`'s read. |
| SSR precedent | `/calendar` Server Component initial fetch | `apps/web/app/(app)/calendar/page.tsx` | status check → `getValidGcalToken` → `listCalendars` → parallel `events.list` per visible calendar → `GcalEventDTO[]` props, with try/catch → banner variants. `force-dynamic`. |
| Jarvis event writes | `createEventForJarvis` etc. | `apps/web/lib/gcal/events.ts`, `apps/web/lib/jarvis/executor.ts` | Already invalidates the `["calendar-events", userId]` prefix client-side via `invalidateAfterJarvisAction`. |

### 1.2 How the world binds to it (the layering rule)

The world adds **one more slice of the SAME query-key family** — not a parallel store:

- **World events query key:** `["calendar-events", userId, worldCalIds.join(","), worldTimeMin, worldTimeMax]`
  where `worldCalIds` = the user's visible calendars (persisted pref, else all) and the window
  is `[startOfDay(today) − 1 day, startOfDay(today) + 8 days)` in the user's IANA timezone —
  a rolling ~9-day slab covering the slice's scrub range. `queryFn` = the existing
  `listEventsForUser` Server Action. `initialData` = the world page's SSR seed.
- **Refetch policy:** `staleTime: 60_000`, `refetchOnWindowFocus: true`,
  `refetchInterval: 300_000` with `refetchIntervalInBackground: false`. There is **no Supabase
  Realtime channel for events** (gcal is not in Postgres — nothing to broadcast); focus-refetch
  + the 5-minute interval + the Jarvis prefix invalidation are the freshness surfaces. A refetch
  is a network event, not a frame — it demands exactly one frame IFF data identity changed
  (same `invalidate()`-on-data-change discipline `WorldDataProvider` already implements).
- **Free win (verified):** because `invalidateAfterJarvisAction` invalidates the
  `["calendar-events", userId]` **prefix**, a "Jarvis, put lunch with Ana at noon Friday" from
  the in-world ribbon (or the 2D console, or another tab) refetches the world slice with zero
  new wiring — and the differ (M-01) turns the new row into a tablet riveting itself into the
  ring. One agent, two theatres, one cache.
- **Connection status:** the world reuses `useGcalConnectionStatus()`'s exact key
  (`["gcal-connection-status"]`) so the Settings badge and the ring never disagree.
- **Not-connected / revoked:** the query resolves to `[]` with a `meridianStatus` flag; the
  ring renders quiet dark brass + a one-line nudge (§5.6). The world NEVER triggers OAuth.

### 1.3 The area/class hue linkage (honest note)

**No event↔project linkage exists in the schema** (verified: no join table, no gcal fields on
`projects`). VISION wants tablets "colored parchment-neutral until they belong to an area/class."
Phase 2 ships a **conservative pure heuristic** (`linkEventToProject`, unit M-02): normalized
title/word match against class-project names (`SidebarProject.isClass === true` first, then
non-class project names, exact word-boundary matches only, ties → no link). Unlinked tablets
stay parchment; a wrong tint is worse than no tint. Gate question Q1 confirms or strips this.

---

## 2. CONTRACTS — FROZEN, AMENDED, AND NEW

### 2.1 Frozen Phase-1 contracts this phase builds AGAINST (unchanged)

- `worldEvents` emitter mechanics (`data/diffing.ts`) — amended by +1 name, see §2.2.
- `cameraBus: { flyTo(pose: CameraPose, ms?): Promise<void> }` — the ring look-up and tablet
  fly-tos go through it exclusively. No second camera authority.
- `useWorldData()` — extended additively (§2.2); existing fields untouched.
- The hologram shader treaty (`materials/hologram.ts`) — tablets use `makeHologramMaterial` +
  `chainOnBeforeCompile` for their state chunk, with **new, non-colliding** names (§2.3).
- `heroGlass()` ≤3-instance dev cap — the zenith tablet consumes the **1 reserve slot**
  (focused lantern + Jarvis ribbon + zenith tablet = exactly 3).
- Demand-mode / idle→0-rAF doctrine + `PerfGovernor` — honored; the ring adds ONE new demand
  source (the shared minute tick) per the exact rule in §4.1.
- `PostFX` last child; `JarvisRing` immediately before it — meridian components mount BEFORE
  `JarvisRing` (see §2.5).
- SDF EB Garamond via drei `<Text>` + `text/fonts.ts` URL constants — numerals/labels reuse
  the preloaded woffs; M-02's glyph audit confirms old-style figures are in the preload set.

### 2.2 Orchestrator AMENDMENTS to frozen contracts (all owned by unit M-01, one amendment commit)

Per README's rule ("changes require an orchestrator amendment commit"), M-01 lands exactly one
commit amending three frozen artifacts:

1. **`worldEvents` +1 event name** (`data/diffing.ts`) — the bus goes from 5 to 6 names:

```ts
type WorldEventMap = {
  // ...existing five, unchanged...
  "meridian-toll": { eventId: string; title: string; startIso: string };
};
```

Emitted by the T-15 scheduler (M-09); consumed by the positional-audio component (M-09) and
the tablet lean-down (M-06). The `chime` event's kind union is NOT extended — the toll is
positional and does not route through `audio/Chimes.tsx`.

2. **`focusStack` +1 level** (`camera/useFocusStack.ts`):

```ts
type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string }
  | { kind: "ring"; eventId?: string };   // NEW — rank 1 (sibling of bough)
```

`{ kind:"ring" }` = ring framed overhead; `{ kind:"ring", eventId }` = a specific tablet focused
(rank 2, sibling of lantern). Push/pop/truncate semantics unchanged. Esc from ring pops to
vestibule AND resets the scrub offset to now (M-10 subscribes to the pop).

3. **`WorldData` additive extension** (`data/useWorldData.ts` + `data/WorldDataProvider.tsx`):

```ts
interface WorldData {
  // ...existing seven fields, byte-identical...
  meridian: MeridianData;                 // NEW
}
interface MeridianData {
  status: "connected" | "not_connected" | "expired";
  events: GcalEventDTO[];                 // rolling window slice, raw DTOs
  calendars: GcalCalendarMeta[];          // for per-calendar color fallback
  timezone: string;                       // users.timezone ?? "UTC"
  windowStartMs: number; windowEndMs: number;  // the loaded slab bounds
}
```

Also in M-01: an events **snapshot differ** (same O(n) Map pattern as `diffSnapshots`) so a
newly-appeared event row can spring its tablet in (and a Jarvis-created event visibly rivets).
It does NOT get a worldEvents name — `EventTablets` diffs in its own data-change effect, exactly
how `Fireflies` handles capture rows today.

### 2.3 NEW frozen contracts this phase introduces (frozen at Wave M1 close)

**The meridian layout contract** (`meridian/meridianLayout.ts` — pure, zero `three` imports,
mirror of `treeLayout.ts` discipline):

```ts
export interface MeridianConfig {
  radius: number;        // default 9 (m)
  height: number;        // ring center y, default 8.5
  cantRad: number;       // ecliptic tilt, default 28° in radians
  tabletCap: number;     // 128
}
export interface TabletSlot {
  eventId: string;
  calendarId: string;
  title: string;
  startMs: number; endMs: number;
  allDay: boolean;
  angleStart: number;    // radians on the 24h dial (0 = midnight, π = noon)
  angleSpan: number;     // duration → arc length; min span clamp for visibility
  dayOffset: number;     // integer days from "today" in user tz (…-1, 0, 1…)
  linkedAreaId: string | null;   // via linkEventToProject (M-02 heuristic)
  linkedProjectId: string | null;
  colorHex: string;      // resolved tint: area OKLCH → parchment → calendar bg fallback
}
export type TabletState = "past" | "upcoming" | "imminent" | "current";
export function timeToAngle(ms: number, tz: string): number;          // seconds-into-day → dial angle
export function ringRotationFor(nowMs: number, scrubOffsetMs: number, tz: string): number;
export function solveMeridianLayout(
  events: GcalEventDTO[], tree: SidebarArea[], calendars: GcalCalendarMeta[],
  tz: string, cfg?: Partial<MeridianConfig>,
): { slots: TabletSlot[]; byEvent: Map<string, TabletSlot> };
export function visibleSlots(
  slots: TabletSlot[], centerMs: number, tz: string,
): TabletSlot[];        // the rolling ~28h display window around the scrub center
export function classifyTablet(slot: TabletSlot, nowMs: number): TabletState;
// imminent = 0 < start − now ≤ 15 min; current = start ≤ now < end; past = end ≤ now
export function linkEventToProject(
  title: string, tree: SidebarArea[],
): { areaId: string; projectId: string } | null;   // conservative word-boundary match, M-02
```

**The dial model (frozen semantics):** the ring is a 24-hour dial; *now* sits at zenith, so the
ring's group rotation is `−timeToAngle(now + scrubOffset) + zenithAngle`. Scrubbing does not
move the camera or the events — it advances `scrubOffsetMs`, rolling a ~28-hour display window
(zenith ±14h) across the loaded slab; tablets enter/leave through the instanced freelist as the
window rolls, which is what makes days "flicker past" at scrub speed. All-day events render as
thin full-width bands at the ring's outer lip for their `dayOffset`, capped at 3 visible.

**The meridian bus** (`meridian/meridianBus.ts` — module singleton, same shape discipline as
`cameraBus`/`fireflyBus`):

```ts
export interface MeridianBus {
  getScrubOffsetMs(): number;
  addScrubVelocity(msPerSec: number): void;   // wheel deltas feed this (M-10)
  snapToNow(ms?: number): Promise<void>;      // decelerating return; Esc path
  subscribe(fn: (offsetMs: number) => void): () => void;  // ring + tablets + labels re-pose
}
export const meridianBus: MeridianBus;         // impl lives in useRingScrub.ts (M-10)
```

Consumers read the offset in `useFrame` via getter (never React state); `subscribe` exists for
coarse listeners (labels' date line). Frozen at Wave M1 close alongside the layout types
(M-10 implements the pre-frozen interface).

### 2.4 Shader-chunk treaty extension (tablet state chunk — names reserved here, frozen)

Tablets stack a state chunk onto `makeHologramMaterial` via the existing `chainOnBeforeCompile`,
obeying the treaty's injection rule (replace-anchor-preserving, `{}`-scoped locals):

| Item | Owner | Name |
|---|---|---|
| Tablet state attribute | M-06 | `aTabletState` (`InstancedBufferAttribute`, itemSize 2: x=state id, y=phase) |
| State id encoding | frozen | 0=past 1=upcoming 2=imminent 3=current (matches `TabletState` order) |
| Varying | M-06 | `vTabletState` |
| Clock uniform | M-06 | `uMeridianTime` |
| Sepia mix uniform | M-06 | `uSepia` (vec3, Sepia Ink) |
| Marker comments | M-06 | `<studiolo:tablet:*>` |
| Program cache key suffix | M-06 | `\|tablet@1` (appended via `chainOnBeforeCompile`) |
| Local prefix | M-06 | `tb` |

### 2.5 Module layout & mounting (collision-free)

```
apps/web/components/world/meridian/
  meridianLayout.ts       meridianMappings.ts      meridianBus.ts
  meridianMaterials.ts    meridianGeometries.ts    meridianPoses.ts
  MeridianRing.tsx        EventTablets.tsx         PlumbLine.tsx
  MeridianLabels.tsx      TollScheduler.tsx        MeridianAudio.tsx
  useRingScrub.ts
  __tests__/meridianLayout.test.ts
apps/web/public/world/sfx/ring-toll.mp3 (+ LICENSE note)
```

Amended existing files (each owned by exactly one unit, per wave): `app/(app)/world/page.tsx`,
`data/WorldDataProvider.tsx`, `data/useWorldData.ts`, `data/diffing.ts`,
`camera/useFocusStack.ts` (all M-01); `camera/useWorldKeys.ts` (M-08); `text/Ledger.tsx` (M-11);
`components/world/README.md` (M-14).

**Mounting rule (repeat of Phase-1 doctrine):** unit agents NEVER touch `WorldScene.tsx`. The
**Conductor** mounts at wave boundaries, in this order — after `<Embers/>` and before
`<CameraRig/>` for pickables, event-driven nulls after `<Chimes/>`:

```
<MeridianRing/> <EventTablets/> <PlumbLine/>      after <Embers/>, before <CameraRig/>  (Wave M2 close)
<MeridianLabels/>                                 beside <WorldLabels/>                 (Wave M3 close)
<TollScheduler/> <MeridianAudio/>                 after <Chimes/> (render null / 1 audio node) (Wave M3 close)
```

`JarvisRing` stays immediately before `PostFX`; `PostFX` stays last. No exceptions.

---

## 3. WORK-UNIT DECOMPOSITION

### Dependency graph & waves (file-disjoint within every wave)

```
WAVE M1 (parallel, foundational)
  M-01 data-bridge-amendment     M-02 meridian-solver
  M-03 meridian-materials        M-04 toll-asset

WAVE M2 (parallel; depends only on M1)
  M-05 ring-structure   [M-01,02,03]
  M-06 tablet-system    [M-01,02,03]
  M-07 plumb-line       [M-03]
  M-08 lookup-camera    [M-01,02]

WAVE M3 (parallel; integration)
  M-09 toll-scheduler   [M-01,04,06]
  M-10 zoetrope-scrub   [M-05,06,08]
  M-11 labels-ledger    [M-02,05,06]

WAVE M4 (sequential closeout)
  M-12 honesty-sweep    [all M2/M3]
  M-13 perf-hardening   [all]
  M-14 docs-changelog   [all]

WAVE M5 (STRETCH — Gate decides; independently shippable)
  M-15 month-zoetrope   [M-10]
```

### Unit index

| ID | Slug | One-line scope | Difficulty | Model |
|---|---|---|---|---|
| M-01 | data-bridge-amendment | SSR gcal seed on `/world`, `WorldData.meridian`, calendar query slice, worldEvents +1, focusStack +ring, events differ | 0.65 | Opus xhigh |
| M-02 | meridian-solver | Pure dial math: `solveMeridianLayout`, window roll, `classifyTablet`, tint resolution, link heuristic + Vitest suite | 0.6 | Opus xhigh |
| M-03 | meridian-materials | Brass ring material, parchment tablet hologram variant, god-ray material, tablet/tick geometries | 0.5 | Opus xhigh |
| M-04 | toll-asset | Source + commit one low brass bell SFX (≤40 KB, CC0) + license note | 0.05 | Haiku |
| M-05 | ring-structure | The annulus: canted group, brass lathe ring, instanced hour ticks, engraved-strip inner face, minute-tick rotation | 0.65 | Opus xhigh |
| M-06 | tablet-system | ONE InstancedMesh of event tablets: freelist, `aTabletState` chunk, duration sizing, sepia/imminent/current grammar, zenith hero swap, lean-down, hover/pick | 0.85 | Opus xhigh |
| M-07 | plumb-line | The now-line: emissive plumb line zenith→trunk apex + additive god-ray cone | 0.45 | Opus xhigh |
| M-08 | lookup-camera | `C` key, ring-view + tablet-focus poses, focusStack(ring) ↔ cameraBus wiring, Esc semantics | 0.55 | Opus xhigh |
| M-09 | toll-scheduler | T-15 timer → `meridian-toll` event; drei PositionalAudio at zenith (gesture-gated, shared unlock) | 0.6 | Opus xhigh |
| M-10 | zoetrope-scrub | `meridianBus` impl: wheel capture while ring-focused, angular momentum + brass deceleration, snap-to-now | 0.75 | Opus xhigh |
| M-11 | labels-ledger | Garamond numerals + date line + hover/zenith captions; Ledger gains the "next event" clause | 0.5 | Opus xhigh |
| M-12 | honesty-sweep | Reduced-motion collapse for all meridian animation; not-connected/revoked quiet-brass states | 0.4 | Opus xhigh |
| M-13 | perf-hardening | Budget §4 verification: draw-call audit, idle-frame audit (1/min), scrub fps protocol | 0.5 | Opus xhigh |
| M-14 | docs-changelog | `components/world/README.md` meridian section + contracts changelog + `.planning` state | 0.1 | Sonnet |
| M-15 | month-zoetrope (STRETCH) | Windowed refetch past ±7d, day-streak flicker LOD, catch-a-day presentation | 0.85 | Opus xhigh |

**Model routing doctrine (restated):** Opus xhigh executes ALL code. Sonnet writes docs (M-14
only). Haiku only for the trivial asset unit (M-04). **There are NO per-wave Fable seeds this
phase** — this document is the pre-plan for every unit; the per-unit specs below carry the
depth the Phase-1 seeds used to.

---

### M-01 · data-bridge-amendment — difficulty 0.65

- **Purpose:** the single seam between gcal and the world, plus the one sanctioned amendment
  commit to the frozen contracts (§2.2). Everything downstream reads `useWorldData().meridian`.
- **Files:** `app/(app)/world/page.tsx`, `data/WorldDataProvider.tsx`, `data/useWorldData.ts`,
  `data/diffing.ts`, `camera/useFocusStack.ts`.
- **Exact bindings:** SSR — mirror `/calendar/page.tsx` §1.1: `getGcalConnectionStatus(user.id)`
  + `users.timezone`/`gcalVisibleCalendarIds` read; if connected, `getValidGcalToken` →
  `listCalendars` → per-calendar `events.list` over `[startOfDay(today)−1d, startOfDay(today)+8d)`
  with `singleEvents:true`, `orderBy:"startTime"`, `timeZone`; try/catch → status variants; pass
  `initialMeridian` through `WorldLoader → WorldCanvas → WorldScene` props (additive prop, same
  pipeline as `initialTasks`). Client — one `useQuery` in `WorldDataProvider` on the key family
  from §1.2 with the exact refetch policy stated there; `queryFn` = `listEventsForUser`
  (map failure kinds → `status` + `[]`); `invalidate()` on data identity change (existing
  pattern). Window bounds recompute when `todayYmd` rolls (the provider's existing minute
  clock), changing the key → natural daily refetch.
- **Signatures:** §2.2 verbatim (`MeridianData`, `WorldEventMap["meridian-toll"]`,
  `FocusLevel` ring variants), plus `diffEventSnapshots(prev: Map<string,GcalEventDTO>, next: GcalEventDTO[]): { added: string[]; removed: string[] }` in `data/diffing.ts`.
- **Perf constraints:** zero new intervals (reuse the todayYmd minute clock); the meridian query
  is the ONLY new network surface; provider memoizes `meridian` object identity on its inputs.
- **Acceptance:** `/world` SSR carries real events with no extra client round-trip;
  disconnecting gcal in Settings flips `meridian.status` within 60 s (shared status key);
  `tsc` green with the amended `FocusLevel` union (exhaustiveness checks in CameraRig updated
  compile-safely — CameraRig itself is amended in M-08, so M-01 keeps rank mapping additive-only).
- **Build steps:** 1) SSR seed 2) provider query + status 3) contract amendments (one commit,
  labeled `orchestrator amendment`) 4) differ 5) tests for the differ 6) commits per logical unit.

### M-02 · meridian-solver — difficulty 0.6

- **Purpose:** all dial math and event→visual mapping as pure functions, testable without WebGL.
  The layout contract of §2.3 is THIS unit's exports, frozen at wave close.
- **Files:** `meridian/meridianLayout.ts`, `meridian/meridianMappings.ts`,
  `meridian/__tests__/meridianLayout.test.ts`.
- **Key decisions to implement:** timezone-correct seconds-into-day via `TZDate` from
  `@date-fns/tz` (already a dependency — CalendarClient uses it); all-day events → `angleSpan`
  spanning the full dial at the outer-lip band lane; minimum tablet span clamp = 20 min of arc
  so a 5-minute standup is still touchable; overlap handling = radial lane offset (up to 2
  lanes, ring inner/outer), 3+ concurrent → merge into a stacked tablet with count badge
  (labels in M-11). Tint resolution order: `linkEventToProject` hit →
  `oklchToThreeColor(pickNodeColor(areaId))`; else parchment; `GcalCalendarMeta.backgroundColor`
  is kept on the slot for the hover caption's small calendar dot only (NOT the glass tint —
  Google's saturated palette would break the Aesthetic Bible).
- **Link heuristic (Q1):** normalize (lowercase, strip punctuation) both event title and
  project names; match whole words; course-code style tokens (e.g. "CPSC 426") match exactly;
  `isClass` projects take precedence; ambiguous (≥2 hits) → null.
- **Acceptance (Vitest):** angle math truth table incl. DST-transition day (America/New_York
  spring-forward — 23h day must not misplace afternoon events); `visibleSlots` window roll
  enters/exits correctly across a day boundary; `classifyTablet` boundaries (exactly T-15,
  event start, event end); link heuristic fixture table (hit, miss, ambiguous).
- **Perf constraints:** pure + memoizable; `solveMeridianLayout` called only on data identity
  change; zero `three` imports (geometry types are `Vector3Tuple`-free here — angles + numbers).

### M-03 · meridian-materials — difficulty 0.5

- **Purpose:** the phase's material vocabulary + geometry singletons, kept OUT of the frozen
  `materials/sharedGeometries.ts` (module-local file instead — the shared file stays frozen).
- **Files:** `meridian/meridianMaterials.ts`, `meridian/meridianGeometries.ts`.
- **Exact recipes:**
  - `makeRingBrassMaterial()` — `MeshStandardMaterial` Studiolo Brass `#C9A227`,
    metalness 0.85, roughness 0.4 (drinks the night HDRI); NOT emissive (structural metal per
    Aesthetic Bible — "brass & candle for what exists").
  - `makeEngravedStripMaterial()` — inner-face strip, low Candleflame emissive (0.6, below
    bloom threshold — legible warmth, not glow).
  - `makeTabletMaterial()` — `makeHologramMaterial({ tint: parchment, opacity 0.28,
    rimColor: candleflame })` base; M-06 chains the tablet state chunk onto it.
  - `makeGodRayMaterial()` — additive `MeshBasicMaterial`, Candleflame, opacity ~0.06,
    `depthWrite:false`, `toneMapped:false` scaled just >1 so Bloom breathes on the shaft core.
  - Geometries: `RING_GEOMETRY` (lathe/torus profile, ≤64 radial segs, ≤20k tris),
    `TABLET_GEOMETRY` (curved plaque — a thin box bent to ring curvature, unit-arc so
    per-instance x-scale = duration span), `TICK_GEOMETRY` (thin box), `BAND_GEOMETRY`
    (all-day lip band), `SHAFT_GEOMETRY` (open cone).
- **Perf constraints:** all singletons; ≤3 new material variants compile; transmission NOT
  created here (M-06 uses `heroGlass()` for the zenith swap — the registry enforces the cap).
- **Acceptance:** dev harness scene: 100 tablet instances = 1 draw call; bloom only on god-ray
  core + imminent rims; brass reads warm under the existing key light.

### M-04 · toll-asset — difficulty 0.05 · Haiku

- One CC0 low brass bell strike, long decay, ≤40 KB, committed at
  `public/world/sfx/ring-toll.mp3` + license note beside the existing three SFX. Pentatonic
  family compatibility (§5.5): fundamental in the same family as the glass bell — pitch-shift
  in an editor if needed; note the chosen fundamental in the license file.

### M-05 · ring-structure — difficulty 0.65

- **Purpose:** the instrument itself — the canted brass annulus overhead, hour ticks, engraved
  inner face, and the once-a-minute rotation step.
- **Files:** `meridian/MeridianRing.tsx`.
- **Exact spec:** one `<group>` at `[0, cfg.height, 0]`, rotated `cantRad` about x (ecliptic
  cant, high side toward the Vestibule camera azimuth so look-up reads the canting immediately);
  inside it the **dial group** whose y-rotation = `ringRotationFor(now, meridianBus.getScrubOffsetMs(), tz)`.
  Children: brass lathe ring (1 mesh), engraved strip (1 mesh), 24 hour ticks + 96 quarter
  ticks as ONE `InstancedMesh(TICK_GEOMETRY)` (majors scaled 2×), zenith marker (small fixed
  brass pointer OUTSIDE the dial group — it never rotates; the dial turns under it).
  `userData = { kind:'ring' }` on the annulus mesh for raycast pick (click ring → look-up, same
  path as `C`).
- **Rotation rule (§4.1 implemented here):** the dial's rotation is read fresh in a `useFrame`
  that early-returns when the frame wasn't demanded by meridian activity; the minute tick
  (provider clock) calls `invalidate()` once → one frame repositions the dial by ~0.25°. During
  scrub/focus/toll, frames are already being demanded and the dial reads the live offset.
- **Perf:** ≤4 draw calls; ≤28k tris; geometry never rebuilt (config is static).
- **Acceptance:** from the dais the ring reads as a distant canted band of warm brass; the
  zenith pointer sits stationary while the dial creeps under it (verify across a 3-minute
  watch: exactly 3 demanded frames when otherwise idle).

### M-06 · tablet-system — difficulty 0.85 (the crown jewel of the phase)

- **Purpose:** every visible event as a glass tablet in ONE `InstancedMesh`; the full
  tablet state grammar; the zenith hero swap; the T-15 lean-down; hover/pick.
- **Files:** `meridian/EventTablets.tsx`.
- **Exact spec:** imperative `new THREE.InstancedMesh(TABLET_GEOMETRY, tabletMaterial, 128)`
  (declarative `<Instances>` REJECTED at this churn rate — window roll mounts/unmounts rows) +
  freelist + `Map<eventId, slot>`; a second small `InstancedMesh(BAND_GEOMETRY, …, 8)` for
  all-day bands. Per-instance: matrix (angle → position on dial circle, x-scale = angleSpan,
  radial lane offset), `instanceColor` = slot tint, `aTabletState` attr per §2.4 treaty. State
  sync on: data identity change, minute tick (past/imminent/current reclassify), scrub offset
  change (window roll via `visibleSlots` + freelist enter/leave with spring scale, auto-invalidating).
  **Zenith hero swap:** the slot nearest zenith with `state === "current" | "imminent"` hides its
  instance and renders ONE hero mesh with `heroGlass({ tint })` (consumes the ≤3-cap reserve;
  swap logic identical to the focused-lantern pattern in `Lanterns.tsx` — read that file first).
  **Lean-down:** on `worldEvents("meridian-toll")`, the matching instance (or hero) springs
  −25° pitch toward the dais over 900 ms, holds while imminent, eases back at event start;
  reduced-motion → instant state color change only. **Hover:** `onPointerMove` on the
  InstancedMesh → `instanceId` → caption request to M-11's singleton + 2° lean + rim lift
  (`maath` damp, ref-driven). **Click:** push `{ kind:"ring", eventId }` → M-08 pose.
- **Sepia grammar:** past tablets mix toward Sepia Ink in the shader chunk (`uSepia`), emissive
  →0.3, and sit naturally *behind* the zenith on the dial — "the journal of the day already
  written" is geometry, not animation.
- **Perf:** 2 draw calls (+1 hero + its transmission pass); zero per-frame allocation
  (preallocated dummy/scratch); `instanceMatrix.needsUpdate` only when dirty; sleeping tablets
  demand nothing (state pulse is shader-side off `uMeridianTime`, advancing only on demanded
  frames — intended).
- **Acceptance:** seeded week (40 events incl. overlaps + 2 all-day) renders ≤4 draw calls
  total; an event created in the 2D `/calendar` (other tab) rivets in after focus-refetch;
  T-15 fires the lean; the zenith tablet is visibly *glass* among holograms.

### M-07 · plumb-line — difficulty 0.45

- **Purpose:** the hanging plumb-line of light marking *now* — VISION's single sanctioned
  volumetric moment.
- **Files:** `meridian/PlumbLine.tsx`.
- **Exact spec:** a thin emissive line mesh (stretched box, Candleflame, `toneMapped:false`,
  intensity >1 → blooms) from the zenith pointer down to y≈4.2 (trunk apex clearance — never
  touches the Tree, per VISION "it never touches the Tree"); around it `SHAFT_GEOMETRY` with
  `makeGodRayMaterial()` (additive cone, apex up). Static geometry; opacity breathes ±15% only
  during the existing 4 s post-interaction window (reads the same activity flag the DustMotes
  idle policy uses — no new demand source). Positioned under the zenith marker (fixed frame —
  does NOT rotate with the dial).
- **Perf:** 2 draw calls, ~200 tris, zero per-frame cost while idle.
- **Acceptance:** from the dais, one quiet golden shaft falls from the ring's highest point;
  dust motes passing through it read brighter (free — additive overlap); no bloom halo wider
  than the shaft core.

### M-08 · lookup-camera — difficulty 0.55

- **Purpose:** the look-up ritual and tablet focus, through the frozen camera authority.
- **Files:** `camera/useWorldKeys.ts` (surgical: `C` key + Esc-from-ring), `meridian/meridianPoses.ts`.
- **Exact spec:** `meridianPoses.ts` exports
  `RING_VIEW_POSE: CameraPose` (camera pulled low/back on the dais, target at ring center —
  the ring fills the upper frame, canted and immense) and
  `tabletFocusPose(slot: TabletSlot, rotation: number): CameraPose` (reading distance ~2.5 m,
  slightly below the tablet so it looks down at you). `C` in `useWorldKeys` →
  `focusStack.push({ kind:"ring" })`; the CameraRig focus-effect maps the new ranks → poses
  (CameraRig's pose-mapping switch gains the two ring cases — **CameraRig.tsx is owned by M-08
  for this wave**; add it to Files). Esc pops per stack semantics; popping the last ring level
  also awaits `meridianBus.snapToNow()` before the glide home (sequenced, not parallel — the
  ring settles, then you descend). Guard: `C` ignored while `e.target` is input/textarea
  (existing guard pattern) and before `boot-complete`.
- **Acceptance:** `C` from anywhere frames the ring in ~800 ms; click a tablet → reading
  distance; Esc walks tablet→ring→vestibule; Esc from scrubbed ring returns the dial to now
  first; `1–9`/`T` keys still work untouched.

### M-09 · toll-scheduler — difficulty 0.6

- **Purpose:** the T-15 moment: one timer, one event, one toll from above.
- **Files:** `meridian/TollScheduler.tsx` (renders null), `meridian/MeridianAudio.tsx`.
- **Exact spec:** TollScheduler computes the next `startMs` with `startMs − now > 0` from
  `meridian.events`; arms ONE `setTimeout` for `startMs − 15 min` (if already inside T-15 and
  not yet started, fire on mount once per eventId — dedupe via a session `Set<eventId>`); on
  fire → `worldEvents.emit("meridian-toll", { eventId, title, startIso })` → re-arm for the
  following event. Re-arms on data change; clears on unmount; `visibilitychange` → recompute
  (timers drift in background tabs). MeridianAudio: drei `<PositionalAudio url="/world/sfx/ring-toll.mp3" distance={6} loop={false}>`
  parented at the zenith marker (~y 8.5) — the reminder literally arrives from overhead;
  playback gated on the SAME gesture-unlock state `audio/Chimes.tsx` maintains (read its
  unlock/mute flags — `localStorage['world:muted']` honored; do NOT create a second
  AudioContext unlock path: drei's listener attaches to the camera, but `.play()` waits for
  the shared unlocked flag). Reduced motion does NOT gate audio (Phase-1 precedent: bells
  still ring).
- **Perf:** zero rAF impact; one timeout at a time; audio decoded lazily on first arm.
- **Acceptance:** create an event 16 min out in 2D → within the refetch cadence the scheduler
  arms; at T-15 the toll sounds *from above* (pan/HRTF audible as you orbit) exactly once, and
  the tablet leans (M-06). Muted flag silences it.

### M-10 · zoetrope-scrub — difficulty 0.75

- **Purpose:** the hand on the wheel — Hero Moment V in miniature, within the loaded window.
- **Files:** `meridian/useRingScrub.ts` (implements + exports the pre-frozen `meridianBus`,
  §2.3; MeridianRing mounts the hook).
- **Exact spec:** while `focus.kind === "ring"` (no eventId): a capture-phase `wheel` listener
  on the canvas maps `deltaY` (and `deltaX`) → `addScrubVelocity` (tuned ~45 min of dial per
  100 px of wheel at unit velocity); CameraControls' own wheel/zoom is disabled for the
  duration (`controls.enabled` dolly flag off via a small exported toggle CameraRig already
  owns for the boot gate — coordinate: M-08 exposes `cameraBus`-adjacent
  `setRingScrubActive(b: boolean)`; if that seam turns out to require CameraRig source
  changes, M-10 defers the toggle wiring to the Conductor's wave-boundary commit rather than
  touching M-08's file). Momentum: velocity decays with **heavy brass friction** — exponential
  damping (`easing.damp`, halflife ~350 ms) + a soft detent that nudges the settle point toward
  the nearest 30-min mark ("catch the Ring at next Friday: it decelerates with a heavy,
  satisfying brass momentum"). Frames demanded ONLY while `|velocity| > ε` or a snap animation
  runs (spring/self-invalidating loop with early-exit). `snapToNow()` = critically-damped
  spring of offset→0, ~700 ms. Scrub offset clamped to the loaded slab bounds
  (`windowStartMs/windowEndMs`) with a rubber-band ease at the edges (the "there's more time
  out there" affordance for M-15). Trackpad two-finger swipe IS a wheel event on macOS — no
  extra gesture lib. Reduced motion: no momentum — wheel steps the dial in discrete 1-hour
  increments, Esc snaps instantly.
- **Acceptance:** one confident flick carries the dial ~a day and decelerates believably; days
  entering/leaving churn tablets through the freelist without hitches (≥58 fps during scrub on
  the M-series baseline); releasing near a busy morning settles legibly on it; at the slab edge
  the dial rubber-bands; idle after settle → rAF back to the 1-frame-per-minute regime.

### M-11 · labels-ledger — difficulty 0.5

- **Purpose:** the engraved voice of the instrument: numerals, the scrub date line, captions —
  and the Ledger finally learns about your day's events.
- **Files:** `meridian/MeridianLabels.tsx`, `text/Ledger.tsx` (surgical).
- **Exact spec:** SDF `<Text>` (EB Garamond via `text/fonts.ts` constants) —
  **8 hour numerals** (every 3 h, old-style figures, Sepia-on-brass look: sepiaInk color,
  slight z-inset toward the strip), parented INSIDE the dial group so they rotate with time;
  `visible` only when `focus.kind === "ring"` or camera pitch > ~35° up (distance/orientation
  cull in `useFrame`, never unmount). **One date line** (italic) under the zenith pointer —
  "Monday, July 6th" — re-composed from the scrub center via `meridianBus.subscribe`
  (throttled to day-change, troika `text` mutation, not React state). **One hover caption**
  singleton (title · time range · small calendar-color dot) + **one zenith caption** for the
  current/imminent tablet. Stacked-overlap tablets get a count badge glyph ("×3") via the
  hover caption. **Ledger:** extend `composeLedgerLine()` to append the next-event clause —
  *"Lecture at two."* — from `meridian.events` (next start after now, 12-h colloquial hour);
  omit clause when `status !== "connected"` or no events remain today. Keep the function pure +
  unit-tested (it already is — extend its test).
- **Perf:** ≤11 new live `<Text>` instances (8 numerals + date + hover + zenith); glyph audit:
  confirm digits/old-style figures render from the preloaded woff set at world mount (extend
  `preloadWorldFonts`'s glyph string if numerals are missing — that constant lives in
  `text/fonts.ts`, owned here for the audit).
- **Acceptance:** numerals crisp when ring-focused, hidden from the dais; date line flips as
  you scrub across midnight; Ledger reads "…Lecture at two. One thought you haven't filed."

### M-12 · honesty-sweep — difficulty 0.4 (Wave M4, sequential)

- **Purpose:** reduced-motion and connection-state honesty across every meridian surface.
- **Files:** touches meridian components (sequenced after M2/M3 settle — no collisions).
- **Spec:** `worldPrefersReducedMotion()`/`useWorldPrefs()` consumers: scrub (discrete steps),
  lean-down (instant color state), snap (instant), ring fade-in on boot (crossfade), god-ray
  breathe (off). Connection states: `not_connected` → ring renders dark petrified brass
  (emissive 0, metalness up), no tablets, no plumb-line, one Garamond line under the zenith:
  *"The ring is dark. Connect Google Calendar on the Page."* (caption slot reused, not a new
  Text); `expired`/`revoked` → same + *"Reconnect"* wording. No OAuth from the world; `Cmd+\`
  remains the path. Empty-but-connected day → bright ring, no tablets, plumb-line still falls
  ("either a very good day…" energy lives in the 2D EmptyState; the world stays wordless).
- **Acceptance:** macOS Reduce Motion ON → zero glides/momentum/lean animation, everything
  legible; disconnect in Settings → world flips to dark ring within 60 s without reload.

### M-13 · perf-hardening — difficulty 0.5 (Wave M4)

- **Purpose:** prove §4. Extend the Phase-1 perf protocol with the meridian section.
- **Files:** `meridian/__tests__/` additions + the perf protocol doc under
  `components/world/__tests__/`.
- **Spec & acceptance:** run the §4.4 protocol on the target machine and record numbers;
  `gl.info.render.calls` delta for the meridian layer ≤20 in the Vestibule; the idle audit
  (§4.1) shows exactly 1 demanded frame per minute after 10 s hands-off; `PerfGovernor` ladder
  still functions (throttle GPU → DPR steps down with the ring in frame).

### M-14 · docs-changelog — difficulty 0.1 · Sonnet

- README meridian section (module map rows, the amended contracts, the dial model, the idle
  rule), CHANGELOG entry, `.planning` state note. Acceptance: a new engineer can add a
  "moon-phase widget" to the ring from the README alone.

### M-15 · month-zoetrope — difficulty 0.85 · **STRETCH (Gate decides — do not start without approval)**

- **Purpose:** the full Hero-V sweep: scrub past the slab into next month.
- **Files:** `meridian/useRingWindowing.ts` (new), amendments inside `useRingScrub.ts` and
  `EventTablets.tsx` (sequential wave — no collision).
- **Spec sketch:** slab paging — when the rubber-band edge is hit with velocity,
  `queryClient.fetchQuery` the adjacent ±7-day slice on the same key family (gcal fetch cost
  ~1 action call; loading state = the dial keeps spinning over "pure quiet brass" until data
  lands); **day-streak LOD** — above an angular-velocity threshold, tablets swap to a single
  additive streak quad per day (1 draw call) so busy days read "dense with glass" at speed and
  the per-instance churn pauses; **catch-a-day** — on settle, the nearest day's tablets lean
  down 8° in sequence (150 ms stagger) — "ready to be touched." Rescheduling stays OUT
  (Phase 4).
- **Acceptance:** flick hard from today → land on next Friday: brutal-Tuesday-reads-as-light
  at speed, deceleration lands within the intended day, tablets present themselves, fps ≥55
  throughout including the mid-scrub fetch.

---

## 4. THE PERFORMANCE BUDGET (LAW — extends PLAN §7, enforced by M-13 + PerfGovernor)

### 4.1 THE RING-ROTATION vs IDLE-rAF RESOLUTION (the exact rule)

VISION asks for "slow Ring rotation" as idle breath; the doctrine demands idle → 0 rAF. The
resolution: **the ring's rotation is time projection, not decorative animation — and real time
at this scale is imperceptible between frames.** The dial turns 360° per day = **0.25° per
minute**; continuous animation of that is waste. Therefore:

> **The Meridian idle rule:** the dial's rotation is a pure function
> `ringRotationFor(Date.now(), scrubOffsetMs, tz)` evaluated only on demanded frames. While
> idle, the ONLY meridian-originated frame demand is the world's existing **minute clock**
> (the same tick that recomputes `todayYmd`) calling `invalidate()` once — **one demanded
> frame per minute**, in which the dial advances ~0.25°, tablet states reclassify, and the
> world sleeps again. Continuous frame demand is permitted ONLY while: (a) `focus.kind ===
> "ring"` AND the camera is moving, (b) `|scrubVelocity| > ε` or a snap/rubber-band animation
> is live, (c) a lean-down / hero-swap / enter-leave spring is live (auto-invalidating), or
> (d) the 4 s post-interaction breath window is open (god-ray breathe rides it). Outside
> these, meridian rAF contribution is exactly 1 frame/min.

This amends the Phase-1 acceptance criterion "idle 10 s → rAF → 0 (± firefly heartbeat ≤5 fps)"
to "… (± firefly heartbeat ≤5 fps, ± meridian minute-tick = 1 frame/min)". M-13 verifies both.

### 4.2 Draw calls, triangles, memory

| Item | Budget |
|---|---|
| Ring structure (annulus + strip + ticks-instanced + zenith pointer) | ≤4 draw calls |
| Event tablets (ONE InstancedMesh) + all-day bands (ONE) | 2 |
| Zenith hero tablet (heroGlass — the ≤3-cap **reserve slot**, now consumed) | 1 (+1 transmission pass) |
| Plumb-line + god-ray cone | 2 |
| Meridian SDF Text (8 numerals + date + hover + zenith captions) | ≤11 |
| **Meridian layer total** | **≤20** |
| **New scene ceiling (Vestibule, ring in frame)** | **≤170** (was ≤150) |
| Meridian triangles | ≤45k (ring ≤28k, tablets ≤12k, rest ≤5k) — scene stays ≤300k total |
| New textures | ZERO (materials are procedural; SFX is audio) |
| New dependencies | **ZERO** (drei ships `PositionalAudio`; `@date-fns/tz` already installed) |

### 4.3 Discipline (instantiation of Phase-1 law)

- Tablets: ONE imperative `InstancedMesh`, freelist, spring enter/leave, zero per-row React.
- Transmission: the ≤3 registry is now FULL (focused lantern, Jarvis ribbon, zenith tablet).
  Nothing else in any later phase may take a slot without freeing one.
- SDF text: live `<Text>` ceiling raised 28 → **40**; numerals distance/focus-culled via
  `visible`; `sdfGlyphSize` ≤64; glyphs preloaded (M-11 audit).
- No per-frame React state anywhere; scrub offset/velocity live in module refs;
  `instanceMatrix.needsUpdate` only when dirty; preallocated scratch objects.
- No new lights. No second composer. No new `<Html>`. No new AudioContext.

### 4.4 Phase-2 perf acceptance protocol (M-13, recorded numbers required)

Seed: Phase-1 seed (8 areas / 40 projects / 300 tasks / 12 captures) + 40 events across 9 days
(incl. 6 overlapping, 2 all-day, 1 starting in 16 min).
- Vestibule with ring in frame: `gl.info.render.calls ≤ 170`, tris ≤ 300k.
- `C` look-up glide + 20 s of aggressive scrubbing (3 flicks, 2 direction reversals): ≥58 fps,
  no hitch > 33 ms on freelist churn.
- T-15 toll + lean during an active scrub: no dropped audio, fps ≥55.
- Hands off 10 s: rAF = firefly heartbeat + exactly 1 meridian frame/min; CPU at idle baseline.
- Reduced-motion pass: zero continuous demand during discrete-step scrubbing.

---

## 5. AESTHETIC / MOTION / SOUND SPEC (the Bible, applied)

1. **Materials.** The ring is *what exists* — Studiolo Brass `#C9A227`, metallic, non-emissive,
   fed by the night HDRI; the engraved inner strip carries sub-bloom Candleflame warmth like
   lamplight on an instrument's scale. Tablets are *luminous paper as glass*: parchment-neutral
   `#F2E9D8` hologram recipe (fresnel rim, Candleflame), taking the parent bough's OKLCH hue
   as stained glass over candlelight ONLY when confidently linked. Google's calendar colors
   never tint glass (they'd shatter the palette); they survive as a small dot in captions.
2. **State is light, on the dial:** past = swung behind zenith + Sepia Ink mix + emissive 0.3
   (a written journal); upcoming = parchment calm; imminent (T-15) = Candleflame rim lift >1
   (blooms) + the 25° lean toward your eyeline; current = the one true glass — `heroGlass` at
   zenith under the plumb-line. The plumb-line is the room's only god-ray: one golden shaft,
   dust drifting through it.
3. **Typography.** Old-style Garamond figures engraved on brass — sepia, inset, no glow.
   The date line is italic (the instrument annotating itself). No geometric sans, ever.
4. **Motion.** Everything eases; nothing pops. Ring fade-in gated on `boot-complete` (2 s
   crossfade). Look-up is a single 800 ms arc that ends slightly under the ring — the
   instrument should loom. Scrub momentum is HEAVY: high friction, low overshoot (≤1.02), a
   soft 30-min detent — a bronze wheel on a good bearing, not an iPhone list. The lean-down is
   deferential, 900 ms, like a servant inclining. `prefers-reduced-motion` collapses all of it
   to instant states, honestly and completely.
5. **Sound.** ONE new sound this phase: the T-15 toll — a single low brass bell, long decay,
   in the pentatonic family of the existing chimes, played through drei `PositionalAudio`
   parented at the ring's zenith so it *falls from above* (VISION §5 verbatim: "the reminder
   literally comes from overhead"). Gesture-gated with the existing unlock, muted by the
   existing flag. Never repeated, never nagging — one toll per event, period.
6. **Honest darkness.** Disconnected = the ring petrifies (dark brass, no tablets, no shaft) —
   history's silhouette, like archived boughs. The world never begs; one engraved line points
   to the Page.

---

## 6. DEFINITION OF DONE + VERIFIER CHECKLIST

Static / CI (verifier runs without auth):
- [ ] `npm run build` green; `tsc --noEmit` green; full Vitest suite green (incl. new
      `meridianLayout` truth tables: DST day, window roll, T-15 boundaries, link heuristic,
      extended `composeLedgerLine`).
- [ ] ZERO new packages in `package.json`; zero three imports outside `components/world/**`;
      2D route chunks byte-comparable (bundle-split audit as Phase 1).
- [ ] Exactly one orchestrator amendment commit touches `diffing.ts` / `useFocusStack.ts` /
      `useWorldData.ts`; `worldEvents` has exactly 6 names; `heroGlass` dev registry cap still
      3 (grep for a 4th creation site).
- [ ] `WorldScene.tsx` mounting order intact: meridian components after `<Embers/>`/before
      `<CameraRig/>` (+ null systems after `<Chimes/>`), `JarvisRing` before `PostFX`, `PostFX` last.
- [ ] Grep-proof of the prime constraint: no Drizzle schema change, no new table, no
      `revalidatePath` near gcal code, no new `/api` route.

In-browser smoke (requires Filippo's auth session — run at the Gate):
- [ ] `/world` with gcal connected: ring overhead, today's tablets riveted, positions/titles
      match `/calendar` for the same window (spot-check 3 events).
- [ ] A class-titled event (e.g. containing the course code) wears its bough's hue; an
      unlinked event stays parchment.
- [ ] The plumb-line falls at zenith; a past-morning event hangs behind it in sepia.
- [ ] `C` frames the ring; hover shows title · time; click a tablet → reading distance; Esc
      walks back and the dial snaps to now.
- [ ] Two-finger swipe: brass momentum through tomorrow → the week; day boundary flips the
      date line; slab edge rubber-bands; settle → idle regime resumes.
- [ ] Create an event 16 min out (2D or via Jarvis one-sentence): tablet rivets in on refetch;
      at T-15 the ring tolls ONCE from above (audibly positional while orbiting) and the
      tablet leans down.
- [ ] Jarvis in-world: "put lunch with Ana at noon tomorrow" → receipt → tablet appears
      without reload (prefix invalidation verified live).
- [ ] Disconnect gcal in Settings → within 60 s the ring petrifies with the engraved nudge; no
      crash, no fetch loop. Reconnect on the Page → ring relights.
- [ ] macOS Reduce Motion: discrete scrub steps, instant lean/states, toll still sounds.
- [ ] Perf protocol §4.4 numbers recorded in the protocol file; idle audit shows the
      1-frame/min regime.
- [ ] `Cmd+\` round-trip: the 2D `/calendar` is byte-identical in behavior. One truth, two theatres.

Ship when every box is checked. Then stand on the dais at 1:45, look up, and let the day toll.

---

## 7. OPEN QUESTIONS FOR THE GATE (Filippo decides; defaults stated)

1. **Area/class tint heuristic (M-02).** Ship the conservative title↔project word-match
   (course codes prioritized, ambiguity → parchment)? Or all-parchment until a real linkage
   exists (a `projects.gcal_keyword` column is a natural Phase-4 companion)?
   *Default: ship the heuristic — it's pure, tested, and wrong-safe.*
2. **Freshness cadence.** Loaded slab = today −1/+8 days; `staleTime` 60 s; focus refetch; 5-min
   foreground poll. Enough? (No Realtime exists for gcal; the alternative — webhooks/push — is
   real backend work and out of scope.) *Default: yes, ship as specced.*
3. **Stretch M-15 (month zoetrope).** In this phase's Gate, or promoted to the Phase-5 slot it
   originally held in PLAN §4? *Default: defer — the ±7-day scrub already proves the wheel.*
4. **The ring's Litany beat.** VISION Hero-I has the ring "swing up out of the darkness" at
   boot; `Litany.tsx` is a frozen Phase-1 timeline. Phase 2 ships a plain 2 s fade gated on
   `boot-complete`. Amend the Litany now (small keyframe insert) or hold for Phase 6 polish?
   *Default: hold — one amendment commit per phase is enough.*
5. **Scrub gesture claim.** While ring-focused, wheel/two-finger = scrub and CameraControls
   dolly is suspended (Esc restores). Comfortable, or prefer Shift+wheel so zoom survives?
   *Default: full claim — the ring focused IS the zoetrope mode.*
6. **The reserve transmission slot.** The zenith tablet permanently consumes the last
   `heroGlass` slot (3/3). Phase 3's Forge editor was expected to want glass too — accept that
   Phase 3 must swap slots contextually (only one of focused-lantern/zenith-tablet is hero at
   a time)? *Default: accept; the registry already supports swap-on-focus.*

---

*— Fable, Architect. The sky is drawn. Hand the torch to Opus — and at 1:45, listen up.*
