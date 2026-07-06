# THE STUDIOLO — BUILD PLAN

> Architect: Fable. Executors: Opus engineering pipeline (parallel agents, atomic commits).
> Sealed inputs: `VISION.md` (the dream), `TECH.md` (the rails), `CODEBASE-MAP.md` (the ground).
> This plan is the contract between the three. Every claim here was verified against the live
> codebase on 2026-07-06 (`getSidebarTree`, `TaskWithProjects`, `tableKey`, `useTableSubscription`,
> `streamJarvis`, `GlobalHotkeys`, `pickNodeColor` all confirmed at the named paths).

---

## 1. GUIDING PRINCIPLES (non-negotiable)

1. **2D stays primary.** The Page is the default, fast, accessible, SSR data-entry surface. Nothing in this plan touches the 2D app's behavior except: one new hotkey (`Cmd+\`), one new route (`/world`). If the 3D world vanished tomorrow, the app is untouched.
2. **One truth, two theatres.** The world is an `ssr:false` client island that reads the SAME TanStack Query caches under the SAME query keys (`tableKey("tasks", userId)`, `tableKey("captures", userId)`, the sidebar-tree query) with the SAME `useTableSubscription` Realtime invalidation. **No parallel store. No world-only fetch layer. No Zustand.** A task completed on `/tasks` ascends as a spark in `/world` because both surfaces share one cache.
3. **Preserve `AreasTree` + `getSidebarTree`.** `apps/web/components/areas/AreasTree.tsx` is not modified. `getSidebarTree` (`apps/web/lib/db/queries/sidebar.ts`) is the single source of the world's geography. The 2D tree is the canopy seen from above — the same `pickNodeColor(id)` OKLCH hash drives bough light in 3D and branch stroke in 2D.
4. **Reuse JARVIS wholesale.** `POST /api/jarvis` SSE via `streamJarvis` (`apps/web/components/jarvis/jarvis-stream-client.ts`) is the only agent path. The world adds a *renderer* for its events (ring, ribbon, firefly flight), never a new agent API. Post-action invalidation reuses `invalidateAfterJarvisAction`.
5. **WebGL, not WebGPU, for v1.** Default renderer; `@react-three/postprocessing` Bloom works out of the box. WebGPU is a Phase-7 capability-gated fast-follow.
6. **Guided flight, never free-look.** `CameraControls.setLookAt(..., true)` glides; Esc pulls back one level; number keys jump to areas. No WASD, no pointer lock, no head-bob in MVP.
7. **State is light — the grammar is sacred.** Due-today = gold pulse `#E8C46B` @ 0.5 Hz. Overdue = `#FF6B4A` + physically dropped. Done (`lesno`) = flare → ascending spark → dissolve + glass bell. P∞/P1 = vertical taper filament. This grammar is implemented ONCE (in the ember system) and never approximated elsewhere.
8. **`prefers-reduced-motion` honored completely.** All springs/flights/pulses collapse to crossfades; reduced-motion users default to the 2D Page; the world remains reachable but static-calm.
9. **Lightweight-first.** `frameloop="demand"`, `dpr={[1,2]}`, one `InstancedMesh` per object family, one Bloom composer, ≤3 transmission objects, draw calls ≤150. §7 is law; every unit carries its perf constraints.
10. **Atomic commits per unit** — deps/config, lib, component, wiring, docs each commit separately, explicit pathspecs. Wave structure guarantees no two parallel agents touch the same file.

---

## 2. TARGET ARCHITECTURE

### 2.1 Route & mounting

New route **`apps/web/app/(app)/world/page.tsx`** inside the authenticated `(app)` route group. It inherits the full provider stack from `(app)/layout.tsx` — auth gate (`getUserOrRedirect`), `QueryProvider` (TanStack Query), `NuqsAdapter`, `SearchProvider`, `NavHistoryProvider`, `AppShell` — so the Canvas island sits INSIDE the existing QueryClient context and can read shared caches for free.

```
app/(app)/world/page.tsx            — Server Component. Fetches SSR seed data:
                                       getSidebarTree(user.id) (active only),
                                       getAllTasksForUser(user.id),
                                       captures list. Renders <WorldLoader .../>.
components/world/WorldLoader.tsx    — 'use client'. Owns the dynamic(() =>
                                       import('./WorldCanvas'), { ssr:false,
                                       loading: <WorldSkeleton/> }) boundary +
                                       WebGL2/reduced-motion capability gate
                                       (falls back to a "return to the Page" card).
components/world/WorldCanvas.tsx    — 'use client'. <Canvas frameloop="demand"
                                       dpr={[1,2]} gl={{ antialias:true,
                                       powerPreference:'high-performance' }}
                                       camera={{ position:[0,1.6,6], fov:55 }}>.
                                       Mounts <WorldScene/>. NOTHING above this
                                       file imports three.
```

The world renders **full-bleed inside the AppShell main pane** (sidebar remains available; VISION's Vestibule is the main pane's content). `(app)/template.tsx`'s 150ms fade covers route entry.

### 2.2 Canvas component tree

```
<Canvas frameloop="demand" dpr={[1,2]}>
  <WorldScene>                        // composition root, no logic
    <WorldDataProvider>               // §2.3 — bridges TanStack Query → scene
      <CameraRig/>                    // drei <CameraControls makeDefault>, focus stack, keys
      <Atmosphere/>                   // floor disc, <Environment files resolution={256}>,
                                      // 2 lights, dust-mote points
      <Bvh firstHitOnly>              // raycast acceleration around all pickables
        <TreeSystem>                  // geography
          <Trunk/>                    // dais + trunk mesh, sap shader strip
          <Boughs/>                   // one merged/instanced bough geometry set
          <Lanterns/>                 // ONE <Instances> for all project lanterns
          <Embers/>                   // ONE InstancedMesh for ALL task embers (imperative)
          <Fireflies/>                // ONE InstancedMesh for capture fireflies
          <WorldLabels/>              // distance-culled SDF <Text> captions
        </TreeSystem>
      </Bvh>
      <TodayPanel/>                   // uikit <Root> panel at the dais
      <JarvisRing/> + <JarvisRibbon/> // ring mesh + drei <Html> input + light-thread
      <Ledger/>                       // SDF <Text> strip, bottom-center
      <Litany/>                       // boot sequence conductor (renders nothing after t=6s)
      <PostFX/>                       // ONE <EffectComposer>: Bloom(mipmapBlur, threshold 1) + Vignette
      <PerfGovernor/>                 // drei <PerformanceMonitor> → DPR/effects downgrade
    </WorldDataProvider>
  </WorldScene>
</Canvas>
```

### 2.3 Data flow (the bridge, not a store)

`WorldDataProvider` is a thin client component that runs the EXACT hooks the 2D app runs:

- **Areas/projects:** `useQuery({ queryKey: <same key Sidebar.tsx uses for the sidebar tree>, queryFn: getSidebarTreeForCurrentUser, initialData: ssrTree })` + `useTableSubscription("areas", userId)` + `useTableSubscription("projects", userId)`. (Executor: read `components/shell/Sidebar.tsx` and copy its key verbatim — sharing the cache slice is the point.)
- **Tasks:** `useQuery({ queryKey: tableKey("tasks", userId), queryFn: getTasksForCurrentUser, initialData: ssrTasks })` + `useTableSubscription("tasks", userId)` + `useTableSubscription("tasks_projects", userId)` — identical to `TasksClient.tsx`.
- **Captures:** `useQuery({ queryKey: [...tableKey("captures", userId), null], queryFn: () => getCapturesForCurrentUser(), initialData: ssrCaptures })` + `useTableSubscription("captures", userId)` — identical to `RecentCapturesWidget.tsx`.

It exposes the results through React context as **plain derived arrays plus a layout solve** (`treeLayout.ts`, pure function, memoized on data identity). Scene systems consume context in their render (cheap — data changes at Realtime cadence, not frame cadence) and write per-frame animation ONLY via `useFrame` mutation. React state never changes per-frame.

### 2.4 JARVIS in the world

`Cmd+K` (already wired app-wide by `GlobalHotkeys.tsx` → `focusJarvis()`) is intercepted on `/world` by the world's own key handler to summon the ring instead. The ribbon's input is a real DOM `<input>` inside drei `<Html transform>` (real caret — TECH.md hard rule). Submit calls `streamJarvis(payload, callbacks, signal)` directly:

- `onTurnStart` → ring flies to center, ribbon unrolls.
- `onText` delta → italic Garamond SDF text writes onto the ribbon.
- `onQueued` → ring's interior three-mote "thinking" orbit.
- `onAction` → the climax: resolve the action's target (created task's project → area via the sidebar tree) and dispatch a **firefly routing flight** to that bough; then run the same post-action invalidation the 2D app uses (`invalidateAfterJarvisAction`), which refetches tasks and kindles the real ember.
- `onError` → ribbon folds with an ember-red edge flash.

### 2.5 `Cmd+\` — World ↔ Page

A ~20-line addition to `apps/web/components/shell/GlobalHotkeys.tsx` (the only 2D file touched): `(e.metaKey||e.ctrlKey) && e.key === "\\"` → if `pathname.startsWith("/world")` `router.push(lastPageRoute ?? "/lifeos")` else store current route and `router.push("/world")`. Last-2D-route and last-camera-pose persist in `sessionStorage` (`world:lastPageRoute`, `world:cameraPose`). Transition is the existing 150ms template fade for MVP (the cinematic trunk-pull-up crossfade is a later-phase polish item).

### 2.6 File/folder layout (complete, collision-free)

```
apps/web/app/(app)/world/page.tsx
apps/web/components/world/
  WorldLoader.tsx            WorldCanvas.tsx           WorldScene.tsx
  WorldSkeleton.tsx          PerfGovernor.tsx
  data/
    WorldDataProvider.tsx    useWorldData.ts           treeLayout.ts
    mappings.ts              diffing.ts
  materials/
    tokens.ts                hologram.ts               sharedGeometries.ts
  tree/
    Trunk.tsx  Boughs.tsx  Lanterns.tsx  Embers.tsx  Fireflies.tsx
  camera/
    CameraRig.tsx            useFocusStack.ts          useWorldKeys.ts
  env/
    Atmosphere.tsx           PostFX.tsx                DustMotes.tsx
  panels/
    TodayPanel.tsx
  jarvis/
    JarvisRing.tsx  JarvisRibbon.tsx  useJarvisWorld.ts  LightThread.tsx
  text/
    WorldLabels.tsx          Ledger.tsx                fonts.ts
  boot/
    Litany.tsx               useLitanySequence.ts
  audio/
    chimes.ts
apps/web/public/world/
  hdri/night-256.hdr         fonts/EBGaramond-Regular.woff
  fonts/EBGaramond-Italic.woff
  sfx/glass-bell.mp3  cork-pop.mp3  two-note.mp3
```

---

## 3. DEPENDENCIES

Exact installs (versions pinned per TECH.md, verified against npm 2026-07-06). Run in `apps/web/`:

```bash
npm install three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 @react-three/postprocessing@3.0.4
npm install @react-three/uikit@1.0.73 @react-three/uikit-default@1.0.73
npm install @react-spring/three@latest maath@latest three-mesh-bvh@0.9.10
npm install -D @types/three leva@latest
```

(`howler` deferred — MVP's three chimes use a tiny raw-WebAudio pool in `audio/chimes.ts`, zero deps.)

**Config:** `apps/web/next.config.ts` gains `transpilePackages: ['three']` (merge into the existing config object; Turbopack handles the rest).

**Assets to source (committed to `apps/web/public/world/`):**
1. **Night HDRI, low-res** — a CC0 1k night/moonlit `.hdr` from Poly Haven (e.g. "moonless golf" or "dikhololo night"), downsized to ≤1k; loaded with `<Environment files="/world/hdri/night-256.hdr" resolution={256}>`.
2. **EB Garamond static `.woff`** — Regular + Italic, downloaded from Google Fonts (the app currently uses `next/font/google`, which does not expose a file troika can parse; SDF `<Text font>` needs a real URL). OFL license file alongside.
3. **Three SFX clips** ≤30 KB each: glass bell, cork pop, two-note ascending chime (CC0, e.g. freesound).

---

## 4. PHASED ROADMAP

| # | Phase | Goal | Ships | Demo / acceptance moment |
|---|---|---|---|---|
| **1** | **The Tree at Night (MVP)** | Prove the magic — VISION §9 exactly | `/world` route; live Tree from `getSidebarTree`; instanced lanterns + embers with FULL state grammar incl. ascending-spark completion reacting to Realtime; guided flight (click-glide, Esc, `1–9`, hover lean + caption); ONE uikit Today panel; `Cmd+K` Jarvis ring/ribbon + firefly routing flight; 6-second Litany boot; `Cmd+\` escape hatch; reduced-motion path; perf hardening | Stand on the dais. Complete a task from the Today panel → spark ascends + glass bell. Type one sentence into `Cmd+K` → firefly flies to the right bough and kindles an ember. `Cmd+\` → intact 2D app. 60 fps throughout. |
| **2** | **The Meridian Ring** | The day as an instrument | Overhead 24h annulus; GCal events as glass tablets (read via existing calendar API path); now-plumb-line + god-ray; T-15 lean-down + toll; area-hue tinting | Look up at 1:45pm and see the 2pm lecture tablet approaching zenith; at 1:45 it tolls once from overhead (`PositionalAudio`). |
| **3** | **Project Mode — the Forge** | Enter a project | Double-click lantern → unfold; kanban ember constellations (todo/doing/done from `status` + `kanbanPosition`); pinboard of project captures; ONE drei `<Html>` real editor panel; rest of Tree dims to Moonlace constellation lines | Double-click the Hyperpolymath lantern, edit a task's notes with a real caret, complete it, watch the spark ascend past your shoulder inside the forge. |
| **4** | **The Cartographer's Table** | Week planning as cartography | `W` → canopy camera + 7-column parchment table; drag unscheduled embers onto days (updates `due_date` via existing server actions); load heat-map columns | Deal five tasks across the week by drag; verify each `due_date` changed in the 2D app. |
| **5** | **The Zoetrope** | Time as a wheel | Ring scrub gesture (two-finger swipe → ring angular velocity + brass-momentum deceleration); day flicker LOD; catch-a-day → tablets lean down | Scrub to next Friday in one flick; the ring decelerates and Friday's tablets present themselves. |
| **6** | **Full sound + polish** | The chamber breathes | Room tone (gesture-gated), full pentatonic chime family, positional travel-swell, Jarvis TTS room reverb, grab-and-throw panels, panel-arrangement persistence | Day-in-the-life run-through (VISION §7) with eyes closed still legible by ear. |
| **7** | **WebGPU mode** | Fast-follow renderer | `'gpu' in navigator` probe → async `gl` factory (`three/webgpu` + `renderer.init()`); TSL ports of the hologram/fresnel materials; node-based post pipeline replacing `@react-three/postprocessing` | Same scene, same grammar, WebGPU renderer active on Safari 26+/Chrome, with automatic WebGL fallback. |

Phases 2–7 are sequenced but independent enough to reshuffle. Everything below decomposes **Phase 1 only** (later phases get their own decomposition when reached).

---

## 5. WORK-UNIT DECOMPOSITION (Phase 1)

### Dependency graph & waves

```
WAVE 1 (parallel, foundational — no unit depends on another wave-1 unit)
  U-01 deps-config        U-02 island-scaffold      U-03 tokens-materials
  U-04 data-bridge        U-05 assets

WAVE 2 (parallel; each depends only on wave 1)
  U-06 tree-geometry   [U-02,03,04]
  U-07 camera-rig      [U-02]           (uses layout TYPES from U-04, not visuals)
  U-08 atmosphere-post [U-02,03,05]
  U-09 ember-system    [U-03,04]        (renders standalone off layout data)
  U-10 lantern-system  [U-03,04]

WAVE 3 (parallel; integration on top of wave 2)
  U-11 labels-ledger   [U-04,05,06]
  U-12 today-panel     [U-02,04]
  U-13 jarvis-ring     [U-02,05,07]
  U-14 firefly-system  [U-04,09]
  U-15 mode-toggle     [U-02]           (only unit touching a shell file)

WAVE 4 (parallel; needs the assembled world)
  U-16 jarvis-routing-choreography [U-13,14,06]
  U-17 litany-bootup   [U-06,08,11]
  U-18 chimes          [U-09,14]
  U-19 reduced-motion-and-gating [U-07,08,09,17]

WAVE 5 (sequential closeout)
  U-20 perf-hardening  [all]
  U-21 docs-changelog  [all]
```

File ownership is disjoint within every wave (checked against §2.6): no two parallel agents write the same file. Cross-unit contracts are TYPES exported from wave-1 units (`treeLayout.ts`, `tokens.ts`, context shape), frozen at the end of wave 1.

### Unit index (scope · files · deps · acceptance · difficulty)

| ID | Slug | One-line scope | Difficulty |
|---|---|---|---|
| U-01 | deps-config | Install pinned 3D deps; `transpilePackages:['three']` | 0.15 |
| U-02 | island-scaffold | `/world` route, SSR seed fetch, `ssr:false` Canvas island, skeleton, capability gate | 0.4 |
| U-03 | tokens-materials | Palette tokens, cheap fresnel-rim hologram material factory, shared geometries | 0.65 |
| U-04 | data-bridge | WorldDataProvider (shared-key queries + Realtime), treeLayout solver, data→visual mappings, snapshot differ | 0.6 |
| U-05 | assets | HDRI, EB Garamond woffs, 3 SFX, font preload helper | 0.1 |
| U-06 | tree-geometry | Dais, trunk, bough limb meshes from layout, sap-light strip | 0.55 |
| U-07 | camera-rig | CameraControls guided flight, focus stack, Esc, `1–9`, hover lean | 0.7 |
| U-08 | atmosphere-post | Floor, Environment, lights, dust motes, Bloom+Vignette composer | 0.45 |
| U-09 | ember-system | ONE InstancedMesh of task embers, full state→light grammar, ascending-spark completion | 0.85 |
| U-10 | lantern-system | Instanced project lanterns, class armature ring, load-based glow | 0.55 |
| U-11 | labels-ledger | Distance-culled SDF Text captions + the Ledger strip | 0.45 |
| U-12 | today-panel | uikit Today panel bound to live tasks, complete-from-world | 0.55 |
| U-13 | jarvis-ring | Ring mesh + breathing, Html ribbon input, streamJarvis wiring | 0.7 |
| U-14 | firefly-system | Instanced capture fireflies, drift swarm, land-and-cool | 0.7 |
| U-15 | mode-toggle | `Cmd+\` in GlobalHotkeys, route memory, camera-pose persistence | 0.3 |
| U-16 | jarvis-routing-choreography | onAction → light-thread + firefly flight to correct bough → ember kindle | 0.85 |
| U-17 | litany-bootup | 6s boot sequence: floor lines, boughs fade up, Ledger writes itself | 0.75 |
| U-18 | chimes | WebAudio pool: glass bell / cork pop / two-note, gesture-unlocked | 0.25 |
| U-19 | reduced-motion-and-gating | prefers-reduced-motion crossfade paths, WebGL2 probe, 2D nudge | 0.4 |
| U-20 | perf-hardening | PerformanceMonitor governor, invalidate audit, perf acceptance test | 0.6 |
| U-21 | docs-changelog | README-world, CHANGELOG, `.planning` state updates | 0.1 |

---

## 6. IMPLEMENTATION-READINESS (per unit)

> Shared vocabulary for all units — **the layout contract** (produced by U-04, consumed everywhere):
>
> ```ts
> // data/treeLayout.ts
> export interface BoughLayout {
>   areaId: string; name: string; emoji: string|null;
>   color: string;              // pickNodeColor(areaId) — SAME hash as AreasTree.tsx (copy fn + palette verbatim)
>   azimuth: number;            // radians around trunk, golden-angle spaced by orderIndex
>   start: Vector3Tuple; end: Vector3Tuple;  // limb root → alcove tip
>   projects: LanternLayout[];
> }
> export interface LanternLayout {
>   projectId: string; areaId: string; name: string; isClass: boolean;
>   position: Vector3Tuple;     // hang point along parent bough curve
>   color: string;              // parent bough color
> }
> export interface EmberSlot {
>   taskId: string; lanternId: string|null;   // null → trunk cluster ("no project")
>   basePosition: Vector3Tuple;               // deterministic jitter around lantern
>   state: EmberState;                        // see mappings.ts below
> }
> export function solveTreeLayout(areas: SidebarArea[]): { boughs: BoughLayout[]; byArea: Map<string,BoughLayout>; byProject: Map<string,LanternLayout> }
> ```
>
> **Data-shape → visual-prop mappings** (`data/mappings.ts`, the grammar codified):
>
> | Data | Visual |
> |---|---|
> | `SidebarArea.id` → `pickNodeColor(id)` OKLCH | bough core filament + lantern glass tint + alcove light |
> | `SidebarArea.orderIndex` | azimuth order around trunk; key `1–9` order |
> | `SidebarArea.archivedAt !== null` | excluded in MVP (petrified boughs = later phase) |
> | `SidebarProject.isClass` | brass armature ring around lantern |
> | `TaskWithProjects.projects[0].id` | parent lantern (no project → trunk cluster) |
> | `task.dueDate === todayYmd` | `state:'today'` → Candleflame `#E8C46B`, emissiveIntensity pulses 1.6→2.6 @0.5 Hz |
> | `task.dueDate < todayYmd && status!=='lesno'` | `state:'overdue'` → Ember Alarm `#FF6B4A`, position.y −0.12 drop, no pulse |
> | `task.status === 'lesno'` (observed as a TRANSITION) | flare ×3 emissive 300ms → ascend +6y over 2.2s with ease-in → scale→0 dissolve → glass bell |
> | `task.priority ∈ {'P∞','P1'}` | filament flame: instance scale.y ×2.2 (taper geometry), P∞ taller than P1 |
> | else | `state:'ambient'` → warm-white 0.9 emissive, subtle 0.2 Hz sway |
> | `capture` row (unconverted) | firefly, Jarvis Cyan `#8FE8FF`, erratic drift near trunk |

---

### U-01 · deps-config — difficulty 0.15
- **Scope:** install exact packages (§3 commands), add `transpilePackages:['three']` to `apps/web/next.config.ts`, verify `next build` passes.
- **Files:** `apps/web/package.json`, `package-lock.json`, `apps/web/next.config.ts`.
- **Deps:** none. **Perf constraint:** none (config).
- **Acceptance:** `npm run build` green; `import('three')` resolvable; no version drift from §3.
- **Build steps:** 1) run installs 2) edit next.config 3) build 4) commit.

### U-02 · island-scaffold — difficulty 0.4
- **Scope:** `/world` route with SSR data seed, strict `ssr:false` island, skeleton, and the client boundary everything else mounts into.
- **Files:** `app/(app)/world/page.tsx`, `components/world/WorldLoader.tsx`, `WorldCanvas.tsx`, `WorldScene.tsx`, `WorldSkeleton.tsx`.
- **Deps:** U-01.
- **Exact APIs:** `next/dynamic` with `{ ssr:false }` inside a `'use client'` loader (Next 16 App Router requires the ssr:false boundary to be a client component); `<Canvas frameloop="demand" dpr={[1,2]} gl={{ antialias:true, powerPreference:'high-performance' }} camera={{ position:[0,1.6,6], fov:55 }}>` from `@react-three/fiber`.
- **Signatures:**
```ts
// page.tsx (Server Component)
export default async function WorldPage(): Promise<JSX.Element>
// fetches: getUserOrRedirect(); getSidebarTree(user.id, false);
//          getAllTasksForUser(user.id); captures via existing query fn
// renders: <WorldLoader userId={...} initialTree={...} initialTasks={...} initialCaptures={...}/>

interface WorldLoaderProps {
  userId: string;
  initialTree: SidebarArea[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureRow[];   // reuse the 2D captures row type
}
```
- **Integration points:** `getSidebarTree` (`lib/db/queries/sidebar.ts`), `getAllTasksForUser` (`lib/db/queries/tasks.ts`), `getUserOrRedirect`. `WorldSkeleton` = paper-textured Nightwalnut div with a single pulsing candle-point (pure CSS, brand tokens).
- **Perf constraints:** the island chunk loads ONLY on `/world` (verify with `next build` route-size output); zero three imports outside `components/world/**`.
- **Acceptance:** `/world` renders an empty Canvas (dark clear color `#120E0B`) with no SSR/hydration errors; navigating 2D routes loads zero three bytes.
- **Build steps:** 1) page + SSR fetches 2) WorldLoader dynamic boundary 3) WorldCanvas 4) skeleton 5) verify bundle split 6) commit route/island separately.

### U-03 · tokens-materials — difficulty 0.65 · **FABLE PRE-PLAN**
- **Scope:** the design-token module and the CHEAP hologram material recipe every non-hero object uses; shared geometry singletons.
- **Files:** `materials/tokens.ts`, `materials/hologram.ts`, `materials/sharedGeometries.ts`.
- **Exact APIs:** `THREE.MeshPhysicalMaterial` (transparent, low opacity, slight roughness) + `material.onBeforeCompile` injecting a **fresnel emissive rim term** (WebGL v1 — this is fine; only the WebGPU phase must port to TSL); `toneMapped:false` + `emissiveIntensity > 1` so Bloom picks it up; drei `<Edges>` alternative documented but the fresnel recipe is primary. `MeshTransmissionMaterial` from drei is exported behind a `heroGlass()` factory with a hard-capped registry (throws in dev if >3 live instances).
- **Signatures:**
```ts
// tokens.ts — VISION §5 palette verbatim
export const STUDIOLO = { nightwalnut:'#120E0B', deepVellum:'#0E1420', parchment:'#F2E9D8',
  sepiaInk:'#4A3B2A', brass:'#C9A227', candleflame:'#E8C46B', emberAlarm:'#FF6B4A',
  jarvisCyan:'#5FD0FF', fireflyCyan:'#8FE8FF', verdigris:'#4FA487', moonlace:'#8FA8C7' } as const;
export const NODE_PALETTE: readonly string[];      // copied verbatim from AreasTree.tsx
export function pickNodeColor(id: string): string; // copied verbatim (djb2 hash)
export function oklchToThreeColor(oklch: string): THREE.Color; // parse via CSS Color 4 (Color.setStyle supports oklch in three r185)

// hologram.ts
export interface HologramOptions { tint: THREE.ColorRepresentation; opacity?: number;
  rimColor?: THREE.ColorRepresentation; rimPower?: number; emissiveIntensity?: number; }
export function makeHologramMaterial(o: HologramOptions): THREE.MeshPhysicalMaterial;
export function heroGlass(o: { tint: string }): JSX.Element; // <MeshTransmissionMaterial transmission={1} thickness={0.35} ior={1.2} roughness={0.15} chromaticAberration={0.04} backside/>

// sharedGeometries.ts — module-level singletons, never per-instance
export const EMBER_GEOMETRY: THREE.SphereGeometry;       // 8×6 segs
export const TAPER_GEOMETRY: THREE.ConeGeometry;         // priority filament
export const LANTERN_GEOMETRY: THREE.BufferGeometry;     // faceted (IcosahedronGeometry(r,0))
export const FIREFLY_GEOMETRY: THREE.SphereGeometry;     // 6×4 segs
```
- **Perf constraints:** ALL materials created once at module/hook level and shared; `onBeforeCompile` shader compiles once per material variant (≤6 variants total); dev-mode transmission cap enforced.
- **Acceptance:** a test scene of 500 instances using `makeHologramMaterial` renders in ≤3 draw calls (instanced) and blooms only where `emissiveIntensity>1`; dev-cap throws on a 4th `heroGlass`.
- **Build steps:** 1) tokens + hash copy 2) fresnel chunk + factory 3) heroGlass + cap 4) shared geometries 5) leva-tweakable dev harness 6) commit lib alone.

### U-04 · data-bridge — difficulty 0.6 · **FABLE PRE-PLAN**
- **Scope:** the single seam between app data and the scene: shared-key queries, Realtime, layout solver, mappings, and the transition differ that detects completions.
- **Files:** `data/WorldDataProvider.tsx`, `data/useWorldData.ts`, `data/treeLayout.ts`, `data/mappings.ts`, `data/diffing.ts`.
- **Exact APIs:** `useQuery` + `useQueryClient` from `@tanstack/react-query`; `tableKey` (`lib/realtime/query-keys.ts`); `useTableSubscription` (`lib/realtime/useTableSubscription.ts`); `invalidate` from `useThree()` — the provider calls `invalidate()` whenever query data identity changes (Realtime → new data → one demanded frame).
- **Signatures:**
```ts
interface WorldData {
  userId: string;
  tree: SidebarArea[];
  layout: ReturnType<typeof solveTreeLayout>;
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];                       // tasks → slots via mappings
  captures: CaptureRow[];
  todayYmd: string;                              // computed once per minute
}
export function useWorldData(): WorldData;        // context consumer
export type EmberState = 'ambient'|'today'|'overdue'|'ascending';
export function classifyTask(t: TaskWithProjects, todayYmd: string): EmberState;

// diffing.ts — completion detection
export interface TaskTransition { taskId: string; from: EmberState; to: 'ascending'; slot: EmberSlot; }
export function diffSnapshots(prev: Map<string, TaskWithProjects>, next: TaskWithProjects[]): TaskTransition[];
// Provider keeps prev in a ref; transitions push into an imperative event bus:
export const worldEvents: { on(ev: 'task-completed'|'capture-created', fn: (p: any) => void): () => void;
                            emit(ev: string, p: any): void };  // tiny mitt-style emitter, NOT React state
```
- **Integration points (by name):** `getSidebarTreeForCurrentUser` (`app/actions/folders.ts`), `getTasksForCurrentUser` (`app/actions/tasks.ts`), `getCapturesForCurrentUser`, `tableKey("tasks"|"captures", userId)`, `useTableSubscription("areas"|"projects"|"tasks"|"tasks_projects"|"captures", userId)`. Copy the sidebar-tree query key verbatim from `components/shell/Sidebar.tsx`.
- **Layout algorithm (deterministic, pure):** boughs at golden-angle azimuths ordered by `orderIndex`, elevation 20–35° off horizontal, length 3.5–5 m scaled by project count; lanterns distributed along the outer 60% of each bough curve at hash-jittered arc params; ember slots on a small Fibonacci sphere shell (r=0.35) around their lantern; unprojected tasks on a shell around the trunk at y=1.2.
- **Perf constraints:** `solveTreeLayout` memoized on `tree` reference; `emberSlots` memoized on `[tasks, layout]`; the differ is O(n) with Maps; NOTHING here runs in `useFrame`.
- **Acceptance:** unit tests (Vitest): classifyTask truth table (today/overdue/lesno/priority); diffSnapshots emits exactly one transition when a status flips to `lesno`; solveTreeLayout stable across calls for same input.
- **Build steps:** 1) treeLayout + tests 2) mappings + tests 3) provider with shared-key queries 4) differ + event bus 5) invalidate wiring 6) separate lib/component commits.

### U-05 · assets — difficulty 0.1
- **Scope:** source and commit HDRI, both Garamond woffs, three SFX; a `text/fonts.ts` module exporting URL constants + a `preloadWorldFonts()` calling troika's `preloadFont` (via drei re-export) with the ASCII+dates glyph set.
- **Files:** `public/world/**` (per §2.6), `components/world/text/fonts.ts`.
- **Acceptance:** files exist, HDRI ≤1.5 MB, each SFX ≤30 KB, license notes committed alongside.
- **Model note:** trivial-tier unit (Haiku-eligible), see §8.

### U-06 · tree-geometry — difficulty 0.55
- **Scope:** the geography: brass dais, trunk, bough limbs with area-hue core filament, from `layout.boughs`.
- **Files:** `tree/Trunk.tsx`, `tree/Boughs.tsx`.
- **Exact APIs:** trunk = `CylinderGeometry` stack + `makeHologramMaterial({ tint: brass })` with an emissive "sap" strip (second cylinder, `emissiveIntensity 1.4`); boughs = ONE `TubeGeometry` per area along a `CatmullRomCurve3` (`start→end` with sag control points) — ≤9 draw calls for limbs — each with a thin core tube (`emissiveIntensity 2.0`, `oklchToThreeColor(bough.color)`, `toneMapped:false`) so Bloom draws the light vein. Each bough mesh gets `userData = { kind:'bough', areaId }` for the camera rig's raycast targets.
- **Signatures:**
```ts
function Boughs(): JSX.Element;                       // reads useWorldData().layout
interface BoughMeshProps { bough: BoughLayout; }      // internal
// exports for other units:
export function boughFocusPose(b: BoughLayout): { position: Vector3Tuple; target: Vector3Tuple };
```
- **Perf constraints:** geometry rebuilt ONLY when `layout` identity changes (useMemo); tube segments ≤64; total tree ≤40k triangles; idle "breath" (0.2 Hz emissive sway) via `useFrame` mutation on shared material uniform — a single number, and it must schedule `invalidate()` at ≤20 fps while idle-breathing is active OR (preferred) breath is driven only when frames are already demanded — decide with U-20's idle policy: MVP rule = breath runs only for 4s after any interaction, then the world truly sleeps.
- **Acceptance:** with 6 areas / 30 projects the whole tree (trunk+boughs) is ≤12 draw calls; boughs match 2D tree colors exactly (visual diff vs `/areas`).
- **Build steps:** 1) trunk+dais 2) bough curve solver 3) core filament + bloom check 4) userData pick targets 5) breath policy 6) commit.

### U-07 · camera-rig — difficulty 0.7 · **FABLE PRE-PLAN**
- **Scope:** guided flight: click-to-glide, Esc focus stack, `1–9` area keys, hover lean + invalidate discipline. The "feel" unit.
- **Files:** `camera/CameraRig.tsx`, `camera/useFocusStack.ts`, `camera/useWorldKeys.ts`.
- **Exact APIs:** drei `<CameraControls makeDefault smoothTime={0.35} />` (wraps `camera-controls`); imperative `controlsRef.current.setLookAt(px,py,pz, tx,ty,tz, true)` for 600–900 ms eased glides; drei `<Bvh firstHitOnly>` already wraps the tree (U-02 scene shell) so `onClick` events on bough/lantern meshes are cheap; hover = `onPointerOver/Out` toggling an emissive-lift target consumed by the object's `useFrame` via `maath` `easing.damp`; `useThree(s => s.invalidate)` — CameraControls fires its own change events under demand mode (drei wires this), verify.
- **Signatures:**
```ts
type FocusLevel = { kind:'vestibule' } | { kind:'bough'; areaId:string } | { kind:'lantern'; projectId:string };
export function useFocusStack(): {
  current: FocusLevel; push(f: FocusLevel): void; pop(): void; reset(): void; };
interface CameraRigProps { controlsRef?: React.RefObject<CameraControls>; }
export const VESTIBULE_POSE: { position: Vector3Tuple; target: Vector3Tuple }; // [0,1.6,6]→[0,2.2,0]
// useWorldKeys: window keydown listener; skips when e.target is input/textarea/contenteditable
// (copy the guard pattern from GlobalHotkeys.tsx); '1'-'9' → layout.boughs[i] → push+glide; Escape → pop+glide.
```
- **Integration points:** `boughFocusPose` (U-06), `layout.byProject` for lantern poses, `worldEvents` for programmatic flights (Jarvis routing needs `flyTo` exposed: export a module-level `cameraBus = { flyTo(pose, ms): Promise<void> }`).
- **Perf constraints:** no per-frame React state; hover state lives in refs; keyboard listener single instance; while a glide runs, frames are demanded by camera-controls itself.
- **Acceptance:** click bough → 700 ms glide; Esc×3 from any depth returns to Vestibule; `3` flies to the third area; hover lifts emissive within 100 ms and settles back; zero rendering while idle (devtools: no rAF activity after 4 s still).
- **Build steps:** 1) CameraControls + vestibule pose 2) focus stack 3) click targets via userData 4) keys 5) hover damp 6) cameraBus export 7) commit.

### U-08 · atmosphere-post — difficulty 0.45
- **Scope:** the room: floor, night environment, two lights, dust motes, and the single composer.
- **Files:** `env/Atmosphere.tsx`, `env/PostFX.tsx`, `env/DustMotes.tsx`.
- **Exact APIs:** `<Environment files="/world/hdri/night-256.hdr" resolution={256} background={false}/>`; floor = `CircleGeometry(14)` `MeshStandardMaterial({ color: nightwalnut, roughness:0.35, metalness:0.1 })` + emissive brass inlay lines as a second mesh of thin `PlaneGeometry` strips (these are the Litany's light-up targets — expose `inlayMaterials: MeshBasicMaterial[]` keyed by areaId); key light = warm `PointLight(candleflame, 2.2, 12)` at [0,2.5,1]; fill = cool `DirectionalLight(moonlace, 0.35)` from above; dust = ONE `THREE.Points` (600 verts, `PointsMaterial size=0.02 transparent`) drifting in `useFrame` (subject to U-06's idle-breath policy); `<EffectComposer><Bloom mipmapBlur luminanceThreshold={1} intensity={1.2}/><Vignette offset={0.4} darkness={0.6}/></EffectComposer>` from `@react-three/postprocessing` — THE ONLY composer in the app.
- **Signatures:** `function Atmosphere(): JSX.Element; export const inlayRegistry: Map<string, THREE.MeshBasicMaterial>;`
- **Perf constraints:** HDRI `resolution={256}`, `background={false}` (background is a cheap CSS/clearColor gradient `nightwalnut→deepVellum`); composer at default resolution with `mipmapBlur` (cheapest bloom); dust points = 1 draw call.
- **Acceptance:** scene draw-call overhead of this unit ≤8; bloom halos ONLY on `toneMapped:false` + emissive>1 objects (verify a standard material does not glow); GPU frame time of empty room ≤2 ms on M-series.
- **Build steps:** 1) floor + inlay strips + registry 2) Environment + lights 3) dust 4) composer 5) commit.

### U-09 · ember-system — difficulty 0.85 · **FABLE PRE-PLAN** (the crown jewel)
- **Scope:** ALL task embers in ONE imperative `InstancedMesh`, full state→light grammar, spring enter/leave, and the sacred ascending-spark completion.
- **Files:** `tree/Embers.tsx`.
- **Exact APIs:** imperative `new THREE.InstancedMesh(EMBER_GEOMETRY, emberMaterial, MAX_EMBERS)` (cap 1024; drei `<Instances>` declaratively is REJECTED here — per-row React children violate the never-mount-per-row rule at this scale). Per-instance color via `instanceColor` (`setColorAt`); per-instance pulse-phase/state via a custom `InstancedBufferAttribute('aState', 2)` read by the material's `onBeforeCompile` chunk (state id + phase offset) so pulsing is GPU-side; matrices mutated in `useFrame` with `easing.damp3` from `maath` toward target transforms; completion animation = CPU-side per-ascending-instance param driven in the same `useFrame` (≤ a few concurrent). Priority filaments: a SECOND small `InstancedMesh(TAPER_GEOMETRY, ...)` (cap 128) positioned above P∞/P1 embers — total 2 draw calls for the whole task layer. `invalidate()` demanded while any ember is pulsing/ascending (a `useFrame`-returned-early flag + `useSpring` from `@react-spring/three` for enter/leave scale, which auto-invalidates).
- **Signatures:**
```ts
function Embers(): JSX.Element;   // consumes useWorldData().emberSlots + worldEvents
interface EmberRuntime {          // module-internal, in refs — NEVER React state
  index: Map<string, number>;     // taskId → instance slot
  free: number[];                 // freelist of instance slots
  ascending: Array<{ slot: number; t: number; from: Vector3 }>;
}
// listens: worldEvents.on('task-completed', ({ slot }) => beginAscent(slot))
// emits:  worldEvents.emit('chime', { kind: 'glass-bell' }) at ascent apex
```
- **Data mapping (from §6 preamble, authoritative):** `classifyTask` → aState; `today`→pulse gold; `overdue`→red + basePosition.y−0.12; `P∞/P1`→filament instance; transition→`ascending` (flare 300 ms → rise 6 y / 2.2 s ease-in → scale 0 → slot freed). Realtime deletions/creations diff through the freelist with spring scale-in from 0 (emissive pop) — VISION/TECH §7 pattern.
- **Perf constraints:** exactly 2 draw calls; zero allocation in `useFrame` (preallocated `Object3D` dummy, `Vector3` scratch); `instanceMatrix.needsUpdate` set once per frame only when dirty; sleeping embers demand no frames (pulse is shader-side driven by a time uniform that only advances during demanded frames — pulse pauses when world sleeps, acceptable and intended).
- **Acceptance:** 500 synthetic tasks render at 60 fps; flipping a task to `lesno` in the 2D app (other tab) produces flare→ascend→dissolve within 1 Realtime roundtrip; overdue embers visibly hang below their lantern; ≤2 draw calls verified via `gl.info.render.calls` delta.
- **Build steps:** 1) InstancedMesh + freelist + index 2) aState attribute + shader chunk (coordinate with U-03's fresnel to avoid chunk collision) 3) classify→target sync on data change 4) damp3 settle 5) ascent runtime + bell event 6) enter/leave springs 7) synthetic-load story/test 8) commit lib/component separately.

### U-10 · lantern-system — difficulty 0.55
- **Scope:** project lanterns as instanced faceted glass; class armature rings; load-based glow.
- **Files:** `tree/Lanterns.tsx`.
- **Exact APIs:** drei `<Instances limit={256}> <Instance/> </Instances>` IS acceptable here (project count is small and lanterns need pointer events per instance — drei Instances forwards R3F events with `instanceId`); geometry `LANTERN_GEOMETRY`, material `makeHologramMaterial({ tint: bough.color })` — but note ONE material per <Instances>, so tint via per-instance `color` prop and keep the material neutral-warm. Class ring = a second `<Instances>` of `TorusGeometry` (brass, `emissiveIntensity 1.2`) at class lanterns only. Hover lean (2–3°) + caption handled by U-07's hover bus + U-11's labels. `userData/instanceId → projectId` map exported for picking.
- **Signatures:** `function Lanterns(): JSX.Element; export const lanternPickMap: Map<number, string>;` glow = interior `pointLight`s are FORBIDDEN (draw/light cost) — "the light inside" is emissive core via per-instance color intensity encoded in `instanceColor` HDR scale.
- **Perf constraints:** 2 draw calls (lanterns + rings); no per-lantern lights; no transmission (heroGlass reserved for the FOCUSED lantern only — swap the focused instance for a single hero mesh overlay when `focus.kind==='lantern'`, hide the instance behind it).
- **Acceptance:** 40 projects = 2 draw calls + 1 hero swap on focus; ringed lanterns are exactly the `isClass:true` projects; clicking a lantern glides camera (U-07 wiring).
- **Build steps:** 1) Instances + placement 2) class rings 3) pick map + events 4) hero swap on focus 5) commit.

### U-11 · labels-ledger — difficulty 0.45
- **Scope:** SDF Garamond captions with distance cull, and the Ledger strip.
- **Files:** `text/WorldLabels.tsx`, `text/Ledger.tsx` (plus U-05's `fonts.ts`).
- **Exact APIs:** drei `<Text font={EB_GARAMOND_WOFF} sdfGlyphSize={64} fontSize={0.12} color={parchment} anchorX="left" maxWidth={1.4} outlineBlur={0.005}>`; visibility by distance in `useFrame` (toggle `visible`, never unmount): area names always visible (≤9), project names ≤6 m from camera, task captions ONLY for hovered ember (single floating caption reused — one `<Text>` whose text/position swap on hover). Ledger = one `<Text>` (italic woff) fixed to a camera-anchored group (drei `<Billboard>` or a group parented under the camera) at bottom-center; content composed from `useWorldData()` (`N tasks due · next event · M unfiled`).
- **Signatures:** `function WorldLabels(): JSX.Element; function Ledger(): JSX.Element; export function composeLedgerLine(d: WorldData): string;`
- **Perf constraints:** `preloadWorldFonts()` called by WorldCanvas before first paint; live `<Text>` instances ≤ 9 (areas) + 6 (near projects) + 1 (hover) + 1 (ledger); `sdfGlyphSize` capped at 64; no per-frame text content changes (ledger recomputes on data change only).
- **Acceptance:** serifs crisp at reading distance; walking away from a lantern fades its label by 6 m; no glyph-atlas pop after boot (preload verified).
- **Build steps:** 1) fonts preload 2) area/project labels + cull 3) hover caption singleton 4) ledger compose + anchor 5) commit.

### U-12 · today-panel — difficulty 0.55
- **Scope:** ONE uikit panel at the dais listing today's tasks, with working complete-from-world.
- **Files:** `panels/TodayPanel.tsx`.
- **Exact APIs:** `@react-three/uikit` `<Root sizeX={1.6} sizeY={1.1} flexDirection="column" padding={24} gap={10} borderRadius={16} backgroundColor={deepVellum} backgroundOpacity={0.55}>`, `<Container overflow="scroll" flexGrow={1}>`, uikit `<Text>` (uikit needs its own font — use its default font for panel text in MVP, or load Garamond via uikit's `FontFamilyProvider` if trivially available); row check-button = uikit-default `<Button variant="ghost" onClick={...}>`. Completion calls the SAME server action the 2D `UpcomingTasksWidget` uses (import `setTaskStatus`-equivalent from `app/actions/tasks.ts` — copy the exact action + optimistic pattern from `UpcomingTasksWidget.tsx`, including `queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })`), which triggers the differ → ascending spark. Panel billboard: static pose facing the vestibule (no `<Billboard>` needed in MVP).
- **Signatures:** `function TodayPanel(): JSX.Element; // rows = tasks.filter(t => classifyTask(t, todayYmd) !== 'ambient' || t.dueDate === todayYmd), sorted overdue-first`
- **Perf constraints:** no per-frame uikit prop changes (uikit 1.0.x allocation hotpath — TECH.md risk); list re-renders only on query-data change; row count capped at 12 with an "and N more — press Cmd+\\" footer.
- **Acceptance:** checking a row completes the real task (verify in 2D), the panel row exits, AND the corresponding ember ascends with the bell.
- **Build steps:** 1) Root/layout 2) rows from data 3) complete action + invalidate 4) cap/footer 5) commit.

### U-13 · jarvis-ring — difficulty 0.7 · **FABLE PRE-PLAN**
- **Scope:** the familiar: idle breathing ring, Cmd+K summon, ribbon with a REAL DOM input, streamJarvis wiring, SSE-driven ribbon text.
- **Files:** `jarvis/JarvisRing.tsx`, `jarvis/JarvisRibbon.tsx`, `jarvis/useJarvisWorld.ts`.
- **Exact APIs:** ring = 2 concentric `TorusGeometry` meshes, `MeshBasicMaterial({ color: jarvisCyan, toneMapped:false })` emissive-equivalent >1 via color multiplier for bloom; idle breath = 12 bpm scale sine in `useFrame` (subject to idle policy: ring breath is allowed to keep a 10 fps demand heartbeat ONLY while ribbon open; when idle-idle, ring freezes mid-breath); summon/unroll = `useSpring` from `@react-spring/three` on group position/scale + ribbon `scaleX` 0→1 (`config: { tension: 220, friction: 26 }`); input = drei `<Html transform occlude="blending" distanceFactor={1.2}>` wrapping a styled `<input>` (Parchment on DeepVellum, Garamond via CSS — DOM text, full caret/IME); reply text = drei `<Text>` italic woff updated from `onText` deltas (batch deltas with a 50 ms throttle before setState); thinking motes = 3 tiny spheres orbiting inside the ring while awaiting first event.
- **Signatures:**
```ts
export function useJarvisWorld(): {
  state: 'idle'|'listening'|'thinking'|'streaming'|'error';
  summon(): void; dismiss(): void;
  submit(input: string): void;   // builds JarvisRequest{ input, history:[] }, calls
                                 // streamJarvis(payload, callbacks, abortRef.current.signal)
};
// callbacks wired: onTurnStart, onText, onQueued, onClarification (MVP: render question as ribbon
// text + option chips as uikit buttons), onAction → worldEvents.emit('jarvis-action', ev), onDone, onError
```
- **Integration points:** `streamJarvis`, `JarvisRequest`, `JarvisActionEvent` (`components/jarvis/jarvis-stream-client.ts`); Cmd+K interception via `useWorldKeys` (U-07) — on `/world`, `preventDefault` BEFORE `GlobalHotkeys`' handler by registering in capture phase; `invalidateAfterJarvisAction` (find in `components/jarvis/` — same call the 2D console makes after `onAction`).
- **Perf constraints:** exactly ONE `<Html>` root in the whole MVP scene; ribbon `<Text>` updates throttled; ring is 2 draw calls, motes 1 (small `<Instances>`); ribbon may use `heroGlass` (1 of the ≤3 budget).
- **Acceptance:** Cmd+K summons ring+ribbon with focus in the input; a typed sentence streams italic text onto the ribbon; `onAction` fires the `jarvis-action` world event (choreography lands in U-16); Esc dismisses and returns key focus to the world.
- **Build steps:** 1) ring + breath 2) summon/dismiss springs 3) Html input + focus management 4) streamJarvis callbacks 5) thinking motes 6) clarification chips 7) commit.

### U-14 · firefly-system — difficulty 0.7 · **FABLE PRE-PLAN**
- **Scope:** unfiled captures as a drifting instanced swarm near the trunk; land-and-cool primitive (flight PATH choreography is U-16).
- **Files:** `tree/Fireflies.tsx`.
- **Exact APIs:** ONE `InstancedMesh(FIREFLY_GEOMETRY, fireflyMaterial, 64)`; drift = per-instance curl-ish wander: seeded random targets re-picked every 2–4 s, `easing.damp3` toward them in `useFrame` (subject to idle policy — drift belongs to the "4 s after interaction" active window plus a slow 5 fps heartbeat when ≥1 firefly exists, so the swarm never looks frozen dead: heartbeat implemented as a `setInterval(invalidate, 200)` gated on visibility+count); material `MeshBasicMaterial({ color: fireflyCyan, toneMapped:false })` scaled >1 for bloom.
- **Signatures:**
```ts
function Fireflies(): JSX.Element;   // rows = captures (unconverted) from useWorldData()
export interface FlightRequest { captureId?: string; toAreaId: string; toProjectId?: string; kind: 'task'|'note'; }
export const fireflyBus: { fly(req: FlightRequest): Promise<void> };  // consumed by U-16;
// fly(): picks/spawns an instance, hands control to a path-follow runtime, resolves at landing,
// then emits worldEvents.emit('chime', { kind:'two-note' }) and retires/cools the instance.
```
- **Data mapping:** `captures` rows (via shared key) → instance count; a capture converted/deleted (Realtime) → spring-out unless it was consumed by an active flight.
- **Perf constraints:** 1 draw call; wander math allocation-free; heartbeat interval cleared when tab hidden (`document.visibilitychange`).
- **Acceptance:** creating a capture in 2D pops a new firefly (spring-in + cork-pop hook point); 15 captures = visible cloud, still 1 draw call; `fireflyBus.fly` moves an instance point-to-point (straight-line placeholder OK pre-U-16).
- **Build steps:** 1) instanced swarm + drift 2) Realtime diff spring in/out 3) heartbeat policy 4) fireflyBus + landing/cool 5) commit.

### U-15 · mode-toggle — difficulty 0.3
- **Scope:** `Cmd+\` both ways, route memory, camera-pose persistence. ONLY unit touching shell code.
- **Files:** `components/shell/GlobalHotkeys.tsx` (surgical addition), `components/world/WorldToggle.ts` (pose persist helpers).
- **Exact APIs:** in `GlobalHotkeys.tsx` handler: `(e.metaKey||e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "\\"` → toggle per §2.5 (follow the file's existing guard style — skip when typing, `e.preventDefault()`); `usePathname` + `useRouter` already imported there. Camera pose save: on world unmount, `controlsRef.current.getPosition/getTarget` → `sessionStorage['world:cameraPose']`; restore in `CameraRig` mount via `setLookAt(..., false)` (instant, pre-first-paint).
- **Acceptance:** `Cmd+\` from `/tasks` enters `/world`; `Cmd+\` again returns to `/tasks` (not `/lifeos`); camera restores within 1 frame; 2D app behavior otherwise byte-identical.
- **Build steps:** 1) hotkey 2) route memory 3) pose persist/restore 4) commit shell change alone.

### U-16 · jarvis-routing-choreography — difficulty 0.85 · **FABLE PRE-PLAN** (the thesis animation)
- **Scope:** `onAction` → resolve destination → cyan light-thread from ring + firefly flight along the bough → ember kindles. The demo climax.
- **Files:** `jarvis/LightThread.tsx`, plus wiring inside `jarvis/useJarvisWorld.ts` (owned file, wave-4 so no collision) and consumption of `fireflyBus`/`cameraBus`.
- **Exact APIs:** destination resolution: `JarvisActionEvent.result.receipt` carries the created entity (executor: inspect one live receipt from `run-turn.ts` executor output to map `projectId`/task fields; fall back to matching the post-invalidation tasks diff — the differ (U-04) will surface the NEW task row whose `projects[0].id → layout.byProject → areaId`). Flight path: `THREE.QuadraticBezierCurve3` (later upgrade CatmullRom) from ring → bough midpoint → lantern; firefly follows `curve.getPointAt(easedT)` in `useFrame` over ~900 ms with a 1.5× speed pulse mid-arc ("dragonfly-quick"); light-thread = `TubeGeometry` along the same curve, `jarvisCyan` bloom material, animated by `drawRange` (`geometry.setDrawRange(0, count*t)`) — 1 draw call, disposed after 1.2 s; landing: firefly scale-cools cyan→candleflame (color lerp) as the differ's spring-in kindles the REAL ember (the firefly retires exactly when the ember spring starts — sequence via `fireflyBus.fly().then(...)`); camera assist: if destination bough is behind the camera, `cameraBus.flyTo` a subtle 20° yaw first (never a full relocation — the user keeps context).
- **Signatures:**
```ts
export function resolveActionDestination(ev: JarvisActionEvent, layout: TreeLayoutResult):
  { areaId: string; projectId?: string; pose: Vector3Tuple } | null;
interface LightThreadProps { from: Vector3Tuple; to: Vector3Tuple; via: Vector3Tuple; ttlMs?: number; }
```
- **Perf constraints:** thread geometry preallocated at max segments, animated by drawRange (no per-frame geometry rebuild); at most 2 concurrent flights; everything disposed on completion.
- **Acceptance (THE demo):** `Cmd+K` → "email the prof about the extension, task, Friday" → SSE actions land → firefly banks along the School bough → lands on the right lantern → cools gold → new ember exists (verify row in 2D) → two-note chime. Under 5 s wall-clock after `onDone`.
- **Build steps:** 1) receipt→destination resolver (+ fallback via differ) 2) bezier flight in fireflyBus 3) LightThread drawRange anim 4) landing/kindle handoff 5) camera assist 6) end-to-end demo test 7) commit.

### U-17 · litany-bootup — difficulty 0.75 · **FABLE PRE-PLAN**
- **Scope:** the 6-second wake: candle-point → floor inlay lines race outward → boughs fade up in orderIndex sequence with per-bough chord hook → Ledger writes itself letter-by-letter.
- **Files:** `boot/Litany.tsx`, `boot/useLitanySequence.ts`.
- **Exact APIs:** a single timeline driven by ONE `useSpring` from `@react-spring/three` (`from:{t:0} to:{t:1}, config:{duration:6000}` — auto-invalidates for the full 6 s) whose `t` is read in `useFrame` via `spring.t.get()` and mapped through a keyframe table: `t∈[0,0.15]` candle-point (dais emissive 0→1); `[0.1,0.4]` inlay lines (U-08's `inlayRegistry` materials' opacity staggered by areaId order); `[0.3,0.8]` boughs (per-bough material uniform `uReveal` 0→1 staggered — coordinate uniform name with U-06); `[0.6,1.0]` Ledger typewriter (`composeLedgerLine` sliced by char count — text updates throttled to 30 ms steps, NOT per-frame setState: drive via a ref + troika `text` property mutation + `sync()`); completion → `worldEvents.emit('boot-complete')` (gates interactivity: CameraRig ignores input until then).
- **Signatures:** `function Litany(): JSX.Element; export function useLitanySequence(): { progress: SpringValue<number>; skip(): void };` `skip()` (any keypress) jumps spring to 1. Reduced-motion: sequence replaced by a single 300 ms global fade (U-19 provides the flag).
- **Perf constraints:** zero mounts/unmounts during the sequence (everything pre-mounted at opacity/reveal 0); after `boot-complete` the component renders `null` logic-wise but must not unmount materials.
- **Acceptance:** cold load of `/world` plays the full 6 s litany at 60 fps, ends on the exact Vestibule money-shot pose; pressing any key skips cleanly; second visit in same session skips automatically (sessionStorage flag).
- **Build steps:** 1) master spring + keyframe map 2) inlay stagger 3) bough reveal uniform wiring 4) ledger typewriter 5) skip + session flag 6) commit.

### U-18 · chimes — difficulty 0.25
- **Scope:** three sounds, gesture-unlocked, wired to world events.
- **Files:** `audio/chimes.ts`.
- **Exact APIs:** raw WebAudio: one `AudioContext` created lazily on first `pointerdown/keydown` (browser autoplay rule), `fetch+decodeAudioData` the 3 clips at world mount, tiny pool of `AudioBufferSourceNode`s; subscribe `worldEvents.on('chime', ...)` for `glass-bell` (task ascent apex), `cork-pop` (capture created), `two-note` (firefly landing). Global mute respects a `localStorage['world:muted']` flag (no UI in MVP; default unmuted after gesture).
- **Acceptance:** three events → three distinct sounds; no console autoplay warnings; muted flag silences all.
- **Build steps:** 1) context+unlock 2) preload/pool 3) event wiring 4) commit.

### U-19 · reduced-motion-and-gating — difficulty 0.4
- **Scope:** honesty layer: `prefers-reduced-motion`, WebGL2 probe, and the "world unavailable → Page" card.
- **Files:** `WorldLoader.tsx` (owned by U-02, wave-1 — U-19 EXTENDS it in wave 4; sequencing prevents collision), a new `data/useWorldPrefs.ts`.
- **Exact APIs:** `matchMedia('(prefers-reduced-motion: reduce)')` → context flag consumed by: CameraRig (`setLookAt(..., false)` instant cuts), Embers (no pulse; ascent = 400 ms crossfade + bell), Litany (300 ms fade), Fireflies (static positions), springs (`immediate: true`); WebGL2 probe = `!!document.createElement('canvas').getContext('webgl2')` in WorldLoader → fallback card (Parchment on Nightwalnut, "The Studiolo needs a stronger lantern — press Cmd+\\ to return to the Page") — never a crash.
- **Signatures:** `export function useWorldPrefs(): { reducedMotion: boolean; muted: boolean };`
- **Acceptance:** with macOS Reduce Motion on: no glides, no pulses, litany is a fade, completion still legible (crossfade + bell); with WebGL2 blocked (devtools): card renders, 2D intact.
- **Build steps:** 1) prefs hook 2) thread flag through the 5 consumers 3) probe + card 4) commit.

### U-20 · perf-hardening — difficulty 0.6
- **Scope:** the governor + the proof. Enforces §7 end-to-end.
- **Files:** `PerfGovernor.tsx`, `components/world/__tests__/perf.md` (manual protocol) + a dev-only stats hook.
- **Exact APIs:** drei `<PerformanceMonitor onDecline={...} onIncline={...}>` wrapping scene content: decline step 1 → `dpr` 2→1.5→1 (via `setDpr` from `useThree`), step 2 → disable Vignette, step 3 → halve bloom intensity, step 4 → surface a non-modal uikit toast "The chamber is heavy — Cmd+\\ for the Page"; a dev flag (`?perf=1`) renders drei `<Stats>` + logs `gl.info.render` (calls/triangles) each demanded frame; idle audit: assert zero rAF ticks after 4 s of no input (test via `PerformanceObserver`/manual devtools protocol).
- **Acceptance:** the §7.9 acceptance test passes and is documented with numbers in the perf protocol file.
- **Build steps:** 1) governor ladder 2) dev stats 3) idle audit 4) run protocol on target machine, record 5) commit.

### U-21 · docs-changelog — difficulty 0.1
- **Scope:** `components/world/README.md` (architecture, idle policy, perf budget table, how to add an object family), CHANGELOG entry, `.planning` state note. **Model: Sonnet.**
- **Acceptance:** a new engineer can add a "habits as moths" family from the README alone.

---

## 7. PERFORMANCE BUDGET & LIGHTWEIGHT DOCTRINE

This section is LAW. Every unit's perf constraints above are instantiations of it; U-20 enforces it.

1. **Target:** locked 60 fps on an M-series MacBook (baseline: M1 Pro, integrated), Chrome + Safari. Frame budget 16.6 ms → GPU ≤10 ms, JS ≤4 ms per demanded frame.
2. **Draw-call ceiling: ≤150 in the MVP scene.** Budget allocation: tree limbs ≤12, lanterns+rings 2 (+1 hero swap), embers+filaments 2, fireflies 1, atmosphere ≤8, labels ≤17 (SDF Text = 1 each), uikit panel ~10–20, ring/ribbon/thread ≤6, composer passes ~4. Headroom ≥60.
3. **Triangles ≤300k; texture memory ≤64 MB** (HDRI@256 + font atlases + paper textures; KTX2 for any imagery; no 4k anything).
4. **Instancing MANDATORY** for embers, fireflies, lanterns: ONE InstancedMesh (or one drei `<Instances>`) per family. Rows NEVER mount/unmount React components; enter/leave = freelist slot + spring scale. Per-frame animation = matrix/uniform mutation in `useFrame`, preallocated scratch objects, zero per-frame React state anywhere in the scene.
5. **`frameloop="demand"` with an explicit invalidation ledger.** Frames are demanded ONLY by: (a) `@react-spring/three` springs (auto-invalidate — enter/leave, summon, litany), (b) camera-controls change events during glides/orbits, (c) `invalidate()` on TanStack Query data identity change (Realtime echo), (d) hover enter/exit, (e) active runtimes (ascent, flight, thread) which keep demanding until done, (f) the firefly 5 fps heartbeat (only while fireflies exist AND tab visible), (g) the 4 s post-interaction breath window. Outside these, the world sleeps: **~0% CPU/GPU idle** is an acceptance criterion, not a hope.
6. **`dpr={[1,2]}`**, governed downward by `<PerformanceMonitor>` (2→1.5→1). ONE `EffectComposer`: `<Bloom mipmapBlur luminanceThreshold={1} intensity={1.2}/>` + optional `<Vignette>` (first thing the governor sheds). Nothing else post-processes.
7. **Transmission budget:** `MeshTransmissionMaterial` on AT MOST 3 hero objects (focused lantern swap, Jarvis ribbon, +1 reserve), enforced by U-03's dev-mode registry. Everything else uses the cheap hologram recipe (semi-transparent physical + fresnel emissive rim + bloom).
8. **SDF text discipline:** glyphs preloaded at boot; `sdfGlyphSize ≤ 64`; live `<Text>` count ≤ ~28; distance-cull by `visible` toggle (never unmount); single reusable hover caption.
9. **Assets:** HDRI `resolution={256}`, `background={false}`; shared geometries/materials from `sharedGeometries.ts`; explicit `dispose()` in unmount effects for anything created imperatively (thread tubes, hero swaps); route-level code-split verified in `next build` output — the 2D app ships zero 3D bytes.
10. **MVP perf acceptance test (U-20 protocol, run on the target machine):**
    - Seed: 8 areas, 40 projects, 300 tasks (30 due today, 12 overdue, 10 P1/P∞), 12 captures.
    - Orbit the Vestibule + fly to 3 boughs + open Today panel + run one Jarvis routing: **≥58 fps sustained** (no dip below 45 during the firefly flight).
    - Complete 3 tasks rapid-fire: concurrent ascents hold ≥55 fps.
    - Hands off for 10 s: rAF activity → 0 (except firefly heartbeat ≤5 fps), CPU ≈ idle baseline.
    - `gl.info.render.calls ≤ 150`, triangles ≤ 300k, in the loaded Vestibule view.

---

## 8. MODEL ROUTING

Doctrine: **Opus (xhigh) executes ALL code.** Units with difficulty ≥ ~0.6 or heavy novelty get a **Fable pre-plan seed** (a focused design memo: exact shader chunks/curve math/timeline tables/state machines) before the Opus build. Sonnet writes docs. Haiku only for truly trivial mechanical units.

| Unit | Executor | Fable pre-plan? | Rationale |
|---|---|---|---|
| U-01 deps-config | Opus xhigh | No | Mechanical but build-critical (version pins, Turbopack config) |
| U-02 island-scaffold | Opus xhigh | No | Well-documented pattern, TECH.md gives the exact skeleton |
| U-03 tokens-materials | Opus xhigh | **Yes** | 0.65 + novelty: custom fresnel `onBeforeCompile` chunk must compose with ember state chunk; pre-plan fixes the shader-chunk interface |
| U-04 data-bridge | Opus xhigh | **Yes** | 0.6 + load-bearing: layout math, differ semantics, event-bus contract freeze for all downstream units |
| U-05 assets | Haiku | No | Pure download/commit/license bookkeeping |
| U-06 tree-geometry | Opus xhigh | No | 0.55; curve/tube work is standard once layout contract exists |
| U-07 camera-rig | Opus xhigh | **Yes** | 0.7 + novelty: focus-stack semantics, demand-mode invalidation discipline, feel-tuning targets |
| U-08 atmosphere-post | Opus xhigh | No | Direct TECH.md recipes (Environment, Bloom, Vignette) |
| U-09 ember-system | Opus xhigh | **Yes** | 0.85, the hardest unit: instancing+freelist+GPU state attribute+ascent runtime; pre-plan specifies the aState encoding and ascent keyframes |
| U-10 lantern-system | Opus xhigh | No | 0.55; drei Instances + pick map is well-trodden |
| U-11 labels-ledger | Opus xhigh | No | 0.45; troika/drei Text with documented knobs |
| U-12 today-panel | Opus xhigh | No | 0.55; uikit layout + copied 2D action pattern |
| U-13 jarvis-ring | Opus xhigh | **Yes** | 0.7 + novelty: SSE→scene state machine, single-Html focus management, summon choreography |
| U-14 firefly-system | Opus xhigh | **Yes** | 0.7 + novelty: wander behavior + heartbeat idle policy + flight-bus API |
| U-15 mode-toggle | Opus xhigh | No | 0.3; surgical, but touches shared shell file → Opus for care |
| U-16 jarvis-routing-choreography | Opus xhigh | **Yes** | 0.85, the thesis animation: receipt resolution, bezier choreography, kindle handoff sequencing |
| U-17 litany-bootup | Opus xhigh | **Yes** | 0.75 + novelty: single-spring keyframe timeline across 4 subsystems; pre-plan writes the keyframe table |
| U-18 chimes | Opus xhigh | No | 0.25; small WebAudio pool |
| U-19 reduced-motion-and-gating | Opus xhigh | No | 0.4; flag-threading, checklist-driven |
| U-20 perf-hardening | Opus xhigh | No | 0.6 but verification-shaped, not novel; §7 IS its pre-plan |
| U-21 docs-changelog | Sonnet | No | Prose |

---

## 9. INTEGRATION & DATA CONTRACTS (precise bindings)

| Source of truth | Access path | 3D binding | Change propagation |
|---|---|---|---|
| Areas + projects | `getSidebarTree(userId)` SSR seed → `getSidebarTreeForCurrentUser` refetch, sidebar's query key | `solveTreeLayout` → boughs (areas, OKLCH via verbatim `pickNodeColor`) + lanterns (projects; `isClass` → armature ring) | `useTableSubscription("areas"/"projects")` → invalidate → new layout memo → geometry rebuild (rare) |
| Tasks | `tableKey("tasks", userId)` + `getTasksForCurrentUser` (identical to `TasksClient.tsx`) | `classifyTask` → ember instance state: today/overdue/priority/ambient per §6 mapping table | Realtime → invalidate → differ: new row = spring-in ember; `status→lesno` transition = ascending spark + bell; removal = spring-out |
| Captures | `[...tableKey("captures", userId), null]` + `getCapturesForCurrentUser` (identical to `RecentCapturesWidget.tsx`) | firefly instances near trunk; count = inbox pressure | Realtime insert → spring-in + cork-pop; convert/delete → spring-out or consumed by flight |
| Task mutations from world | SAME server actions as 2D (`app/actions/tasks.ts`) + `invalidateQueries(tableKey("tasks", userId))` | Today panel check-off | Round-trips through the one cache — the 2D app sees it identically |
| JARVIS | `streamJarvis` → `POST /api/jarvis` SSE | `onText`→ribbon ink; `onQueued`→thinking motes; `onAction`→`resolveActionDestination` (receipt→projectId→`layout.byProject`→areaId) → LightThread + `fireflyBus.fly` → landing syncs with differ's ember kindle; then `invalidateAfterJarvisAction` | One agent, two theatres: on the Page the same action renders as today's toasts/invalidations |
| Calendar | none in MVP | — | Meridian Ring = Phase 2; GCal never persisted (constraint upheld) |
| 2D tree | `AreasTree.tsx` untouched | **The Page's tree IS the canopy from above**: identical hierarchy, identical `pickNodeColor` hues, so `Cmd+\` preserves the mental map for free | — |

**Contract freeze:** at end of wave 1, `treeLayout.ts` types, `mappings.ts` table, `tokens.ts`, `worldEvents` event names, and the bus signatures (`cameraBus`, `fireflyBus`) are frozen; wave 2+ agents may consume but not modify them (changes require an orchestrator amendment commit).

---

## 10. RISKS & MITIGATIONS (TECH.md table → units)

| Risk (TECH.md) | Severity | Owned by | Mitigation as built |
|---|---|---|---|
| Text input in 3D | High | U-13 | The ONLY in-world text entry is one drei `<Html>` DOM `<input>` (real caret/IME); all rich editing stays on the Page; Phase 3's forge editor is also `<Html>` |
| DOM-in-3D at scale | High | U-12, U-13 | uikit for the panel; exactly ONE `<Html>` root in the scene; `occlude="blending"` never raycast occlusion |
| Accessibility | High | U-15, U-19 | The Page remains the accessible path; `Cmd+\` always exits; reduced-motion users default to Page with the World reachable-but-calm; fallback card on capability failure |
| SSR / hydration | Medium | U-02 | Strict island: three imports confined to `components/world/**`, `ssr:false` behind a client boundary, `transpilePackages:['three']`; CI check = `next build` green + 2D route chunk audit |
| Bundle size | Medium | U-02, U-20 | Route-level code-split verified in build output; HDRI/fonts/SFX lazy under `/world` only |
| Motion sickness | Medium | U-07, U-19 | Guided `setLookAt` glides only; no WASD/pointer-lock in MVP; damped orbit; reduced-motion = instant cuts |
| Transmission perf | Medium | U-03 | `heroGlass` dev-enforced ≤3 registry; everything else cheap fresnel recipe |
| uikit maturity | Low–Med | U-12 | Pinned 1.0.73; no per-frame prop churn; row cap 12; panel re-renders only on data change |
| Perf generally | High (self-imposed) | U-09, U-14, U-20 | Instancing + demand + dpr clamp + `PerformanceMonitor` ladder + idle-sleep audit + §7.10 measured protocol |
| WebGPU ecosystem gaps | Medium | Phase 7 | Deferred entirely; WebGL v1; fresnel via `onBeforeCompile` accepted as WebGL-only debt, TSL port scheduled with Phase 7 |
| SSE receipt shape drift | Medium (new) | U-16 | `resolveActionDestination` has a fallback: if the receipt lacks project linkage, resolve via the post-invalidation task diff (new row's `projects[0].id`) — routing flight degrades gracefully to "fly after refetch", never breaks |

---

## 11. DEFINITION OF DONE (MVP) + VERIFICATION CHECKLIST

The Tester/verifier runs this end-to-end on the target machine (M-series MacBook, Chrome AND Safari):

**Build integrity**
- [ ] `npm run build` green; `tsc --noEmit` green; Vitest suite (U-04 tests) green.
- [ ] `next build` route output: `/world` is the only route carrying three/R3F chunks; a 2D route's JS is byte-comparable to pre-project baseline.

**The Tree, live**
- [ ] `/world` renders trunk + one bough per active area, hues matching `/areas` (same `pickNodeColor` output, spot-check 3 areas).
- [ ] Lanterns = active projects; class projects wear the armature ring.
- [ ] Embers: a due-today task pulses gold; an overdue task hangs red below its lantern; a P1 task carries a taper filament.
- [ ] **Realtime:** create a task in a second tab (2D) → ember springs in without reload; delete it → ember springs out.

**The sacred animation**
- [ ] Completing a task (from the world's Today panel AND from the 2D app in another tab) → flare → spark ascends → dissolves → glass bell. Both trigger paths verified.

**Flight & keys**
- [ ] Click bough → ~700 ms glide; click lantern → reading-distance arrival; Esc walks back lantern→bough→vestibule; Esc×3 from anywhere = dais; `1–9` fly to areas in order; hover = lean + emissive lift + Garamond caption.

**Jarvis**
- [ ] `Cmd+K` in-world summons ring + ribbon with a real caret; a routed sentence ("remind me to email the prof Friday") streams ink, then: light-thread fires, firefly flies along the CORRECT area's bough, lands, cools gold, and the new ember exists (verify the task row in 2D). Two-note chime plays.

**The Litany & the hatch**
- [ ] Cold load plays the 6 s boot (floor lines → boughs → Ledger typewriter) ending on the Vestibule shot; any key skips; same-session revisit skips.
- [ ] `Cmd+\` from `/tasks` enters the world; `Cmd+\` returns to `/tasks` exactly as left (scroll, state intact); camera pose survives the round trip.

**Honesty layers**
- [ ] macOS Reduce Motion ON: no glides/pulses/drift; litany = fade; completion = crossfade + bell; everything still legible.
- [ ] WebGL2 disabled (devtools override): fallback card renders, no crash, 2D untouched.

**Performance (§7.10, recorded numbers required)**
- [ ] Seeded scene (8 areas / 40 projects / 300 tasks / 12 captures): ≥58 fps through orbit + 3 fly-tos + panel + one routing flight; ≥55 fps with 3 concurrent ascents.
- [ ] Idle 10 s: rAF → 0 (± firefly heartbeat ≤5 fps); CPU at idle baseline; `gl.info.render.calls ≤ 150`.
- [ ] `PerformanceMonitor` ladder verified by artificially throttling GPU (devtools): DPR steps down, Vignette sheds, nudge toast appears.

Ship when every box is checked. Then stand on the dais, say one sentence, and watch the light land where it belongs.

*— Fable, Architect. Plan sealed. Hand the torch to Opus.*
