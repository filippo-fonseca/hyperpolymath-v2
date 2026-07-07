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
| `panels/TodayPanel.tsx` | Today holographic panel | One `@react-three/uikit` `<Root>` panel at the dais listing due/overdue tasks. Completion calls the same server action as the 2D `UpcomingTasksWidget` → `invalidateQueries(tableKey("tasks", userId))` → differ → ascending spark. | `TodayPanel` |
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

## Meridian Ring (Phase 2)

> *"Time in every other app is a grid you look at. Here it is a wheel you put your hand on."*

Google Calendar rendered as a great slow brass-and-glass annulus turning overhead — canted like an armillary sphere's ecliptic. The day is a 24-hour dial; *now* is always at zenith under the plumb-line of light; events are glass tablets riveted to the ring, approaching you all morning and swinging behind you into sepia once they pass. A new engineer can add a ring widget from this section alone.

---

### Module Map (meridian/)

| File | System | What It Owns | Key Exports |
|---|---|---|---|
| `meridian/meridianLayout.ts` | Dial math | Pure 24h dial math: `timeToAngle`, `ringRotationFor`, `solveMeridianLayout`, `visibleSlots`, `classifyTablet`, `linkEventToProject`, `resolveOverlaps`. Zero `three` imports; deterministic given its inputs; memoizable by identity. | `MeridianConfig`, `TabletSlot`, `TabletState`, `TabletPlacement`, `timeToAngle()`, `ringRotationFor()`, `solveMeridianLayout()`, `visibleSlots()`, `classifyTablet()`, `linkEventToProject()`, `resolveOverlaps()` |
| `meridian/meridianMappings.ts` | State→light grammar | Tablet tint resolution (`resolveTabletTint`), calendar-dot color for hover captions (`calendarDotColor`), the `TABLET_VISUALS` constants (sepia mix, emissive, rim, lean), and `TABLET_STATE_ID` encoding. Zero `three` imports. | `resolveTabletTint()`, `calendarDotColor()`, `TABLET_VISUALS`, `TABLET_STATE_ID`, `PARCHMENT_HEX`, `oklchToHex()` |
| `meridian/meridianBus.ts` | Scrub seam | The frozen `MeridianBus` interface + module singleton. Wave-M2 components import `meridianBus` immediately; M-10 registers the real impl via `__registerMeridianBusImpl` at mount (no second bus needed). Buffered subscriptions wire through on registration. | `MeridianBus`, `meridianBus`, `__registerMeridianBusImpl()` |
| `meridian/meridianMaterials.ts` | Material factory | Three material factories: `makeRingBrassMaterial` (Studiolo Brass, metalness 0.85, non-emissive), `makeEngravedStripMaterial` (sub-bloom Candleflame warmth), `makeTabletMaterial` (hologram recipe reparameterised — parchment, Candleflame rim; M-06 chains the state chunk on), `makeGodRayMaterial` (additive, `toneMapped:false`, ~0.06 opacity). | `makeRingBrassMaterial()`, `makeEngravedStripMaterial()`, `makeTabletMaterial()`, `makeGodRayMaterial()` |
| `meridian/meridianGeometries.ts` | Geometry singletons | Module-local singletons for the Meridian Ring: `RING_GEOMETRY`, `TABLET_GEOMETRY`, `TICK_GEOMETRY`, `BAND_GEOMETRY`, `SHAFT_GEOMETRY`. One per file; never constructed inside a component or `useFrame`. NOT added to the frozen `materials/sharedGeometries.ts`. | `RING_GEOMETRY`, `TABLET_GEOMETRY`, `TICK_GEOMETRY`, `BAND_GEOMETRY`, `SHAFT_GEOMETRY` |
| `meridian/meridianHover.ts` | Hover seam | `tabletHoverBus` — a pure, `three`-free pub/sub between `EventTablets` (emitter, M-06) and `MeridianLabels` (consumer, M-11). `set(eventId|null)` dedupes repeated `onPointerMove` calls; `subscribe` returns an unsubscribe fn. Keeps the dependency direction one-way. | `TabletHoverBus`, `tabletHoverBus` |
| `meridian/meridianPoses.ts` | Camera poses | Pure pose math for the look-up ritual (no React, no `three` runtime). `RING_VIEW_POSE`: camera low on the dais (~y 1.1, z 7.0), target the ring center — the ring looms overhead. `tabletFocusPose(slot, dialRotation)`: ~2.5 m reading distance, camera below the tablet so the lean-down reads correctly. | `RING_VIEW_POSE`, `tabletFocusPose()` |
| `meridian/MeridianRing.tsx` | Ring structure | The canted brass annulus overhead. One `<group>` at `[0, 8.5, 0]` rotated `cantRad` about X; inside it a dial group whose y-rotation = `ringRotationFor(now, scrubOffsetMs, tz)` (read via `meridianBus`). Children: lathe ring mesh, engraved strip, ONE `InstancedMesh(TICK_GEOMETRY)` for 24 hour ticks + 96 quarter ticks (majors 2× scaled), fixed zenith pointer. `userData = { kind:'ring' }` for raycast pick → look-up. Boots `useRingScrub`. | `MeridianRing` |
| `meridian/EventTablets.tsx` | Tablet system | ONE imperative `InstancedMesh(TABLET_GEOMETRY, …, 128)` for all event tablets + a small `InstancedMesh(BAND_GEOMETRY, …, 8)` for all-day bands. Freelist + `Map<eventId, slot>`; `aTabletState` instanced attribute (§2.4 treaty). Zenith hero swap: slot nearest zenith with `state === "current" | "imminent"` hides its instance and renders one `heroGlass` mesh (consuming the ≤3-cap reserve). T-15 lean-down: 25° pitch spring on `worldEvents("meridian-toll")`; instant state-color under `prefers-reduced-motion`. Hover → `tabletHoverBus.set()`; click → `focusStack.push({ kind:"ring", eventId })`. | `EventTablets` |
| `meridian/PlumbLine.tsx` | Plumb-line | The now-line of light: thin emissive box (Candleflame, `toneMapped:false`, > 1 intensity → Bloom) falling from the zenith pointer to y ≈ 4.2 (never touches the Tree). Wrapped by `SHAFT_GEOMETRY` cone with `makeGodRayMaterial`. Static geometry; opacity breathes ±15% only during the 4 s post-interaction window (shares the DustMotes activity flag, zero new demand source). Fixed frame — does not rotate with the dial. | `PlumbLine` |
| `meridian/MeridianLabels.tsx` | Labels | SDF `<Text>` (EB Garamond, from `text/fonts.ts` constants): 8 hour numerals (every 3 h, old-style figures, sepia-on-brass, z-inset, parented inside the dial group so they rotate with time; `visible` only when ring-focused or camera pitch > ~35° up); one italic date line under the zenith pointer (re-composed from the scrub center via `meridianBus.subscribe`, day-change throttled, troika mutation, not React state); one hover caption singleton (title · time range · calendar-color dot via `tabletHoverBus.subscribe`) + one zenith caption for the current/imminent tablet. | `MeridianLabels` |
| `meridian/TollScheduler.tsx` | T-15 scheduler | Renders `null`. Arms exactly ONE `setTimeout` for `startMs − 15 min` of the nearest upcoming timed event; dedupes via a session `Set<eventId>` so each event tolls at most once per session. Re-arms on `meridian.events` identity change; recomputes on `visibilitychange` (timer drift in background tabs). Emits `worldEvents("meridian-toll", { eventId, title, startIso })`. Zero rAF impact. | `TollScheduler` |
| `meridian/MeridianAudio.tsx` | Positional audio | Drei `<PositionalAudio url="/world/sfx/ring-toll.mp3" distance={6} loop={false}>` parented at the zenith marker (~[0, 8.5, 0]) — the T-15 toll literally arrives from overhead. Lazy mount: the audio node doesn't exist until the first `worldEvents("meridian-toll")`; mounted inside `<Suspense fallback={null}>` so the ~13 KB MP3 stays off the boot path. Reuses the world's shared gesture-unlock (`isAudioUnlocked()`) and mute (`isMuted()`) flags from `audio/synth.ts` — no second `AudioContext`. | `MeridianAudio` |
| `meridian/useRingScrub.ts` | Zoetrope scrub | Implements and registers the pre-frozen `MeridianBus`. While `focus.kind === "ring"` (no `eventId`): capture-phase `wheel` listener maps `deltaY`/`deltaX` → `addScrubVelocity`; heavy brass momentum (exponential decay ~350 ms half-life) + soft 30-min detent (`easing.damp`); `snapToNow` = critically-damped spring to offset 0 (~700 ms). Offset clamped to loaded slab with rubber-band at edges. Self-invalidating frame loop (exits when settled → 1-frame/min idle regime). Reduced motion: discrete 1-hour steps, instant snap. | `useRingScrub()` (called once in `MeridianRing`) |

---

### The Dial Model

The ring is a **24-hour dial**; *now* is always at zenith. The dial group's y-rotation is:

```ts
ringRotationFor(nowMs, scrubOffsetMs, tz)
// = ZENITH_ANGLE − timeToAngle(nowMs + scrubOffsetMs, tz)
```

`timeToAngle` converts wall-clock time-of-day in the user's IANA timezone (via `TZDate`) to a dial angle: `0 = midnight, π = noon, 2π = next midnight`. Using wall-clock rather than elapsed-ms means a DST-transition day (a 23 h or 25 h day) never misplaces an afternoon event — 2pm is always `14/24` of the dial.

**Tablet placement convention:** tablets are placed on the dial's inner circle at `[R·sinβ, 0, R·cosβ]` in the dial group's local frame (β = dial angle after the dial has turned), where `β = 0` is the ring's top (zenith, i.e. toward the Vestibule camera azimuth). After canting the parent group `cantRad` about X (high side toward +Z), the world position of a tablet at angle β is:

```
tx = R·sinβ
ty = height + R·cosβ·sin(cantRad)
tz = R·cosβ·cos(cantRad)
```

**Scrubbing** advances `scrubOffsetMs`, rolling a ~28 h display window (zenith ±14 h) across the loaded ±7-day slab. The camera and the tablets never move — the dial re-orients and tablets enter/leave the freelist as the window rolls. Days "flicker past" at scrub speed.

**The ≤3 transmission/heroGlass cap:** `heroGlass()` is limited to 3 live instances (the dev registry). They are now all consumed: (1) the focused lantern, (2) the Jarvis ribbon, (3) the zenith tablet (the `current | imminent` tablet nearest zenith). Only one of (1) and (3) is hero at a time in practice (ring focus and lantern focus are mutually exclusive stack levels), so swap-on-focus is idiomatic.

---

### Frozen Contracts (Phase 2 additions)

These are established at Phase-2 Wave M1 close. Changes require an orchestrator amendment commit.

#### `worldEvents` — amended to 6 event names (source: `data/diffing.ts`)

```ts
type WorldEventMap = {
  // ...five Phase-1 names unchanged...
  "meridian-toll": { eventId: string; title: string; startIso: string };
  // emitted by TollScheduler.tsx; consumed by MeridianAudio + EventTablets lean-down
};
```

The `chime` kind union is NOT extended — the toll is positional audio and does NOT route through `audio/Chimes.tsx`.

#### `MeridianBus` / `meridianBus` (source: `meridian/meridianBus.ts`)

```ts
export interface MeridianBus {
  getScrubOffsetMs(): number;
  addScrubVelocity(msPerSec: number): void;   // wheel deltas
  snapToNow(ms?: number): Promise<void>;      // decelerating return; Esc path
  subscribe(fn: (offsetMs: number) => void): () => void;  // day-change listeners
}
export const meridianBus: MeridianBus;        // facade; impl registered by useRingScrub
export function __registerMeridianBusImpl(next: MeridianBus): () => void;
// Called once by useRingScrub on mount; returns an unregister fn for HMR/unmount.
// Pending subscribers are wired through automatically on registration.
```

Frame consumers read the offset via the getter inside `useFrame`; `subscribe` is for coarse listeners (e.g. the date line re-composing once per day-change, not per frame).

#### `tabletHoverBus` (source: `meridian/meridianHover.ts`)

```ts
export interface TabletHoverBus {
  get(): string | null;           // currently-hovered eventId; null = nothing
  set(eventId: string | null): void;  // M-06 only; dedupes repeated onPointerMove
  subscribe(fn: (eventId: string | null) => void): () => void;  // M-11 consumer
}
export const tabletHoverBus: TabletHoverBus;
```

#### `worldEvents "meridian-toll"` — T-15 signal

Emitted by `TollScheduler` exactly once per event per session. Payload: `{ eventId, title, startIso }`. Consumers: `MeridianAudio` (plays the toll from above), `EventTablets` (springs the lean-down).

#### `focusStack` — amended `FocusLevel` (source: `camera/useFocusStack.ts`)

```ts
type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string }
  | { kind: "ring"; eventId?: string };   // NEW — rank 1 (sibling of bough) when no eventId,
                                          //        rank 2 (sibling of lantern) when eventId present
```

`{ kind:"ring" }` = ring framed overhead (look-up); `{ kind:"ring", eventId }` = a specific tablet focused. Esc from ring pops to vestibule AND awaits `meridianBus.snapToNow()` before the camera glides home.

#### `WorldData.meridian` / `MeridianData` (source: `data/useWorldData.ts`)

```ts
interface MeridianData {
  status: "connected" | "not_connected" | "expired";  // reuses GcalConnectionStatus
  events: GcalEventDTO[];           // rolling ±7-day slab, raw DTOs from gcal
  calendars: GcalCalendarMeta[];    // for hover-caption calendar-dot color
  timezone: string;                 // users.timezone ?? "UTC"
  windowStartMs: number;            // loaded slab start (inclusive)
  windowEndMs: number;              // loaded slab end (exclusive)
}
// WorldData.meridian is additive — all Phase-1 fields are byte-identical.
```

`status` maps to the existing `useGcalConnectionStatus()` key (`["gcal-connection-status"]`). The world reuses this key so the Settings badge and the ring never disagree. Disconnected → ring renders quiet dark brass with one engraved nudge; never a crash, never OAuth from the world.

#### `isAudioUnlocked()` / `isMuted()` seam (source: `audio/synth.ts`)

```ts
export function isAudioUnlocked(): boolean;  // true once the shared gesture has fired
export function isMuted(): boolean;           // reads localStorage['world:muted']
```

`MeridianAudio` reads these before calling `.play()` — the world has exactly ONE gesture-unlock path and ONE mute flag. Do not add a second.

---

### The Meridian Idle Rule (§4.1 — law)

> The dial's rotation is a **pure function** `ringRotationFor(Date.now(), scrubOffsetMs, tz)` evaluated only on demanded frames. While idle, the ONLY meridian-originated frame demand is the world's existing **minute clock** calling `invalidate()` once — **one demanded frame per minute**, in which the dial advances ~0.25°, tablet states reclassify, and the world sleeps again.
>
> Continuous frame demand is permitted ONLY while: (a) `focus.kind === "ring"` AND the camera is moving, (b) `|scrubVelocity| > ε` or a snap/rubber-band animation is live, (c) a lean-down/hero-swap/enter-leave spring is live (auto-invalidating via spring), or (d) the 4 s post-interaction breath window is open (god-ray breathe rides it). Outside these, meridian rAF contribution is exactly 1 frame/min.

This amends the Phase-1 idle acceptance criterion to: `idle 10 s → rAF → 0 (± firefly heartbeat ≤5 fps, ± meridian minute-tick = 1 frame/min)`.

The scrub hook (`useRingScrub`) is **self-invalidating with early exit**: each live frame calls `invalidate()` to demand the next; the moment the animation settles the loop exits without invalidating, and the world falls straight back to the idle regime.

---

### Draw-Call Budget (Vestibule, ring in frame ≤170)

| Meridian layer component | Budget |
|---|---|
| Ring structure (annulus + engraved strip + ticks `InstancedMesh` + zenith pointer) | ≤4 draw calls |
| Event tablets (`InstancedMesh` cap 128) + all-day bands (`InstancedMesh` cap 8) | 2 |
| Zenith hero tablet (`heroGlass` — the ≤3-cap reserve slot, now consumed) | 1 (+1 transmission pass) |
| Plumb-line + god-ray cone | 2 |
| Meridian SDF `<Text>` (8 numerals + date line + hover caption + zenith caption) | ≤11 |
| **Meridian layer total** | **≤20** |
| **New scene ceiling (Vestibule, ring in frame)** | **≤170** (was ≤150) |

Transmission registry status: **FULL** (focused lantern + Jarvis ribbon + zenith tablet = 3/3). Any later phase that wants a glass object must free one slot contextually (swap-on-focus is the idiomatic pattern).

---

### How to Add a Ring Widget

A "moon-phase widget" — or any object that lives on or near the ring — follows this pattern:

1. **Add a slot type** to `meridian/meridianLayout.ts` (mirror of `TabletSlot`). Keep it a pure type with angle-and-number math only (no `three` imports). `solveMeridianLayout` or a sibling solver computes positions.
2. **Extend `MeridianData`** in `data/useWorldData.ts` additively. `WorldDataProvider` populates it from the same gcal query slice or a new shared-key query — never a parallel store.
3. **Create the component** (e.g. `meridian/MoonPhaseWidget.tsx`) — imperative `InstancedMesh` if there are many; a single mesh if there is one. Consume `useWorldData()`. Read the scrub offset in `useFrame` via `meridianBus.getScrubOffsetMs()` (never React state).
4. **Demand frames only during activity.** If the widget is decorative idle content, it should NOT call `invalidate()` — the minute-tick already demanded that frame. If it animates (e.g. a spring), use a self-invalidating loop (call `invalidate()` inside `useFrame`, early-return when settled).
5. **Honor `prefers-reduced-motion`.** Read `worldPrefersReducedMotion()` at the top of your `useFrame` and collapse animations to instant states.
6. **If the widget needs audio**, read `isAudioUnlocked()` + `isMuted()` from `audio/synth.ts`. No second `AudioContext`.
7. **If a new event name is needed**, amend `WorldEventMap` in `data/diffing.ts` with an orchestrator amendment commit (bus has 6 names after Phase 2; grow it additively, never silently).
8. **Mount in `WorldScene.tsx`** — a single-line insertion. Meridian components mount after `<Embers/>` and before `<CameraRig/>` for pickables; render-null systems after `<Chimes/>`. `JarvisRing` stays immediately before `PostFX`; `PostFX` stays last.

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
