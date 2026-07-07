# THE STUDIOLO — PHASE 3 BUILD PLAN: THE BOTTEGA (the workbench of light)

> Architect: Fable. Executors: Opus engineering pipeline (parallel agents, atomic commits).
> Sealed inputs: `PHASE-3-VISION-NOTES.md` (Filippo's brief — the emotional source of truth),
> `PHASE-3-FOUNDATION-AUDIT.md` (the KEEP/REFRAME/DROP/NET-NEW constraint envelope),
> `apps/web/components/world/README.md` (the frozen world contracts, incl. the Phase-2
> meridian additions this plan partially demolishes), and the live code.
> Every data-contract claim below was verified against the codebase on 2026-07-06
> (`TodayPanel.tsx`, `useFocusStack.ts`, `useWorldData.ts`, `diffing.ts`, `useWorldPrefs.ts`,
> `CameraRig.tsx` exports incl. `setRingScrubActive`, `hologram.ts` exports incl. `heroGlass`,
> `HabitsClient.tsx` / `JournalingClient.tsx` / `CapturesClient.tsx` query keys,
> `app/actions/{tasks,captures,habits,journal,gcal-events}.ts` server actions — all confirmed
> at the named paths). Where this plan INVENTS (bench geometry numbers, the drag mechanic, the
> persistence store, the panel-LOD scheme), it says so explicitly and routes the decision to a
> Gate question (§9). This is the SINGLE Fable plan for Phase 3 — no per-wave Fable seeds.
> **Human gate: Filippo reviews and blesses this document before any code-writing agent runs.**

---

## 0. PHASE THESIS & THE SHIPPABLE SLICE

**Thesis.** Phase 1 gave the Studiolo its ground — the Tree, the embers, the familiar. Phase 2
gave it a sky it turns out we don't want. Phase 3 gives the Studiolo its **hands**: the room
becomes a working **bottega** — Verrocchio's workshop rebuilt as Stark's lab, which is the same
room five centuries apart. The LifeOS surfaces that today live as 2D browser pages become
**holographic panels of luminous drafting paper**, arranged in a **workbench arc** around where
you stand. You swipe between them (the camera glides — the flight system you already own), you
**grab one and move it** (your bench, your arrangement, remembered between sessions), and you
**work in them for real** — complete a task, file a capture, tick a habit — through the exact
same server actions and query keys as the 2D app. The Tree stays exactly where it is and what
it is: the centerpiece and the living map of your areas and projects, visible down the aisle
between the benches, still navigable by click and by key. The Meridian Ring comes down; its
gcal plumbing survives into one honest flat agenda panel among the others. **One truth, two
theatres — and now the second theatre is a place you work, not a place you look.**

**North star, one line:** *step into the room, glide along your own arrangement of living
panels, touch your real data, and see the Tree of your life standing at the center of it all.*

**The shippable slice (the Gate demo):**
Boot into the bottega. The Litany plays; the Tree reveals; around your standing point an arc of
five glass-paper panels warms into view — Tasks, Captures, Agenda, Habits, Journal — each
carrying your live data, the Tree visible down the open aisle between them. Two-finger swipe
right: the camera glides one bench over, the Captures panel filling your view; the panel under
focus lifts, its frame catching the light. Check off a task on the Tasks panel — the same
server action as the 2D widget fires, and behind the panel the task's ember flares and ascends
from the Tree. Grab the Habits panel by its header and drag it two slots left — the bench
re-arranges with a soft glide, a low chime docks it, and when you reload the page it is still
there. Press `C` — the Agenda panel summons itself into focus, this afternoon's lecture
tinted with its class's bough hue, the same events as the 2D `/calendar`, byte-identical.
Say one sentence to Jarvis — the firefly routes, the panels refresh, no reload. Press `Cmd+\`
— the 2D app shows the identical state. **The Ring is gone and nothing of value was lost.**

**In the slice:**
- The `<WorldPanel>` primitive (generalized from `TodayPanel`) + the panel frame material.
- The workbench arc: a pure layout solver, ≤7 slots, central aisle preserving the Tree sightline.
- Swipe navigation: wheel/trackpad horizontal swipe, ←/→ keys, click-a-panel — all through
  `focusStack` + `cameraBus.flyTo` (the existing flight authority; ~700 ms felt glide).
- Grab-and-move: header-drag a panel to a new slot; the arc re-solves; arrangement persists.
- Five widgets: **Tasks** (the TodayPanel reborn), **Captures**, **Agenda** (flat calendar on
  the surviving M-01 bridge), **Habits**, **Journal** (read + open-on-Page).
- The Meridian demolition: `meridian/` presentation deleted at file level; `classifyTablet` /
  `linkEventToProject` / calendar-dot logic extracted and reused by the Agenda panel.
- Focused-panel hero moment: the freed transmission slot becomes a glass backplate behind the
  panel under focus (swap-on-focus, registry stays ≤3). *(Gate Q7 confirms.)*
- Connection/empty honesty per panel; reduced-motion collapse for every new animation.

**Explicitly OUT of the slice (stated so no executor builds them speculatively):**
- **Free 6-DOF panel placement** — MVP grab-and-move is slot reordering on the arc (Gate Q3
  decides whether continuous-angle placement ships as the stretch unit W-18).
- **Rich text editing in-world** — uikit has no TipTap; the Journal panel reads today's entry
  and defers editing to the Page (`Cmd+\` deep-link). Same for wiki/pages (not in roster).
- **In-world event mutation** — the Agenda panel READS gcal; the Page and Jarvis write it
  (unchanged Phase-2 rule).
- **New widget surfaces beyond the five** (Nutrition, Training, People, Wiki, Search) — the
  registry is designed for them; they are post-Gate roster additions, one unit each.
- **Tree↔widget cross-linking** (focus a bough → Tasks panel scopes to that area) — specced as
  stretch unit W-17, Gate decides.
- **A generic reminder toll** (the T-15 concept reborn without the ring) — deferred; the
  `ring-toll.mp3` asset is kept on disk for that future.
- **Boot-sequence rework** — the Litany timeline is untouched; only its greeting copy may
  change (W-13).

---

## 1. THE VERIFIED FOUNDATION & DATA CONTRACT (real seams — reuse, never reinvent)

**The prime constraint, restated as law: widgets read and write through the IDENTICAL
TanStack Query keys and server actions as the 2D app. No world store, no parallel fetch layer.**
(`WorldDataProvider` already mounts the 2D queries verbatim; `TodayPanel` already proves the
write path end-to-end: `updateTaskStatus` → `invalidateQueries(tableKey("tasks", userId))` →
Realtime → shared cache → differ → `task-completed` → ember ascent.)

### 1.1 What exists and carries the phase (verified 2026-07-06, with paths)

| Concern | Artifact | Path | Why it matters here |
|---|---|---|---|
| The widget template | `TodayPanel` | `components/world/panels/TodayPanel.tsx` | The proof-of-concept: uikit `<Root>/<Container>/<Text>` + uikit-default `<Button>`, fixed world-anchored group, `useWorldData()` reads, real server-action writes, `ROW_CAP=12`, STUDIOLO skin, zero per-frame work. §2.1 generalizes it. |
| Data bridge | `WorldDataProvider` / `useWorldData()` | `components/world/data/` | One `useQuery` per surface with the 2D key/fn verbatim + `useTableSubscription` + `invalidate()` on data change. Adding a widget's data = one query here + one SSR seed. |
| Flight authority | `cameraBus.flyTo(pose, ms)` / `CameraRig` | `components/world/camera/CameraRig.tsx` | The ONLY way the camera moves. Swipe = flying to face a fixed panel. Reduced-motion instant-cut built in. |
| Navigation state | `focusStack` (`useSyncExternalStore`, rank-chain) | `components/world/camera/useFocusStack.ts` | Gains `{kind:"widget", widgetId}`; loses `{kind:"ring"}` (§3.2). Push/pop/truncate semantics untouched. |
| Keyboard | `useWorldKeys` (single capture-phase listener) | `components/world/camera/useWorldKeys.ts` | Gains ←/→ (prev/next panel); `C` is re-pointed from ring look-up to "summon the Agenda panel"; `1–9` boughs and `Esc` unchanged. |
| Hologram look | `makeHologramMaterial` (fresnel rim, unlimited) + `heroGlass()` (`HERO_GLASS_CAP=3` dev registry) + `chainOnBeforeCompile` | `components/world/materials/hologram.ts` | §7.1 — the transmission-cap answer. |
| Tokens / text | `STUDIOLO`, `pickNodeColor`, `oklchToThreeColor`; EB Garamond SDF via `text/fonts.ts` | `components/world/materials/tokens.ts`, `text/` | Panel skins and placard titles. |
| Reduced motion | `worldPrefersReducedMotion()` / `useWorldPrefs()` | `components/world/prefs/useWorldPrefs.ts` | Every new glide/spring/drag routes through it. |
| Perf | `PerfGovernor` (adaptive dpr), demand frameloop, `PostFX` last-child rule | `components/world/perf/`, `env/PostFX.tsx` | Inherited automatically. |
| The gcal bridge (M-01) | `WorldData.meridian` slice: key `["calendar-events", userId, calIds, timeMin, timeMax]`, `listEventsForUser`, `useGcalConnectionStatus` (`["gcal-connection-status"]`), SSR seed in `world/page.tsx` | `data/WorldDataProvider.tsx`, `app/actions/gcal-events.ts`, `lib/gcal/useGcalConnectionStatus.ts` | Survives WHOLESALE; renamed `WorldData.calendar` (§3.2) and consumed by the Agenda panel verbatim. |
| Salvaged pure logic | `classifyTablet`, `linkEventToProject` (from `meridian/meridianLayout.ts`), `calendarDotColor` (from `meridian/meridianMappings.ts`) | `components/world/meridian/` | Extracted to `panels/agenda/agendaLogic.ts` before the directory is deleted (§5). |
| The Tree | `tree/Trunk`, `Boughs`, `Lanterns`, `Embers`, `Fireflies` | `components/world/tree/` | Untouched. It IS the "see & navigate the areas/projects tree" ask — already pickable, already keyed, already loved. §4.2 makes the hub call. |
| Jarvis | `jarvis/*` (ring, ribbon, choreography, light-thread) | `components/world/jarvis/` | Untouched. The bottega's voice already exists. |

### 1.2 The per-widget data contract (2D keys and actions, verified per widget)

Every row below was read from the named 2D client. The world widget's queries/mutations are
these, **byte-identical** — the executor's first act for each widget unit is to open the 2D
client and copy its key/action usage, not to design new ones.

| Widget | Read keys (2D verbatim) | Query fns | Write actions (2D verbatim) | Realtime |
|---|---|---|---|---|
| **Tasks** | `tableKey("tasks", userId)` | `getTasksForCurrentUser` | `updateTaskStatus({id, newStatus:"lesno"})` (`app/actions/tasks.ts`) | already subscribed in provider |
| **Captures** | `[...tableKey("captures", userId), null]` (provider already mounts this); `tableKey("hashtags", userId)` for tag chips | `getCapturesForCurrentUser` | `updateCapture` / `deleteCapture` (`app/actions/captures.ts`) — mirror the 2D `CapturesClient` row affordances (executor reads that file first) | already subscribed |
| **Agenda** | `["calendar-events", userId, calIds, timeMin, timeMax]` (the M-01 slice, already in provider) + `["gcal-connection-status"]` | `listEventsForUser` | NONE (read-only; Page/Jarvis write) | none (gcal not in Postgres; focus-refetch + 5-min poll + Jarvis prefix invalidation, unchanged) |
| **Habits** | `tableKey("habits", userId)`; `[...tableKey("habit_completions", userId), windowStart, today]` (shape verified in `HabitsClient.tsx` ~157–175) | `getHabitsForCurrentUser`, `getHabitCompletionsInRange` | `toggleHabitCompletion` (`app/actions/habits.ts`) with the 2D invalidation pattern | NEW: `useTableSubscription` for `habits` + `habit_completions` in the provider (mirror the five existing channels; executor verifies table names against `lib/realtime`) |
| **Journal** | `["journaling", userId, todayYmd]` (verified in `JournalingClient.tsx` ~52) | `getJournalEntry` (`app/actions/journal.ts`) | NONE in MVP (read + "open on the Page"; `upsertJournalEntry` exists for a later quick-append) | NEW: `useTableSubscription` for `journal_entries` if the 2D app has one; else focus-refetch only (executor checks `JournalingClient` — it invalidates the `["journaling", userId]` prefix on write) |

**Provider additions (unit W-01):** two new `useQuery` mounts (habits pair, journal-today) with
identical keys/fns, matching SSR seeds in `app/(app)/world/page.tsx` (same pipeline as
`initialTasks`), and the new Realtime subscriptions. `WorldData` extends additively (§3.2).
The habits window (`windowStart`) recomputes off the provider's existing `todayYmd` minute
clock — zero new intervals.

**Honest note (invented, flagged):** the Journal entry's content format is whatever the 2D
editor persists (likely rich JSON). uikit renders plain text only. The widget shows a
plain-text extraction (first ~12 lines) + word count + an "open on the Page" affordance. If
extraction proves ugly at execution time, the widget degrades to "entry exists / streak"
status — the executor decides at build time and notes it; this does not gate the phase.

---

## 2. THE AESTHETIC BIBLE — *bottega, not neon*

The brand tension is real: EB Garamond parchment-and-brass vs. "Tony Stark's lab." The honest
reconciliation is that **Leonardo's workshop WAS Stark's lab** — drafting instruments, brass
armatures, luminous diagrams pinned above a workbench. We do not bolt cyan onto parchment; we
render *the notebooks of a Renaissance engineer as light*. Rules, binding on every unit:

1. **Panels are luminous drafting paper, not sci-fi glass.** The panel body is the proven
   TodayPanel skin verbatim: deep-vellum uikit slab at `opacity 0.7`, parchment text, brass
   border, coral only for overdue/alarm. No transmission material on panel bodies, ever (§7.1).
2. **The frame is the instrument.** Each panel gets a thin 3D **drafting frame** — brass rail
   top and bottom, candleflame fresnel rim via `makeHologramMaterial` — that reads as a
   workshop fixture holding a sheet of light. The frame, not the sheet, is what glows: rim
   intensity >1 (blooms softly) ONLY on the focused panel; unfocused frames sit sub-bloom.
3. **Cyan belongs to Jarvis alone.** The one Stark color in the room stays exclusively the
   familiar's (ring, ribbon, light-thread). Panels never use it. *(Gate Q6 confirms this
   direction against the alternatives.)*
4. **Area hue is earned, not decorative.** Agenda rows tint with a bough's OKLCH hue only when
   `linkEventToProject` links confidently (Phase-2 rule, kept). Tasks rows show their project
   name in text, not color floods. Google's calendar palette survives only as the small
   calendar dot (`calendarDotColor`).
5. **Typography.** EB Garamond SDF for everything 3D-text (placard titles, captions); uikit's
   default font inside panels (its documented limits — no italic, MSDF glyph gaps — are
   inherited from TodayPanel: dimmed weight carries the italic intent, bordered containers
   replace exotic glyphs).
6. **Motion is furniture-heavy.** Swipe glides are the existing ~700 ms `smoothTime` feel.
   Panel re-arrangement eases like sliding a bench, never snaps (400–600 ms, `maath` damp).
   The grabbed panel lifts ~6 cm and tilts ~4° toward you — picked up, not teleported.
   `prefers-reduced-motion` collapses all of it to instant cuts, honestly and completely.
7. **Sound stays sparse.** Reuse the existing chime family: `two-note` on dock (a panel
   settling into its slot), nothing on swipe (the glide is the feedback). No new clips, no
   `chime` union amendment this phase.
8. **Honest darkness.** A disconnected Agenda panel renders its frame dark and one engraved
   line ("*The agenda is dark. Connect Google Calendar on the Page.*"); an empty panel gets a
   quiet aside ("*The day is clear.*" pattern). The world never begs and never OAuths.

---

## 3. CONTRACTS — FROZEN, AMENDED, AND NEW

### 3.1 Frozen Phase-1/2 contracts this phase builds AGAINST (unchanged)

- `cameraBus: { flyTo(pose, ms?): Promise<void> }` — the ONLY camera authority. All swipe/
  summon glides go through it.
- `worldEvents` emitter mechanics — amended by −1 name (§3.2); the five Phase-1 names and the
  `chime` kind union are untouched.
- The hologram shader treaty (`materials/hologram.ts`) — the panel frame uses
  `makeHologramMaterial` as-is (no new shader chunks this phase; no treaty extension needed).
- `heroGlass()` ≤3 registry — after demolition the registry holds 2 (focused lantern, Jarvis
  ribbon); the freed slot's use is Gate Q7.
- Demand-mode / idle→0-rAF doctrine, `PerfGovernor`, reduced-motion seam, boot gate
  (`bootDone()`), `PostFX` last / `JarvisRing` immediately before it — all law, all inherited.
- The shared-cache discipline and the code-split boundary (zero three imports outside
  `components/world/**`).

### 3.2 Orchestrator AMENDMENTS to frozen contracts (all owned by unit W-01, one amendment commit)

Per the README's rule, W-01 lands exactly one commit amending the frozen artifacts:

1. **`focusStack`: ring out, widget in** (`camera/useFocusStack.ts`):

```ts
type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string }
  | { kind: "widget"; widgetId: WidgetId };   // NEW — rank 1 (sibling of bough)
// { kind:"ring" } and its rank cases are REMOVED with the meridian.
```

Rank 1 means: focusing a widget from a bough (or vice versa) is one truncate+glide, no phantom
depth; `Esc` from a widget pops to vestibule. `sameLevel` gains the widgetId comparison.
Push/pop/truncate semantics stay byte-identical.

2. **`worldEvents`: 6 → 5 names** (`data/diffing.ts`): `"meridian-toll"` is removed with its
emitter (`TollScheduler`) and consumers. The bus returns to the five Phase-1 names. No new
names are added this phase — widget drag/dock intents ride the new module-singleton
`widgetBus` (§3.5), per the audit's explicit instruction. `diffEventSnapshots` (the event
differ) is KEPT — the Agenda panel uses it to know when a Jarvis-created event appears (a row
shimmer, W-09).

3. **`WorldData`: honest rename + additive extension** (`data/useWorldData.ts` +
`data/WorldDataProvider.tsx` + the `initialMeridian` prop chain through
`world/page.tsx → WorldLoader → WorldCanvas → WorldScene`):

```ts
interface WorldData {
  // ...Phase-1 fields byte-identical...
  calendar: CalendarData;        // RENAMED from `meridian` (same shape; MeridianData → CalendarData,
                                 // MeridianSeed → CalendarSeed, initialMeridian → initialCalendar)
  habits: HabitsData;            // NEW
  journal: JournalTodayData;     // NEW
}
interface HabitsData {
  habits: HabitWithAreas[];                    // tableKey("habits", userId)
  completions: HabitCompletionRow[];           // [...tableKey("habit_completions"), windowStart, today]
  windowStart: string;                         // ymd, derived from todayYmd
}
interface JournalTodayData {
  entry: JournalEntryRow | null;               // ["journaling", userId, todayYmd]
}
```

(Executor note: the exact row types come from the server actions' return types — import them,
don't redeclare. The rename is mechanical: the only live consumers of `meridian.*` after
demolition are `text/Ledger.tsx`'s next-event clause and the new Agenda panel.)

### 3.3 THE `<WorldPanel>` CONTRACT — the frozen primitive (owned by W-03, frozen at Wave W1 close)

`panels/WorldPanel.tsx`, factored out of `TodayPanel.tsx`. Everything every widget shares
lives here; widgets provide only their content and their data wiring.

```ts
export type WidgetId = "tasks" | "captures" | "agenda" | "habits" | "journal";
// The union grows additively per new widget unit (an orchestrator amendment).

export interface WorldPanelProps {
  widgetId: WidgetId;
  title: string;                       // header caption, EB-Garamond-adjacent uikit bold
  countChip?: string;                  // optional right-aligned brass chip ("6 due")
  status?: "ready" | "empty" | "disconnected";  // drives the honesty states (§2.8)
  emptyLine?: string;                  // the quiet aside shown when status === "empty"
  disconnectedLine?: string;           // the engraved nudge when "disconnected"
  focused: boolean;                    // from the rig; drives frame rim lift + LOD (§7.2)
  lod: "full" | "placard";             // from the rig; placard = frame + SDF title only
  slot: BenchSlot;                     // position/rotation from the layout solver (§3.4)
  dragHandleProps?: DragHandleProps;   // from useWidgetDrag (W-07); undefined = not draggable yet
  children: ReactNode;                 // uikit Container/Text/Button content ONLY
}
export function WorldPanel(props: WorldPanelProps): JSX.Element;
export const PANEL_ROW_CAP = 12;       // every widget caps rows and renders "and N more"
```

**Binding rules baked into the primitive (not re-decided per widget):**
- **Anchoring:** a fixed world-anchored `<group position={slot.position} rotation={slot.rotation}>`
  — NEVER camera-attached (the TodayPanel rationale, verbatim: camera-tracking would need a
  per-frame transform write and break demand-mode idle). During a drag, the rig — not the
  panel — animates the group transform; at rest it is static again.
- **Body:** one uikit `<Root sizeX≈1.6 sizeY≈1.1 …>` with the TodayPanel skin constants
  (deep-vellum `opacity 0.7`, brass `borderWidth 1`, `borderRadius 16`, `padding 24`); header
  row + brass rule + scrollable content region are provided; widgets fill the content region.
- **Frame:** one shared-geometry frame mesh (top/bottom brass rails + corner tabs, ~600 tris)
  with a module-singleton `makeHologramMaterial({ tint: brass, rimColor: candleflame })`;
  `focused` mutates `material.userData.rimUniforms` values only (no material churn).
- **Placard LOD:** when `lod === "placard"` the `<Root>` does not mount; instead one SDF
  `<Text>` (EB Garamond, the widget title) floats in the frame. This is the draw-call answer
  (§7.2). Switching LOD is a mount change at interaction cadence — never per-frame.
- **Data/interaction seam:** widgets read `useWorldData()` in render (memoized derivations,
  never per-frame) and write through 2D server actions + `queryClient.invalidateQueries` on
  the identical key, with the optimistic local-Set pattern where the 2D client uses one.
  The primitive itself touches NO data.
- **Interaction plumbing:** uikit pointer events work as-is (TodayPanel `<Button>` precedent).
  `event.stopPropagation()` inside panel content so panel clicks don't fall through to
  world picking. Clicking a placard-LOD panel pushes `{kind:"widget", widgetId}` (summon).

### 3.4 The bench layout contract (`panels/widgetLayout.ts` — pure, zero `three` imports, owned by W-02, frozen at Wave W1 close)

**Invented — geometry defaults are Fable's proposal, tunable constants, not law; Gate Q4
confirms the arrangement model itself.**

```ts
export interface BenchConfig {
  center: Vector3Tuple;    // arc center ≈ the standing point; default [0, 0, 4.6]
  eyeY: number;            // panel center height; default 1.5 (TodayPanel precedent)
  radius: number;          // slot distance from center; default 3.0
  aisleRad: number;        // central gap toward the Tree; default 70° in radians
  maxSlots: number;        // 7 — the hard live-panel cap (§7.2)
}
export interface BenchSlot {
  index: number;                       // 0 = leftmost
  widgetId: WidgetId;
  position: Vector3Tuple;              // panel group transform (world space)
  rotation: Vector3Tuple;              // faces the arc center
  cameraPose: CameraPose;              // reading pose: at center, facing the slot, ~1.9 m
}
export function solveBenchLayout(order: WidgetId[], cfg?: Partial<BenchConfig>): BenchSlot[];
export function neighborOf(order: WidgetId[], current: WidgetId | null, dir: 1 | -1): WidgetId | null;
export function nearestSlotIndex(order: WidgetId[], yawRad: number, cfg?: Partial<BenchConfig>): number;
// nearestSlotIndex: used by the drag drop-resolution (yaw of the drag ray → slot index).
```

Slots distribute symmetrically on the arc left and right of the aisle; the aisle keeps the
Tree (trunk at origin) framed dead-center from the vestibule pose. With 5 widgets: two panels
per side plus one at either shoulder. `TodayPanel`'s current pose (`[-1.85, 1.5, 1.5]`,
yaw 0.42) is deliberately inside the solver's reachable family — slot poses are a
generalization of the one pose already proven to read well.

### 3.5 The widget bus (`panels/widgetBus.ts` — module singleton, pattern: `jarvisWorldBus`; owned by W-02 as interface, implemented by W-06/W-07; frozen at Wave W1 close)

```ts
export type WidgetBusEvent =
  | { kind: "drag-start"; widgetId: WidgetId }
  | { kind: "drag-move"; widgetId: WidgetId; yawRad: number }     // pointer ray yaw around center
  | { kind: "drag-drop"; widgetId: WidgetId; toIndex: number }
  | { kind: "docked"; widgetId: WidgetId };                        // after the settle animation
export interface WidgetBus {
  emit(e: WidgetBusEvent): void;
  subscribe(fn: (e: WidgetBusEvent) => void): () => void;
}
export const widgetBus: WidgetBus;
```

Focus/navigation state does NOT live here — it stays in `focusStack` (one navigation truth).
The bus exists only for the drag choreography (drag hook → rig re-pose → dock chime) — exactly
the audit's "separate module singleton, not a 7th worldEvents name."

### 3.6 The layout persistence contract (owned by W-04; **store choice is Gate Q1**)

**Invented — flagged.** Default proposal: versioned localStorage, schema designed so a
`users.world_layout` JSONB column is a drop-in upgrade later.

```ts
// localStorage key: "world:widgetLayout@1"
export interface WidgetLayoutV1 {
  v: 1;
  order: WidgetId[];        // arc order, index 0 = leftmost slot
  hidden: WidgetId[];       // dismissed from the bench (summonable via key/Jarvis later)
}
export function loadWidgetLayout(): WidgetLayoutV1;   // validates + falls back to DEFAULT_LAYOUT
export function saveWidgetLayout(l: WidgetLayoutV1): void;
export const DEFAULT_LAYOUT: WidgetLayoutV1;          // ["tasks","captures","agenda","habits","journal"], hidden: []
export function useWidgetLayout(): {                  // useSyncExternalStore over a module store
  layout: WidgetLayoutV1;
  moveWidget(id: WidgetId, toIndex: number): void;    // reorder + persist + notify
};
```

Unknown widget ids on load (from a future version) are dropped silently; missing ids are
appended in DEFAULT order — the store never crashes the world. If Gate Q1 picks the DB column,
`loadWidgetLayout` becomes a provider-seeded read and `saveWidgetLayout` a debounced server
action; the interface above is written so ONLY W-04's file changes.

### 3.7 The widget registry (`panels/widgetRegistry.ts` — owned by W-02, frozen at Wave W1 close)

```ts
export interface WidgetSpec {
  id: WidgetId;
  title: string;
  component: ComponentType<{ focused: boolean }>;   // renders INSIDE WorldPanel's content region…
  // …no: each widget file exports a self-contained component that renders <WorldPanel> itself
  // with its own content — see the per-unit specs. The registry maps id → component + title:
}
export const WIDGET_REGISTRY: Record<WidgetId, WidgetSpec>;
```

Each widget component receives `{ slot, focused, lod, dragHandleProps }` from the rig and
renders `<WorldPanel …>` with its content. The registry is the single place the roster grows.

### 3.8 Module layout & mounting (collision-free)

```
apps/web/components/world/panels/
  WorldPanel.tsx        widgetLayout.ts       widgetRegistry.ts     widgetBus.ts
  widgetLayoutStore.ts  WidgetRig.tsx         useWidgetDrag.ts
  TasksWidget.tsx       CapturesWidget.tsx    HabitsWidget.tsx      JournalWidget.tsx
  agenda/AgendaWidget.tsx   agenda/agendaLogic.ts   agenda/__tests__/agendaLogic.test.ts
  __tests__/widgetLayout.test.ts  __tests__/widgetLayoutStore.test.ts
  (TodayPanel.tsx is DELETED once TasksWidget lands — W-05)
```

Amended existing files (each owned by exactly one unit, per wave): `data/diffing.ts`,
`data/useWorldData.ts`, `data/WorldDataProvider.tsx`, `camera/useFocusStack.ts`,
`camera/CameraRig.tsx`, `app/(app)/world/page.tsx`, `WorldLoader.tsx`, `WorldCanvas.tsx` (all
W-01, wave W1); `camera/CameraRig.tsx` + `camera/useWorldKeys.ts` (W-06, wave W2);
`panels/WidgetRig.tsx` (W-07, wave W3); `text/Ledger.tsx` (W-01, rename only);
`boot/Litany.tsx` copy (W-13); `components/world/README.md` (W-16).

**Mounting rule (Phase-1/2 doctrine, restated):** unit agents NEVER touch `WorldScene.tsx`.
The **Conductor** mounts/unmounts at wave boundaries:

```
Wave W1 close:  REMOVE <MeridianRing/> <EventTablets/> <PlumbLine/> <MeridianLabels/>
                <TollScheduler/> <MeridianAudio/> (the demolition commit rides with W-01)
Wave W2 close:  REMOVE <TodayPanel/>; ADD <WidgetRig/> after <Embers/>, before <CameraRig/>
                (panels are pickables). <JarvisRing/> stays immediately before <PostFX/>;
                <PostFX/> stays last. No exceptions.
```

---

## 4. THE SPATIAL & NAVIGATION MODEL

### 4.1 The workbench arc (arrangement)

Panels stand on a **fixed arc of bench slots** around the standing point (the vestibule),
each a static world-anchored group facing the arc center — the TodayPanel placement pattern,
multiplied and solved by `solveBenchLayout`. The camera never carries panels; panels never
track the camera. This is the audit's "strongest-fit" model and it preserves both the
no-per-frame-writes contract and the demand-mode idle for free. The alternative (a rotating
carousel) is REJECTED per the audit — it reintroduces continuous per-frame work.

### 4.2 The Tree is the hub (the opinionated call)

**Decision: the Tree stays the room's centerpiece and its map; the bench wraps around YOU, not
around it.** The arc's central aisle (default 70°) keeps the trunk, boughs, lanterns, embers,
and fireflies framed dead-ahead from the vestibule — you work at benches with your life's tree
standing in the middle of the workshop, exactly the thing Filippo has always loved, undiminished.
Navigation into the tree is unchanged: click a bough / press `1–9` → bough focus; click a
lantern → lantern focus. Widget focus and bough focus are rank-1 siblings on the stack, so
moving between "working at a bench" and "walking into the tree" is always one glide, and `Esc`
always walks home. The tree does NOT become a widget, does not shrink, does not move.
*(Gate Q4 lets Filippo overrule this; W-17 stretch adds the cross-link where focusing a bough
scopes the Tasks panel to that area.)*

### 4.3 Swipe (navigation between panels)

- **Model:** swiping = `focusStack.push({kind:"widget", widgetId: neighborOf(order, current, dir)})`
  → CameraRig's existing focus→pose effect → `cameraBus.flyTo(slot.cameraPose)` (~700 ms felt
  glide; reduced-motion = instant cut, inherited).
- **Inputs (W-06):**
  - **Wheel/trackpad:** the ring scrub's death frees the wheel. A capture-phase `wheel`
    listener on the canvas treats a **horizontal-dominant** gesture (`|deltaX| > |deltaY|`,
    accumulated past a ~60 px threshold, then debounced ~350 ms) as one discrete swipe.
    Vertical wheel is untouched — it remains CameraControls dolly in open space and uikit
    scroll when the pointer is over a panel (uikit handles its own scroll; the listener
    ignores vertical entirely). Two-finger horizontal swipe on macOS IS a wheel event — no
    gesture lib.
  - **Keys:** `←`/`→` = prev/next panel; `C` = summon the Agenda panel (muscle-memory
    preserved from the ring); `Esc` pops (existing); `1–9` boughs (existing, untouched). All
    inside the ONE `useWorldKeys` listener, behind the existing typing guard and boot gate.
  - **Pointer:** clicking any unfocused panel (full or placard) summons it.
- **At vestibule** (nothing focused), a swipe focuses the nearest panel on that side; swiping
  "past the end" of the arc is a soft no-op (a ~4° camera nudge-and-return, reduced-motion:
  nothing).

### 4.4 Grab-and-move (the meatiest NET-NEW mechanic — designed, and gated)

**MVP scope decision: slot reordering on the arc, not free placement.** (Gate Q3; free
placement is stretch W-18.) Rationale: discrete slots keep panels static-at-rest (perf law),
make persistence trivial and robust (`order: WidgetId[]`), and still deliver the felt promise
— *my bench, my arrangement*.

The interaction (W-07, `useWidgetDrag.ts` + `WidgetRig` integration — **invented, flagged**):

1. **Grab:** the panel header carries a drag affordance (`⠿`-style grip drawn as bordered
   uikit containers — no glyph risk). `pointerdown` on the grip → `widgetBus.emit({kind:"drag-start"})`.
   The rig lifts the panel ~6 cm, tilts it ~4° toward the camera (damped spring, self-invalidating),
   and dims the other panels' rims. `setPointerCapture` on the canvas for the duration.
2. **Move:** `pointermove` → unproject the pointer ray onto the arc cylinder (radius from
   `BenchConfig`) → a yaw angle → `widgetBus.emit({kind:"drag-move", yawRad})`. The dragged
   panel's group follows the yaw along the arc (frames demanded only while dragging — the
   drag loop is self-invalidating with early exit). Other panels **preview-shift**: the rig
   computes the would-be order via `nearestSlotIndex` and eases displaced panels toward their
   preview slots (400 ms damp).
3. **Drop:** `pointerup` → `nearestSlotIndex` resolves the final index →
   `useWidgetLayout().moveWidget(id, toIndex)` (persist + notify) → the rig re-solves
   `solveBenchLayout(order)` and eases every panel to its final slot → on settle,
   `widgetBus.emit({kind:"docked"})` → one `two-note` chime. If focus was on the dragged
   widget, CameraRig re-glides to its new `cameraPose`.
4. **Reduced motion:** no lift/tilt/preview animation — the drag ghost is a frame-only outline
   at the candidate slot; drop applies the new order as an instant cut.
5. **Cancel:** `Esc` during a drag aborts and eases the panel home without persisting.

**Persistence:** `WidgetLayoutV1` (§3.6) written on drop. Store = localStorage by default,
**Gate Q1 decides** (options include a `users` JSONB column and a `world_layout` table — see
§9). The world reads the layout once at mount via `useWidgetLayout`; there is no cross-tab
sync requirement in MVP (single user, and the world is one tab at a time in practice).

---

## 5. THE MERIDIAN DEMOLITION (file-level, precise)

All demolition is owned by **W-01** (one focused sequence of commits in wave W1), because every
deletion touches the same frozen seams the amendment commit already owns.

### 5.1 EXTRACT FIRST (survivors move before anything burns)

| Survivor | From | To | Notes |
|---|---|---|---|
| `classifyTablet` (→ rename `classifyEvent`), its `TabletState` union (→ `EventTiming`: `past/current/imminent/upcoming`), the time-window helpers it needs | `meridian/meridianLayout.ts` | `panels/agenda/agendaLogic.ts` | Representation-agnostic; the Agenda rows use it verbatim (imminent rows get the candleflame accent). Tests move with it. |
| `linkEventToProject` (the conservative title→project/course-code linker) | `meridian/meridianLayout.ts` | `panels/agenda/agendaLogic.ts` | Feeds the area-hue tint on Agenda rows. Tests move with it. |
| `calendarDotColor` (+ `PARCHMENT_HEX` if referenced) | `meridian/meridianMappings.ts` | `panels/agenda/agendaLogic.ts` | The calendar dot on Agenda rows. |
| The entire gcal data bridge (provider slice, SSR seed, `diffEventSnapshots`, `useGcalConnectionStatus` wiring) | `data/`, `world/page.tsx` | stays in place | Renamed `meridian` → `calendar` per §3.2; otherwise byte-identical. |
| `public/world/sfx/ring-toll.mp3` + license note | — | stays on disk | Unused this phase; reserved for a future generic reminder chime. Documented as such in W-16. |

### 5.2 DELETE (the annulus presentation, ~4,100 LOC)

`meridian/MeridianRing.tsx`, `meridian/EventTablets.tsx`, `meridian/useRingScrub.ts`,
`meridian/MeridianLabels.tsx`, `meridian/PlumbLine.tsx`, `meridian/TollScheduler.tsx`,
`meridian/MeridianAudio.tsx`, `meridian/meridianPoses.ts`, `meridian/meridianHover.ts`,
`meridian/meridianBus.ts`, `meridian/meridianGeometries.ts`, `meridian/meridianMaterials.ts`,
`meridian/meridianMappings.ts` (post-extraction), `meridian/meridianLayout.ts`
(post-extraction), `meridian/__tests__/*` (post-move) — **the `meridian/` directory ceases to
exist.** Git history is the archive *(Gate Q8 offers keep-as-ambient-clock as an alternative)*.

### 5.3 SURGICAL REMOVALS in kept files (W-01 owns each, wave W1)

- `camera/CameraRig.tsx`: delete `setRingScrubActive` (verified export, line ~233) and the two
  ring `poseForFocus` cases + the `meridianPoses` import. The widget pose case arrives in
  wave W2 (W-06) — W-01 leaves the `FocusLevel` exhaustiveness compiling with a temporary
  vestibule-pose fallback for `"widget"` (explicitly commented as W-06's seam).
- `camera/useWorldKeys.ts`: the `C` → ring handler body is emptied to a no-op with a
  `// W-06 re-points to Agenda` comment (W-06 owns this file in wave W2; W-01 must not
  collide — if the deletion graph makes the no-op awkward, the Conductor may instead sequence
  the `C` re-point into the W-01 commit; executor's call, one owner per wave preserved).
- `data/diffing.ts`: remove `"meridian-toll"` (bus → 5 names). Keep `diffEventSnapshots`.
- `camera/useFocusStack.ts`: remove the ring level; add the widget level (§3.2).
- `data/useWorldData.ts` / `data/WorldDataProvider.tsx` / `WorldLoader.tsx` / `WorldCanvas.tsx`
  / `app/(app)/world/page.tsx`: the `meridian→calendar` rename + the habits/journal
  additions (§3.2, §1.2).
- `text/Ledger.tsx`: mechanical rename of its `meridian.events` read to `calendar.events`
  (the next-event clause SURVIVES — it's good).
- `WorldScene.tsx`: the six meridian mounts removed by the **Conductor** at wave W1 close.
- `components/world/README.md`: the meridian section is rewritten by W-16 at closeout (interim
  inaccuracy tolerated mid-phase, as in Phase 2).

---

## 6. WORK-UNIT DECOMPOSITION

### Dependency graph & waves (file-disjoint within every wave)

```
WAVE W1 (parallel, foundational)
  W-01 demolition-and-amendments      (meridian delete, contract amendments, provider+SSR additions, agendaLogic extraction)
  W-02 bench-solver-and-contracts     (widgetLayout.ts, widgetRegistry.ts, widgetBus.ts interface+impl, tests)
  W-03 worldpanel-primitive           (WorldPanel.tsx + frame material/geometry + LOD + honesty states)
  W-04 layout-persistence             (widgetLayoutStore.ts + useWidgetLayout + tests)

WAVE W2 (parallel; depends only on W1)
  W-05 tasks-widget          [W-01,02,03]
  W-06 widget-rig-and-nav    [W-01,02,03,04]   (WidgetRig.tsx, CameraRig widget pose, useWorldKeys, wheel-swipe)
  W-08 captures-widget       [W-01,02,03]
  W-09 agenda-widget         [W-01,02,03]

WAVE W3 (parallel; depends on W2)
  W-07 grab-and-move         [W-04,06]         (useWidgetDrag.ts + WidgetRig drag integration + dock chime)
  W-10 habits-widget         [W-01,02,03]
  W-11 journal-widget        [W-01,02,03]
  W-12 focused-hero-glass    [W-03,06]         (gate-conditional: only if Q7 = yes)
  W-13 greeting-and-sounds   [W-06]

WAVE W4 (sequential closeout)
  W-14 honesty-sweep         [all W2/W3]
  W-15 perf-hardening        [all]
  W-16 docs-changelog        [all]

WAVE W5 (STRETCH — Gate decides; independently shippable)
  W-17 tree-crosslink        [W-05,06]         (bough focus scopes the Tasks panel)
  W-18 free-placement        [W-07]            (continuous-angle arrangement)
```

### Unit index

| ID | Slug | One-line scope | Difficulty | Model |
|---|---|---|---|---|
| W-01 | demolition-and-amendments | Delete `meridian/` (post-extraction), the one amendment commit (focusStack, worldEvents −1, WorldData rename+extend), provider/SSR habits+journal queries, agendaLogic extraction | 0.7 | Opus xhigh |
| W-02 | bench-solver-and-contracts | Pure arc solver + registry + widgetBus + Vitest suite | 0.5 | Opus xhigh |
| W-03 | worldpanel-primitive | `<WorldPanel>` extracted from TodayPanel: skin, frame mesh, LOD, honesty states | 0.75 | Opus xhigh |
| W-04 | layout-persistence | Versioned localStorage store + `useWidgetLayout` + validation + tests | 0.4 | Opus xhigh |
| W-05 | tasks-widget | TodayPanel reborn as `TasksWidget` on the primitive; TodayPanel deleted | 0.45 | Opus xhigh |
| W-06 | widget-rig-and-nav | `WidgetRig` mount, CameraRig widget pose case, ←/→ + `C` keys, wheel-swipe listener | 0.75 | Opus xhigh |
| W-07 | grab-and-move | Drag lifecycle: grip → arc-follow → preview-shift → drop → persist → dock chime | 0.85 | Opus xhigh |
| W-08 | captures-widget | Captures inbox rows + tag chips + row affordances via 2D actions | 0.55 | Opus xhigh |
| W-09 | agenda-widget | Flat calendar panel on the calendar slice + agendaLogic; connection honesty | 0.6 | Opus xhigh |
| W-10 | habits-widget | Today's habit grid + `toggleHabitCompletion` through the shared cache | 0.55 | Opus xhigh |
| W-11 | journal-widget | Today's entry read (plain-text extraction) + open-on-Page affordance | 0.5 | Opus xhigh |
| W-12 | focused-hero-glass | Glass backplate behind the focused panel (freed heroGlass slot; swap-on-focus) | 0.4 | Opus xhigh |
| W-13 | greeting-and-sounds | Litany greeting copy for the bottega; dock chime wiring polish | 0.2 | Opus xhigh |
| W-14 | honesty-sweep | Reduced-motion + connection/empty states across every panel and the drag | 0.4 | Opus xhigh |
| W-15 | perf-hardening | §7 verification: draw-call audit, idle audit, swipe/drag fps protocol | 0.5 | Opus xhigh |
| W-16 | docs-changelog | README rewrite (meridian section → bench section), CHANGELOG, `.planning` state | 0.1 | Sonnet |
| W-17 | tree-crosslink (STRETCH) | `{kind:"bough"}` focus scopes TasksWidget to that area | 0.5 | Opus xhigh |
| W-18 | free-placement (STRETCH) | Continuous-angle arrangement + `angles` map in the layout schema | 0.7 | Opus xhigh |

**Model routing doctrine (restated):** Opus xhigh executes ALL code. Sonnet writes docs (W-16
only). No asset unit this phase (sounds are reused), so no Haiku slot.

---

### W-01 · demolition-and-amendments — difficulty 0.7

- **Purpose:** clear the ground and re-plumb the seams in one owned sweep: the meridian
  presentation dies, its data bridge survives under an honest name, and the two new data
  surfaces (habits, journal) join the provider.
- **Files:** everything in §5 plus `data/WorldDataProvider.tsx`, `data/useWorldData.ts`,
  `app/(app)/world/page.tsx`, `WorldLoader.tsx`, `WorldCanvas.tsx`, `text/Ledger.tsx`,
  `panels/agenda/agendaLogic.ts` (new), `panels/agenda/__tests__/agendaLogic.test.ts` (moved).
- **Build order (commits per logical unit, per the repo's commit-often law):**
  1) extract `agendaLogic.ts` + move its tests (green before anything is deleted);
  2) the ONE orchestrator amendment commit (focusStack widget level, worldEvents 6→5,
     `WorldData` rename+extend per §3.2);
  3) delete `meridian/` + the surgical removals in CameraRig/useWorldKeys (§5.3);
  4) provider additions: habits pair query + journal-today query with the exact keys of §1.2,
     `useTableSubscription` channels, memoized `habits`/`journal` slices, `invalidate()` on
     identity change (existing pattern);
  5) SSR seeds for habits/journal in `world/page.tsx` (mirror the `initialTasks` pipeline);
  6) Ledger rename.
- **Perf constraints:** zero new intervals (habits window derives from the existing `todayYmd`
  clock); the two new queries are the only new network surfaces.
- **Acceptance:** `tsc`/build/Vitest green with `meridian/` gone; grep proves no
  `meridian`-named import survives outside `.planning`; `/world` SSR carries habits + journal
  seeds; `worldEvents` has exactly 5 names; `focusStack` compiles with `"widget"` and without
  `"ring"`; the Ledger still speaks the next-event clause.

### W-02 · bench-solver-and-contracts — difficulty 0.5

- **Purpose:** all bench math and the phase's shared contracts as pure, tested modules.
- **Files:** `panels/widgetLayout.ts`, `panels/widgetRegistry.ts`, `panels/widgetBus.ts`,
  `panels/__tests__/widgetLayout.test.ts`.
- **Spec:** §3.4/§3.5/§3.7 verbatim. Zero `three` imports (tuple math only — mirror
  `treeLayout.ts` discipline). The solver must be total for 1..7 widgets and deterministic;
  `cameraPose` for each slot places the eye at `center + eyeY`, target at the slot, distance
  ~1.9 m, slight downward pitch (panel center at eye height reads flat).
- **Acceptance (Vitest):** slot symmetry around the aisle; aisle clearance (no slot within
  `aisleRad/2` of the tree azimuth); `neighborOf` wraps correctly at ends (returns null past
  the edge — the §4.3 soft no-op); `nearestSlotIndex` truth table incl. yaws inside the aisle
  (resolves to the adjacent edge slot); 7-widget layout stays within the arc.

### W-03 · worldpanel-primitive — difficulty 0.75 (the phase's keystone)

- **Purpose:** the frozen primitive of §3.3 — everything TodayPanel proved, generalized once.
- **Files:** `panels/WorldPanel.tsx` (+ module-local frame geometry/material constants inside
  it or a sibling `panelFrame.ts` — executor's call, one file preferred).
- **Spec:** §3.3 verbatim. Read `TodayPanel.tsx` FIRST and lift its skin constants, ROW_CAP
  doctrine, `PanelClick` typing, glyph workarounds, and perf comments — the primitive's JSDoc
  should carry the same contract language. The frame: shared `ExtrudeGeometry`/box-composite
  singleton, ONE `makeHologramMaterial` module singleton shared by all frames (per-panel rim
  lift mutates a cloned uniforms object ONLY on the focused panel's material instance —
  executor may use 2 material instances total: `frameIdle`, `frameFocused`, swapped on focus
  at interaction cadence; never per-frame).
- **Perf constraints:** placard LOD ≤4 draw calls (frame ≤2 + one SDF Text + nothing else);
  full panel ≤22 (uikit Root batches + frame); no per-frame work anywhere in the file.
- **Acceptance:** a dev harness (Vitest + a manual story in comments) renders a full panel and
  a placard; toggling `focused` swaps rim state without material recompile; `status`
  variants render the §2.8 lines; TodayPanel's visual identity is preserved side-by-side.

### W-04 · layout-persistence — difficulty 0.4

- **Purpose:** §3.6 verbatim — the store the bench remembers itself with.
- **Files:** `panels/widgetLayoutStore.ts`, `panels/__tests__/widgetLayoutStore.test.ts`.
- **Spec:** module store + `useSyncExternalStore` hook (the `focusStack` pattern, verbatim
  discipline: stable snapshots, new array identity per mutation). Validation: unknown ids
  dropped, missing ids appended, malformed JSON → DEFAULT_LAYOUT. SSR-safe (no window →
  DEFAULT). `moveWidget` clamps `toIndex`.
- **Acceptance (Vitest):** round-trip; corruption fallback; forward-compat (a `v:2` blob with
  unknown fields → graceful DEFAULT or best-effort per validation rules); `moveWidget`
  reorder truth table.

### W-05 · tasks-widget — difficulty 0.45

- **Purpose:** the template becomes the first citizen: TodayPanel's content on the primitive.
- **Files:** `panels/TasksWidget.tsx` (new); DELETE `panels/TodayPanel.tsx`.
- **Spec:** content = TodayPanel's rows verbatim (today+overdue, overdue-first sort,
  optimistic `checkedOff` Set, `updateTaskStatus` + `tableKey("tasks", userId)` invalidation,
  ROW_CAP + "and N more"). Registers in `WIDGET_REGISTRY` as `"tasks"`, title "Tasks". The
  empty line stays *"The day is clear."*
- **Acceptance:** completing a task from the panel ascends the ember (the full Phase-1 loop,
  re-verified); the panel renders identically to TodayPanel modulo the frame; TodayPanel is
  gone and nothing imports it.

### W-06 · widget-rig-and-nav — difficulty 0.75

- **Purpose:** the bench comes alive: the rig that mounts panels on slots, and every way to
  move between them.
- **Files:** `panels/WidgetRig.tsx` (new), `camera/CameraRig.tsx` (widget pose case),
  `camera/useWorldKeys.ts` (←/→, `C`), plus the wheel listener (inside WidgetRig or a
  `useWheelSwipe` local hook — same file).
- **Spec:** WidgetRig reads `useWidgetLayout()` + `useFocusStack()` + `WIDGET_REGISTRY`,
  computes `solveBenchLayout(order)` (memoized on order identity), and renders each visible
  widget component with `{slot, focused, lod}`. LOD rule (§7.2): focused + immediate
  neighbors = `"full"`; others = `"placard"`; nothing focused (vestibule) = the DEFAULT trio
  centered on the arc middle is full. CameraRig: `poseForFocus` gains
  `case "widget": slotFor(widgetId).cameraPose` (rig exposes a module-level
  `getBenchSlot(widgetId)` getter so CameraRig doesn't import React state — mirror how
  lantern poses resolve today; executor reads `lanternFocusPose` first). Keys per §4.3.
  Wheel per §4.3 (horizontal-dominant, threshold+debounce, boot-gated, typing-guarded).
- **Perf constraints:** LOD switches and focus changes are interaction-cadence mount/prop
  changes; the wheel listener allocates nothing per event; no `useFrame` in this unit at all
  (the glide belongs to cameraBus).
- **Acceptance:** five panels stand on the arc with the Tree clear down the aisle; ←/→ and
  two-finger swipe glide bench-to-bench in ~700 ms; `C` summons Agenda; `Esc` walks home;
  `1–9` still fly to boughs; reduced-motion cuts instantly; after any glide settles, rAF
  returns to idle-zero.

### W-07 · grab-and-move — difficulty 0.85 (the crown jewel of the phase)

- **Purpose:** §4.4 in full — the mechanic that makes the bench *yours*.
- **Files:** `panels/useWidgetDrag.ts` (new), `panels/WidgetRig.tsx` (drag integration — owned
  by this unit in wave W3).
- **Spec:** §4.4 steps 1–5 verbatim. The drag loop is the phase's ONLY new `useFrame`
  consumer: self-invalidating while `dragging`, early-exits on settle (the Phase-2 scrub-loop
  pattern — read `useRingScrub`'s loop shape in git history if helpful, or the ember ascent
  runtime). Ray→arc math: intersect the pointer ray with the vertical cylinder of radius
  `BenchConfig.radius` about `center`; take the yaw of the near intersection;
  `nearestSlotIndex(yaw)`. Preview-shift eases via `maath` damp on group positions
  (preallocated scratch). Dock chime: `worldEvents.emit("chime", {kind:"two-note"})` on
  `docked` (existing name, no amendment). Guard rails: drags ignored before `boot-complete`;
  pointer leaving the canvas = drop-in-place; panel content pointer events suppressed during
  a drag (uikit `pointerEvents:"none"` toggle or a rig-level flag — executor picks the
  cleaner; document it).
- **Acceptance:** grab Habits, carry it across the arc — panels preview-shift out of the way;
  release — everything settles with the chime; reload `/world` — the arrangement persists;
  `Esc` mid-drag cancels cleanly; reduced-motion path per §4.4.4; after settle, idle rAF is
  zero; 20 s of continuous drag-thrash ≥58 fps.

### W-08 · captures-widget — difficulty 0.55

- **Purpose:** the inbox on the bench — fireflies get their ledger.
- **Files:** `panels/CapturesWidget.tsx`.
- **Spec:** rows from the provider's captures slice (already mounted, key
  `[...tableKey("captures", userId), null]`); newest-first, ROW_CAP. Row content: capture
  text (2-line clamp), age caption, hashtag chips (from `tableKey("hashtags", userId)` — this
  query is NOT yet in the provider; **add it via a small W-08-owned provider touch is
  FORBIDDEN (provider is W-01's file)** → instead W-01 adds the hashtags query in wave W1
  (append to its checklist) and W-08 only reads). Affordances: mirror the 2D `CapturesClient`
  row's primary actions with `updateCapture`/`deleteCapture` + the 2D invalidation pattern
  (executor opens `CapturesClient.tsx` first and copies; do not invent affordances the 2D app
  lacks). Empty line: *"Nothing drifting."*
- **Acceptance:** creating a capture in 2D (other tab) lands a row (and its firefly) live;
  resolving one from the panel removes it in both theatres; `capture-created` chime/firefly
  behavior is untouched (the differ is upstream and unaware of us).

### W-09 · agenda-widget — difficulty 0.6

- **Purpose:** the calendar as one honest panel — the Ring's soul without its scaffolding.
- **Files:** `panels/agenda/AgendaWidget.tsx`.
- **Spec:** reads `useWorldData().calendar` (§3.2). Rows: today + tomorrow (a "Today" /
  "Tomorrow" section header pair), each row = time range (12-h, user tz via the DTO's ISO
  offsets), title, calendar dot (`calendarDotColor`), area-hue accent when
  `linkEventToProject` hits (left border strip in the bough's OKLCH hue), `classifyEvent`
  states: `past` rows dimmed to sepia opacity, `current` row carries a candleflame left
  border, `imminent` (T-15) row's accent lifts. ROW_CAP with "and N more". All-day events =
  a thin banner row at the section top (cap 3, "+N" overflow). `diffEventSnapshots` in a
  data-change effect gives newly-appeared event rows a one-shot opacity shimmer (600 ms,
  self-terminating; reduced-motion: none). Reclassification rides the provider's minute tick
  (a `todayYmd`/minute-cadence derived value — no new interval). Connection honesty per §2.8:
  `status !== "connected"` → `WorldPanel status="disconnected"` with the engraved nudge; the
  panel never OAuths.
- **Acceptance:** rows match the 2D `/calendar` for the same window (spot-check 3 events);
  a class-coded event wears its bough hue; a Jarvis-created event shimmers in without reload
  (prefix invalidation, verified live in Phase 2, re-verified here); disconnect in Settings →
  the panel darkens within 60 s.

### W-10 · habits-widget — difficulty 0.55

- **Purpose:** today's habit grid, togglable from the world.
- **Files:** `panels/HabitsWidget.tsx`.
- **Spec:** reads `useWorldData().habits`. One row per active habit: name + a per-day tick
  strip for the trailing 7 days (bordered-container cells, filled = completed — no glyphs),
  today's cell is the interactive `<Button>`. Toggle calls `toggleHabitCompletion` with the
  2D optimistic/invalidation pattern (executor copies `HabitsClient`'s mutation handling,
  ~231–286). Streak caption if the 2D client computes one (copy the derivation; don't invent).
  Empty line: *"No habits kept yet."*
- **Acceptance:** ticking today syncs to the 2D `/habits` grid live and vice versa; the 7-day
  strip matches the 2D window for the same dates; ROW_CAP honored.

### W-11 · journal-widget — difficulty 0.5

- **Purpose:** today's page, glanceable; the Page remains the desk you write at.
- **Files:** `panels/JournalWidget.tsx`.
- **Spec:** reads `useWorldData().journal`. Entry exists → plain-text extraction (first ~12
  lines / ~600 chars, per §1.2's flagged honest note), word-count caption, and an "Open on
  the Page →" affordance that stores the journaling route and triggers the same navigation
  path as `ModeToggle` (executor reads `ModeToggle.tsx` and reuses its
  `sessionStorage['world:lastPageRoute']` + router mechanism rather than a bare
  `router.push`; the panel must not invent a second 2D↔3D doorway). No entry → status
  `"empty"`, line *"Today's page is blank."* + the same open-on-Page affordance. NO editing
  in-world this phase.
- **Acceptance:** writing in 2D journaling (other tab) updates the panel live (prefix
  invalidation on `["journaling", userId]`); the affordance lands on `/journaling` with
  today selected; rich-JSON content renders as legible plain text (or the degraded
  entry-exists state, decided and documented by the executor).

### W-12 · focused-hero-glass — difficulty 0.4 (**gate-conditional: build only if Q7 = backplate**)

- **Purpose:** the one true glass moment: the panel you're working at earns transmission.
- **Files:** `panels/FocusedPanelGlass.tsx` (mounted inside WidgetRig by the Conductor note,
  or rendered by WidgetRig directly — wave W3, W-07 owns WidgetRig, so this unit renders a
  SIBLING component and the Conductor mounts it; keep files disjoint).
- **Spec:** when `focus.kind === "widget"`, one rounded-slab mesh (~2 cm behind the focused
  panel's plane, 4% oversize) with `heroGlass({ tint: deepVellum })` — consuming the slot
  freed by the zenith tablet's death (registry: focused lantern + Jarvis ribbon + this = 3/3;
  lantern focus and widget focus are mutually exclusive stack levels, so in practice ≤2 + the
  ribbon are ever live — same swap-on-focus idiom as `Lanterns.tsx`, which the executor reads
  first). Mount/unmount at focus cadence; fade via opacity damp (300 ms, self-invalidating);
  reduced-motion: instant.
- **Acceptance:** the focused panel visibly deepens (refraction of the tree/room behind it);
  `heroGlass` dev registry never throws; swapping focus rapidly never double-mounts.

### W-13 · greeting-and-sounds — difficulty 0.2

- **Purpose:** the room learns its new name.
- **Files:** `boot/Litany.tsx` (copy strings only — the timeline/keyframes are FROZEN),
  plus the dock-chime wiring polish if W-07 left a TODO.
- **Spec:** greeting copy shifts from studiolo-contemplative to bottega-workshop (2–3 line
  change; keep EB Garamond diction; e.g. the closing line addresses "the bench is yours" —
  final copy is the executor's craft, reviewed at Gate). No structural edits.
- **Acceptance:** Litany runs byte-identically in timing; only strings changed.

### W-14 · honesty-sweep — difficulty 0.4 (Wave W4, sequential)

- **Purpose:** reduced-motion and state honesty across every new surface.
- **Spec:** audit every W2/W3 unit against `worldPrefersReducedMotion()`/`useWorldPrefs()`:
  swipe (instant cut — inherited, verify), drag (§4.4.4 ghost path), preview-shift (instant),
  dock (no chime suppression — sound is not motion, Phase-1 precedent), Agenda shimmer (off),
  frame rim transitions (instant), hero-glass fade (instant). Connection/empty states: every
  panel renders a designed `status` variant, never a blank slab; the Agenda nudge wording per
  §2.8. Boot gate: swipe/drag/keys inert until `boot-complete` (verify each).
- **Acceptance:** macOS Reduce Motion ON → zero glides/springs anywhere new, everything
  legible and operable; each panel's empty + disconnected states screenshot-reviewed at Gate.

### W-15 · perf-hardening — difficulty 0.5 (Wave W4)

- **Purpose:** prove §7. Extend the perf protocol with the bench section; record numbers.
- **Spec & acceptance:** run §7.4 on the target machine; `gl.info.render.calls` within
  budget in bench view; idle audit (10 s hands-off → rAF 0 ± firefly heartbeat ± 1 frame/min
  minute-tick); swipe marathon and drag-thrash fps floors met; `PerfGovernor` ladder still
  steps under synthetic GPU throttle; uikit re-layout spikes on data refetch stay <16 ms for
  ROW_CAP-sized panels (profile once, note the number).

### W-16 · docs-changelog — difficulty 0.1 · Sonnet

- README: delete the meridian section; add "The Workbench (Phase 3)" section (module map
  rows for `panels/`, the §3 contracts, the bench model, the LOD rule, the idle rule, the
  demolition changelog incl. the kept `ring-toll.mp3` note); CHANGELOG entry; `.planning`
  state note. Acceptance: a new engineer can add a "Nutrition widget" from the README alone.

### W-17 · tree-crosslink — difficulty 0.5 · **STRETCH (Gate decides)**

- When `focus.kind === "bough"`, the TasksWidget header gains the area's name in its OKLCH
  hue and its rows scope to that area's tasks (pure derivation off existing data — tasks know
  their projects, projects their areas via the tree). Pop to vestibule → unscoped. Zero new
  queries. The first true tree↔bench conversation.

### W-18 · free-placement — difficulty 0.7 · **STRETCH (Gate decides — do not start without approval)**

- `WidgetLayoutV1` → `V2` adds `angles?: Record<WidgetId, number>`; the drag drop no longer
  snaps to slots but persists the raw yaw (clamped outside the aisle, min-separation solved);
  `solveBenchLayout` honors explicit angles. Migration: `V1` blobs upgrade losslessly.

---

## 7. THE PERFORMANCE BUDGET (LAW — extends Phase-1 §7 and Phase-2 §4; enforced by W-15 + PerfGovernor)

### 7.1 THE TRANSMISSION-CAP RESOLUTION (the #1 wall, answered)

The `HERO_GLASS_CAP=3` registry was FULL (focused lantern, Jarvis ribbon, zenith tablet).
A bench of glassy panels cannot be transmission glass — and it will not be. The Stark-hologram
look is built from three cheap layers, and transmission is spent on exactly one moment:

> **The panel-material law:** panel BODIES are uikit translucency (deep-vellum `opacity 0.7`
> — the TodayPanel look, zero material budget). Panel FRAMES are `makeHologramMaterial`
> (fresnel rim + Bloom — the unlimited hologram recipe), shared as ≤2 material instances
> across ALL frames (idle/focused). True transmission (`heroGlass`) appears in the bench
> layer at most ONCE: the focused-panel backplate (W-12), occupying the slot FREED by the
> zenith tablet's demolition. Registry after Phase 3: focused lantern + Jarvis ribbon +
> focused-panel backplate = 3/3 — and because lantern-focus and widget-focus are mutually
> exclusive stack levels, at most 2 + ribbon are ever live simultaneously. No later phase
> may take a slot without freeing one (unchanged law).

### 7.2 Draw calls, triangles, memory (the panel-LOD law)

Each uikit `<Root>` owns its own draw batches (~15–22 calls for a ROW_CAP panel — the
Phase-1 budget line "panel ~20"). Seven full panels would blow the ceiling; therefore:

> **The bench LOD law:** at most **3 panels render full content** (the focused panel + its
> two arc neighbors; at vestibule, the central trio). All other bench panels render as
> **placards** (frame + one SDF title, ≤4 calls). LOD switches at focus/interaction cadence
> only. The live-widget cap is **7**.

| Item | Budget |
|---|---|
| Full panels (≤3 × ≤22, uikit batches + frame) | ≤66 |
| Placards (≤4 × ≤4) | ≤16 |
| Focused-panel hero backplate (W-12, if gated in) | 1 (+1 transmission pass) |
| Bench SDF `<Text>` (≤7 placard/panel titles — panels' own text is uikit, not SDF) | ≤7 |
| **Bench layer total** | **≤90** |
| **New scene ceiling (bench view)** | **≤190** (meridian's ≤170 retires with it; base scene minus TodayPanel's ~20 plus the bench) |
| Bench triangles (frames ~600 tris × 7 + backplate) | ≤8k (scene stays ≤300k) |
| New textures | ZERO |
| New dependencies | **ZERO** (uikit, uikit-default, maath, troika all already installed) |
| Live SDF `<Text>` ceiling | stays 40 (meridian's 11 die; bench adds ≤7) |

### 7.3 The idle-rAF rule (instantiation)

Panels at rest are static world objects: **zero per-frame work** (the TodayPanel gold
standard, now a contract of the primitive). uikit demands a frame per discrete change
(hover, refetch re-layout) then sleeps. The ONLY new continuous demand sources, all
self-terminating: (a) swipe glides (cameraBus, already compliant), (b) the drag loop +
preview-shift damps (W-07, early-exit on settle), (c) the Agenda shimmer and hero-glass fade
(one-shot, self-invalidating). The provider's minute tick persists (todayYmd + Agenda
reclassification + habits window) = **1 demanded frame per minute**, unchanged from Phase 2's
amended criterion: `idle 10 s → rAF → 0 (± firefly heartbeat ≤5 fps, ± minute-tick = 1 frame/min)`.
Wheel-swipe events during idle demand nothing until the threshold trips (accumulation is
listener-side arithmetic, no `invalidate()`).

### 7.4 Phase-3 perf acceptance protocol (W-15, recorded numbers required)

Seed: Phase-1 seed (8 areas / 40 projects / 300 tasks / 12 captures) + 40 events across 9
days + 8 habits with completions + a journal entry; 5 widgets on the bench.
- Bench view (vestibule): `gl.info.render.calls ≤ 190`, tris ≤ 300k.
- Swipe marathon: 10 consecutive swipes end-to-end across the arc: ≥58 fps, every glide
  settles to idle within 1 s of arrival.
- Drag-thrash: 20 s of continuous grab/carry/drop across all slots: ≥58 fps, no hitch >33 ms
  on preview-shift or LOD switches.
- Data churn: complete 3 tasks + toggle 2 habits + create 1 capture in quick succession from
  panels: every uikit re-layout <16 ms; ember/firefly choreography unharmed.
- Hands off 10 s: rAF = firefly heartbeat + 1 frame/min; CPU at idle baseline.
- Reduced-motion pass: zero continuous demand during swipe/drag (instant cuts only).

---

## 8. DEFINITION OF DONE + VERIFIER CHECKLIST

Static / CI (verifier runs without auth):
- [ ] `npm run build` green; `tsc --noEmit` green; full Vitest suite green (incl.
      `widgetLayout` truth tables, `widgetLayoutStore` validation, moved `agendaLogic` tests).
- [ ] ZERO new packages in `package.json`; zero three imports outside `components/world/**`;
      2D route chunks byte-comparable (bundle-split audit as Phases 1/2).
- [ ] The `meridian/` directory does not exist; grep finds no `meridian` import or
      `setRingScrubActive`/`meridian-toll`/`{ kind: "ring" }` reference in `components/world/**`.
- [ ] Exactly one orchestrator amendment commit touches `diffing.ts` / `useFocusStack.ts` /
      `useWorldData.ts`; `worldEvents` has exactly 5 names; `heroGlass` dev registry cap
      still 3 with at most the three sanctioned creation sites (grep).
- [ ] `WorldScene.tsx`: no meridian mounts; `<WidgetRig/>` after `<Embers/>` / before
      `<CameraRig/>`; `<JarvisRing/>` immediately before `<PostFX/>`; `<PostFX/>` last;
      `TodayPanel` gone.
- [ ] Grep-proof of the prime constraints: no new table/schema change (unless Gate Q1 chose
      the DB store — then exactly the one idempotent migration, journal untouched), no new
      `/api` route, no `revalidatePath` near gcal code.

In-browser smoke (requires Filippo's auth session — run at the Gate):
- [ ] Boot → Litany → five panels on the arc, Tree clear down the aisle, live data in every
      panel matching its 2D page (spot-check each).
- [ ] Two-finger swipe and ←/→ glide bench-to-bench; `C` summons Agenda; click a placard
      summons it; `Esc` walks home; `1–9` still fly to boughs.
- [ ] Complete a task from the Tasks panel → ember ascends + glass bell (the Phase-1 loop).
- [ ] Resolve a capture from the Captures panel → gone in 2D too; create a capture in 2D →
      row + firefly appear live.
- [ ] Toggle a habit from the panel → 2D `/habits` reflects it live, and vice versa.
- [ ] Agenda: rows match `/calendar`; class event wears bough hue; Jarvis "put lunch with Ana
      at noon tomorrow" → row shimmers in without reload; disconnect gcal in Settings → panel
      darkens with the nudge within 60 s; reconnect on the Page → panel relights.
- [ ] Journal panel shows today's entry text; "Open on the Page" lands on `/journaling`.
- [ ] Grab a panel, drag it across the arc, drop → preview-shift, settle, dock chime; reload
      → arrangement persists; `Esc` mid-drag cancels.
- [ ] Focused panel wears the glass backplate (if Q7 gated in); registry never throws.
- [ ] macOS Reduce Motion: instant cuts everywhere; drag ghost path works; panels fully
      operable.
- [ ] Perf protocol §7.4 numbers recorded; idle audit passes.
- [ ] `Cmd+\` round-trip: every 2D page byte-identical in behavior. One truth, two theatres.

Ship when every box is checked. Then stand at your bench, swipe once, and get to work.

---

## 9. OPEN QUESTIONS FOR THE GATE (Filippo decides; defaults stated; each ≤4 options, AskUserQuestion-ready)

1. **Where does the bench arrangement persist?** (W-04; §3.6 is written to make this swappable)
   - (a) **localStorage only** (`world:widgetLayout@1`) — zero migration, instant, this-device-only. *Default.*
   - (b) `users.world_layout` JSONB column — one idempotent migration, syncs across devices.
   - (c) A dedicated `world_layout` table — overkill for one row per user; only if richer
     per-widget state (sizes, pins) is coming soon.
   - (d) localStorage now, DB column as a named fast-follow issue.

2. **How many widgets in the MVP slice?**
   - (a) Three: Tasks, Captures, Agenda (drops wave W3's widget units).
   - (b) Four: + Habits.
   - (c) **Five: + Journal (the full plan as written).** *Default.*
   - (d) Start with Tasks alone, gate again after W2.

3. **Grab-and-move scope for MVP?**
   - (a) **Slot reordering on the arc (discrete, persists order).** *Default — perf-safe, robust.*
   - (b) Continuous angle placement on the arc band (stretch W-18 promoted into the slice).
   - (c) Full free placement (position + height) — rejected by Fable as breaking the
     static-at-rest law without a redesign; listed for completeness.
   - (d) No moving in MVP — swipe only, arrangement fixed.

4. **Is the Tree the hub?** (§4.2 made the call; confirm or overrule)
   - (a) **Tree stays the untouched centerpiece; the bench wraps the standing point with a
     clear aisle to it.** *Default.*
   - (b) Widgets orbit the Tree itself (panels between boughs) — rejected as visual collision
     with lanterns/embers, listed for completeness.
   - (c) Tree shrinks/moves aside; widgets take center stage.
   - (d) (a) now, plus promote stretch W-17 (bough focus scopes the Tasks panel) into the slice.

5. **Does the flat Agenda ship in the MVP?**
   - (a) **Yes, read-only, today+tomorrow, in wave W2 (the M-01 bridge makes it nearly free).** *Default.*
   - (b) Yes, but minimal (next-3-events list, no sections/tints) — save polish for later.
   - (c) No — calendar stays 2D-only until the bench proves itself; W-09 deferred.

6. **The hologram aesthetic direction?** (§2 wrote the bible for (a))
   - (a) **"Leonardo's drafting light": parchment/vellum panels, brass frames, candleflame
     rims; cyan remains Jarvis-only.** *Default.*
   - (b) Lean Stark: cyan/teal holograms across the bench (breaks the palette; Fable
     recommends against).
   - (c) Split the difference: parchment ambient, the focused panel shifts toward cyan.
   - (d) Per-widget area-hue tinted frames (busy; wrong-tint risk).

7. **The freed transmission slot (the zenith tablet's inheritance)?**
   - (a) **The focused-panel glass backplate (unit W-12).** *Default.*
   - (b) Hold it in reserve (skip W-12; cheapest, one fewer hero moment).
   - (c) Give it to a Tree moment instead (e.g. focused-bough glass) — new design work, defer.

8. **Meridian disposal?**
   - (a) **Delete wholesale; git history is the archive.** *Default.*
   - (b) Keep `MeridianRing` only, demoted to a non-interactive ambient clock overhead
     (retains ~1 file + materials; costs draw calls and contradicts "the whole sky" demotion).
   - (c) Archive the directory on a branch before deletion (one `git branch meridian-archive`
     — cheap, cosmetic).

---

*— Fable, Architect. The sky comes down; the bench goes up. Hand the torch to Opus — and
when the room wakes, arrange it your way.*
