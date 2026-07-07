# U-14 · firefly-system — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/tree/Fireflies.tsx` — captures as
> living fireflies. Design memo only; no code exists for this unit yet. Everything below was
> verified on 2026-07-06 against the COMMITTED wave-1/wave-2 contracts (file:line cited). Where
> PLAN §6 U-14's sketch and this memo differ, this memo wins — it resolves the sketch's
> ambiguities against the frozen contracts.
>
> File you will create (nothing else): `apps/web/components/world/tree/Fireflies.tsx`.
> The orchestrator wires `<Fireflies/>` into `WorldScene.tsx` at the wave-3 boundary
> (WorldScene.tsx:60-66); you do NOT touch WorldScene.
>
> Frozen inputs you consume, never modify:
> - `data/diffing.ts` — **you IMPLEMENT `fireflyBus`**. The shape is frozen at
>   diffing.ts:154-163 (`FlightRequest { captureId?; toAreaId; toProjectId?; kind }`,
>   `FireflyBus { fly(req): Promise<void> }` — "resolves at landing", diffing.ts:162) and
>   ownership is assigned to this file at diffing.ts:138-144. Import the types; export
>   `export const fireflyBus: FireflyBus = { … }`. Also consumed: `worldEvents`
>   (diffing.ts:100-136) — `"capture-created"` payload `{ captureId }` (diffing.ts:91) and
>   `"chime"` kinds `"glass-bell" | "cork-pop" | "two-note"` (diffing.ts:92).
> - `data/useWorldData.ts` — `useWorldData().captures` (`CaptureWithLinks[]`,
>   useWorldData.ts:23) is the declarative truth; `.layout` (`TreeLayoutResult`,
>   useWorldData.ts:20) for boughs/lanterns.
> - `data/treeLayout.ts` — `boughPoint(b, t)` (treeLayout.ts:136-150; the SAME quadratic
>   Bézier the U-06 tube is fitted through — flying along it stays glued to the visible
>   limb), `hash01` (treeLayout.ts:42-46), `BoughLayout`/`LanternLayout`
>   (treeLayout.ts:69-87), `TRUNK_RADIUS`/`LANTERN_HANG` constants.
> - `materials/sharedGeometries.ts` — `FIREFLY_GEOMETRY` (sphere 0.02, 40 tris,
>   sharedGeometries.ts:45-47). Do NOT construct geometry.
> - `materials/tokens.ts` — `STUDIOLO.fireflyCyan` `#8FE8FF` (tokens.ts:20),
>   `STUDIOLO.candleflame` `#E8C46B` (tokens.ts:17).
> - `tree/Embers.tsx` — read-only neighbor. You copy its SoA discipline (typed arrays,
>   freelist, one allocation-free `useFrame`) and coordinate the landing handoff with its
>   spring-in (§8). You never import from it.
>
> Hard rules inherited: exactly **1 draw call** for the whole capture layer (PLAN §7.2 line
> 578 budgets "fireflies 1"; the brief's "≤2" is satisfied with headroom); **zero per-frame
> React state**; **zero allocation in `useFrame`**; rows NEVER mount/unmount; the swarm
> **sleeps completely when empty** and idles at a ≤5 fps heartbeat otherwise (PLAN §7.5(f)
> line 581, §7.10 line 590).

---

## 0. Orientation — what this unit actually is

One React component owning ONE imperative `THREE.InstancedMesh` and a per-frame runtime,
mounted as a `<primitive>`, plus ONE module-level bus singleton other units call:

1. **The firefly mesh** — `new THREE.InstancedMesh(FIREFLY_GEOMETRY, fireflyMaterial, 256)`.
   Every unfiled capture is an instance. Per-instance hue/brightness via `instanceColor`
   (HDR-scaled for bloom + the landing cool-down lerp); per-instance transform via
   `instanceMatrix` mutated in `useFrame`.
2. **`fireflyBus`** — the module singleton implementing the frozen `FireflyBus` interface.
   U-16 (jarvis-routing-choreography) is its only planned caller (PLAN §6 U-16 line 525).

Three behaviors, one runtime:
- **Drift** — a wandering swarm loitering near the trunk (VISION.md:129-133: "they loiter
  near the trunk in a loose swarm. Their count is your inbox pressure").
- **Flight** — the scripted `fly()` along `boughPoint` to a lantern (VISION.md:134-138:
  "a curving, dragonfly-quick flight along the correct bough to its destination lantern…
  **this flight is the visual proof of the core product promise**").
- **Landing/cool** — arrive, two-note chime, dissolve while cooling cyan→candle-gold, hand
  the stage to the real ember's spring-in (§8).

Component skeleton (structure, not code):

```
export function Fireflies(): JSX.Element
  ├─ useWorldData()                    → captures, layout
  ├─ useMemo(mount-once)               → material, mesh, runtime (buildSystem)
  ├─ useEffect([sys])                  → module mirrors for the bus (§7.1), dispose on unmount
  ├─ useEffect([captures])             → reconcile (§4)
  ├─ useEffect(mount)                  → worldEvents.on("capture-created") → cork-pop (§9)
  ├─ useEffect(mount)                  → wake listeners (4 s window) + heartbeat + visibility (§6)
  ├─ useFrame((_, delta))              → drift + flights + dissolves + demand decision (§5–§7)
  └─ return <primitive object={sys.mesh} />

export const fireflyBus: FireflyBus   // module singleton, delegates into the mounted system
```

drei `<Instances>` is REJECTED (never-mount-per-row rule, PLAN §7.4 line 580). All mutable
state lives in module-internal typed arrays; `useWorldData()` is read in RENDER only.

---

## 1. Data truth — what a firefly IS, verified against the real capture flow

### 1.1 The rows

`useWorldData().captures` is fed by the provider's query
`[...tableKey("captures", userId), null]` / `getCapturesForCurrentUser()`
(WorldDataProvider.tsx:84-88), with `useTableSubscription("captures", userId)` Realtime
invalidation (WorldDataProvider.tsx:65). Query limit is 100 rows
(lib/db/queries/captures.ts:84) — relevant to the cap (§2.4).

### 1.2 Membership predicate — "unfiled"

A firefly is a capture **that hasn't found its branch** (VISION.md:130-131). PLAN's mapping
table says "`capture` row (unconverted) → firefly" (PLAN.md:284), and the U-14 scope says
"unfiled captures" (PLAN.md:499). `CaptureWithLinks.projects`
(lib/db/queries/captures.ts:34) tells us whether it's filed:

```
isFirefly(c: CaptureWithLinks) := c.projects.length === 0
```

This makes every flight kind map to a REAL data transition, not a fiction:

| Trigger | Real data transition | Realtime consequence in `captures` | Firefly consequence |
|---|---|---|---|
| Capture created (2D composer, Jarvis `create_capture`) | `createCapture` insert (app/actions/captures.ts:45-68) | new row, `projects: []` | reconcile spawns; `capture-created` event → cork-pop (§9) |
| Convert to task (2D dialog or Jarvis) | `convertCaptureToTask`: task insert + capture **hard delete** in ONE transaction (app/actions/jarvis.ts:96-121) | row vanishes | consumed by flight if one is active, else spring-out (§4); the NEW task row spring-kindles an ember via U-09's reconcile |
| Capture linked to a project (`kind:"note"` routing) | `capturesProjects` insert | row's `projects.length` becomes > 0 → fails the predicate | leaves the swarm (consumed by flight or spring-out) |
| Capture deleted | `deleteCapture` (app/actions/captures.ts:243-247) | row vanishes | spring-out |

### 1.3 Event ordering guarantee you rely on

The provider emits `capture-created` in its OWN effect keyed on `captures`
(WorldDataProvider.tsx:126-138). `Fireflies` is a **child** of the provider, and child
effects run before parent effects on the same commit — the same ordering U-09 relies on
(Embers.tsx:861-864). So when your `capture-created` listener fires, your reconcile has
ALREADY spawned the firefly. The listener therefore only needs to chime + pop (§9), never
spawn.

---

## 2. The mesh + material

### 2.1 Material — additive glow, NOT hologram

PLAN §6 U-14 prescribes `MeshBasicMaterial` (PLAN.md:501). Do NOT use
`makeHologramMaterial` — a 0.02-radius mote has no readable fresnel rim, and staying off the
hologram family means zero shader-treaty exposure (hologram.ts:14-61 stays U-03/U-09's
problem). Exact construction:

```ts
const fireflyMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,            // WHITE — hue lives in instanceColor (§2.3)
  toneMapped: false,          // HDR instanceColor survives to trip Bloom (threshold 1)
  transparent: true,
  blending: THREE.AdditiveBlending,  // overlapping motes accumulate glow; no sort artifacts
  depthWrite: false,
});
```

Additive + `depthWrite:false` is the standard bloomable-mote recipe: against the Nightwalnut
scene the swarm reads as points of light, and the 15-capture "visible cloud" acceptance
(PLAN.md:512) brightens naturally where motes overlap.

### 2.2 Bloom arithmetic (why HDR_MULT = 1.8)

`new THREE.Color(STUDIOLO.fireflyCyan)` under r185 color management yields linear
≈ (0.275, 0.808, 1.0). The composer blooms only luminance > 1
(`luminanceThreshold={1}`, PLAN §7.6 line 582). At ×1.8 the instance color is
≈ (0.49, 1.45, 1.8) — two components over threshold → a clean cyan halo. The cool-down
target, `candleflame` ×1.2 ≈ (0.97, 0.66, 0.18), sits BELOW threshold — cooling literally
turns the bloom off as the mote becomes matter (§7.6).

### 2.3 `instanceColor` — allocated eagerly

Call `mesh.setColorAt(i, WHITE)` for ALL 256 slots at construction, before first render, then
`mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)` — same reason and same pattern as
Embers (Embers.tsx:296-307): the buffer must exist at first compile. Also
`mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)`, `mesh.frustumCulled = false`
(flights traverse the whole tree; the instanced bounding sphere is stale — Embers.tsx:291
precedent), `mesh.name = "fireflies"`. Initialize every slot to a scale-0 matrix.

### 2.4 Cap = 256 (amendment note)

PLAN §6's sketch says 64 (PLAN.md:501) and the geometry comment repeats it
(sharedGeometries.ts:45-46); the orchestrator brief for this unit raises the cap to **256**.
Adopt 256: the captures query pages at 100 rows (§1.1), and the extra headroom absorbs
transient flight-only instances (§7.3) plus dissolve tails without freelist pressure. Cost is
unchanged where it matters — still exactly 1 draw call; worst-case triangles 256 × 40 =
10.2k (vs 2.6k), noise against the 300k budget (PLAN §7.3 line 579). The stale comment in
`sharedGeometries.ts` is documentation only — the cap is an `InstancedMesh` constructor
argument, not a geometry property; do not edit the frozen file.

---

## 3. The SoA runtime — zero React state

Module-internal, mount-once (built in `useMemo`, like Embers.tsx:846). All caps/constants in
one block:

```ts
const MAX_FIREFLIES = 256;
const FLIGHT_POOL   = 4;      // ≥ U-16's "at most 2 concurrent flights" (PLAN.md:532)
// Swarm volume — an annulus around the trunk, clear of the trunk-shell ember
// cluster (radius 0.6, y 1.2–2.0; treeLayout.ts:37-38):
const SWARM_R_MIN = 0.9,  SWARM_R_MAX = 1.6;
const SWARM_Y_MIN = 1.4,  SWARM_Y_MAX = 2.8;
// Wander:
const RETARGET_MIN_S = 2.0, RETARGET_MAX_S = 4.0;   // PLAN.md:501 "every 2–4 s"
const WANDER_SMOOTH  = 0.9;                          // maath damp3 smoothTime (s)
const DT_CAP         = 0.25;  // NOT 0.1: heartbeat frames arrive at 200 ms and must
                              // integrate fully, else 5 fps drift crawls (§6.2)
// Enter/leave/pop (mirrors the ember feel, Embers.tsx:82-85):
const SPRING_LAMBDA = 12, POP_LAMBDA = 6, ENTER_POP = 2.0;
// Glow:
const HDR_MULT = 1.8;
const FLICKER_AMP = 0.25;     // ±25% brightness sinusoid
const FLICKER_HZ_MIN = 0.5, FLICKER_HZ_MAX = 1.1;    // per-instance via hash01
// Flight timeline (§7.5):
const DEPART_MS = 250, TRAVERSE_MS = 900, LAND_MS = 200, DISSOLVE_MS = 280;
const SPEED_PULSE_A = 0.5;    // 1.5× mid-arc speed pulse (§7.5)
const FLIGHT_LIFT = 0.08;     // skim ABOVE the limb tube, never intersect it
// Idle policy (§6):
const ACTIVE_MS = 4000, HEARTBEAT_MS = 200;
```

Runtime shape:

```ts
type FireflyMode = 0 /* drifting */ | 1 /* flying */ | 2 /* dissolving */;

interface FlightEntry {                  // fixed pool, allocation only at fly() call time
  slot: number;                          // -1 = inactive
  captureId: string | null;              // null = transient (no backing row)
  bough: BoughLayout | null;
  tLand: number;                         // curve parameter of the landing (§7.4)
  target: THREE.Vector3;                 // final landing position (preallocated per entry)
  departFrom: THREE.Vector3;             // wander position at fly() (preallocated)
  t: number;                             // ms since flight start
  resolve: (() => void) | null;          // the fly() promise; fired ONCE at landing
}

interface FireflyRuntime {
  index: Map<string, number>;            // captureId → slot (resident, unconsumed)
  free: number[];                        // freelist stack, seeded [255..0]
  consumed: Set<string>;                 // captureIds owned by an active flight (§7.7)
  flights: FlightEntry[];                // length FLIGHT_POOL
  flightCount: number;
  alive: Uint8Array;                     // slot occupied
  mode: Uint8Array;                      // FireflyMode per slot
  pos: Float32Array;                     // 3× — current position (authoritative)
  goal: Float32Array;                    // 3× — wander goal (drift mode only)
  nextPickAt: Float32Array;              // clock seconds for next goal re-pick
  seed: Uint32Array;                     // per-slot LCG state (§5.2)
  phase: Float32Array;                   // flicker phase, hash01(id)·2π, set once
  flickerHz: Float32Array;               // per-slot flicker rate, set once
  scale: Float32Array; scaleTarget: Float32Array;
  pop: Float32Array;                     // HDR pop multiplier, decays → 1
  hue: Float32Array;                     // 3× — linear RGB (cyan; lerps to candleflame in dissolve)
  highWater: number;
  motion: boolean;                       // springs/pops still animating (demand flag)
  clock: number;                         // seconds, advanced by capped dt; wraps at 600
}

interface FireflySystem {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshBasicMaterial;
  runtime: FireflyRuntime;
}
```

Module-level scratch (the ONLY objects the loop touches): `_dummy: Object3D`, `_va`, `_vb:
Vector3`, `_color: Color`, plus the two precomputed linear colors `CYAN` (`new
THREE.Color(STUDIOLO.fireflyCyan)`) and `COOL` (`new THREE.Color(STUDIOLO.candleflame)`).

---

## 4. Reconcile — `useEffect([sys, captures])`

Diff `captures.filter(isFirefly)` against `runtime.index`, exactly the Embers discipline
(Embers.tsx:439-546):

1. **Removals** (id in index, absent or newly-filed in next):
   - If `consumed.has(id)`: **skip** — an active flight owns this instance and will retire
     it itself (PLAN.md:510: "convert/delete → spring-out **unless it was consumed by an
     active flight**"). Do not free, do not touch scaleTarget.
   - Else: `scaleTarget[slot] = 0`; the frame loop frees the slot when scale < 0.01
     (Embers.tsx:765-784 pattern), removing it from `index` at that moment (keep a
     `leavingByCapture` map mirroring Embers.tsx:206, or fold leave-tracking into
     `mode`+`scaleTarget` — either is fine; the invariant is re-adds mid-leave reclaim the
     slot rather than double-spawning).
2. **Additions**: pop the freelist (cap-exhausted → `warnCapOnce`, mirroring
   Embers.tsx:236-244). Seed the slot:
   - Spawn position — deterministic from `hash01` (treeLayout.ts:42-46), cylindrical:
     `θ = 2π·hash01(id)`, `r = SWARM_R_MIN + (SWARM_R_MAX−SWARM_R_MIN)·hash01(id+":r")`,
     `y = SWARM_Y_MIN + (SWARM_Y_MAX−SWARM_Y_MIN)·hash01(id+":y")`. Same input ⇒ same
     spawn, across reloads.
   - `scale = 0`, `scaleTarget = 1`, `pop = ENTER_POP` (the "blinks into being",
     VISION.md:314), `mode = 0`, `hue = CYAN`, `phase = hash01(id)·2π`,
     `flickerHz = FLICKER_HZ_MIN + (MAX−MIN)·hash01(id+":f")`, `seed = (hash01(id)·2³²)>>>0`,
     `goal = spawn`, `nextPickAt = clock` (re-pick immediately on first frame).
3. Set `runtime.motion = true`; `invalidate()` once at the end of the effect (the provider
   also invalidates on data identity, WorldDataProvider.tsx:140-144 — the double demand is
   harmless).

Reconcile is the ONLY spawn path. The `capture-created` event never spawns (§1.3, §9).

---

## 5. The wandering model

### 5.1 Goal-seeking drift (PLAN's prescription, made exact)

PLAN §6 U-14: "seeded random targets re-picked every 2–4 s, `easing.damp3` toward them"
(PLAN.md:501). Per drift-mode slot, per demanded frame:

1. If `runtime.clock >= nextPickAt[s]`: draw three LCG values (§5.2), pick a new `goal`
   inside the swarm volume (same cylindrical mapping as spawn), set
   `nextPickAt[s] = clock + RETARGET_MIN_S + (RETARGET_MAX_S−RETARGET_MIN_S)·rand`.
2. `easing.damp3(_va ← pos, goal, WANDER_SMOOTH, dt)` → write back to `pos`. maath's damp3
   is frame-rate independent, so the SAME code integrates correctly at 60 fps (active
   window) and at 5 fps (heartbeat) — no dual path.
3. Flicker: `brightness = 1 + FLICKER_AMP·sin(2π·flickerHz[s]·clock + phase[s])`;
   `instanceColor = hue × HDR_MULT × brightness × pop`. A 0.5–1.1 Hz sinusoid sampled at
   5 fps is comfortably above Nyquist — the idle blink stays smooth.
4. Write the matrix (position + uniform `scale[s]`) only when the slot moved or scaled;
   batch `needsUpdate` flags once per frame (Embers.tsx:827-830 pattern).

`dt = min(delta, DT_CAP)` — capped at 0.25 s so a 200 ms heartbeat gap integrates as a full
step, but a background-tab return can't teleport the swarm (Embers.tsx:727 precedent, wider
cap deliberate).

### 5.2 Allocation-free seeded randomness (the one subtlety)

`hash01` takes a string — calling it per re-pick would allocate in `useFrame`. Instead each
slot carries an integer LCG seeded ONCE at spawn from `hash01(captureId)`:

```
seed[s] = (seed[s] * 1664525 + 1013904223) >>> 0;   rand = seed[s] / 4294967296;
```

Pure integer math, zero allocation, deterministic per capture id. `hash01` itself is called
only in reconcile/spawn (event cadence, allocation there is fine).

### 5.3 Reduced motion

`prefersReducedMotion` (§10) short-circuits step 1–3: positions stay at spawn, brightness
constant. "Fireflies (static positions)" is U-19's explicit requirement (PLAN.md:555).

---

## 6. Demand-mode idle policy — the exact contract

This is the §7.5(f) instantiation (PLAN.md:581): *"the firefly 5 fps heartbeat (only while
fireflies exist AND tab visible)"* + the §7.5(g) 4-second post-interaction window. Unlike
Embers (whose idle pulse is GPU-side and simply pauses), fireflies have CPU-side gentle
motion — so the policy has **three tiers**, decided at the END of every `useFrame`:

| Tier | Condition | Demand behavior | Effective rate |
|---|---|---|---|
| **Flight-active** | `flightCount > 0` OR `runtime.motion` (springs/pops/dissolves unsettled) | `invalidate()` every frame from inside `useFrame` | 60 fps until done |
| **Awake** | within the 4 s active window (`performance.now() < activeUntil`) | `invalidate()` every frame | 60 fps drift |
| **Idle** | fireflies exist, window closed | **return WITHOUT invalidating**; the external heartbeat demands frames | ≤5 fps drift |
| **Asleep** | zero live instances | heartbeat cleared; nothing demands | 0 — true sleep |

Implementation, verbatim policy:

- **Active window** — copy the DustMotes wake pattern exactly (DustMotes.tsx:87-104):
  passive listeners on `pointerdown/pointermove/keydown/wheel` set
  `activeUntilRef = performance.now() + ACTIVE_MS` and call `invalidate()` once. Also open
  the window from reconcile-spawn and from `fly()` (a flight is an interaction).
- **Heartbeat** — `setInterval(() => invalidate(), HEARTBEAT_MS)` (PLAN.md:501 names this
  exact mechanism), installed ONLY while `liveCount > 0 && document.visibilityState ===
  "visible" && !reducedMotion`. Maintain it from: (a) a `visibilitychange` listener
  (PLAN.md:511: "heartbeat interval cleared when tab hidden"), (b) reconcile (count may
  have crossed 0↔1), (c) the frame loop when it frees the last slot. Keep the id in a ref;
  install/clear must be idempotent.
- **The sleep proof** (acceptance): with zero captures, rAF activity is 0 and no interval
  exists. With a resident swarm and hands off for 10 s, rAF ≈ 5 Hz — exactly the §7.10
  audit line "rAF activity → 0 (except firefly heartbeat ≤5 fps)" (PLAN.md:590).
- **Why drift doesn't self-demand when idle**: the frame loop only *advances* state in
  demanded frames; by not invalidating in the Idle tier, the heartbeat's 5 fps IS the drift
  rate. damp3's dt-integration keeps the visual speed identical to the 60 fps tier — only
  the sampling is coarser. This is what "gently alive but never busy" costs: ~0.1 ms of JS
  five times a second.

---

## 7. `fireflyBus.fly()` — the scripted flight

### 7.1 Bus plumbing (module singleton ↔ mounted system)

`fireflyBus` is a module-level `const` (it must exist at import time — U-16 imports it
directly). The mounted component mirrors what the bus needs into module refs, the same
pattern as U-09's `emberUniforms` module singleton (Embers.tsx:108-111):

```ts
let _sys: FireflySystem | null = null;        // set in a mount effect, nulled on unmount
let _layout: TreeLayoutResult | null = null;  // refreshed by an effect keyed on layout
let _invalidate: (() => void) | null = null;
let _wake: (() => void) | null = null;        // opens the 4 s window

export const fireflyBus: FireflyBus = {
  fly(req: FlightRequest): Promise<void> { /* §7.2–§7.6 */ },
};
```

**Degradation rule**: if `_sys` or `_layout` is null (world unmounted, or called before
mount), or `layout.byArea.get(req.toAreaId)` is undefined (stale area id), log a
`console.warn` and **resolve immediately**. Never reject, never hang — U-16 chains
`.then()` for thread cleanup (PLAN.md:525) and must not leak on a missing world.

### 7.2 Acquiring the instance

- `req.captureId` set AND `index.has(captureId)`: use that slot. `index.delete(captureId)`,
  `consumed.add(captureId)` — from this moment reconcile ignores this id (§4.1) and the
  flight owns the instance's lifecycle.
- Otherwise (no `captureId`, or the row already vanished — e.g. Jarvis created a task
  straight from a sentence with no capture): **spawn a transient** — pop the freelist,
  place it at the bough root (`bough.start` + small `hash01` jitter), `scale 0 → 1` fast
  spring so the flight has a visible body within ~120 ms. `captureId = null` on the entry.
  Freelist empty → warn + resolve immediately (never no-op silently mid-choreography;
  mirrors `beginAscent`'s never-silently-drop rule, Embers.tsx:570-589).

### 7.3 The flight pool

`flights` is a fixed `FLIGHT_POOL = 4` array (U-16 promises ≤2 concurrent, PLAN.md:532;
4 = margin). Pool exhausted → finish the OLDEST instantly (resolve its promise, chime,
retire its instance) and reuse the entry — the Embers ascent-pool overflow discipline
(Embers.tsx:601-609). The `resolve` function captured per call is the only allocation;
`fly()` runs at event cadence, not per-frame.

### 7.4 Destination resolution (once, at call time)

- `bough = layout.byArea.get(req.toAreaId)` — required (else degrade, §7.1).
- If `req.toProjectId`: `lantern = layout.byProject.get(req.toProjectId)`; verify
  `lantern.areaId === req.toAreaId` (mis-matched ids fall back to area-only landing).
  `target.set(...lantern.position)`.
  **Recovering the curve parameter `tLand`**: `LanternLayout` doesn't store its `t`
  (treeLayout.ts:80-87), so recover it numerically against the frozen curve — coarse-scan
  `boughPoint(bough, k/32)` for `k = 0..32` minimizing squared distance to
  `lantern.position`, then one refinement pass of 8 samples over `±1/32` around the best.
  40 evaluations of a quadratic Bézier, once per flight — robust to any future solver
  jitter tweak, zero duplication of the solver's placement formula (treeLayout.ts:237-251).
- No `toProjectId`: `tLand = 0.85`, `target = boughPoint(bough, 0.85)` — routed "to an
  area" lands on the outer limb.
- `req.kind` does not change the path; `"task"` vs `"note"` differ only in what the DATA
  does afterwards (ember kindles vs. capture stays linked, §1.2) — the dissolve is
  identical in MVP.

### 7.5 The flight timeline (total ≈ 1.35 s + 0.28 s dissolve)

Advance `entry.t += dt·1000` in the frame loop; phases by elapsed time:

| Phase | Window | Motion |
|---|---|---|
| **Depart** | 0 → 250 ms | lerp `departFrom → bough.start`, easeInQuad (`u²`) — the firefly dives to the limb root |
| **Traverse** | 250 → 1150 ms | `u = (t−250)/900`; **curve param** `ct = tLand · s(u)` where `s(u) = u − (A/2π)·sin(2πu)`, `A = 0.5`; position = `boughPoint(bough, ct) + [0, FLIGHT_LIFT, 0]` |
| **Land** | 1150 → 1350 ms | lerp `boughPoint(bough,tLand)+lift → target`, easeOutQuad — the hop down onto the lantern (lanterns hang `LANTERN_HANG=0.18` below the curve, treeLayout.ts:35, so the lift naturally vanishes here) |
| **Arrival** | at 1350 ms | `resolve()` the promise (frozen semantics: "resolves at landing", diffing.ts:162) + `worldEvents.emit("chime", { kind: "two-note" })` (§9) + enter dissolve |
| **Dissolve/cool** | 1350 → 1630 ms | `mode = 2`: scale `1 → 0` smoothstep over 280 ms while `hue` lerps `CYAN → COOL` and the HDR mult eases `1.8 → 1.2` — cooling below bloom threshold (§2.2), "cooling from cyan to candle-gold" (VISION.md:317) |
| **Retire** | dissolve end | scale-0 matrix, `alive = 0`, `free.push(slot)`, `consumed.delete(captureId)`, entry `slot = -1`, swap-remove from the pool |

The speed-pulse math: `s(0)=0, s(1)=1, s′(u) = 1 − A·cos(2πu)` → speed 0.5× at the ends,
**1.5× mid-arc** — exactly U-16's "dragonfly-quick" 1.5× pulse (PLAN.md:525), owned here so
U-16 only *calls* `fly()`.

While ANY flight is active the loop invalidates every frame (§6 tier 1) — a flight never
stutters at heartbeat rate.

### 7.6 Who calls `fly()` — the trigger map

| Route | Caller | Mechanism |
|---|---|---|
| **Jarvis routing** (the thesis) | U-16 | `onAction` → `resolveActionDestination(ev, layout)` → `fireflyBus.fly({ captureId?, toAreaId, toProjectId, kind })`; landing syncs with the ember kindle from `invalidateAfterJarvisAction`'s refetch (PLAN.md:99, 525, 633) |
| **2D convert/link** (dialog on /captures) | nobody, in MVP | no event carries a destination; the capture row just vanishes → firefly springs out, ember springs in independently. Honest, unchoreographed. A post-MVP enhancement may correlate the differ's added-task row to the removed capture and fire `fly()` — that is U-16/orchestrator territory, NOT built here |
| **U-14 itself** | never | this unit only ever *implements* `fly()`; it initiates nothing |

### 7.7 The completion race, stated as invariants

The convert transaction deletes the capture and inserts the task atomically
(app/actions/jarvis.ts:96-121), but its Realtime echo races the 1.35 s flight arbitrarily.
Four cases, all safe:

1. **Echo lands mid-flight** (common): reconcile sees the id gone → `consumed` check skips
   it (§4.1). The flight completes and retires the instance itself. No double-free.
2. **Echo lands before `fly()` is even called** (fast refetch): `index` miss → transient
   spawn path (§7.2). The animation still plays; the swarm count is already correct.
3. **Ember appears before the firefly lands**: U-09's reconcile spring-kindles on ITS own
   effect (Embers.tsx:861-864) — the ember may already be glowing at the lantern when the
   firefly arrives. Fine: the landing reads as the firefly merging into it.
4. **Firefly lands before the ember exists** (slow refetch): dissolve completes; the ember
   springs in moments later with its own `ENTER_POP`. A ≤1 s gap is acceptable MVP
   choreography (PLAN's acceptance gives 5 s wall-clock for the whole sequence,
   PLAN.md:533).

**Never** wait on, poke, or import the ember system. The handoff is positional coincidence
plus tuned timing (§8) — deliberately loose coupling.

---

## 8. The visual handoff to the ember

`emberPickMap` (Embers.tsx:189-190) confirms embers are keyed by taskId with their own
lifecycle; the firefly cannot (and must not) address a specific ember instance. What makes
the handoff read as one continuous event:

- **Place**: the firefly's `target` IS `lantern.position`; the new ember's slot is on the
  Fibonacci shell radius 0.35 around that same lantern (treeLayout.ts:154-168). Landing and
  kindling happen within half a meter of each other in the focused view.
- **Time**: firefly dissolve is 280 ms; the ember's spring-in at `SPRING_LAMBDA = 12`
  reaches ~95% scale in ≈250 ms (Embers.tsx:82,751). When the echo has landed (case 1/3
  above — the common case, since `invalidateAfterJarvisAction` fires at `onAction`, before
  U-16 even starts the flight), the two animations overlap as a cross-fade: cyan mote
  shrinking + cooling, gold ember popping in.
- **Sound**: one two-note chime at the seam (§9), not two competing sounds — the capture's
  cork-pop happened seconds earlier at spawn.

---

## 9. Events & chimes — exact wiring

One frozen-contract clarification, resolved in favor of the committed contracts: the
orchestrator brief floated `cork-pop` for the landing, but PLAN §6 U-14 (PLAN.md:508), U-18's
sound map ("`cork-pop` (capture created), `two-note` (firefly landing)", PLAN.md:548) and
VISION ("Firefly lands / Jarvis routes something → two-note ascending chime",
VISION.md:283) all agree. **This memo follows the frozen map:**

| Moment | You emit | Why |
|---|---|---|
| `capture-created` received AND the id is in `index` (reconcile already spawned it, §1.3) | `worldEvents.emit("chime", { kind: "cork-pop" })` + set `pop[slot] = ENTER_POP` + `invalidate()` | U-18 subscribes to `chime`, not `capture-created` (PLAN.md:548) — U-14 is the bridge. The index check keeps filed-capture edge cases silent. |
| Flight landing (arrival instant, §7.5) | `worldEvents.emit("chime", { kind: "two-note" })` | The routing chime — "cyan-bright" (VISION.md:283). Emitted exactly once per flight, at the same instant the promise resolves. |

Subscribe with the disposer pattern (`worldEvents.on` returns an unsubscribe,
diffing.ts:101-119) inside a mount effect — StrictMode-safe like Embers.tsx:867-871. U-14
never emits `capture-created` (the provider owns it, WorldDataProvider.tsx:126-138) and
never listens to `jarvis-action` (U-16's job).

---

## 10. Reduced-motion seam — one branch, one place

U-19 will thread a real `useWorldPrefs()` later (PLAN.md:552-556); it does not exist yet.
Do what the other wave-2/3 units do: read the media query ONCE at mount into the system —

```ts
const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

— and branch in exactly three places (so U-19's retrofit is a one-variable swap):

1. **Drift**: skipped entirely; fireflies hold their deterministic spawn positions
   (PLAN.md:555 "Fireflies (static positions)"). Flicker also constant.
2. **Heartbeat**: never installed — a static swarm demands nothing; renders happen only on
   data-change invalidations. True zero-idle.
3. **`fly()`**: no path animation. Emit the two-note chime, resolve the promise immediately,
   and give the consumed/transient instance a 300 ms scale-out crossfade at its current
   position (crossfades are the sanctioned reduced-motion vocabulary, VISION.md:272-273).
   The ember still kindles from data — the user still sees the result land, honestly.

---

## 11. Performance budget

| Metric | Budget | This design |
|---|---|---|
| Draw calls | 1 (PLAN §7.2:578) | 1 InstancedMesh; brief's ≤2 met with headroom |
| Triangles | — | 256 × 40 = 10.2k worst case (§2.4) |
| JS per demanded frame | ≤4 ms total scene (PLAN §7.1:577) | ~100 slots × (damp3 + sin + matrix compose) ≈ 0.05–0.1 ms; flights add 4 curve evals max |
| Allocation in `useFrame` | zero | LCG randomness (§5.2), module scratch only, no strings, no closures |
| Idle (swarm present) | rAF ≤5 fps (PLAN §7.10:590) | heartbeat `setInterval(invalidate, 200)`, no self-demand outside window (§6) |
| Idle (no captures) | rAF = 0 | heartbeat cleared at count 0; nothing demands |
| Tab hidden | no work | `visibilitychange` clears the interval (PLAN.md:511) |
| GPU program count | +1 | one plain MeshBasicMaterial program (no onBeforeCompile, no treaty exposure) |

Disposal on unmount: `mesh.dispose()`, `material.dispose()`, clear the heartbeat, remove
listeners, resolve any in-flight promises (U-16 must never hang on a world unmount), null
the module mirrors.

---

## 12. TypeScript signatures (the complete public + internal surface)

```ts
"use client";
// tree/Fireflies.tsx — U-14

import type { JSX } from "react";
import * as THREE from "three";
import type { FireflyBus, FlightRequest } from "../data/diffing";   // FROZEN — never redeclare
import type { BoughLayout, TreeLayoutResult } from "../data/treeLayout";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

// ── Public (PLAN §6 U-14:502-509) ──
export function Fireflies(): JSX.Element;
export const fireflyBus: FireflyBus;      // implements diffing.ts:161-163 exactly
export default Fireflies;
// NOTE: `FlightRequest` is IMPORTED from data/diffing.ts:154-159 (PLAN's sketch inlined it;
// the frozen contract owns the declaration — re-exporting is optional, redeclaring is not).

// ── Internal (module-private; names are binding for reviewability) ──
type FireflyMode = 0 | 1 | 2;                       // drifting | flying | dissolving
interface FlightEntry { slot: number; captureId: string | null; bough: BoughLayout | null;
  tLand: number; target: THREE.Vector3; departFrom: THREE.Vector3; t: number;
  resolve: (() => void) | null; }
interface FireflyRuntime { /* §3 verbatim */ }
interface FireflySystem { mesh: THREE.InstancedMesh; material: THREE.MeshBasicMaterial;
  runtime: FireflyRuntime; }

function buildSystem(): FireflySystem;                                   // §2, §3
function reconcile(sys: FireflySystem, captures: CaptureWithLinks[]): void;  // §4
function beginFlight(sys: FireflySystem, layout: TreeLayoutResult,
  req: FlightRequest, resolve: () => void): void;                        // §7.2–§7.4
function stepFrame(sys: FireflySystem, delta: number,
  invalidate: () => void, activeUntil: number): void;                    // §5–§7.5, §6 tiers
function findLanternT(bough: BoughLayout, target: THREE.Vector3): number; // §7.4 scan
function syncHeartbeat(sys: FireflySystem, invalidate: () => void): void; // §6 idempotent
```

---

## 13. Ordered build checklist (each step = one focused commit)

1. **Scaffold + static swarm** — `buildSystem` (mesh, material, eager instanceColor,
   scale-0 init), `reconcile` additions only, deterministic spawn positions from
   `useWorldData().captures.filter(isFirefly)`. Verify: seeded captures appear as glowing
   cyan motes near the trunk; `gl.info.render.calls` +1.
2. **Wander drift + active window** — LCG re-targeting, damp3, flicker, wake listeners,
   frame-loop demand tiers 1–2. Verify: motes drift while the pointer moves, freeze 4 s
   after hands-off.
3. **Heartbeat + visibility gating** — `syncHeartbeat`, `visibilitychange`, count-0
   teardown. Verify with DevTools performance panel: hands-off rAF ≈ 5 Hz with captures,
   0 Hz with none, 0 Hz tab-hidden. This is the §7.10 idle audit line — do not skip.
4. **Realtime spring in/out + cork-pop bridge** — removals/leaves in reconcile,
   `capture-created` listener (chime + pop). Verify: create a capture on `/captures` in a
   second tab → mote blinks in; delete it → spring-out.
5. **`fireflyBus` + scripted flight + landing/cool** — module mirrors, `beginFlight`,
   pool, `findLanternT`, the §7.5 timeline, two-note + resolve-at-landing, dissolve/cool,
   `consumed` race rules. Verify from the console:
   `fireflyBus.fly({ toAreaId, toProjectId, kind: "task" })` flies a mote along the limb to
   the lantern and it cools out; the promise resolves at touchdown; calling with a live
   `captureId` consumes that mote and reconcile does not double-retire it.
6. **Reduced-motion seam** — the three §10 branches. Verify with the media query forced.
7. **Perf pass + final commit** — 15+ captures: still 1 draw call, cloud reads as a cloud;
   `useFrame` allocation check (no GC churn in the performance profile while drifting).

---

## 14. Acceptance (PLAN §6 U-14:512 + this memo)

- [ ] Creating a capture in 2D pops a new firefly (spring-in + `chime:cork-pop` emitted).
- [ ] 15 captures = visible cloud; `gl.info.render.calls` shows exactly +1 for the layer.
- [ ] `fireflyBus.fly()` moves an instance along `boughPoint` of the correct bough to the
      correct lantern (curve-following — this memo supersedes the sketch's "straight-line
      placeholder OK"), resolves at landing, emits `chime:two-note`, dissolves cyan→gold.
- [ ] Converting a capture mid-flight never double-frees or ghosts an instance (§7.7 cases).
- [ ] Hands off 10 s with captures present: rAF ≤5 fps. Zero captures: rAF 0, no interval.
      Tab hidden: no interval. (PLAN §7.10:590.)
- [ ] Zero React state per frame; zero allocation in `useFrame`; rows never mount/unmount.
- [ ] `prefers-reduced-motion`: static swarm, no heartbeat, `fly()` = chime + instant
      resolve + 300 ms crossfade.
- [ ] TypeScript strict; only file created is `tree/Fireflies.tsx`; no frozen file touched.
