# The Studiolo — 3D World Architecture

> *"I'm tired of dashboards. I want a world."*

---

## What The Studiolo Is

The Studiolo is a first-person holographic chamber — a Renaissance study rebuilt as a starship command deck — where your entire life grows out of the floor as a single **living Tree of brass and light**. Areas are its boughs. Projects hang in its branches like glass lanterns. Tasks burn inside them as embers. Captures drift through the dark as fireflies looking for a branch to land on. Somewhere in the warm dark, always, is **Jarvis** — a small ring of cyan light that flies to your shoulder when you speak. You don't *check* this world. You *inhabit* it.

**The load-bearing principle: 2D primary; 3D as a second theatre over ONE data cache.** The Page (`/tasks`, `/lifeos`, etc.) is the default, fast, SSR-capable, accessible data-entry surface. The 3D world at `/world` is a `ssr:false` client island that reads the **exact same TanStack Query caches** — same query keys, same query functions, same Realtime invalidation — as the 2D app. There is no world store, no parallel fetch layer, no Zustand. A task completed in the 2D app from another tab ascends as a spark in the 3D world because both share one cache. **One truth, two theatres.**

---

## Entry & Mounting

```
app/(app)/world/page.tsx           Server Component. Auth-gates (getUserOrRedirect),
                                   fetches SSR seed data — getSidebarTree, getAllTasksForUser,
                                   getCapturesForCurrentUser — then renders <WorldLoader />.

components/world/WorldLoader.tsx   'use client'. Runs a WebGL2 capability probe
                                   (document.createElement('canvas').getContext('webgl2'));
                                   if unavailable, renders a branded FallbackCard.
                                   Mounts the Canvas island via:
                                     dynamic(() => import('./WorldCanvas'), { ssr: false,
                                       loading: <WorldSkeleton /> })
                                   so three/R3F ship ONLY in the /world route chunk.

components/world/WorldCanvas.tsx   'use client'. The ONE R3F <Canvas> boundary.
                                   Config: frameloop="demand", dpr={[1,2]},
                                   gl={{ antialias:true, powerPreference:'high-performance' }},
                                   camera={{ position:[0,1.6,6], fov:55 }},
                                   clearColor="#120E0B" (Nightwalnut).
                                   Mounts <WorldScene />.

components/world/WorldScene.tsx    Composition root — no logic, only mounting order.
                                   Wraps everything in <WorldDataProvider>, then renders
                                   every system in a single flat list (see module map).
```

The world renders full-bleed inside the `AppShell` main pane; the 2D sidebar remains visible. No three imports exist outside `components/world/**` — the bundle split is a CI acceptance criterion.

---

## Module Map

| Folder / File | System | What It Owns | Key Exports |
|---|---|---|---|
| `data/WorldDataProvider.tsx` | Data bridge | Mounts the shared-key `useQuery` calls (same keys as `Sidebar.tsx`, `TasksClient.tsx`, `RecentCapturesWidget.tsx`), all five `useTableSubscription` Realtime channels, the snapshot differ, and the `invalidate()` demand kick on data change. | — (renders `WorldDataContext.Provider`) |
| `data/useWorldData.ts` | Data context | The `WorldDataContext` and the `useWorldData()` hook every scene system calls in render. | `useWorldData(): WorldData`, `WorldDataContext`, `WorldData` interface |
| `data/treeLayout.ts` | Layout solver | Pure deterministic function: `SidebarArea[]` → bough/lantern/ember-slot geometry positions. Golden-angle azimuth, Fibonacci ember shells, quadratic Bézier bough curves. Zero `three` imports. | `solveTreeLayout()`, `BoughLayout`, `LanternLayout`, `EmberSlot`, `TreeLayoutResult`, `boughPoint()`, `hash01()` |
| `data/mappings.ts` | State→light grammar | Classifies each task into `EmberState`; owns `EMBER_VISUALS` constants (colors, pulse rates, offsets); assembles `EmberSlot[]` via the geometry helpers. | `classifyTask()`, `buildEmberSlots()`, `EMBER_VISUALS`, `EmberState`, `hasFilament()`, `filamentScaleY()` |
| `data/diffing.ts` | Differ + event bus | O(n) snapshot differ that detects `status → "lesno"` completion transitions. Module-level `worldEvents` mitt-style emitter (exactly 5 frozen event names). Frozen `CameraBus`/`FireflyBus` interface shapes. | `worldEvents`, `diffSnapshots()`, `TaskTransition`, `CameraBus`, `CameraPose`, `FireflyBus`, `FlightRequest` |
| `materials/tokens.ts` | Design tokens | VISION §5 palette (`STUDIOLO` const), per-area color hash (`NODE_PALETTE` + `pickNodeColor`, copied verbatim from `AreasTree.tsx` for bundle isolation), and `oklchToThreeColor()` (manual OKLCH→linear-sRGB, since `three` r185 silently ignores `oklch()` strings). | `STUDIOLO`, `pickNodeColor()`, `oklchToThreeColor()`, `NODE_PALETTE` |
| `materials/hologram.ts` | Shader recipe | `makeHologramMaterial()`: a `MeshPhysicalMaterial` decorated with a fresnel emissive rim via `onBeforeCompile` (grazing edges emit HDR radiance > 1.0, trips Bloom at `luminanceThreshold=1`). `heroGlass()`: `MeshTransmissionMaterial` with a dev-enforced ≤3 live-instance cap. `chainOnBeforeCompile()`: the stacking utility U-09 uses. | `makeHologramMaterial()`, `heroGlass()`, `chainOnBeforeCompile()`, `HologramOptions`, `HologramUniforms` |
| `materials/sharedGeometries.ts` | Geometry singletons | Module-level geometry instances shared across all instanced families: `EMBER_GEOMETRY`, `TAPER_GEOMETRY`, `LANTERN_GEOMETRY`, `FIREFLY_GEOMETRY`. Created once, never per-instance. | `EMBER_GEOMETRY`, `TAPER_GEOMETRY`, `LANTERN_GEOMETRY`, `FIREFLY_GEOMETRY` |
| `tree/Trunk.tsx` | Tree trunk | Brass dais + trunk column geometry with an emissive sap-vein strip. | `Trunk` |
| `tree/Boughs.tsx` | Bough limbs | One `TubeGeometry` per area along the canonical quadratic Bézier curve from `treeLayout`. Each bough carries a core emissive filament in its OKLCH hue (blooms). Each bough mesh has `userData = { kind:'bough', areaId }` for raycast picking. | `Boughs`, `boughFocusPose()` |
| `tree/Lanterns.tsx` | Project lanterns | Drei `<Instances>` of faceted `IcosahedronGeometry` hologram lanterns. A second `<Instances>` of `TorusGeometry` provides the class-project armature ring. Hero swap (focused lantern → `heroGlass`) is governed by the focus stack. | `Lanterns`, `lanternPickMap` |
| `tree/Embers.tsx` | Task embers | **One** imperative `InstancedMesh(EMBER_GEOMETRY, …, 1024)` for all task embers + a second for priority filaments (`TAPER_GEOMETRY`, cap 128). Full state→light grammar driven by a custom `aState` `InstancedBufferAttribute` (GPU-side pulse). Ascent runtime (flare 300 ms → rise 6 m / 2.2 s → dissolve) is CPU-side in `useFrame`. | `Embers` |
| `tree/Fireflies.tsx` | Capture fireflies | **One** `InstancedMesh(FIREFLY_GEOMETRY, …, 64)` for unfiled captures. Per-instance curl-ish wander with a 5 fps heartbeat `setInterval` (so the swarm never looks frozen). `fireflyBus.fly()` claims an instance for a routing flight. | `Fireflies`, `fireflyBus: FireflyBus` |
| `camera/CameraRig.tsx` | Camera authority | The ONLY component that flies the camera. Wraps drei `<CameraControls makeDefault>`. Publishes the `cameraBus` singleton. Translates focus-stack changes → poses → `cameraBus.flyTo()`. Enforces the boot gate (ignores navigation until `boot-complete`). Saves/restores pose to `sessionStorage['world:cameraPose']`. | `CameraRig`, `cameraBus: CameraBus`, `VESTIBULE_POSE`, `lanternFocusPose()`, `bootDone()` |
| `camera/useFocusStack.ts` | Focus stack | Module singleton implementing a `vestibule → bough → lantern` chain. Push truncates at the new rank (no phantom depth). Reactive via `useSyncExternalStore`. | `focusStack`, `useFocusStack()`, `FocusLevel` |
| `camera/useWorldKeys.ts` | World keyboard | Single `keydown` listener: `1–9` fly to areas by `orderIndex`; `Escape` pops the focus stack; skips when `e.target` is an input/textarea. | `useWorldKeys()` |
| `env/Atmosphere.tsx` | Room environment | Floor `CircleGeometry`, `<Environment files="/world/hdri/night-256.hdr" resolution={256}>`, warm key `PointLight` (Candleflame, intensity 2.2), cool fill `DirectionalLight` (Moonlace, 0.35). Exposes `inlayRegistry: Map<string, MeshBasicMaterial>` keyed by areaId for the Litany's floor-line reveal. | `Atmosphere`, `inlayRegistry` |
| `env/DustMotes.tsx` | Atmosphere particles | 600-vertex `THREE.Points` drifting in `useFrame`. One draw call. Idle policy: active only during the 4 s post-interaction window or the Litany. | `DustMotes` |
| `env/PostFX.tsx` | Post-processing | **The ONE** `<EffectComposer>` in the entire app: `<Bloom mipmapBlur luminanceThreshold={1} intensity={1.2}/>` + `<Vignette offset={0.4} darkness={0.6}/>`. Must remain the last child of `WorldScene`. | `PostFX` |
| `text/WorldLabels.tsx` | World captions | Distance-culled SDF `<Text>` captions via troika-three-text: area names (always visible, ≤9), project names (visible ≤6 m), hover caption (one singleton reused across all hovered objects). | `WorldLabels` |
| `text/Ledger.tsx` | Day-at-a-glance HUD | Camera-anchored bottom-center `<Text>` strip in italic EB Garamond composing a one-line day summary from `useWorldData()`. | `Ledger`, `composeLedgerLine()` |
| `text/fonts.ts` | Font preload | URL constants for the EB Garamond `.woff` files in `public/world/fonts/`. Exports `preloadWorldFonts()` (calls troika's `preloadFont` with the ASCII+dates glyph set at world mount). | `EB_GARAMOND_WOFF`, `EB_GARAMOND_ITALIC_WOFF`, `preloadWorldFonts()` |
| `panels/**` | The Workbench (Phase 3) | `TodayPanel.tsx` is gone — the whole bench-of-panels subsystem lives here now. See [The Workbench (Phase 3 — The Bottega)](#the-workbench-phase-3--the-bottega) below for its own module map. | — |
| `jarvis/JarvisRing.tsx` | Jarvis ring mesh | Two concentric `TorusGeometry` meshes (Jarvis Cyan, `toneMapped:false` for bloom). Idle breathing at 12 bpm. Summon/dismiss spring via `@react-spring/three`. Mounts `useJarvisWorld()` exactly once. | `JarvisRing` |
| `jarvis/JarvisRibbon.tsx` | Jarvis input ribbon | Drei `<Html transform>` wrapping a styled `<input>` (the ONLY `<Html>` root in the scene). Real DOM caret. Streams italic Garamond reply text via troika `text` property mutation (throttled 50 ms). Clarification chips render as uikit buttons. | `JarvisRibbon` |
| `jarvis/useJarvisWorld.ts` | Jarvis state machine | State machine (`idle → listening → thinking → streaming → error`). Wires `streamJarvis()` callbacks: `onText` → ref buffers (never React re-render), `onAction` → `invalidateAfterJarvisAction` then `worldEvents.emit('jarvis-action', ev)`, `onDone` → persist turn + history. | `useJarvisWorld(): JarvisWorldHandle`, `jarvisWorldBus` |
| `jarvis/useJarvisChoreography.ts` | Routing choreography | Subscribes to `worldEvents('jarvis-action')`. Resolves the action receipt → `projectId → layout.byProject → areaId`. Calls `cameraBus.flyTo` (20° yaw assist if destination bough is behind camera), then `fireflyBus.fly()`. The light-thread fires in parallel. | `JarvisChoreographer` |
| `jarvis/LightThread.tsx` | Cyan light thread | `TubeGeometry` along a `QuadraticBezierCurve3` from ring → bough midpoint → lantern, animated by `drawRange` (no per-frame geometry rebuild). Cyan bloom material. Disposes after ~1.2 s. | `LightThread` |
| `boot/Litany.tsx` | Boot sequence | The 6-second Litany conductor. A single `useSpring({ from:{t:0}, to:{t:1}, config:{duration:6000} })` drives a keyframe table in `useFrame`: floor inlay stagger → bough `uReveal` uniform → Ledger typewriter → `worldEvents.emit('boot-complete')`. Any keypress skips. Same-session revisit skips via `sessionStorage`. Renders `null` after completion. | `Litany` |
| `boot/useLitanySequence.ts` | Litany sequence hook | The spring + keyframe logic, skip handler, and session-flag management extracted from `Litany.tsx`. | `useLitanySequence(): { progress: SpringValue<number>; skip(): void }` |
| `audio/Chimes.tsx` | World audio | Lazy `AudioContext` (unlocked on first gesture). Preloads 3 clips. Subscribes to `worldEvents('chime')`: `glass-bell` (task ascent), `cork-pop` (capture created), `two-note` (firefly landing). Global mute via `localStorage['world:muted']`. | `Chimes` |
| `audio/synth.ts` | Audio pool | Raw WebAudio pool of `AudioBufferSourceNode`s. | `ChimeKind`, audio pool helpers |
| `prefs/useWorldPrefs.ts` | Reduced-motion honesty | Two shapes: `worldPrefersReducedMotion()` (read-at-call-time, SSR-safe) used by module-scope callers like `cameraBus`; `useWorldPrefs()` (`useSyncExternalStore` subscription) for render-time consumers. | `useWorldPrefs(): WorldPrefs`, `worldPrefersReducedMotion()` |
| `WorldLoader.tsx` | SSR gate + capability | WebGL2 probe + `dynamic(..., { ssr:false })` island boundary. | `WorldLoader`, `WorldLoaderProps` |
| `WorldCanvas.tsx` | R3F Canvas | The one `<Canvas>` with all renderer flags. | `WorldCanvas` |
| `WorldScene.tsx` | Composition root | Flat list of system mounts in render order inside `<WorldDataProvider>`. | `WorldScene`, `WorldSceneProps` |
| `WorldSkeleton.tsx` | Loading shell | Parchment-on-Nightwalnut loading state with a pulsing candle-point. Zero three imports. | `WorldSkeleton` |
| `ModeToggle.tsx` | 2D↔3D toggle | Hosts `Cmd+\` logic: stores last 2D route in `sessionStorage['world:lastPageRoute']`, routes between `/world` and the saved route. | `ModeToggle` |

---

## Frozen Contracts

These interfaces and names are established at Wave 1 close. Changes require an orchestrator amendment commit.

### `worldEvents` — 5 event names (source: `data/diffing.ts`)

```ts
type WorldEventMap = {
  "task-completed": TaskTransition;     // differ detected status→"lesno"
  "capture-created": { captureId: string };
  chime: { kind: "glass-bell" | "cork-pop" | "two-note" };
  "jarvis-action": JarvisActionEvent;   // after invalidateAfterJarvisAction
  "boot-complete": void;               // Litany finished; gates CameraRig
};
```

### `cameraBus` / `CameraPose` (source: `data/diffing.ts`, impl: `camera/CameraRig.tsx`)

```ts
interface CameraPose { position: Vector3Tuple; target: Vector3Tuple; }
interface CameraBus  { flyTo(pose: CameraPose, ms?: number): Promise<void>; }
export const cameraBus: CameraBus; // singleton in CameraRig.tsx
```

### `fireflyBus` / `FlightRequest` (source: `data/diffing.ts`, impl: `tree/Fireflies.tsx`)

```ts
interface FlightRequest { captureId?: string; toAreaId: string; toProjectId?: string; kind: "task" | "note"; }
interface FireflyBus    { fly(req: FlightRequest): Promise<void>; }
export const fireflyBus: FireflyBus; // singleton in Fireflies.tsx
```

### `focusStack` (source: `camera/useFocusStack.ts`)

```ts
type FocusLevel = { kind:"vestibule" } | { kind:"bough"; areaId:string } | { kind:"lantern"; projectId:string };
// ranks: vestibule=0, bough=1, lantern=2. push() truncates at the new rank.
focusStack.push(f)  // chain-truncate → notify → CameraRig effect → cameraBus.flyTo
focusStack.pop()    // pop top unless vestibule
focusStack.reset()  // return to vestibule
```

### `useWorldData` (source: `data/useWorldData.ts`)

```ts
interface WorldData {
  userId: string;
  tree: SidebarArea[];       // active areas from the shared areas query
  layout: TreeLayoutResult;  // memoized on tree identity
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];   // memoized on [tasks, layout, todayYmd]
  captures: CaptureWithLinks[];
  todayYmd: string;          // user local timezone, re-computed each minute
}
export function useWorldData(): WorldData; // throws outside WorldDataProvider
```

### `inlayRegistry` (source: `env/Atmosphere.tsx`)

```ts
export const inlayRegistry: Map<string, THREE.MeshBasicMaterial>;
// Keyed by areaId. The Litany stagers opacity 0→1 on these materials
// to produce the floor-line reveal in area orderIndex sequence.
```

### The shader-chunk treaty (source: `materials/hologram.ts`)

U-03 (fresnel) and U-09 (ember aState) share a `MeshPhysicalMaterial` via `chainOnBeforeCompile`. The table below is frozen:

| Item | Owner | Name | Notes |
|---|---|---|---|
| Rim color uniform | U-03 | `uRimColor` | vec3, fragment |
| Rim exponent | U-03 | `uRimPower` | float, default 2.5 |
| Rim HDR intensity | U-03 | `uRimIntensity` | float, > 1 blooms |
| Rim alpha boost | U-03 | `uRimAlphaBoost` | float, default 0.35 |
| Uniform access path | U-03 | `material.userData.rimUniforms` | mutate `.value` only |
| Ember state attribute | U-09 | `aState` | `InstancedBufferAttribute` itemSize 2: x=state id, y=phase offset |
| State id encoding | frozen | 0=ambient 1=today 2=overdue 3=ascending | must match `EmberState` union order |
| Ember varying | U-09 | `vEmberState` | vec2, vertex→frag |
| Ember clock | U-09 | `uEmberTime` | float seconds |
| Marker comments | both | `<studiolo:fresnel:*>` (U-03), `<studiolo:ember:*>` (U-09) | guards double-injection |
| Program cache key | U-03 base | `"studiolo:sf@1"` | U-09 appends `\|ember@1` via `chainOnBeforeCompile` |

Injection rule: both units use `shader.fragmentShader.replace(anchor, anchor + "\n" + chunk)` so each anchor survives for the next decorator. Locals live inside `{}` blocks with `sf`/`em` prefixes to prevent collisions.

### `EMBER_VISUALS` state→light grammar (source: `data/mappings.ts`)

```ts
export const EMBER_VISUALS = {
  today:     { color: "#E8C46B", pulseHz: 0.5, emissiveMin: 1.6, emissiveMax: 2.6, yOffset: 0 },
  overdue:   { color: "#FF6B4A", pulseHz: 0,   emissive: 1.8,    yOffset: -0.12 },
  ambient:   { color: "#F2E9D8", pulseHz: 0.2, emissive: 0.9,    yOffset: 0 },
  ascending: { flareMs: 300, flareMul: 3, riseY: 6, riseMs: 2200, ease: "easeIn" },
} as const;
```

The grammar is sacred. Implement it once in `Embers.tsx`; never approximate it elsewhere.

---

## Data Flow

```
Kiwi: one sentence typed into Cmd+K
  ↓
streamJarvis() → POST /api/jarvis SSE
  ↓ onAction
invalidateAfterJarvisAction(queryClient, name, userId)
  + worldEvents.emit('jarvis-action', ev)
  ↓
TanStack Query refetch (same key as 2D app)          Realtime channel insert
  ↓                                                     ↓
diffSnapshots(prev, next) via WorldDataProvider effect
  ↓ completion detected
worldEvents.emit('task-completed', transition)
  ↓
Embers.tsx beginAscent(slot)
  + worldEvents.emit('chime', { kind: 'glass-bell' })

Parallel choreography path:
worldEvents('jarvis-action') → JarvisChoreographer
  → resolveActionDestination(ev, layout) → { areaId, projectId }
  → cameraBus.flyTo(yawAssist)
  → fireflyBus.fly({ toAreaId, toProjectId, kind:'task' })
     → firefly curves along the bough → lands → cools cyan→candleflame
     → worldEvents.emit('chime', { kind: 'two-note' })
```

2D task completion (from `/tasks` or `TodayPanel`):
- Calls the same server action → same `invalidateQueries(tableKey("tasks", userId))` → differ → ascending spark + glass bell.
- The 2D surface and the world see it identically. **One truth, two theatres.**

---

## Performance Doctrine

These rules are law (PLAN §7). U-20 (`PerfGovernor`) enforces them at runtime.

| Principle | Rule |
|---|---|
| **Demand mode** | `frameloop="demand"`. Frames are demanded ONLY by: springs (auto-invalidate), camera-controls change events, `invalidate()` on TanStack Query data change, hover enter/exit, active runtimes (ascent/flight/thread), the firefly 5 fps heartbeat, the 4 s post-interaction breath window. |
| **Idle target** | ~0 CPU/GPU when idle. Zero rAF activity after 4 s of no input. |
| **Instancing** | Embers, fireflies, and lanterns are each ONE `InstancedMesh` / drei `<Instances>`. Rows NEVER mount/unmount React components. Enter/leave = freelist slot + spring scale. |
| **Draw-call ceiling** | ≤150 draw calls in the Vestibule view. Budget: tree ≤12, lanterns+rings 2, embers+filaments 2, fireflies 1, atmosphere ≤8, labels ≤17, panel ~20, ring/ribbon/thread ≤6, composer ~4. |
| **Triangle budget** | ≤300k triangles; ≤64 MB texture memory. |
| **Transmission cap** | `MeshTransmissionMaterial` on ≤3 hero objects (focused lantern swap, Jarvis ribbon, +1 reserve). Enforced by `heroGlass()`'s dev registry. Everything else uses the cheap fresnel hologram recipe. |
| **DPR** | `dpr={[1,2]}`. `<PerformanceMonitor>` steps down: 2→1.5→1, then sheds Vignette, then halves Bloom intensity, then surfaces a toast nudge. |
| **Per-frame discipline** | Zero per-frame React state. Animation = `useFrame` matrix/uniform mutation, preallocated scratch objects, `easing.damp` from `maath`. `instanceMatrix.needsUpdate` only when dirty. |
| **SDF text** | Glyphs preloaded at boot via `preloadWorldFonts()`. Live `<Text>` instances ≤~28. Distance-cull via `visible` toggle (never unmount). `sdfGlyphSize` ≤64. |
| **HDRI** | `resolution={256}`, `background={false}` (the dark gradient is cheap CSS `clearColor`). |
| **Bundle split** | Zero three imports outside `components/world/**`. Verified in `next build` route-size output. |

**MVP acceptance test (run on M-series MacBook, Chrome + Safari):** 8 areas / 40 projects / 300 tasks / 12 captures — ≥58 fps through orbit + 3 fly-tos + panel + one routing flight; ≥55 fps with 3 concurrent ascents; idle 10 s → rAF → 0 (± firefly heartbeat ≤5 fps).

---

## Accessibility

- **`prefers-reduced-motion: reduce`** is honored by `useWorldPrefs()` / `worldPrefersReducedMotion()`. All springs become `immediate: true`, camera glides become instant cuts, the Litany collapses to a 300 ms fade, ember ascent crossfades, fireflies freeze at their current positions. The completion glass bell still sounds (audio is not gated by motion preference).
- **WebGL2 unavailable**: `WorldLoader` detects this at mount and renders a branded `FallbackCard` instead of crashing. The 2D app is untouched.
- **The Page is the accessible path.** `Cmd+\` always returns to the last 2D route. The world is reachable and navigable with reduced motion, but dense text editing and keyboard-first triage belong on the Page.

---

## How To Extend — Adding a New Object Family

A new visual object family (e.g. "habits as moths") follows this pattern:

1. **Add types to `data/treeLayout.ts` or `data/mappings.ts`** — a new slot type (e.g. `HabitSlot`) with deterministic positions and state classification. Keep `solveTreeLayout` (and its tests) green.
2. **Add the family to `data/useWorldData.ts`** — extend `WorldData` with the new slot array. `WorldDataProvider` builds it from existing queries or a new shared-key query.
3. **Create `tree/Moths.tsx`** (or wherever the family belongs) — ONE `InstancedMesh`, freelist, state attribute, `useFrame` settle loop. Consume `useWorldData()`. Follow the hover convention documented in `CameraRig.tsx` JSDoc. Never mount/unmount per-row.
4. **If new events are needed**, amend `worldEvents` / `WorldEventMap` in `data/diffing.ts` with an orchestrator amendment commit. Do not add event names unilaterally (the bus is frozen at 5 names).
5. **Mount in `WorldScene.tsx`** — a single-line insertion at the appropriate slot (before `PostFX`; after `CameraRig` if it needs click events).
6. **Add shared geometry** to `materials/sharedGeometries.ts` if the family has its own geometry primitive.
7. **Perf budget**: confirm the new family's draw-call contribution keeps the scene at ≤150 total. Instancing is mandatory.

---

## The Workbench (Phase 3 — The Bottega)

> *"I'm tired of a sky I only look at. Give me a bench I can work at."*

The Meridian Ring came down. In its place the Studiolo grew **hands**: a workbench arc of holographic drafting-paper panels standing where the ring used to loom, each one a live window onto a 2D surface — Tasks, Captures, Agenda, Habits, Journal — that you swipe between, grab and rearrange, and genuinely work in through the exact same server actions and query keys as the 2D app. The Tree keeps its place as the room's centerpiece, framed dead-ahead down the aisle between the benches. A new engineer can add a widget to the bench from this section alone.

---

### Module Map (panels/)

| File | System | What It Owns | Key Exports |
|---|---|---|---|
| `panels/widgetTypes.ts` | Shared type surface | `WidgetId`, `BenchConfig`, `BenchSlot` — hoisted out of `WorldPanel.tsx`/`widgetLayout.ts` so the Wave-W1 units (`focusStack` amendment, the solver/registry/bus, the primitive) stay genuinely file-disjoint. The one place the bench roster's *type* grows. | `WidgetId`, `BenchConfig`, `BenchSlot` |
| `panels/widgetLayout.ts` | Bench solver | Pure, deterministic arc math (zero `three` imports at runtime): `solveBenchLayout` (order → per-slot position/rotation/`cameraPose`), `neighborOf` (swipe prev/next, `null` past the arc's edge), `nearestSlotIndex` (drag drop-resolution from a yaw), `slotAngles`. Angle convention: signed offset from the aisle centerline, left wing negative, right wing positive. | `DEFAULT_BENCH_CONFIG`, `SLOT_STEP_RAD`, `solveBenchLayout()`, `neighborOf()`, `nearestSlotIndex()`, `slotAngles()` |
| `panels/widgetRegistry.ts` | Widget registry | The single place the bench roster grows (§3.7 doctrine, mirrors `WorldScene.tsx`'s mount-list idiom): a `WidgetId → { title, component }` map, populated by the Conductor as each widget lands — **widget units never edit this file**. | `WIDGET_REGISTRY`, `WidgetSpec`, `WidgetComponentProps`, `getWidgetSpec()`, `isWidgetRegistered()`, `listWidgets()` |
| `panels/widgetBus.ts` | Drag choreography bus | A tiny, `three`-free module-singleton pub/sub carrying ONLY the grab-and-move lifecycle (`drag-start` → `drag-move` → `drag-drop` → `docked`). Focus/navigation state does NOT live here — that stays in `focusStack`; the dock chime rides the existing `worldEvents("chime")` name, not a bus event. | `widgetBus`, `WidgetBus`, `WidgetBusEvent` |
| `panels/widgetLayoutStore.ts` | Layout persistence | The bench remembers itself: a versioned `localStorage` blob (`world:widgetLayout@1`) holding the arc `order` + a `hidden` roster, exposed both imperatively (`loadWidgetLayout`/`saveWidgetLayout`) and reactively (`useWidgetLayout`, the `useFocusStack` `useSyncExternalStore` discipline). SSR-safe; unknown ids dropped, missing ids appended in `ROSTER` order, corrupt JSON falls back to `DEFAULT_LAYOUT` — never crashes the world. | `WidgetLayoutV1`, `DEFAULT_LAYOUT`, `WIDGET_LAYOUT_STORAGE_KEY`, `loadWidgetLayout()`, `saveWidgetLayout()`, `useWidgetLayout()` |
| `panels/WorldPanel.tsx` | The panel primitive | THE keystone. Everything `TodayPanel` proved, generalized once: the deep-vellum uikit `<Root>` skin verbatim (opacity 0.7, brass border), ONE shared brass-rail frame geometry drawn with one of two module-singleton `makeHologramMaterial` instances (`frameIdle`/`frameFocused` — a prop-driven swap, never a recompile), the full/placard LOD split (§7.2 below), the §2.8 honesty states (`ready`/`empty`/`disconnected`), and the click-to-summon/click-to-swallow pick plumbing. Touches NO data — widgets supply `children` + their own wiring. | `WorldPanel()`, `WorldPanelProps`, `DragHandleProps`, `PANEL_ROW_CAP` |
| `panels/WidgetRig.tsx` | Bench rig | Reads the persisted `order` (`useWidgetLayout`) + `useFocusStack()`, solves the arc once per reorder (`solveBenchLayout`, memoized on `order` identity), and renders each REGISTERED widget's self-contained component at its slot with `{ slot, focused, lod }`. Owns the wheel/trackpad swipe listener and the module-level `getBenchSlot()`/`swipeBench()` seam `CameraRig` and `useWorldKeys` read (no React import needed on their side — mirrors how lantern poses resolve). No `useFrame` in this file — the glide belongs to `cameraBus`. | `WidgetRig`, `getBenchSlot()`, `swipeBench()` |
| `panels/useWidgetDrag.ts` | Grab-and-move | The crown jewel, and the phase's ONLY new `useFrame` consumer: self-invalidating while dragging/settling, early-exit to idle-zero the instant the bench stops moving. Ray→vertical-bench-cylinder intersection → signed yaw → live arc-following + preview-shift of displaced panels → drop resolves the nearest slot, persists via `useWidgetLayout().moveWidget()`, and eases every panel home with one `two-note` dock chime on settle. `Esc` mid-drag cancels without persisting. Reduced motion collapses lift/tilt/preview to a frame-only ghost outline + an instant cut on drop. | `useWidgetDrag()`, `WidgetDragApi`, `GHOST_GEOMETRY`, `GHOST_MATERIAL` |
| `panels/FocusedPanelGlass.tsx` | Focused-panel hero glass | The one true glass moment (§7.1 below): a single `heroGlass` backplate mounted ~2 cm behind whichever panel is focused, swap-on-focus (the `Lanterns.tsx` idiom — a widget→widget swap re-positions the SAME mesh, never double-mounts), fading in/out via one damped `useFrame` that unmounts on full fade-out. Rendered as a sibling of `WidgetRig` in `WorldScene.tsx`. | `FocusedPanelGlass` |
| `panels/TasksWidget.tsx` | Tasks panel | `TodayPanel`'s content reborn on the primitive: today+overdue tasks (overdue-first sort), the optimistic `checkedOff` Set, and the REAL `updateTaskStatus` completion → the same `tableKey("tasks", userId)` invalidation → the same ember-ascent loop. `TodayPanel.tsx` itself is deleted; nothing imports it. | `TasksWidget` |
| `panels/CapturesWidget.tsx` | Captures panel | The inbox on the bench: newest-first captures (`useWorldData().captures`) with hashtag chips (`useWorldData().hashtags`), row delete via the same `deleteCapture` action + `tableKey("captures", userId)` invalidation as the 2D `CapturesClient`. No affordances invented beyond the 2D card's own. | `CapturesWidget` |
| `panels/HabitsWidget.tsx` | Habits panel | Today's habit grid: one row per active habit, a trailing-7-day tick strip (copied verbatim from `HabitsClient`'s `ManageHabitRow`), today's cell an interactive `<Button>` wired to the same `toggleHabitCompletion` action + optimistic overlay as `/habits`. No streak caption (the 2D client computes none — nothing invented). | `HabitsWidget` |
| `panels/JournalWidget.tsx` | Journal panel | Today's entry, read-only: a combined plain-text preview of `main_response`/`notes_section` (first ~12 lines / ~600 chars) + word count, and an "Open on the Page →" affordance that reuses `ModeToggle`'s ONE `Cmd+\` doorway (writes `sessionStorage['world:lastPageRoute']`, dispatches the same keydown) rather than inventing a second route. No in-world editing this phase. | `JournalWidget` |
| `panels/agenda/AgendaWidget.tsx` | Agenda panel | The Ring's soul without its scaffolding: a flat, read-only Today/Tomorrow calendar built on `useWorldData().calendar`. Area-hue accent strip when `linkEventToProject` hits confidently, the calendar-source dot, `past`/`current`/`imminent` row treatment via `classifyEvent`, and a one-shot 600 ms shimmer on any event that `diffEventSnapshots` finds newly-appeared (a Jarvis-created event arriving live). Connection honesty per §2.8 — never OAuths. | `AgendaWidget` |
| `panels/agenda/agendaLogic.ts` | Event grammar (survivor) | The Meridian Ring's pure event logic, extracted verbatim BEFORE `meridian/` was deleted: `classifyEvent` (was `classifyTablet`), `linkEventToProject`, `calendarDotColor`. Representation-agnostic (works off `{startMs,endMs}`, no tablet-slot coupling); zero `three` imports. | `classifyEvent()`, `linkEventToProject()`, `calendarDotColor()`, `EventTiming`, `PARCHMENT_HEX`, `IMMINENT_MS` |

---

### The Bench Spatial Model

The bench is a **fixed arc of slots** around the standing point (the vestibule) — a generalization of `TodayPanel`'s single proven pose, multiplied and solved by `solveBenchLayout`. Panels are static world-anchored groups; the camera never carries them and they never track the camera (the "zero per-frame work" contract — see the idle rule below). A pure **central aisle** keeps the Tree (trunk at the origin) framed dead-ahead from the vestibule: **the bench wraps around YOU, not around the Tree**. Widget focus and bough focus are rank-1 siblings on the `focusStack`, so moving between "working at a bench" and "walking into the tree" is always one glide, and `Esc` always walks home.

Geometry defaults (`DEFAULT_BENCH_CONFIG` — tunable constants, not law):

| Constant | Value | Meaning |
|---|---|---|
| `center` | `[0, 0, 4.6]` | The arc center ≈ the standing point |
| `eyeY` | `1.5` | Panel-center height (the `TodayPanel` precedent) |
| `radius` | `3.0` | Slot distance from `center`, in meters |
| `aisleRad` | `70°` | The central gap kept clear toward the Tree |
| `maxSlots` | `7` | The hard live-panel cap (§7.2 below) |
| `SLOT_STEP_RAD` | `28°` | Angular spacing between adjacent slots on the same wing |
| `READ_DISTANCE` | `1.9 m` | Reading-eye distance from the panel along its radial |

**Angle convention:** every angle in `widgetLayout.ts` (and the drag hook's `yawRad`) is a **signed offset from the aisle centerline** — `α = 0` points straight down the aisle at the Tree (no slot ever sits there); `α < 0` is the viewer's left wing (index 0 = leftmost/outermost slot); `α > 0` is the right wing. Slots are ordered left→right by `α` ascending. An even-length order splits symmetrically; an odd one gives the extra slot to the right wing. This is the exact convention `useWidgetDrag`'s ray→yaw math inverts, so a drag and the static solve never drift apart.

---

### Navigation — Swipe, Summon, Grab-and-Move

- **Swipe** — three equivalent inputs, all resolving through `neighborOf` + `focusStack.push({ kind:"widget", widgetId })` + `CameraRig`'s existing focus→pose effect (`cameraBus.flyTo`, ~700 ms glide, instant cut under reduced motion):
  - **Wheel/trackpad:** a capture-phase `wheel` listener on the canvas (`WidgetRig`'s `useWheelSwipe`) treats a horizontal-dominant gesture (`|deltaX| > |deltaY|`) as one discrete swipe once it accumulates past ~60 px, debounced ~350 ms. Vertical wheel is left completely untouched (`CameraControls` dolly in open space; uikit's own scroll over a panel).
  - **Keys:** `←`/`→` (prev/next panel via `swipeBench`); `C` summons the Agenda panel; `Esc` pops; `1–9` still fly to boughs — all inside the one `useWorldKeys` listener.
  - **Click:** clicking any unfocused panel (full or placard) summons it — `WorldPanel`'s frame `onClick` (placard) or its SDF title `onClick`.
  - At the vestibule (nothing focused), a swipe focuses the nearest panel on that side; swiping past the arc's end is a soft no-op — `neighborOf` returns `null`, nothing is pushed.
- **Summon** — a placard click (or a swipe/key landing on it) is the only way a distant panel comes to reading pose; it is always `focusStack.push({ kind:"widget", widgetId })`, never a direct camera move.
- **Grab-and-move** (`useWidgetDrag.ts` — MVP is **slot reordering**, not free placement):
  1. **Grab** — `pointerdown` on a panel's frame grip: pointer capture, `widgetBus.emit({kind:"drag-start"})`, the panel lifts ~6 cm and tilts ~4° toward the camera, its frame blooms (the `focused` override the rig applies to the dragged id).
  2. **Move** — `pointermove`: the pointer ray intersects the vertical bench cylinder → a signed yaw → `widgetBus.emit({kind:"drag-move", yawRad})`. The grabbed panel follows the yaw along the arc; every other panel **preview-shifts** toward its would-be slot (`nearestSlotIndex` against a precomputed `solveBenchLayout` per candidate index), damped over ~400 ms.
  3. **Drop** — `pointerup`/`pointercancel`/pointer-leaves-canvas: `nearestSlotIndex` resolves the final index → `useWidgetLayout().moveWidget(id, toIndex)` (reorder + persist to `localStorage` + notify) → the rig re-solves and every panel eases to its final slot → on settle, one `worldEvents.emit("chime", {kind:"two-note"})` dock chime (the existing chime name — no amendment).
  4. **Cancel** — `Esc` mid-drag aborts and eases the panel home without persisting and without a chime.
  5. **Reduced motion** — no lift/tilt/preview animation at all; the drag ghost is a frame-only wireframe outline snapped to the candidate slot, and drop applies the new order as an instant cut (the dock chime still sounds — audio is not gated by motion preference).

---

### The Panel-LOD Law (§7.2)

At most **3 panels render full uikit content** at once — the focused panel plus its two arc neighbors (index ±1 in the solved order); at the vestibule (nothing focused) the full trio is centered on the arc middle. Every other bench panel renders as a **placard**: the brass frame + one SDF `<Text>` title, nothing else (`WorldPanel`'s `lod === "placard"` branch — the `<Root>` simply does not mount). `WidgetRig` chooses LOD at render from focus/order state — a **mount change at interaction cadence, never per-frame**. The live-widget cap is **7** (`BenchConfig.maxSlots`); an `order` longer than that is silently clamped to its first 7 entries.

---

### The Idle-rAF Rule (§7.3)

Panels at rest are static world objects: `WorldPanel.tsx` has no `useFrame`, no ref mutation, and never calls `invalidate()`. The bench's only continuous frame-demand sources, both self-invalidating with an early exit at settle:

- **`useWidgetDrag`'s one `useFrame`** — live only while a drag or its post-drop settle animation is in flight; the instant the bench stops moving it stops calling `invalidate()` and the world sleeps.
- **`FocusedPanelGlass`'s opacity fade** — a short damped `useFrame` that runs only while the backplate is fading in or out, unmounting (and releasing its `heroGlass` registry slot) the moment a fade-out reaches zero.

Outside an active drag or fade, the bench contributes nothing beyond the provider's existing once-a-minute `invalidate()` (the `todayYmd` clock that also drives Agenda reclassification and the habits window) — unchanged from the Phase-1/2 idle criterion: `idle 10 s → rAF → 0 (± firefly heartbeat ≤5 fps, ± minute-tick = 1 frame/min)`.

---

### The Transmission-Cap Resolution (§7.1)

Panel **bodies** stay cheap uikit translucency — the `TodayPanel` skin verbatim, deep-vellum `opacity 0.7`, zero material budget. Panel **frames** use the fresnel-rim hologram recipe (`makeHologramMaterial`), shared as exactly **two** module-singleton material instances (`frameIdle` / `frameFocused` in `WorldPanel.tsx`) — the `focused` prop swaps between them, and because both pin the same `customProgramCacheKey`, the swap never recompiles a shader program and never mutates a per-frame uniform.

True transmission (`heroGlass` / `MeshTransmissionMaterial`) is spent on exactly **one** moment in the bench layer: `FocusedPanelGlass`'s backplate, occupying the slot **freed by the Meridian zenith tablet's demolition**. The `heroGlass` dev registry after Phase 3 holds: the focused lantern (`Lanterns.tsx`), the Jarvis ribbon (`JarvisRibbon.tsx`), and the focused-panel backplate — **3/3**. Because lantern-focus and widget-focus are mutually exclusive `focusStack` levels, at most 2 of those + the ribbon are ever live simultaneously; the registry can never overflow.

---

### Frozen Contracts (Phase 3 additions)

These are established at Wave W1 close. Changes require an orchestrator amendment commit.

#### `worldEvents` — back to 5 event names (source: `data/diffing.ts`)

`"meridian-toll"` is removed along with its emitter (`TollScheduler`) and consumers — the bus returns to the five Phase-1 names (`task-completed`, `capture-created`, `chime`, `jarvis-action`, `boot-complete`). No new names are added this phase; the drag choreography rides the separate `widgetBus` singleton instead (the audit's "not a 7th `worldEvents` name" rule).

#### `focusStack` — amended `FocusLevel` (source: `camera/useFocusStack.ts`)

```ts
type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string }
  | { kind: "widget"; widgetId: WidgetId };  // NEW — rank 1, sibling of bough
// { kind: "ring" } and its rank cases are REMOVED with the Meridian demolition.
```

Rank 1 means focusing a widget from a bough (or vice versa) is one truncate+glide with no phantom depth; `Esc` from a widget pops to vestibule. Push/pop/truncate semantics are byte-identical to Phase 1/2.

#### `WorldData` — `meridian` renamed to `calendar`, plus two new slices (source: `data/useWorldData.ts`)

```ts
interface WorldData {
  // ...Phase-1 fields byte-identical...
  calendar: CalendarData;       // RENAMED from `meridian` (M-01); shape unchanged
  habits: HabitsData;           // NEW
  journal: JournalTodayData;    // NEW
  hashtags: HashtagWithCount[]; // NEW — tag chips for the Captures panel
}
interface HabitsData {
  habits: HabitWithAreas[];           // tableKey("habits", userId)
  completions: HabitCompletionRow[];  // [...tableKey("habit_completions"), windowStart, today]
  windowStart: string;                // ymd, derived from the existing todayYmd clock
}
interface JournalTodayData {
  entry: JournalEntry | null;         // ["journaling", userId, todayYmd]
}
```

`CalendarData` itself is byte-identical to the old `MeridianData` — only the name changed, top-to-bottom (`meridian` → `calendar`, `MeridianSeed` → `CalendarSeed`, `initialMeridian` → `initialCalendar`). `habits.windowStart` derives from the provider's existing minute clock — zero new intervals.

#### `WidgetBus` / `widgetBus` (source: `panels/widgetBus.ts`)

```ts
export type WidgetBusEvent =
  | { kind: "drag-start"; widgetId: WidgetId }
  | { kind: "drag-move"; widgetId: WidgetId; yawRad: number }
  | { kind: "drag-drop"; widgetId: WidgetId; toIndex: number }
  | { kind: "docked"; widgetId: WidgetId };
export interface WidgetBus {
  emit(e: WidgetBusEvent): void;
  subscribe(fn: (e: WidgetBusEvent) => void): () => void;
}
export const widgetBus: WidgetBus;
```

#### `WidgetLayoutV1` / `useWidgetLayout` (source: `panels/widgetLayoutStore.ts`)

```ts
export interface WidgetLayoutV1 {
  v: 1;
  order: WidgetId[];   // arc order, index 0 = leftmost slot
  hidden: WidgetId[];  // dismissed from the bench (summonable later)
}
export const DEFAULT_LAYOUT: WidgetLayoutV1; // full roster, nothing hidden
export function loadWidgetLayout(): WidgetLayoutV1;
export function saveWidgetLayout(l: WidgetLayoutV1): void;
export function useWidgetLayout(): {
  layout: WidgetLayoutV1;
  moveWidget(id: WidgetId, toIndex: number): void;
};
```

Persisted under `localStorage["world:widgetLayout@1"]`. Gate-chosen default: localStorage only, this-device-only — the schema is deliberately shaped so a `users.world_layout` JSONB column is a drop-in upgrade later, touching only this file.

#### `WidgetSpec` / `WIDGET_REGISTRY` (source: `panels/widgetRegistry.ts`)

```ts
export interface WidgetComponentProps {
  slot: BenchSlot;
  focused: boolean;
  lod: "full" | "placard";
  dragHandleProps?: DragHandleProps; // threaded by the rig; undefined pre-W-07
}
export interface WidgetSpec {
  id: WidgetId;
  title: string;
  component: ComponentType<WidgetComponentProps>;
}
export const WIDGET_REGISTRY: Partial<Record<WidgetId, WidgetSpec>>;
export function getWidgetSpec(id: WidgetId): WidgetSpec | undefined;
export function listWidgets(): WidgetSpec[];
```

#### `WorldPanelProps` (source: `panels/WorldPanel.tsx`)

```ts
export interface WorldPanelProps {
  widgetId: WidgetId;
  title: string;
  countChip?: string;
  status?: "ready" | "empty" | "disconnected"; // default "ready"
  emptyLine?: string;
  disconnectedLine?: string;
  focused: boolean;
  lod: "full" | "placard";
  slot: BenchSlot;
  dragHandleProps?: DragHandleProps;
  children: ReactNode; // uikit Container/Text/Button content ONLY
}
export function WorldPanel(props: WorldPanelProps): JSX.Element;
export const PANEL_ROW_CAP = 12; // every widget caps rows, "and N more" footer
```

#### `BenchConfig` / `BenchSlot` / the solver (source: `panels/widgetTypes.ts`, `panels/widgetLayout.ts`)

```ts
export interface BenchConfig {
  center: Vector3Tuple; eyeY: number; radius: number;
  aisleRad: number; maxSlots: number;
}
export interface BenchSlot {
  index: number; widgetId: WidgetId;
  position: Vector3Tuple; rotation: Vector3Tuple; cameraPose: CameraPose;
}
export function solveBenchLayout(order: WidgetId[], cfg?: Partial<BenchConfig>): BenchSlot[];
export function neighborOf(order: WidgetId[], current: WidgetId | null, dir: 1 | -1): WidgetId | null;
export function nearestSlotIndex(order: WidgetId[], yawRad: number, cfg?: Partial<BenchConfig>): number;
```

---

### Draw-Call Budget (Vestibule, bench in view ≤190)

| Bench layer component | Budget |
|---|---|
| Full panels (≤3 × ≤22, uikit batches + frame) | ≤66 |
| Placards (≤4 × ≤4, frame + one SDF title) | ≤16 |
| Focused-panel hero backplate (`FocusedPanelGlass`) | 1 (+1 transmission pass) |
| Bench SDF `<Text>` (≤7 placard titles) | ≤7 |
| **Bench layer total** | **≤90** |
| **New scene ceiling (bench view)** | **≤190** (Meridian's ≤170 retires with it; base scene minus `TodayPanel`'s ~20 plus the bench) |

Transmission registry status: **3/3** (focused lantern + Jarvis ribbon + focused-panel backplate) — the slot the Meridian zenith tablet used to occupy now belongs to the bench.

---

### The Meridian Demolition (changelog)

The Meridian Ring — the whole annulus, its 24-hour dial, its event tablets, its plumb-line, its T-15 toll — is **deleted at the file level**; the `meridian/` directory no longer exists in this repo. Git history is its archive.

**What died:** `meridian/MeridianRing.tsx`, `EventTablets.tsx`, `useRingScrub.ts`, `MeridianLabels.tsx`, `PlumbLine.tsx`, `TollScheduler.tsx`, `MeridianAudio.tsx`, `meridianPoses.ts`, `meridianHover.ts`, `meridianBus.ts`, `meridianGeometries.ts`, `meridianMaterials.ts`, `meridianMappings.ts`, `meridianLayout.ts`, and their tests — roughly 4,100 lines of dial/tablet presentation code, along with the `worldEvents "meridian-toll"` name, the `focusStack` `{kind:"ring"}` level, `CameraRig.setRingScrubActive`, and `MeridianBus`/`tabletHoverBus`.

**What survived, extracted verbatim before the burn:** `classifyTablet` → `classifyEvent`, `linkEventToProject`, and `calendarDotColor` now live in `panels/agenda/agendaLogic.ts` and feed the Agenda panel's row grammar unchanged. The entire gcal data bridge — the provider slice, the SSR seed, `useGcalConnectionStatus`, `diffEventSnapshots` — survives wholesale, simply renamed `meridian` → `calendar` (§3.2 above). Nothing about how the world talks to Google Calendar changed; only the ring that displayed it is gone.

**What's intentionally kept but currently unused:** `public/world/sfx/ring-toll.mp3` stays on disk. It is not wired to anything in Phase 3 — it is reserved for a future **generic reminder chime** (the T-15 "toll" concept, reborn without the ring it used to hang from). Do not delete it; do not re-wire it speculatively.

---

### How to Add a Widget

A "Nutrition widget" — or any new bench citizen — follows this pattern. This is the litmus test the whole section above exists to pass: everything below is real, current code, not aspiration.

1. **Create `panels/NutritionWidget.tsx`** implementing `WidgetComponentProps` (`{ slot, focused, lod, dragHandleProps? }` from `panels/widgetRegistry.ts`). Render your content into `<WorldPanel widgetId="nutrition" title="Nutrition" focused={focused} lod={lod} slot={slot} dragHandleProps={dragHandleProps}>…</WorldPanel>` — **forward `dragHandleProps` straight through** so the panel stays draggable. Cap rows at `PANEL_ROW_CAP` with an "and N more" footer; never render a blank slab — always a `status="empty"`/`"disconnected"` line (§2.8). Mirror `TasksWidget.tsx` for the shape.
2. **Add its data to the provider + `WorldData`.** Extend the `WorldData` interface in `data/useWorldData.ts` additively (e.g. `nutrition: NutritionData`), and mount the read in `data/WorldDataProvider.tsx` using the SAME 2D query key/fn — never a parallel fetch layer. Seed it server-side in `app/(app)/world/page.tsx` and thread the prop through `WorldLoader.tsx` → `WorldCanvas.tsx` → `WorldScene.tsx`, mirroring exactly how the habits/journal slices were added.
3. **Add `"nutrition"` to the `WidgetId` union** in `panels/widgetTypes.ts` — the one place the bench roster's *type* grows.
4. **Register it in `panels/widgetRegistry.ts`** — import the component and add one entry: `nutrition: { id: "nutrition", title: "Nutrition", component: NutritionWidget }` to `WIDGET_REGISTRY`. This file is Conductor-owned (widget units don't edit it mid-wave), but the eventual change really is that one line.
5. **Add `"nutrition"` to the `ROSTER`** array in `panels/widgetLayoutStore.ts` so `DEFAULT_LAYOUT` and the persistence validator both know about the new slot. (A widget added after a user's saved layout was written is handled automatically too — `normalizeLayout` appends any roster id that's neither ordered nor hidden.)
6. **That's it.** `solveBenchLayout`, `WidgetRig`, the LOD law, the honesty states, and the drag/persistence machinery all generalize for free — you never touch `WidgetRig.tsx`, `useWidgetDrag.ts`, or `WorldPanel.tsx`.
7. **Honor `prefers-reduced-motion`** if your widget adds any animation of its own (read `useWorldPrefs()`), and keep your data reads in `render`, memoized, never per-frame — the primitive's own perf discipline (§7.3) assumes every widget follows it.

---

## Changelog

### The Studiolo — 3D World, Phase 1 MVP (U-01 through U-21, 2026-07-06)

The `/world` route ships a complete WebGL2 3D world anchored to live app data with zero parallel stores.

**What shipped:**
- `/world` route with SSR seed data + `ssr:false` Canvas island; WebGL2 capability gate with branded fallback card (`WorldLoader`, `WorldCanvas`, `WorldScene`, `WorldSkeleton`).
- `WorldDataProvider` — shared TanStack Query caches (identical keys/queryFns to the 2D app) + 5 Realtime channels + O(n) snapshot differ + `worldEvents` emitter.
- `solveTreeLayout` — pure, deterministic layout solver: golden-angle boughs, Fibonacci ember shells, quadratic Bézier limb curves.
- Full design-token system (`STUDIOLO` palette, `pickNodeColor` verbatim copy, `oklchToThreeColor` OKLCH→linear-sRGB converter).
- Fresnel-rim hologram material (`makeHologramMaterial`) + `MeshTransmissionMaterial` hero glass (≤3 cap) + `chainOnBeforeCompile` for U-09's shader stacking. Frozen shader-chunk treaty.
- Tree geometry: dais, trunk, bough limbs with OKLCH core filaments (bough colors match the 2D `AreasTree` exactly via the same `pickNodeColor` djb2 hash).
- Instanced project lanterns with class armature rings + hero swap on focus.
- Instanced task embers (`InstancedMesh` cap 1024) with GPU-side `aState` pulse attribute: full state→light grammar (due-today gold pulse 0.5 Hz, overdue red + physical drop, P∞/P1 taper filament) + ascending-spark completion animation (flare 300 ms → rise 6 m / 2.2 s → dissolve).
- Instanced capture fireflies (`InstancedMesh` cap 64) with wander drift + 5 fps heartbeat + `fireflyBus.fly()` for routing flights.
- `CameraRig` — drei `CameraControls`, guided flight (click-glide ~700 ms, Esc pop, `1–9` area keys, hover emissive lift via `maath` damp). `cameraBus` singleton. Camera-pose persist/restore via `sessionStorage`.
- `focusStack` module singleton (`vestibule → bough → lantern` chain, `useSyncExternalStore`).
- Atmosphere: night HDRI (256px), floor disc + brass inlay strips, warm key light, cool fill, 600-vertex dust motes.
- PostFX: one `EffectComposer` — `Bloom(mipmapBlur, threshold=1, intensity=1.2)` + `Vignette(0.4/0.6)`.
- Distance-culled SDF `<Text>` captions (area names, project names ≤6 m, hover caption singleton) + camera-anchored `Ledger` strip.
- `TodayPanel` — uikit holographic panel; task completion triggers the real server action → same cache invalidation → ascending spark.
- `JarvisRing` + `JarvisRibbon` — ring mesh, idle breath, summon/dismiss springs, the ONE `<Html>` DOM input (real caret). `useJarvisWorld` state machine wired to `streamJarvis` (same SSE path as the 2D console).
- `JarvisChoreographer` + `LightThread` — `onAction` → receipt resolution → camera yaw assist → `fireflyBus.fly()` → curved bezier routing flight → light-thread drawRange animation → firefly cools cyan→candleflame as the real ember kindles.
- Litany boot sequence — 6 s spring-driven keyframe timeline: floor inlay stagger → bough reveal uniforms → Ledger typewriter. Skip on any keypress. Same-session revisit skips via `sessionStorage`.
- Three WebAudio chimes (glass bell / cork pop / two-note) gesture-unlocked via lazy `AudioContext`.
- `useWorldPrefs` / `worldPrefersReducedMotion` — live `prefers-reduced-motion` honesty layer wired to 5 consumers (CameraRig, Embers, Fireflies, JarvisRing/Ribbon, Litany).
- `Cmd+\` mode toggle — round-trips between `/world` and the last 2D route with camera-pose persistence.
- Vitest unit test suite for the data-bridge (classifyTask truth table, diffSnapshots transition detection, solveTreeLayout stability).
