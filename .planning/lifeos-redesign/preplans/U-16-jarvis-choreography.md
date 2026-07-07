# U-16 · jarvis-routing-choreography — Fable pre-plan seed

> For the Opus engineer. Design memo only — no code ships from this file.
> Scope: PLAN.md §6 U-16 (PLAN.md:522-534), §4 Phase-1 row (PLAN.md:168), §7 law
> (PLAN.md:573-592). Vision: VISION.md §6 Hero I/II (VISION.md:296-320), §3
> "Ring of the Familiar" (VISION.md:155-166), §9.4 (VISION.md:423-425).
>
> **This is the thesis animation.** When Kiwi routes one sentence to the right
> place, a cyan thread leaps from the ring, a firefly banks along the correct
> bough, and the real ember kindles where it lands. Everything below exists to
> make that read as *cause → effect*, exactly once, at 60 fps, and to make it
> impossible to double, hang, or hijack the user.

---

## 0. What U-16 is — and is not

U-16 is a **pure choreography layer** on top of an event that already works.

- **The trigger is frozen:** `worldEvents.on("jarvis-action", (ev: JarvisActionEvent) => …)`
  (diffing.ts:89-95). U-13 emits it **only on `ev.result.ok`** and calls
  `invalidateAfterJarvisAction` **before** emitting (useJarvisWorld.ts:229-234).
  The refetch that materializes the real ember/firefly is therefore ALREADY in
  flight when U-16 wakes up.
- **U-16 must NOT re-invalidate, re-fetch, or mutate any query cache.** Not
  once. The declarative slot arrays (U-09 embers, U-14 fireflies) are the
  source of truth for what exists; U-16 only draws light on top.
- **U-16 spawns no embers and no resident fireflies.** The firefly it sends is
  either a *consumed resident* or a *transient* — both already implemented and
  owned by U-14 (`fireflyBus.fly`, Fireflies.tsx:812-840). The ember that
  appears afterward belongs to the differ → U-09 spring-in.
- **U-16 owns:** the light-thread visual, the resolve-receipt-to-world-position
  pipeline, the per-tool choreography map, and the bounded ≤20° camera assist.

New files: `jarvis/useJarvisChoreography.ts` (resolver + choreographer
component) and `jarvis/LightThread.tsx` (the thread pool + bus). Plus three
one-line sanctioned micro-amendments (§8) to `JarvisRing.tsx`, `Fireflies.tsx`,
and `WorldScene.tsx` — all wave-4-sequential, zero collision.

---

## 1. The pipeline — trigger → resolve → choreograph

One routed action flows through exactly five stages:

```
(1) TRIGGER      worldEvents "jarvis-action" fires (U-13, success-only,
                 invalidation already dispatched — useJarvisWorld.ts:229-234)
(2) RESOLVE      resolveActionDestination(ev, layout) → ChoreographyTarget | null
                 └─ null + waitable → pending-wait window (§2.3, ≤2000 ms)
(3) ASSIST       bounded camera nudge (≤20° yaw, 450 ms, guards §6) — fire
                 and forget, BEFORE the thread so the flight happens on screen
(4) THREAD+FLY   lightThreadBus.draw(...) and fireflyBus.fly(...) start
                 TOGETHER on the same 1350 ms timeline (§5); thread head leads
                 the firefly by ~60 ms ("the light shows the way")
(5) HANDOFF      fly() resolves at landing (two-note chime is U-14's,
                 Fireflies.tsx:593-599). U-16 does NOTHING more. The ember
                 spring-in arrives via Realtime/refetch on its own clock (§7).
```

The choreographer is a logic component, `<JarvisChoreographer/>`, mounted once
in `WorldScene.tsx` (composition root invites one-line wave-4 insertions,
WorldScene.tsx:70-80). It renders `<LightThreads/>` as its only child, holds
zero React state at frame cadence, and subscribes to `jarvis-action` in a
mount-once `useEffect` with `layout`/`tasks`/`captures`/`emberSlots` mirrored
into refs (the useWorldKeys.ts:29-31 pattern — subscribe once, read refs).

Multiple actions per turn ("do these three things") each fire their own
`jarvis-action` → each gets its own resolve + thread + flight, subject to the
pool caps (2 concurrent threads §4.5, 4 flight entries U-14-side,
Fireflies.tsx:59). The camera assist fires **at most once per turn burst**
(§6.4) — three nudges in two seconds is seasickness, not guidance.

---

## 2. Destination resolution — receipt → world position

### 2.1 What a receipt actually contains (verified in the executor)

`JarvisActionEvent` = `{ toolUseId, name, result: { ok, id?, receipt?, kind?, error? } }`
(jarvis-stream-client.ts:66-76). Receipts that matter, verbatim from
`lib/jarvis/executor.ts`:

| Tool | Receipt fields U-16 reads | Source |
|---|---|---|
| `create_task` | `receipt.id`, `receipt.project_ids: string[]` (validated ids), `receipt.inbox: boolean` | executor.ts:165-176 |
| `create_capture` | `receipt.id`, `receipt.project_ids: string[]` | executor.ts:243-250 |
| `update_task` | `receipt.id`, `receipt.after` (raw task row incl. `status`) | executor.ts:477 |
| everything else | nothing spatial | — |

### 2.2 The resolver (pure, synchronous, receipt-only)

```
resolveActionDestination(ev, layout) — no waiting, no side effects:
  1. name ∈ NOOP_TOOLS (§3 table)                       → null
  2. pids = receiptProjectIds(ev.result.receipt)         // safe extractor:
     receipt is Record<string, unknown>; accept only a string[] under
     "project_ids"; anything else → []
  3. pids[0] → layout.byProject.get(pids[0])             // treeLayout.ts:99
     → { kind:"lantern", areaId, projectId, point: lantern.position }
  4. create_task with pids empty (inbox task → trunk cluster)
     → { kind:"trunk", point: null }   // point filled by the wait window §2.3
  5. create_capture with pids empty (stays a firefly)
     → { kind:"swarm", point: captureSpawnPosition(ev.result.id) }  // §8.2
  6. otherwise → null
```

Guard: step 3 must ALSO verify the lantern exists — a project can be archived
between action and event (layout excludes archived, treeLayout.ts:198-200). A
missing lantern falls through to the wait window (§2.3), then to abandonment.

### 2.3 The wait-for-slot window (the fallback ladder, PLAN §10 receipt-drift row)

When the receipt lacks linkage (drifted shape, missing `project_ids`, an
inbox task needing its trunk slot), the row itself is the fallback — the
invalidation U-13 already fired will refetch it within one roundtrip:

- Register a **pending routing** keyed by `ev.result.id` in a module-level
  `Map<string, PendingRouting>` (a ref, never React state).
- The choreographer has ONE `useEffect` keyed on `[tasks, captures, emberSlots]`
  identity (data cadence — Realtime/refetch, PLAN §7.5(c) already demands the
  frame). On each change, sweep pending entries:
  - task id found in `tasks` → `projects[0]?.id → layout.byProject` →
    lantern target; no project → find its `EmberSlot` in `emberSlots`
    (treeLayout.ts:89-94, `taskId` match) → `{ kind:"trunk", point: slot.basePosition }`.
  - capture id found in `captures` → `projects[0]?.id` → lantern (filed) or
    `captureSpawnPosition(id)` (unfiled).
- Each entry carries a `deadline = performance.now() + WAIT_FOR_ROW_MS` (2000).
  A single shared `setTimeout` sweep (armed only while the map is non-empty)
  abandons expired entries with a `console.warn("[studiolo] routing target
  never materialized", name, id)` — the routing degrades to *nothing visible*,
  never a thread to nowhere (the diffing.ts:42-45 honesty rule: a light that
  lies is worse than no light).
- **No polling, no per-frame checks.** The sweep runs at data cadence + one
  timeout. This is the "fly after refetch" degradation PLAN §10 mandates.

---

## 3. The per-tool choreography table (authoritative)

Tool names enumerated from the REAL tool→key map, invalidate-after-action.ts:53-96.
Note U-13 emits `jarvis-action` for **every** `ok:true` action — including
`find_*` and `ask_clarification` (their executors return `ok:true`,
executor.ts:323-332, 595, 618) — so the resolver MUST no-op them explicitly.

| Tool name | Thread | Firefly flight | Camera assist | Ember/other handoff |
|---|---|---|---|---|
| `create_task` (with project) | ring → along bough → lantern | `fly({ toAreaId, toProjectId, kind:"task" })` — transient | yes (once/turn) | ember springs in via differ/U-09; U-16 does nothing |
| `create_task` (inbox, no project) | ring → trunk slot (`EmberSlot.basePosition`, via wait window) | none — `fireflyBus` can't target the trunk (`FlightRequest` requires `toAreaId`, diffing.ts:154-159) | no | ember springs in at that slot |
| `create_capture` (filed to project) | ring → along bough → lantern | `fly({ toAreaId, toProjectId, kind:"note" })` — transient (the row is never a resident firefly, `isFirefly` false, Fireflies.tsx:258-260) | yes (once/turn) | nothing further |
| `create_capture` (unfiled) | ring → `captureSpawnPosition(id)` in the swarm | none — the NEW RESIDENT firefly (spawned by U-14 reconcile) IS the payoff; cork-pop + pop belong to U-14 (Fireflies.tsx:905-915) | no | thread endpoint = exact spawn point, so the pop reads as the thread's delivery |
| `update_task`, `receipt.after.status === "lesno"` | **none** — completion is U-09's sacred ascent (the differ fires `task-completed`; PLAN §1.7) | none | optional glance: same bounded assist toward the ember's slot IF resolvable via `emberSlots` — ship it, lowest priority | never duplicate the flare/bell |
| `update_task` (any other change) | micro-thread "attention flick": ring → the task's `EmberSlot.basePosition` (600 ms total, §4.6), only if the slot exists | none | no | nothing |
| `delete_task`, `delete_capture` | none — deletion is the reconcile spring-out, not a routing | none | no | — |
| `create_event`, `update_event`, `delete_event` | none in MVP — the Meridian Ring is Phase 2 (PLAN §4 row 2); leave a `// PHASE-2:` comment hook | none | no | ribbon receipt is the only feedback |
| `remember_fact`, `forget_fact`, `create_person`, `link_people` | none — no spatial home in the Tree | none | no | — |
| `find_tasks`, `find_captures`, `find_events`, `find_people`, `ask_clarification` | **NOOP_TOOLS** — resolver returns null before touching the receipt | none | no | — |

---

## 4. LightThread — geometry, material, animation

### 4.1 Path construction (once per routing — routing cadence, not frame cadence)

The thread and the firefly must trace the **same path** so the light reads as
one gesture. Both derive from `boughPoint(b, t)` (treeLayout.ts:136-150), the
frozen quadratic Bézier the limb mesh itself is built from.

For a lantern target on bough `b` with landing parameter `tLand`:

```
control points (in order, world space):
  P0 = ringOrigin                          (§8.1)
  P1 = b.start lifted +FLIGHT_LIFT (0.08 — mirror Fireflies.tsx:97,
       skim above the limb, never intersect it)
  P2 = boughPoint(b, 0.33·tLand) + lift
  P3 = boughPoint(b, 0.66·tLand) + lift
  P4 = target.point                        (lantern position — exact)
curve = new THREE.CatmullRomCurve3([P0..P4], false, "centripetal")
```

`centripetal` is mandatory — it cannot cusp or self-intersect on uneven
spacing (ring → bough root is a long hop; the limb samples are short).

`tLand` recovery: nearest-point scan of `boughPoint` against the lantern
position — 33 coarse samples then 9 refinement samples, identical math to
U-14's private `findLanternT` (Fireflies.tsx:421-451). Duplicate it as a
private `nearestBoughT(b, p)` in LightThread.tsx (≈20 lines; U-14's is
module-private and stays that way — do NOT export it, the duplication is
cheaper than widening a frozen file's surface).

Trunk/swarm targets (no bough): 3-point curve `[ringOrigin, mid, target]`
where `mid = lerp(ringOrigin, target, 0.5) + [0, 0.25, 0]` — a shallow arc,
not a laser.

Geometry: `new THREE.TubeGeometry(curve, TUBE_SEGMENTS=64, RADIUS=0.006,
RADIAL_SEGMENTS=5, false)` → 64·5·6 = **1,920 indices**, trivially cheap.
Built ONCE per routing, disposed at thread end (PLAN §7.9 explicit-dispose
rule). Never rebuilt per frame — animation is drawRange only (PLAN §6 U-16
perf constraint, PLAN.md:532).

### 4.2 Material (module singleton, shared by the pool)

```
MeshBasicMaterial {
  color: CYAN × 2.6  (STUDIOLO.jarvisCyan, tokens.ts:19 — HDR > 1 trips
                      Bloom's luminanceThreshold 1, the world's only glow engine)
  toneMapped: false
  transparent: true, opacity: 0.9
  blending: AdditiveBlending, depthWrite: false   (mirror Fireflies.tsx:182-188)
}
```

One material for both pool meshes. Opacity is animated on the SHARED material
only during the final fade (§4.4) — with ≤2 threads and a 150 ms fade the
shared-fade approximation is invisible; if both threads ever fade
simultaneously they fade together, which reads fine. (Alternative — one
material per pool entry — costs one extra program-cache entry for zero visible
gain; rejected.)

### 4.3 Draw / dissolve — the drawRange comet

Indexed TubeGeometry: indices per tubular segment = `RADIAL_SEGMENTS·6 = 30`.
Two normalized params drive it, advanced in the LightThreads `useFrame`:

- **Head `H(t)`**: 0→1 over `[0, DRAW_MS]` where `DRAW_MS = 1350 − LEAD_MS`
  (LEAD_MS = 60). Eased with the SAME speed-pulse the firefly uses —
  `s(u) = u − (A/2π)·sin(2πu)`, A = 0.5 (Fireflies.tsx:96,621) — so head and
  firefly stay visually locked, the head one beat ahead.
- **Tail `T(t)`**: holds 0 until `TAIL_DELAY_MS = 450`, then 0→1 over
  `[450, 1600]`, easeInQuad. The lit span `[T, H]` is a comet: full thread
  never persists; the light *travels*.

```
startIdx = floor(T · TUBE_SEGMENTS) · 30
count    = max(0, ceil(H · TUBE_SEGMENTS) · 30 − startIdx)
geometry.setDrawRange(startIdx, count)
```

- **t = 0..1350 ms**: head draws toward the lantern (firefly lands at 1350,
  U-14's frozen `T_LAND_END`, Fireflies.tsx:94).
- **t = 1350..1600 ms**: head parked at 1, tail catches up — the thread
  drains INTO the landing point exactly while the firefly's dissolve/cool
  runs (1350–1630 ms, Fireflies.tsx:95).
- **t = 1600..1750 ms**: 150 ms opacity fade 0.9→0 (belt and suspenders for
  the last segment), then `setDrawRange(0,0)`, `geometry.dispose()`, slot
  freed, opacity restored.

Total thread life ≈ 1.75 s. **Amendment note:** PLAN §6 U-16 sketched
"disposed after 1.2 s" (PLAN.md:525) before U-14 froze the 1630 ms flight
timeline; the thread must outlive the flight it escorts. This memo amends the
lifetime to ≤1.8 s — record it in the commit message.

Micro-thread variant (`update_task` attention flick): same machinery,
`durationMs = 600`, tail delay 200, no firefly, no assist.

### 4.4 Reduced motion

Threads are never drawn under `prefers-reduced-motion` (§9). No fade
alternative — the ribbon receipt + chime + ember crossfade are the
reduced-motion story.

### 4.5 Pool + demand

- Fixed pool of **2** thread runtimes (PLAN §6 U-16: "at most 2 concurrent
  flights"). A third `draw()` finishes the oldest instantly (jump its params
  to end, dispose, reuse) — mirror U-14's overflow pattern
  (Fireflies.tsx:542-549).
- ONE `useFrame` in `LightThreads` advances active entries and calls
  `invalidate()` while any is live — a sanctioned active runtime under
  PLAN §7.5(e). Zero entries → the hook returns immediately, zero rAF demand.
- Zero per-frame allocation: params and matrices are plain numbers on pool
  entries; the ONLY allocations are the per-routing curve + TubeGeometry
  (routing cadence — a few per minute at most, explicitly acceptable).
- Meshes: two `<mesh>` children created once (`frustumCulled = false` — the
  thread spans ring-space to tree-space), `visible` toggled, geometry swapped
  per routing. **≤2 transient draw calls**, 0 when idle — inside the
  "ring/ribbon/thread ≤6" budget line (PLAN §7.2).

---

## 5. Timeline sync with the firefly (the frozen numbers)

U-14's flight timeline is frozen and module-private (Fireflies.tsx:87-97):
depart 250 ms → traverse 900 ms → land at **1350 ms** → dissolve to **1630 ms**,
with the A=0.5 speed pulse mid-traverse. U-16 mirrors these as its own
constants with a citation comment (`// mirrors Fireflies.tsx:88-97 — frozen`);
do not export them from U-14 (widening a frozen file for four numbers is worse
than a documented copy — same reasoning as the pickNodeColor copy,
tokens.ts:30-35).

Both systems start on the same `performance.now()` tick (U-16 calls
`lightThreadBus.draw(...)` and `fireflyBus.fly(...)` back to back in the same
task), both trace `boughPoint`, both use the same easing. Drift over 1.35 s is
sub-frame. The thread head's 60 ms lead is deliberate: light announces, the
firefly follows, the landing point receives both.

`fly()`'s promise resolves at landing (Fireflies.tsx:593-599 — chime included,
U-16 never emits a chime). After `await`, U-16 does exactly nothing (§7).

---

## 6. The bounded camera assist — a nudge, never a hijack

U-07's CameraRig is the flight authority (CameraRig.tsx:9-15); the focus→pose
effect flies ONLY on focus change (CameraRig.tsx:291-309). U-16 deliberately
does **not** push `focusStack` — a routing is ambient feedback, and hijacking
focus would silently change the user's Esc depth mid-thought
(useFocusStack.ts:6-11). Decision: **no focus push, ever.** The assist is a raw
`cameraBus.flyTo` (CameraRig.tsx:150-178) that rotates the view a bounded
amount and lets go.

### 6.1 The math (yaw-only, ≤20°)

```
F  = camera.getWorldDirection(scratch)            // current forward
D  = normalize(target.point − camera.position)    // toward destination
δ  = signedAngle(F.xz, D.xz)                      // yaw needed, radians

if |angle(F, D)| ≤ ASSIST_DEADZONE (25°) → skip   // already comfortably
                                                  // in a 55° FOV frame
δ' = clamp(δ, −ASSIST_MAX, +ASSIST_MAX)           // ASSIST_MAX = 20° = 0.349 rad
F' = F rotated about world +Y by δ'               // yaw only; pitch untouched
pose = {
  position: camera.position (UNCHANGED — an assist never relocates),
  target:   camera.position + F' · min(|D_len|, 8)
}
void cameraBus.flyTo(pose, ASSIST_MS = 450)       // fire and forget
```

450 ms maps to `smoothTime` 0.3 via the bus clamp (CameraRig.tsx:84-86,157) —
snappier than a 700 ms focus glide, felt as a glance, not a trip. The target
distance is capped at 8 m so the orbit pivot lands at a sane depth; the next
real focus flight overwrites it anyway.

### 6.2 Guards (all must pass)

1. **Never during user drag.** LightThreads' mount effect adds
   `pointerdown`/`pointerup`/`pointercancel` listeners on `gl.domElement`
   (`useThree(s => s.gl)`) maintaining a module `pointerDown: boolean` +
   `lastPointerUpAt` timestamp. Skip if down, or if released < 300 ms ago
   (drag momentum). This deliberately avoids touching U-07's private
   `controlsInstance` — DOM truth is sufficient and collision-free.
2. **Reduced motion off** (§9) — no assist, period.
3. **`bootDone()` true** (CameraRig.tsx:145-147) — never yank during the Litany.
4. **Deadzone** — destination already on screen (≤25° off forward) → skip.
5. **Once per turn burst** — a module `lastAssistAt`; skip if < 4000 ms since
   the previous assist. Multiple actions in one turn share one glance.

### 6.3 Auto-release

There is nothing to release: `flyTo` completes and camera-controls returns to
user ownership automatically; any user input DURING the glide takes over
immediately (camera-controls composes input with transitions;
`draggingSmoothTime={0.12}`, CameraRig.tsx:317). The failsafe race in the bus
(CameraRig.tsx:169-176) already guarantees the promise can't deadlock U-16 —
and U-16 never awaits it anyway (`void`).

---

## 7. The ember/firefly race — cause → effect, never doubled

The invalidation fired BEFORE the `jarvis-action` event (useJarvisWorld.ts:229-234),
so the real row races the choreography. Both orders must read correctly:

- **Ember arrives EARLY** (refetch beats the 1350 ms flight): the U-09 ember
  springs in with its ENTER_POP flare at `EmberSlot.basePosition` — on the
  0.35 m shell around the lantern (treeLayout.ts:36,154-168) — while the
  firefly is still inbound to the lantern point. They coexist ≤1 s within
  ~0.35 m of each other; the firefly's dissolve (cyan→candleflame color lerp,
  Fireflies.tsx:638-647) lands ON the lit cluster and reads as the light
  joining its ember. Acceptable by design — U-16 has no lever into U-09 and
  must not want one (the slot array is truth).
- **Ember arrives LATE** (slow roundtrip): the firefly lands, cools gold,
  dissolves out by 1630 ms; the ember pops moments later at the same cluster.
  Reads as kindle-with-a-breath-of-delay. U-16 does NOT wait, retry, or
  invalidate — the row WILL arrive (U-13 invalidated; Realtime is additive
  belt-and-suspenders, invalidate-after-action.ts:9-24).
- **Never doubled:** the firefly is a transient/consumed instance that scales
  to zero and frees its slot (Fireflies.tsx:658-668); the ember is a separate
  InstancedMesh instance. U-16 creates neither. There is no code path where
  two persistent lights represent one task.
- **Unfiled capture case:** the resident firefly is spawned by U-14's
  reconcile and popped by its `capture-created` bridge (Fireflies.tsx:905-915).
  U-16's thread ends at `captureSpawnPosition(id)` — the exact deterministic
  spawn point — so whichever finishes first, thread-tip and pop coincide
  spatially and read as one delivery.
- **Consumed-resident guard** (filed capture): U-16 always passes
  `captureId: undefined` for `create_capture` flights — the row was born
  filed, no resident exists to consume, and passing the id would be a no-op
  lookup miss anyway (Fireflies.tsx:512-529 falls through to transient).
  Simpler to be explicit: transients only.

---

## 8. Sanctioned micro-amendments (wave-4 sequential — zero collision)

Three tiny edits to other units' files. Waves are sequential (PLAN §5), so
file ownership conflicts are impossible; each is a one-liner that widens an
export surface without changing behavior. Commit each with its consumer.

### 8.1 `jarvis/JarvisRing.tsx` — the ring's world origin

The ring is camera-parented via `createPortal(…, camera)` (JarvisRing.tsx:237-258)
at camera-space `SUMMON_POSITION [0, −0.08, −0.9]` + ring offset
`RING_LOCAL_X = −0.36` (JarvisRing.tsx:57-63). During a routing the ribbon is
open, so the ring IS at the summon pose (springs settled long before actions
stream in). Add to JarvisRing.tsx:

```
export function ringWorldOrigin(camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3
// out.set(SUMMON_POSITION[0] + RING_LOCAL_X, SUMMON_POSITION[1], SUMMON_POSITION[2])
// return camera.localToWorld(out)
```

Keeping the helper IN JarvisRing.tsx keeps the pose constants single-sourced
(never duplicate them into U-16). The camera is in the scene graph with a live
matrixWorld (JarvisRing.tsx:151-158), so `localToWorld` is correct at any
frame. U-16 calls it once per routing with a preallocated scratch Vector3.

### 8.2 `tree/Fireflies.tsx` — the deterministic spawn point

`seedSpawnPos` (Fireflies.tsx:263-270) is private and uses private swarm
constants. Add a thin exported wrapper:

```
export function captureSpawnPosition(id: string): Vector3Tuple
// three hash01 draws → the same cylindrical point seedSpawnPos writes
```

(Implementation may call `seedSpawnPos` into a scratch Float32Array — exact
reuse, no duplication.)

### 8.3 `WorldScene.tsx` — the mount

One line at the wave-4 slot (WorldScene.tsx:70-80), after `<TodayPanel/>`,
before `<JarvisRing/>`:

```
<JarvisChoreographer /> {/* [U-16] jarvis-action → thread + flight + assist */}
```

(The thread meshes are world-space scene children; any position before
`<PostFX/>` is valid. Keep the slot list comment current.)

---

## 9. Reduced-motion seam

Read the flag once per routing via the same media query every sibling uses
(`prefersReducedMotion()`, CameraRig.tsx:118-123 pattern; U-19 will rewire all
of these to `useWorldPrefs` in one diff — keep it a named module function).

Under reduced motion, per routed action:

- **No thread** (§4.4). **No assist** (§6.2.2). **No micro-thread.**
- **Still call `fireflyBus.fly(...)`** — U-14's reduced-motion branch
  (Fireflies.tsx:531-540) resolves instantly, emits the two-note chime, and
  crossfades the mote out. The chime + the ribbon receipt + the ember's U-09
  reduced-motion crossfade ARE the routing feedback. Completion still legible
  (PLAN §11 honesty checklist).
- The wait-for-row machinery still runs (it's invisible bookkeeping needed to
  know WHERE the fly should go).

---

## 10. Perf + demand-mode ledger (PLAN §7 instantiated)

| Constraint | U-16's answer |
|---|---|
| Draw calls | ≤2 transient (thread pool), 0 idle. Budget line "ring/ribbon/thread ≤6" (PLAN §7.2) holds: U-13 uses 5, threads borrow 2 only mid-routing. |
| Frame demand | LightThreads' `useFrame` invalidates ONLY while a thread is live (§7.5(e) active runtime). Choreographer itself never demands — its work is event/effect cadence. Idle = zero rAF from U-16. |
| Allocation | Zero per frame. Per routing: 1 CatmullRomCurve3 + 1 TubeGeometry + ≤2 Vector3 clones — routing cadence, disposed on finish (`geometry.dispose()`, PLAN §7.9). Scratch Vector3s at module level. |
| React state | None at frame cadence. Pending routings, pointer state, assist timestamps: module refs. Data mirrors: refs updated in render. |
| Geometry rebuild | Never per frame — drawRange only (PLAN.md:532 verbatim). |
| Concurrency | 2 threads (pool), oldest-finishes-instantly overflow; U-14 caps flights at 4 (Fireflies.tsx:59) — headroom above our 2. |
| Failure honesty | Unknown area → `fly()` no-ops with a warn (Fireflies.tsx:825-831); unresolvable receipt → abandoned after 2 s with a warn; world unmounted mid-choreography → bus no-ops (CameraRig.tsx:153, Fireflies.tsx:818-824). Nothing throws, nothing hangs, nothing lies. |

---

## 11. TypeScript signatures (write exactly these)

```ts
// ── jarvis/useJarvisChoreography.ts ─────────────────────────────────────────
import type { Vector3Tuple } from "three";
import type { JarvisActionEvent } from "@/components/jarvis/jarvis-stream-client";
import type { TreeLayoutResult } from "../data/treeLayout";

/** Where a routed action lands in the world. */
export type ChoreographyTarget =
  | { kind: "lantern"; areaId: string; projectId: string; point: Vector3Tuple }
  | { kind: "trunk"; point: Vector3Tuple }    // inbox task → trunk cluster slot
  | { kind: "swarm"; point: Vector3Tuple };   // unfiled capture → spawn point

/**
 * Pure, synchronous, receipt-only resolution (PLAN §6 U-16 signature, adapted:
 * the pose field folded into `point`). Returns null for NOOP_TOOLS, failed
 * extraction, or a vanished lantern — callers escalate null to the
 * wait-for-row window when the tool is waitable (create_task/create_capture
 * with a result.id, or trunk targets needing their EmberSlot).
 */
export function resolveActionDestination(
  ev: JarvisActionEvent,
  layout: TreeLayoutResult,
): ChoreographyTarget | null;

/** Tool names that must never choreograph (emitted ok:true by U-13). */
export const NOOP_TOOLS: ReadonlySet<string>;

/**
 * Logic component. Mounted ONCE in WorldScene (§8.3). Subscribes to
 * worldEvents "jarvis-action" (mount-once effect, data in refs), runs the
 * resolve→assist→thread+fly pipeline, owns the pending-wait map, and renders
 * <LightThreads/> as its only child. Zero frame-cadence React state.
 */
export function JarvisChoreographer(): ReactElement;

// module-internal:
interface PendingRouting {
  ev: JarvisActionEvent;      // re-resolved when the row arrives
  deadline: number;           // performance.now() + WAIT_FOR_ROW_MS (2000)
}

// ── jarvis/LightThread.tsx ──────────────────────────────────────────────────
import type * as THREE from "three";
import type { BoughLayout } from "../data/treeLayout";
import type { ChoreographyTarget } from "./useJarvisChoreography";

export interface ThreadRequest {
  from: THREE.Vector3;          // ring world origin (caller's scratch; cloned in)
  target: ChoreographyTarget;
  bough: BoughLayout | null;    // lantern targets: the path's limb; else null
  durationMs?: number;          // head-draw time; default 1290 (=1350−LEAD_MS)
}

/**
 * Module singleton, Fireflies.tsx `fireflyBus` pattern (mounted component
 * mirrors itself into module refs; bus no-ops with a warn when unmounted).
 * Resolves when the head reaches the end of the path (t = durationMs) — NOT
 * at dissolve end, so callers can sequence off "the light arrived".
 * Never rejects, never hangs (unmount resolves all in-flight promises).
 */
export const lightThreadBus: {
  draw(req: ThreadRequest): Promise<void>;
};

/** The pool renderer: 2 meshes, 1 shared material, 1 useFrame. */
export function LightThreads(): ReactElement;

// module-internal pool entry:
interface ThreadEntry {
  active: boolean;
  mesh: THREE.Mesh;             // persistent; geometry swapped per routing
  geometry: THREE.TubeGeometry | null;  // disposed at thread end
  startedAt: number;            // performance.now()
  durationMs: number;
  tailDelayMs: number;
  totalMs: number;              // durationMs + drain + fade
  resolve: (() => void) | null;
}

// ── jarvis/JarvisRing.tsx (amendment, §8.1) ─────────────────────────────────
export function ringWorldOrigin(
  camera: THREE.Camera,
  out: THREE.Vector3,
): THREE.Vector3;

// ── tree/Fireflies.tsx (amendment, §8.2) ────────────────────────────────────
export function captureSpawnPosition(id: string): Vector3Tuple;
```

Frozen constants to declare in U-16 (with citation comments):

```ts
const LEAD_MS = 60;               // thread head leads the firefly
const DRAW_MS = 1350 - LEAD_MS;   // firefly T_LAND_END, mirrors Fireflies.tsx:94
const TAIL_DELAY_MS = 450;
const DRAIN_END_MS = 1600;        // tail completes just before dissolve end (1630)
const FADE_MS = 150;
const SPEED_PULSE_A = 0.5;        // mirrors Fireflies.tsx:96
const FLIGHT_LIFT = 0.08;         // mirrors Fireflies.tsx:97
const TUBE_SEGMENTS = 64; const RADIAL_SEGMENTS = 5; const THREAD_RADIUS = 0.006;
const THREAD_HDR = 2.6;           // > Bloom threshold 1
const MICRO_MS = 600; const MICRO_TAIL_DELAY_MS = 200;
const WAIT_FOR_ROW_MS = 2000;
const ASSIST_MAX_RAD = (20 * Math.PI) / 180;
const ASSIST_DEADZONE_RAD = (25 * Math.PI) / 180;
const ASSIST_MS = 450; const ASSIST_COOLDOWN_MS = 4000;
const DRAG_SETTLE_MS = 300;
const THREAD_POOL = 2;            // PLAN §6 U-16: at most 2 concurrent
```

---

## 12. Ordered build checklist (atomic commits, explicit pathspecs)

1. **Amendments first** — `ringWorldOrigin` in JarvisRing.tsx +
   `captureSpawnPosition` in Fireflies.tsx. Verify `tsc --noEmit`.
   Commit: `feat(world): export ring origin + capture spawn seams for U-16`.
2. **`LightThread.tsx`** — pool, shared material, curve builder (+ private
   `nearestBoughT`), drawRange comet, dispose path, bus with unmount-resolve.
   Commit: `feat(world): LightThreads pool + lightThreadBus (U-16)`.
3. **Resolver** — `resolveActionDestination`, `NOOP_TOOLS`,
   `receiptProjectIds` extractor in useJarvisChoreography.ts. Pure functions
   first. Commit: `feat(world): jarvis receipt→destination resolver (U-16)`.
4. **Resolver tests (Vitest)** — truth table: every tool name in §3 →
   expected target kind/null; malformed receipts (missing/non-array/empty
   `project_ids`); archived-project miss → null. Pure functions, no three
   runtime needed (`Vector3Tuple` is type-only). Commit with 3 or separately.
5. **Choreographer** — event subscription, pending-wait map + data-cadence
   sweep + deadline timeout, per-tool dispatch, reduced-motion branch.
   Commit: `feat(world): JarvisChoreographer pipeline (U-16)`.
6. **Camera assist** — yaw math, five guards, pointer-state listeners on
   `gl.domElement`, cooldown. Commit: `feat(world): bounded ≤20° routing
   camera assist (U-16)`.
7. **Mount** — one line in WorldScene.tsx + slot-comment update.
   Commit: `feat(world): mount JarvisChoreographer (U-16)`.
8. **End-to-end pass** — the §13 demo on live data, both race orders (throttle
   network in devtools to force ember-late), reduced-motion pass, idle-rAF
   audit. Fix, then final commit if needed.

---

## 13. Acceptance (verifier-runnable)

**THE demo (PLAN §6 U-16, PLAN §11 Jarvis row):** `Cmd+K` → *"email the prof
about the extension, task, Friday"* → SSE actions land → cyan thread leaps
from the ring and draws along the **correct area's** bough while a firefly
banks beneath it → firefly lands on the right lantern, cools cyan→gold,
two-note chime → the new ember exists (verify the task row in the 2D app).
Complete choreography < 5 s wall-clock after `onDone`.

Plus, specifically:

- [ ] Thread and firefly trace the same limb; head leads by a visible beat;
      thread drains into the landing point and is fully gone ≤1.8 s.
- [ ] `create_capture` unfiled: thread ends exactly where the new firefly
      pops (cork-pop); no flight fired.
- [ ] Inbox `create_task`: thread to the trunk-cluster slot (arrives after
      the refetch — wait window ≤2 s); no firefly; ember pops there.
- [ ] `update_task` → `lesno`: NO thread; ascent + bell play exactly once
      (U-09's); nothing doubled.
- [ ] `find_tasks` / `ask_clarification` / fact / person / event tools:
      zero world motion.
- [ ] Assist: with the target bough behind the camera, view yaws ≤20° over
      ~450 ms; grabbing the mouse mid-assist takes over instantly; no assist
      while dragging, during boot, under reduced motion, or twice within 4 s;
      focus stack depth unchanged (Esc behavior identical before/after).
- [ ] Both race orders (ember-early via fast local, ember-late via throttled
      network) read as cause→effect; at no point do two persistent lights
      represent one task.
- [ ] Reduced motion: no thread, no assist; chime + receipt + ember crossfade
      still land; `fly()` resolves instantly.
- [ ] U-16 issues ZERO query invalidations/refetches (grep the diff:
      no `invalidateQueries`, no `invalidateAfterJarvisAction` import).
- [ ] Idle audit: 10 s hands-off after a routing → zero rAF from U-16
      (threads disposed, useFrame early-returns); `gl.info.render.calls`
      returns to baseline.
- [ ] `tsc --noEmit` green; resolver Vitest suite green; `npm run build` green.

*— Fable. The receipt names the branch; the thread shows the way; the firefly
delivers; the ember answers. Seal it and hand it to Opus.*
