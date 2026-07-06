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
