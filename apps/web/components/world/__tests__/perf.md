# The Studiolo — Performance Protocol & Audit (U-20)

This is the U-20 deliverable: the adaptive-resolution governor's design, the
static draw-call audit against §7's budget, the idle-rAF audit, and the manual
acceptance protocol (§7.10) to run on the target machine.

§7 of `PLAN.md` is LAW. This file records how the assembled world conforms to it.

---

## 1. PerfGovernor — adaptive resolution

`components/world/perf/PerfGovernor.tsx`, mounted once in `WorldScene` just
before `<JarvisRing/>`/`<PostFX/>` (PostFX must stay last; the ring immediately
before it).

**Mechanism.** drei `<PerformanceMonitor>` samples sustained fps and fires
`onDecline` / `onIncline`. The governor walks a fixed **dpr ladder**:

| Rung | dpr  | Meaning                         |
|------|------|---------------------------------|
| 0    | 2.0  | crisp default (retina)          |
| 1    | 1.5  | one decline step                |
| 2    | 1.0  | floor — half-resolution         |

- `onDecline` → step one rung **down** (2 → 1.5 → 1) via `useThree(s=>s.setDpr)`.
- `onIncline` → step one rung **up** back toward crisp.
- Each rung value is clamped to `[1, min(2, devicePixelRatio)]`, so a non-retina
  display is never pushed above its native pixel ratio.
- One `invalidate()` follows each `setDpr` so the resized render target repaints.

Halving resolution is the single biggest GPU lever and touches no geometry,
material, or frozen contract — the cheapest, safest hardening pass.

### Demand-mode safety (the load-bearing subtlety)

The world runs `frameloop="demand"` and must sleep to **0 rAF** when idle. The
governor preserves that on two counts:

1. **It never demands a frame to sample.** drei's `<PerformanceMonitor>` reads
   fps from a bare `useFrame` and does **not** call `invalidate()` (verified
   against drei 10.7.x source: its `useFrame` only pushes timestamps). It samples
   only on frames other systems already demanded, so it adds zero rAF at idle.
   The governor's own frame observer is likewise passive.

2. **It ignores untrustworthy samples.** Under demand mode, fps computed from
   *sparse* demanded frames (a lone hover kick, or the firefly 5 fps idle
   heartbeat) is meaninglessly low — the inter-frame gap is large because nothing
   asked to render, not because the GPU is slow. Acting on that would drop dpr
   while idle. So a decline/incline is honoured **only** after a run of ≥20
   consecutive *dense* frames (Δt < 100 ms ⇒ a genuine glide/orbit/animation
   loop). The 100 ms threshold sits below the firefly heartbeat's 200 ms cadence,
   so idle heartbeat frames are correctly excluded while real load (down to
   ~10 fps continuous) still triggers a downgrade.

No new dependency — drei is already in the tree.

---

## 2. Draw-call audit vs §7.2 budget

§7.2 ceiling: **≤150** draw calls in the loaded Vestibule view; per-family
allocation below. Static tally of the assembled scene (post-boot, Today panel
closed, no lantern focus):

| System            | §7 budget         | Static count (Vestibule) | Notes |
|-------------------|-------------------|--------------------------|-------|
| Tree (Trunk+Boughs) | ≤12             | ~9  (dais+trunk+sap + limb/core tubes per area) | one Tube per area + core |
| Atmosphere        | ≤8                | ~7  (floor 1 + ≤6 inlays) | IBL/ lights are not draw calls |
| DustMotes         | 1                 | 1   (one InstancedMesh)  | |
| Lanterns (+rings) | 2 (+1 hero focus) | 2   (0 hero at vestibule) | hero swap only on lantern focus |
| Embers (+filaments) | 2               | 2   (two InstancedMesh)  | |
| Fireflies         | 1                 | 1   (one InstancedMesh)  | |
| Labels + Ledger   | ≤17 (SDF = 1 ea)  | ~7–17 (area captions + ledger strip) | project captions distance-culled |
| Today panel       | ~10–20 (open)     | ~0–a few (closed)        | uikit renders only when open |
| Jarvis ring/ribbon/thread | ≤6        | ~3  (ring 2 + motes 1; ribbon/thread transient) | |
| Composer passes   | ~4                | ~4  (Bloom + Vignette)   | the ONLY EffectComposer |
| Litany            | 0 after boot      | 0   (shutter retired)    | |
| **Total (panel closed)** | **≤150**   | **≈ 40–55**              | headroom ≥ 60 ✔ |
| **Total (panel open + focus)** | —      | **≈ 60–80**              | still ≫ under 150 ✔ |

**Verdict:** comfortably within the ≤150 ceiling with the required ≥60 headroom.
Confirm live with `?perf=1` (see §4) reading `gl.info.render.calls` in the loaded
Vestibule.

### Inlay batching (deferred item) — decision: NOT batched

`env/Atmosphere.tsx` renders one brass inlay strip per area (≤6 areas ⇒ ≤6 draw
calls). Batching was evaluated and **rejected**:

- Merging strips onto a single mesh with a per-area **material array** does not
  reduce draw calls — three.js issues **one draw call per geometry group /
  material**. Net GPU win: zero.
- A single **shared** material would collapse the per-area `opacity`/`color`
  control the Litany (U-17) animates during boot, and break the frozen
  `inlayRegistry` shape (`Map<areaId, MeshBasicMaterial>` → one live material per
  area).

So batching adds risk for no gain. ≤6 draw calls fits the atmosphere budget (≤8).
See the `// PERF (U-20 audit):` note in `Atmosphere.tsx`.

---

## 3. Idle → 0 rAF audit

§7.5 defines the only sanctioned frame demanders. Static audit of every
`useFrame`/`invalidate` in `components/world` confirms each is gated so the world
sleeps at idle:

- **CameraRig** — no `useFrame`; `invalidate()` is a one-shot kick, glides
  self-sustain via camera-controls change events, then stop.
- **Litany** — `useFrame` invalidates only during the finite boot timeline; goes
  quiet at `boot-complete`.
- **Boughs** — breath `invalidate()` only inside the 4 s post-interaction window
  (§7.5g), then `stopBeat()`.
- **WorldLabels / hover damps** — `invalidate()` only while a maath `easing.damp`
  is still moving; stops on convergence.
- **Ledger** — recomputes on data identity only; a single `invalidate()` per
  change, none per frame.
- **JarvisRing** — breath **never** invalidates (freezes mid-breath at idle);
  the 10 fps heartbeat runs only while the ribbon is open **and** tab visible;
  motes self-demand only while `thinking`.
- **JarvisRibbon / LightThread** — invalidate only while actively
  streaming / a thread is live (§7.5e).
- **Fireflies** — the one sanctioned idle demander: a **5 fps** heartbeat, and
  only while fireflies exist **and** the tab is visible (§7.5f); the wake window
  and flight tiers are finite.
- **PerfGovernor** — passive observer; never invalidates.

**Verdict:** with all systems mounted, a hands-off Vestibule (ribbon closed,
zero captures) reaches **0 rAF**. With captures present, the only idle activity
is the sanctioned firefly 5 fps heartbeat.

---

## 4. Dev stats (`?perf=1`)

`?perf=1` on the `/world` route surfaces drei `<Stats>` and logs
`gl.info.render` (`calls` / `triangles`) each demanded frame for live
verification of §2. (Dev-only; never in production bundles.)

---

## 5. MVP acceptance protocol (§7.10 — run on the target machine)

Baseline: M-series MacBook (M1 Pro integrated), Chrome + Safari.

Seed: 8 areas, 40 projects, 300 tasks (30 due today, 12 overdue, 10 P1/P∞), 12
captures.

1. Orbit the Vestibule + fly to 3 boughs + open Today panel + run one Jarvis
   routing → **≥58 fps sustained**, no dip below 45 during the firefly flight.
2. Complete 3 tasks rapid-fire → concurrent ascents hold **≥55 fps**.
3. Hands off 10 s → rAF activity → **0** (except firefly heartbeat ≤5 fps),
   CPU ≈ idle baseline.
4. `gl.info.render.calls ≤ 150`, triangles ≤ 300k in the loaded Vestibule view.
5. Governor: throttle the GPU (devtools) → dpr steps down the ladder
   (2 → 1.5 → 1); remove the throttle → dpr climbs back.

Record measured numbers here when run on hardware.
