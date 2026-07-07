# U-09 · ember-system — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/tree/Embers.tsx` — the crown jewel.
> Design memo only; no code exists for this unit yet. Everything below was verified on 2026-07-06
> against the COMMITTED wave-1 contracts (file:line cited). Where PLAN §6 U-09's sketch and this
> memo differ, this memo wins — it resolves the sketch's ambiguities against the frozen treaty.
>
> File you will create (nothing else): `apps/web/components/world/tree/Embers.tsx`.
>
> Frozen inputs you consume, never modify:
> - `materials/hologram.ts` — `makeHologramMaterial`, `chainOnBeforeCompile`, and the
>   shader-chunk treaty (doc comment, hologram.ts:14-61). Read it before writing a line.
> - `materials/sharedGeometries.ts` — `EMBER_GEOMETRY` (sphere 0.03, 80 tris), `TAPER_GEOMETRY`
>   (open cone, base pre-translated to the instance origin, grows +Y). Do NOT construct geometry.
> - `materials/tokens.ts` — `STUDIOLO` palette.
> - `data/mappings.ts` — `EmberState`, `EMBER_VISUALS`, `classifyTask`, `hasFilament`,
>   `filamentScaleY`. Every color/Hz/ms/offset in this memo is a READ from `EMBER_VISUALS`;
>   never re-literal them in TS logic (GLSL interpolates them once, §2.5).
> - `data/useWorldData.ts` — `useWorldData().emberSlots` (declarative truth) + `.tasks`.
> - `data/treeLayout.ts` — `EmberSlot`, `hash01` (deterministic per-task phase).
> - `data/diffing.ts` — `worldEvents.on("task-completed", …)` (payload `TaskTransition`,
>   carries the PRE-completion slot), `worldEvents.emit("chime", { kind: "glass-bell" })`.
>
> Hard rules inherited: exactly **2 draw calls** for the whole task layer; **zero per-frame React
> state**; **zero allocation in `useFrame`**; rows NEVER mount/unmount; pulse is GPU-side and
> pauses when the world sleeps (intended, PLAN §6 U-09 perf constraints + §7.5).

---

## 0. Orientation — what this unit actually is

One React component that owns two imperative `THREE.InstancedMesh` objects and a per-frame
runtime, mounted as `<primitive>`s:

1. **The ember mesh** — `new THREE.InstancedMesh(EMBER_GEOMETRY, emberMaterial, 1024)`. Every
   task ember in the world lives here. Per-instance hue via `instanceColor` (`setColorAt`,
   HDR-scaled during flare/pop); per-instance state+phase via a custom `aState`
   `InstancedBufferAttribute` read by the ember shader chunk; per-instance transform via
   `instanceMatrix` mutated in `useFrame`.
2. **The taper mesh** — `new THREE.InstancedMesh(TAPER_GEOMETRY, taperMaterial, 128)`. One
   filament flame above each P∞/P1 ember. No custom attribute, no instanceColor — plain
   hologram material, wholesale-repacked (§7).

drei `<Instances>` is REJECTED for embers (PLAN §6 U-09: per-row React children violate the
never-mount-per-row rule at this scale). All mutable state lives in refs / preallocated typed
arrays. `useWorldData()` is read in RENDER; reconciliation happens in a `useEffect` keyed on
data identity; animation happens in ONE `useFrame`.

Component skeleton (structure, not code):

```
export function Embers(): JSX.Element
  ├─ useWorldData()                    → emberSlots, tasks
  ├─ useMemo(mount-once)               → material, meshes, aState, runtime (refs)
  ├─ useEffect([emberSlots, tasks])    → reconcile (§4) + taper repack flag (§7)
  ├─ useEffect(mount)                  → worldEvents.on("task-completed") (§6), dispose on unmount
  ├─ useFrame((state, delta))          → clock + settle + enter/leave + ascents + tapers (§5)
  └─ return <><primitive object={emberMesh}/><primitive object={taperMesh}/></>
```

---

## 1. The material — treaty compliance, step by step

### 1.1 Construction (once, at mount)

```ts
const emberMaterial = makeHologramMaterial({
  tint: "#ffffff",                      // WHITE — the state hue lives in instanceColor (§1.3)
  opacity: 0.55,                        // embers are denser than architecture holograms
  rimColor: STUDIOLO.candleflame,
  rimIntensity: 0.9,                    // < 1: the rim must NOT bloom — the state glow does
});
chainOnBeforeCompile(emberMaterial, injectEmberChunk, "ember@1");
```

- `makeHologramMaterial` gives a FRESH `MeshPhysicalMaterial` instance (hologram.ts:127). Embers
  never share a material instance with any other family (treaty, hologram.ts:24-25).
- `chainOnBeforeCompile` (hologram.ts:176-188) runs the fresnel injector FIRST, then
  `injectEmberChunk` — chain order is the injection order. The combined program cache key
  becomes `"studiolo:sf@1|ember@1"` automatically; do not touch `customProgramCacheKey`
  yourself.
- Opacity/rim numbers above are starting values (leva-tunable in the U-03 dev harness); the
  invariant that is NOT tunable: rim intensity stays < 1 on this material so bloom belongs
  exclusively to the state grammar.

### 1.2 The uniform

```ts
const emberUniforms = { uEmberTime: { value: 0 } };   // module of the hook, created once
```

`injectEmberChunk` does `shader.uniforms.uEmberTime = emberUniforms.uEmberTime;` — the SAME
object the `useFrame` mutates, captured outside the compile closure (same pattern as
`rimUniforms`, hologram.ts:143-149). Also mirror it at
`emberMaterial.userData.emberUniforms = emberUniforms` for the dev harness. `uEmberTime` is
float seconds, advanced ONLY inside `useFrame` (i.e. only in demanded frames — treaty row
"Ember clock", hologram.ts:42).

**Precision wrap:** in `useFrame`, after `uEmberTime.value += delta`, wrap
`if (v > 600) v -= 600`. 600 s is a common multiple of both pulse periods (2 s @0.5 Hz,
5 s @0.2 Hz), so the wrap is phase-invisible; without it `sin()` of an ever-growing float
degrades on long sessions.

### 1.3 `instanceColor` — hue channel, allocated eagerly

- Call `emberMesh.setColorAt(i, WHITE)` for ALL 1024 slots **at construction, before first
  render**. This forces three to create the `instanceColor` buffer immediately, so
  `USE_INSTANCING_COLOR` is defined at the FIRST program compile — the fragment chunk
  references `vColor` (§2.4) and would fail to compile without it. Never let the mesh render
  once colorless and recompile later.
- Set `emberMesh.instanceColor.setUsage(THREE.DynamicDrawUsage)`.
- `new THREE.Color("#E8C46B")` converts sRGB→linear automatically under r185 color management;
  `setColorAt` therefore receives linear-light values — correct, no manual conversion.
- HDR trick (same one U-10 lanterns use, PLAN §6): `instanceColor` components may exceed 1.0.
  The completion flare (×3) and the spring-in pop ride this channel CPU-side; the shader's
  per-state glow is multiplied by `vColor`, so an HDR instanceColor scales the emitted
  radiance directly.

### 1.4 The `aState` attribute

```ts
// Attached to EMBER_GEOMETRY (U-09 is its sole consumer — sharedGeometries.ts:22).
// Idempotent guard for StrictMode / remount:
if (!EMBER_GEOMETRY.getAttribute("aState")) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 2), 2);
  a.setUsage(THREE.DynamicDrawUsage);
  EMBER_GEOMETRY.setAttribute("aState", a);
}
```

- itemSize 2: `x` = state id as float — **0=ambient 1=today 2=overdue 3=ascending** (frozen
  encoding, hologram.ts:39-40; matches the `EmberState` union order in mappings.ts:21).
- `y` = phase offset ∈ [0,2π), written ONCE per slot allocation as
  `hash01(taskId) * Math.PI * 2` (`hash01` from treeLayout.ts:42) — deterministic, so the same
  task pulses at the same phase across reloads. Never rewritten on state change.
- Attribute survives unmount (the geometry is a never-disposed singleton); freed slots are
  invisible via scale-0 matrices, so stale `aState` rows are harmless.

---

## 2. The GLSL `inject` fn — exact text

### 2.1 String mechanics (treaty rules, hologram.ts:56-60)

Every injection replaces `#include <x>` with `#include <x>\n<chunk>` so the anchor SURVIVES for
any future decorator. Declare ONLY the treaty names (`aState`, `vEmberState`, `uEmberTime`).
All locals live inside a `{}` block with the `em` prefix. Marker comments
`// <studiolo:ember:*>` wrap every chunk (greppable, guards double-injection).

`injectEmberChunk(shader)` performs exactly four replaces — two on `shader.vertexShader`
(U-03 never touches the vertex shader; U-09 owns it outright, hologram.ts:60), two on
`shader.fragmentShader` — plus the uniform assignment from §1.2.

### 2.2 Vertex, anchor `#include <common>` — declarations

```glsl
#include <common>
// <studiolo:ember:vdecl>
attribute vec2 aState;
varying vec2 vEmberState;
// </studiolo:ember:vdecl>
```

(Custom instanced attributes are never auto-declared by three — this manual declaration is
required and is exactly what the treaty's anchor map row 1 prescribes, hologram.ts:49-50.)

### 2.3 Vertex, anchor `#include <begin_vertex>` — varying copy only

```glsl
#include <begin_vertex>
// <studiolo:ember:vstate>
vEmberState = aState;
// </studiolo:ember:vstate>
```

**Decision — the overdue y-drop is CPU-side, NOT in the vertex shader.** The treaty sanctions
an optional `transformed.y` drop here (hologram.ts:51), but it is rejected for three reasons:
(a) `transformed` is in LOCAL space, pre-`instanceMatrix`, so the −0.12 would be multiplied by
the instance scale and shrink during spring-in; (b) a GPU drop snaps instantly on state change,
whereas baking `EMBER_VISUALS.overdue.yOffset` into the settle TARGET (§4.3) makes an ember
visibly *sag* through `damp3` when it becomes overdue — the grammar reads "physically dropped"
(PLAN §1.7) and a settle sells that; (c) fewer shader branches. The vertex chunk therefore
stays the two-line varying copy above.

### 2.4 Fragment, anchor `#include <common>` — declarations

```glsl
#include <common>
// <studiolo:ember:fdecl>
varying vec2 vEmberState;
uniform float uEmberTime;
// </studiolo:ember:fdecl>
```

### 2.5 Fragment, anchor `#include <emissivemap_fragment>` — the pulse block

**Where it lands (read carefully):** after U-03's injector ran, the fragment source contains
`#include <emissivemap_fragment>` immediately followed by the `<studiolo:fresnel:rim>` block
(hologram.ts:110-118 — U-03 kept the anchor per treaty rule 1). Your `String.replace` on the
anchor therefore inserts the ember block textually BETWEEN the anchor and the rim block. That
is correct and final: "AFTER" in the treaty table (hologram.ts:54) refers to *chain/injection
order*, which is what guarantees your anchor still exists. Both blocks are purely additive to
`totalEmissiveRadiance` (the rim's extra `diffuseColor.a` boost reads nothing of yours), so
GLSL execution order between them is commutative. Do NOT try to anchor on
`</studiolo:fresnel:rim>` to force textual after-ness — injecting into another unit's chunk is
forbidden without an amendment (treaty rule 4).

The chunk — with every literal interpolated from `EMBER_VISUALS` at module scope so
mappings.ts stays the single source (use a helper `const f = (n: number) => n.toFixed(4)`;
GLSL needs the decimal point):

```glsl
#include <emissivemap_fragment>
// <studiolo:ember:pulse>
{
  float emState = vEmberState.x;
  float emGlow;
  if ( emState < 0.5 ) {
    // ambient: EMBER_VISUALS.ambient — emissive 0.9, subtle 0.2 Hz shimmer
    emGlow = ${f(AMB.emissive)} + 0.08 * sin( 6.2831853 * ${f(AMB.pulseHz)} * uEmberTime + vEmberState.y );
  } else if ( emState < 1.5 ) {
    // today: EMBER_VISUALS.today — gold pulse emissiveMin→Max @ pulseHz
    float emWave = 0.5 + 0.5 * sin( 6.2831853 * ${f(TODAY.pulseHz)} * uEmberTime + vEmberState.y );
    emGlow = mix( ${f(TODAY.emissiveMin)}, ${f(TODAY.emissiveMax)}, emWave );
  } else if ( emState < 2.5 ) {
    // overdue: EMBER_VISUALS.overdue — steady alarm, pulseHz 0, no shimmer
    emGlow = ${f(OVER.emissive)};
  } else {
    // ascending: shader floor = today's emissiveMax; the ×3 flare rides instanceColor HDR (§6)
    emGlow = ${f(TODAY.emissiveMax)};
  }
  totalEmissiveRadiance += vColor * emGlow;
}
// </studiolo:ember:pulse>
```

Notes:
- State comparisons are the frozen `< 0.5` step ladder (hologram.ts:39).
- `vColor` is three's own instancing-color varying: with `USE_INSTANCING_COLOR` defined (§1.3),
  r185's `color_pars_fragment` declares `varying vec3 vColor` and `color_vertex` bakes
  `instanceColor` into it. That is why instanceColor eagerly exists before first compile.
  Verify once at build time (render 1 ember, no shader error); if a three patch ever drops the
  fragment-side define, the fallback is declaring the treaty-external varying — which would
  need an amendment, so verify first, it is present in r185.
- The per-instance HUE is entirely `vColor` (instanceColor); the shader owns only the scalar
  glow. `mix(emissiveMin, emissiveMax, …)` with `uEmberTime` + per-instance `vEmberState.y`
  phase is exactly the prompt's contract for the gold pulse.
- Values > 1.0 bloom because the material is `toneMapped:false` and Bloom's
  `luminanceThreshold` is 1 — ambient (≤0.98) stays under the threshold, today/overdue/
  ascending cross it. That is the whole state→light grammar in one multiply.

---

## 3. Mesh setup & buffers (imperative, once)

In a mount-once `useMemo` (or `useRef` lazy init):

1. Material + chain (§1.1), uniform object (§1.2).
2. `emberMesh = new THREE.InstancedMesh(EMBER_GEOMETRY, emberMaterial, 1024)`.
   - `emberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)`.
   - Initialize ALL 1024 matrices to scale-0 (`dummy.scale.setScalar(0)`) so unused slots are
     invisible degenerate triangles — never rely on `count` for embers (slots are sparse under
     the freelist).
   - `setColorAt` all slots white (§1.3), `instanceColor.setUsage(DynamicDrawUsage)`.
   - `aState` attribute attach (§1.4).
   - `emberMesh.frustumCulled = false` — the geometry's bounding sphere is r=0.03 at origin;
     instances span the whole tree; without this the mesh vanishes when the origin leaves the
     frustum.
   - Optional but recommended: `emberMesh.name = "embers"` for `gl.info` debugging.
3. `taperMaterial = makeHologramMaterial({ tint: STUDIOLO.candleflame, opacity: 0.5, emissiveIntensity: 1.4 })`
   — **no chain call**. Tapers don't pulse per-instance; they reuse the base fresnel program
   `"studiolo:sf@1"` (zero extra shader compile). Constant body emissive 1.4 > 1 blooms gently.
4. `taperMesh = new THREE.InstancedMesh(TAPER_GEOMETRY, taperMaterial, 128)` —
   `DynamicDrawUsage`, `frustumCulled = false`, `taperMesh.count = 0` (tapers are densely
   repacked, so `count` IS the draw count — §7).
5. Unmount cleanup: `emberMesh.dispose(); taperMesh.dispose();` (releases instance buffers),
   `emberMaterial.dispose(); taperMaterial.dispose();` (per-mount instances). **Never** dispose
   `EMBER_GEOMETRY` / `TAPER_GEOMETRY` (shared singletons, sharedGeometries.ts:5-9), and leave
   the `aState` attribute attached (idempotent guard re-uses it).

Render: `return <><primitive object={emberMesh}/><primitive object={taperMesh}/></>` — the only
JSX this component ever produces. Nothing else mounts or unmounts, ever.

---

## 4. The freelist/index runtime + reconciliation

### 4.1 Runtime shape (module-internal, lives in a ref — NEVER React state)

Matches PLAN §6's `EmberRuntime` signature, extended with the SoA arrays the frame loop needs
(all preallocated at cap; “SoA” so `useFrame` touches flat memory, no per-slot objects):

```ts
interface EmberRuntime {
  // — PLAN §6 signature —
  index: Map<string, number>;            // taskId → instance slot (resident embers only)
  free: number[];                        // freelist stack, seeded [1023..0]
  ascending: AscentEntry[];              // live ascents (swap-remove list, see §6)
  // — extensions —
  leavingByTask: Map<string, number>;    // taskId → slot, spring-out in progress (§4.4 race)
  alive: Uint8Array;                     // 1024 — slot occupied (resident|leaving|ascending)
  pos: Float32Array;                     // 1024*3 — CURRENT position (authoritative)
  target: Float32Array;                  // 1024*3 — settle target (basePosition + yOffset)
  scale: Float32Array;                   // 1024 — current uniform scale
  scaleTarget: Float32Array;             // 1024 — 1 resident, 0 leaving
  pop: Float32Array;                     // 1024 — HDR color multiplier, decays → 1
  baseColor: Float32Array;               // 1024*3 — linear RGB of current state hue
  stateId: Uint8Array;                   // 1024 — mirrors aState.x (CPU copy for cheap diff)
  highWater: number;                     // max slot ever allocated + 1 (frame-loop bound)
  motion: boolean;                       // anything animating? (early-return + invalidate flag)
  taperDirty: boolean;                   // filament repack requested (§7)
}
```

Preallocated scratch (module level): one `THREE.Object3D` dummy, two `THREE.Vector3`, one
`THREE.Color`. These are the ONLY vector/color objects the frame loop ever touches.

### 4.2 State → per-slot writes (one helper, used by reconcile AND ascent)

`applyState(slot, state, taskId?)`:
- `stateId[slot] = STATE_ID[state]` (0/1/2/3) and write `aState.array[slot*2] = id`;
  `aState.needsUpdate = true` (flag once per reconcile, not per slot — batch).
- `baseColor` ← `EMBER_VISUALS[state].color` (`ambient` `#F2E9D8` / `today` `#E8C46B` /
  `overdue` `#FF6B4A`; `ascending` keeps the FROM-state color — the flare recolors via HDR,
  not hue). Then `setColorAt(slot, scratchColor.fromArray(baseColor,…).multiplyScalar(pop[slot]))`,
  `instanceColor.needsUpdate = true` (batched).
- `target[slot*3+1]` gets `basePosition[1] + yOffset(state)` where `yOffset` is
  `EMBER_VISUALS.overdue.yOffset` (−0.12) for overdue, else the state's `yOffset` (0). This is
  the CPU-side drop decided in §2.3.

### 4.3 Reconcile — `useEffect([emberSlots, tasks])`

`emberSlots: EmberSlot[]` (useWorldData.ts:22) is the declarative truth; completed tasks never
appear in it (mappings.ts:73). Algorithm, O(n) with one Map build:

1. Build `nextByTask: Map<taskId, EmberSlot>` from the array.
2. **Removals** — for each `taskId` in `index` with no `nextByTask` entry: move it to
   `leavingByTask`, delete from `index`, set `scaleTarget[slot] = 0`. Do NOT free the slot yet
   (the frame loop frees it when scale ≈ 0, §5.4). Slots owned by an ascent are not in `index`
   (the ascent claims them out of it, §6), so they're naturally skipped.
3. **Updates** — for each slot in `nextByTask` whose `taskId` is already in `index`: write
   `target` from `basePosition` (+ yOffset); if `state` differs from `stateId[slot]`, call
   `applyState`. Phase (`aState.y`) is never touched.
4. **Additions** — `taskId` in neither `index` nor `leavingByTask`:
   `slot = free.pop()`; if the freelist is empty, `console.warn` once and skip (cap 1024 is
   ~3× the perf-protocol load; never throw). Then: `index.set(taskId, slot)`,
   `alive[slot] = 1`, `highWater = max(highWater, slot+1)`; `pos` ← `basePosition` (spawn in
   place — no fly-in; the SCALE animates, not the position); `scale[slot] = 0`,
   `scaleTarget[slot] = 1`; `pop[slot] = 2.2` (the emissive pop — decays to 1 in the frame
   loop); `aState.array[slot*2+1] = hash01(taskId) * 2π` (phase, once); `applyState(slot, state)`.
   - **Re-adds during leave** (task deleted then recreated, or reclassified within one leave
     window): if `taskId` is in `leavingByTask`, reclaim that slot back into `index`, set
     `scaleTarget = 1`, update target/state — no new slot.
5. Set the batched `needsUpdate` flags actually touched, `runtime.motion = true`,
   `runtime.taperDirty = true`, and call `invalidate()` (from `useThree(s => s.invalidate)`)
   so the settle/enter/leave animation starts on the next demanded frame.

### 4.4 The completion race (this is load-bearing — read twice)

`WorldDataProvider`'s differ emits `task-completed` from a **parent** `useEffect`
(WorldDataProvider.tsx:110-124), and React runs child effects before parent effects in the
same commit. So when a completion lands: **your reconcile runs FIRST** (sees the task gone
from `emberSlots`, starts a leave → `leavingByTask`), and the `task-completed` event fires
moments later in the same commit. The ascent handler must therefore reclaim from EITHER map:

- `index.has(taskId)` → claim that slot (event arrived before any refetch reconcile — e.g.
  optimistic cache write ordering). Delete from `index`.
- else `leavingByTask.has(taskId)` → claim that slot, cancel the leave (`scaleTarget = 1`,
  scale is still ≈1 since the leave started this same commit). Delete from `leavingByTask`.
  **This is the normal path.**
- else (no instance — task created+completed between snapshots normally never emits, the
  differ drops slotless completions at diffing.ts:66-67; but a leave might have fully finished
  if events were delayed) → spawn a fresh slot from the freelist at
  `transition.slot.basePosition` with the `transition.from` state's color, then immediately
  begin the ascent. The sacred animation never silently no-ops.

Claimed slots belong to the ascent runtime alone until it frees them (§6).

---

## 5. The frame loop — ONE `useFrame`, allocation-free

```
useFrame((_, delta) => {
  1. uEmberTime.value += min(delta, 0.1); wrap at 600 (§1.2).   // ALWAYS — pulse rides any demanded frame
  2. if (!runtime.motion && !runtime.taperDirty) return;        // the early-return flag — sleeping embers cost 1 add
  3. settle + enter/leave sweep (§5.2–5.4) over slots [0, highWater)
  4. ascent sweep (§6)
  5. taper repack/follow (§7)
  6. flush dirty flags — instanceMatrix/instanceColor/aState `.needsUpdate = true` at most ONCE each
  7. if (stillMoving) invalidate(); else runtime.motion = false;
})
```

### 5.1 Invalidation policy (instantiates PLAN §7.5 exactly)

- **What demands frames:** the reconcile effect (one `invalidate()` per data change), and step
  7 above while any settle/enter/leave/ascent is unfinished. Enter/leave are manual damps, so
  U-09 self-invalidates; there are no react-spring springs in this unit (§5.3 decision).
- **What does NOT demand frames: the pulse.** `uEmberTime` advances only when a frame was
  demanded by something (camera glide, hover, data change, ascent…). When the world sleeps,
  the clock freezes and pulsing pauses mid-phase — **acceptable and intended** (PLAN §6 U-09
  perf constraints, verbatim). Do not add a pulse heartbeat.
- Cap `delta` at 0.1 s wherever it feeds an animation (background-tab return would otherwise
  teleport ascents).

### 5.2 Settle — resident embers toward target

For each slot with `alive[slot]` and not ascending: `scratchA.fromArray(pos, slot*3)`;
`easing.damp3(scratchA, scratchB.fromArray(target, slot*3), 0.25, delta)` (`maath/easing`,
smoothTime 0.25 s); `scratchA.toArray(pos, slot*3)`. Track `moved = distSq > 1e-8` into the
`stillMoving` accumulator. This is what makes an ember glide to a new Fibonacci-shell slot
when a sibling is added, and sag −0.12 the minute it turns overdue.

### 5.3 Enter/leave — manual damp, NOT react-spring (decision)

PLAN §6's sketch mentions `useSpring`; the prompt sanctions "`@react-spring/three` **or**
manual damp". **Manual damp wins:** N concurrent enter/leaves would need N spring controllers
(allocation, bookkeeping) against an instanced mesh they can't drive directly anyway. Instead:
`scale[slot] = damp(scale[slot], scaleTarget[slot], 12, delta)` (`maath` scalar `easing.damp`
on the SoA array — zero objects), and `pop[slot] = damp(pop[slot], 1, 6, delta)` with the
color rewritten via `setColorAt(slot, base × pop)` only while `pop > 1.01`. The enter reads:
scale 0→1 with an emissive pop (color ×2.2 decaying to ×1) — the "spring-in + emissive pop"
the plan demands, without a single allocation. Self-invalidation (§5.1) replaces springs'
auto-invalidate.

### 5.4 Leave completion

When a leaving slot's `scale < 0.01`: write the final scale-0 matrix, `alive[slot] = 0`,
`free.push(slot)`, delete from `leavingByTask` (find by slot — keep the reverse entry in the
map value, or sweep `leavingByTask` since it's tiny).

### 5.5 Matrix writes

Only for slots that moved/scaled this frame: `dummy.position.fromArray(pos, slot*3)`;
`dummy.scale.setScalar(scale[slot])` (quaternion stays identity — spheres);
`dummy.updateMatrix()`; `emberMesh.setMatrixAt(slot, dummy.matrix)`; set a local
`matrixDirty = true`. Flush `instanceMatrix.needsUpdate` ONCE at step 6 — never per slot,
never on frames where nothing moved.

---

## 6. The ascent runtime — the sacred animation

All numbers from `EMBER_VISUALS.ascending` (mappings.ts:61): `flareMs: 300, flareMul: 3,
riseY: 6, riseMs: 2200, ease: "easeIn"`.

### 6.1 Entry pool

`AscentEntry = { slot: number; t: number; from: THREE.Vector3 }` — matches the PLAN §6
signature (`t` in ms). Preallocate a pool of 16 entries (each owning its `Vector3`) reused
round-robin; `ascending` is a fixed array + live count with swap-remove. 16 concurrent ascents
is far beyond the "3 rapid-fire completions" acceptance; if the pool is exhausted, complete the
oldest instantly (free + bell) and reuse — never allocate.

### 6.2 Trigger — `worldEvents.on("task-completed", …)` (subscribe in a mount effect, keep the
unsubscribe for cleanup; StrictMode-safe because `on` returns a disposer, diffing.ts:102-119)

On `TaskTransition { taskId, from, to, slot }`: claim the instance per the §4.4 ladder; then
`entry.slot = s; entry.t = 0; entry.from.fromArray(pos, s*3)` (CURRENT animated position, not
`slot.basePosition` — the ember may have been mid-settle); `applyState(s, "ascending")` writes
`aState.x = 3` (shader glow floor jumps to emissiveMax); `runtime.motion = true;
runtime.taperDirty = true` (its filament vanishes, §7); `invalidate()`.

### 6.3 Keyframe table (per entry, `t += delta*1000` each frame, capped delta)

| Phase | t (ms) | position.y | scale | instanceColor HDR mult | notes |
|---|---|---|---|---|---|
| **Flare** | 0 → 300 | `from.y` (held) | 1 (held) | `1 → 3` linear (`flareMul`) | color = from-state hue × mult |
| **Rise** | 300 → 2500 | `from.y + 6·easeInCubic(u)`, `u=(t−300)/2200` | 1 until t=1900, then `1 → 0` via `smoothstep` over the last 600 ms (the dissolve) | `3 → 1.2` linear over the rise | x/z held at `from.x/z` — the ascent is a plumb line |
| **Apex** | t ≥ 2500 | — | — | — | once: `worldEvents.emit("chime", { kind: "glass-bell" })`; write scale-0 matrix; `alive=0`; `free.push(slot)`; swap-remove entry |

- `easeInCubic(u) = u*u*u` — the codified reading of `ease: "easeIn"`. Slow lift-off, then the
  spark accelerates heavenward.
- Apex = flare end + rise end = 2500 ms, coincident with the dissolve completing — one bell,
  emitted exactly once per entry (guard with the swap-remove).
- The reconcile never fights this: the task is already absent from `emberSlots`, and the slot
  was claimed out of `index`/`leavingByTask`.
- Reduced-motion seam (U-19 lands later): route the trigger through one small
  `beginAscent(transition)` function so U-19 can branch it to a 400 ms crossfade + bell without
  touching the runtime. Just structure it that way; do not implement the branch.

---

## 7. Priority filaments — the second InstancedMesh

- **Membership:** `tasks.filter(hasFilament)` (mappings.ts:47-49 — P∞/P1, non-lesno) whose
  taskId is RESIDENT in `index` (no filament on leaving or ascending embers — the flame dies at
  the flare). Cap 128; warn+truncate beyond.
- **Wholesale repack, not a freelist:** filaments carry zero persistent per-instance GPU state
  (no aState, no instanceColor), so on `taperDirty` rebuild densely: for k = 0..n−1 write
  matrix k from the k-th member, then `taperMesh.count = n`. ≤128 matrix composes is trivial.
  `taperDirty` is set by reconcile (§4.3), ascent claim (§6.2), and leave start.
- **Follow:** filaments track their parent ember every motion frame (same `useFrame`, AFTER the
  ember sweep): `dummy.position.fromArray(pos, parentSlot*3)`; `dummy.position.y += 0.03`
  (ember radius — TAPER_GEOMETRY's base is pre-translated to its origin,
  sharedGeometries.ts:30-34, so the cone sits ON the ember and grows upward);
  `dummy.scale.set(s, s * filamentScaleY(task), s)` where `s = scale[parentSlot]` (filament
  springs in/out with its ember) and `filamentScaleY` is 2.8 (P∞) / 2.2 (P1) from
  mappings.ts:51-53. Compose, `setMatrixAt(k, …)`, flush `needsUpdate` once.
  Keep the repacked member list as two preallocated arrays (`taperParentSlot: Uint16Array(128)`,
  `taperScaleY: Float32Array(128)`) rebuilt only on repack — the per-frame follow reads flat
  arrays, allocation-free.
- Overdue sag, settle drift, everything positional is inherited automatically because the
  follow reads the ember's live `pos`.

---

## 8. Perf doctrine, instantiated (PLAN §7 → this unit)

1. **Exactly 2 draw calls:** ember mesh + taper mesh. Both `frustumCulled = false` (§3), taper
   via `count`, embers via scale-0. Verify with `gl.info.render.calls` delta (mount the world
   with and without `<Embers/>`; the delta must be ≤2).
2. **Triangles:** worst case 1024×80 + 128×12 ≈ 83.4k — within the §7 budget already reserved
   (sharedGeometries.ts:23-29).
3. **Zero allocation in `useFrame`:** all state in preallocated typed arrays; scratch = 1
   `Object3D` + 2 `Vector3` + 1 `Color`, module-level; iterate `for (let s = 0; s < highWater; s++) if (alive[s])`
   — no Map iterators, no closures, no array literals in the loop. The ascent pool never
   allocates post-mount.
4. **Sleep:** step 2's early return means a fully-settled ember field costs one float add per
   demanded frame and demands nothing itself. Idle world → zero rAF (the §7.10 audit).
5. **Pulse pause:** intended (§5.1). Do not "fix" it with a heartbeat.
6. **`needsUpdate` discipline:** each of `instanceMatrix` / `instanceColor` / `aState` flagged
   at most once per frame, and only on frames where its buffer was actually written.
7. **500 tasks @60 fps:** the motion-frame cost is ~500 damp3 + ≤500 matrix composes ≈ well
   under 1 ms; the sleeping cost is ~0. The synthetic-load check (build step 7) proves it.

---

## 9. TypeScript signatures (PLAN §6 U-09, honored + extensions)

```ts
// tree/Embers.tsx
export function Embers(): JSX.Element;      // consumes useWorldData().emberSlots/.tasks + worldEvents

interface EmberRuntime {                     // module-internal, in refs — NEVER React state
  index: Map<string, number>;                // taskId → instance slot   (PLAN §6)
  free: number[];                            // freelist of instance slots (PLAN §6)
  ascending: AscentEntry[];                  // (PLAN §6: {slot; t; from: Vector3})
  // extensions (§4.1): leavingByTask, alive, pos, target, scale, scaleTarget,
  // pop, baseColor, stateId, highWater, motion, taperDirty
}
interface AscentEntry { slot: number; t: number; from: THREE.Vector3 }

// listens: worldEvents.on("task-completed", (tr: TaskTransition) => beginAscent(tr))
// emits:  worldEvents.emit("chime", { kind: "glass-bell" })   — once, at ascent apex

// small sanctioned export (U-11 hover caption / U-07 picking, mirrors U-10's lanternPickMap):
export const emberPickMap: ReadonlyMap<number, string>;  // instanceId → taskId (maintained by reconcile)
```

Constants: `const MAX_EMBERS = 1024; const MAX_TAPERS = 128;` — module-level, mirrored nowhere
else.

---

## 10. Ordered build checklist (each its own focused commit, explicit pathspecs)

1. **Mesh + freelist skeleton** — material (§1.1), meshes, buffers, init (§3), `EmberRuntime`,
   mount as primitives. Static: hardcode a few test slots, verify 2 draw calls & no shader
   error (this also proves the `vColor` availability claim in §2.5 before anything depends on it).
2. **The ember chunk** — `injectEmberChunk` (§2, verbatim anchors/markers/names), `aState`
   wiring, `uEmberTime` advance + wrap. Verify: gold pulse on a state-1 test instance; pulse
   freezes when idle (expected); grep the compiled shader (`renderer.debug` or a temporary log)
   for both `<studiolo:fresnel:rim>` and `<studiolo:ember:pulse>` markers coexisting.
3. **Reconcile** — §4.2/§4.3 against live `emberSlots`; enter pop + leave shrink via §5.3;
   settle via §5.2. Verify Realtime add/remove from a second tab.
4. **Ascent runtime** — §6 trigger + keyframes + apex chime emit + slot free; §4.4 race ladder.
5. **Priority filaments** — §7 repack + follow.
6. **Invalidate audit** — step-7 flag logic; confirm zero rAF after quiescence (devtools
   performance panel, 4 s hands-off).
7. **Synthetic load** — dev-only story/flag seeding 500 fake slots (bypass the provider);
   record fps + `gl.info` numbers in the commit message.
8. **Polish + docs comment pass** — file header explaining the runtime, treaty pointers.

---

## 11. Acceptance (must all pass before hand-off)

- [ ] Flip a task to `lesno` from the 2D app in ANOTHER TAB → within one Realtime roundtrip the
      ember flares (×3, 300 ms) → ascends +6y over 2.2 s ease-in → dissolves → **glass bell**
      exactly once. Same result completing from the world's Today panel (U-12) once it exists.
- [ ] A due-today task pulses gold 1.6→2.6 @ 0.5 Hz; two due-today tasks pulse OUT of phase
      (deterministic per-task phase).
- [ ] An overdue task renders `#FF6B4A`, steady (no pulse), visibly hanging 0.12 BELOW its
      Fibonacci-shell slot — and it SAGS there smoothly when a today task crosses midnight
      (minute-tick reclassification).
- [ ] A P∞ task carries a taller filament than a P1 (2.8 vs 2.2 scale.y); the filament rides
      every ember movement and dies at the completion flare.
- [ ] Create/delete a task in 2D → spring-in with emissive pop / spring-out; NO React
      mount/unmount churn (React DevTools profiler shows `Embers` renders only on data change).
- [ ] `gl.info.render.calls` delta for the whole task layer ≤ 2; 500 synthetic tasks ≥ 60 fps
      on the target machine; 3 rapid-fire completions ≥ 55 fps.
- [ ] Hands off 4 s → zero rAF activity (pulse frozen mid-phase is CORRECT, not a bug).
- [ ] Shader source contains both units' markers; no GLSL redeclaration warnings; program count
      unchanged after mounting a second hologram consumer (cache key discipline held).

*— Fable. The grammar is sacred; the freelist is boring on purpose. Build the boring parts boring and the spark will carry itself.*
