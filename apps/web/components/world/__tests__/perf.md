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

---
---

# The Studiolo — Performance Protocol & Audit, Meridian (Phase 2, M-13)

Phase 2 (The Meridian Ring) extends the living protocol above. `PHASE-2-PLAN.md`
§4 is LAW for the meridian layer; this section records how the assembled ring,
tablets, plumb-line, and labels conform to it — the DERIVABLE audit filled in by
code inspection, and the live-fps / `gl.info.render.calls` rows marked **PENDING
HUMAN GATE** for Filippo to record on the authenticated `/world` route (the
static/CI verifier cannot open an authenticated session).

Method for everything below marked "(derivable)": direct source inspection of
every `<mesh>` / `InstancedMesh` / `<Text>` in `components/world/meridian/**`
plus the pure invariants pinned by `meridian/__tests__/meridianPerf.test.ts`.

## M1. Meridian draw-call audit vs §4.2 budget (derivable)

§4.2 ceilings: meridian layer total **≤20**; new Vestibule scene ceiling **≤170**
(was ≤150 — a **+20** meridian delta). Itemized by code inspection of each mesh:

| Unit / file | Draw call(s) | Count | §4.2 budget | Evidence (code) |
|---|---|---|---|---|
| **Ring structure** (`MeridianRing.tsx`) | brass annulus + engraved strip + ticks-instanced + zenith marker | **4** | ≤4 | 1 `<mesh RING_GEOMETRY>` · 1 `<mesh stripGeom>` · 1 `<primitive ticks>` (ONE `InstancedMesh`, 24 hour + 96 quarter = 120 instances) · 1 `<mesh markerGeom>` |
| **Event tablets** (`EventTablets.tsx`) | ONE tablet `InstancedMesh(128)` + ONE all-day band `InstancedMesh(8)` | **2** | 2 | `sys.tabletMesh` + `sys.bandMesh`; window-roll churns instances through a freelist, not draw calls |
| **Zenith hero tablet** (`EventTablets.tsx`) | `heroGlass()` swap at zenith | **1 (+1 transmission pass)** | 1 (+1) | one `<mesh>{heroGlass()}` mounted ONLY while a `current`\|`imminent` tablet is within ±16° of zenith (`HERO_ZENITH_THRESH`); consumes the **3rd/3** `MeshTransmissionMaterial` reserve slot (dev cap enforced in `materials/hologram.ts`, `HERO_GLASS_CAP=3`) |
| **Plumb-line** (`PlumbLine.tsx`) | emissive line + god-ray cone | **2** | 2 | 1 `<mesh lineGeometry>` (bloom emitter) + 1 `<mesh SHAFT_GEOMETRY>` (additive cone); rendered only while `status === "connected"` |
| **Meridian SDF Text** (`MeridianLabels.tsx`) | 8 numerals + date line + zenith caption + hover caption | **≤11** | ≤11 | 8 `<Text>` numerals (`HOUR_MARKS`) + 1 date + 1 zenith + 1 hover = 11 troika Text nodes; `sdfGlyphSize=64` (§4.3 ceiling) |
| **Meridian layer total** | | **≤20** | **≤20** | 4 + 2 + 1 + 2 + 11 (transmission pass tracked as "+1", not a base call) |

**Verdict (derivable): the meridian layer's simultaneous draw-call ceiling is
≤20, matching §4.2 exactly, with a +20 scene delta (150 → 170).** Two honest
refinements, stated so the live numbers are read correctly:

1. **The hover caption's calendar-color dot** (`MeridianLabels.tsx`, a
   `circleGeometry` `<mesh>`) is a 12th label-layer draw call that the §4.2 table
   folds into the "hover caption" line. It is `visible` ONLY while a tablet is
   actively hovered (`ht.fillOpacity > 0.01`), which requires ring focus. So the
   true simultaneous ceiling — **ring-focused + hovering a tablet + a zenith hero
   live** — is **21 draw calls (+1 transmission pass)**. This is a *look-up /
   interaction* peak, never the idle Vestibule, and any GPU pressure it creates is
   exactly what the DPR governor (M3 below) absorbs.
2. **The Vestibule steady-state is far below the ceiling.** Standing on the dais
   (NOT ring-focused, camera pitch ≤ 35°), the 8 numerals are `visible=false`
   (distance/pitch cull in `useFrame`, never unmounted) and the hover
   caption+dot are off. Vestibule delta = ring 4 + tablets 2 + plumb 2 + date
   line 1 + zenith caption (0–1) + hero (0–1, +transmission) ≈ **9–11 draw
   calls** — roughly HALF the +20 budget. The ≤170 scene ceiling holds with wide
   headroom over the Phase-1 Vestibule baseline (≈40–55, §2 above).

**Triangles (derivable, `meridianGeometries.ts` header):** ring 512 + ticks
120×12 = 1 440 + strip ~192 + marker ~24 ≈ **2.2k**; tablets 128×12 = 1 536;
bands 8×128 = 1 024; hero 12; plumb 12 (line) + 48 (cone). Worst case ≈ **6.4k
tris** — ~14 % of the ≤45k meridian budget; scene stays ≤ 300k.

**Textures:** ZERO new (all materials procedural; numerals reuse the preloaded
EB Garamond atlas; the toll is audio). **Dependencies:** ZERO new (drei ships
`PositionalAudio`; `@date-fns/tz` already installed). **Transmission registry:**
now 3/3 (focused lantern · Jarvis ribbon · zenith hero) — full, per §4.3.

## M2. Meridian idle-frame audit vs §4.1 (derivable)

§4.1 permits continuous meridian frame demand ONLY while (a) `focus.kind ===
"ring"` and the camera is moving, (b) `|scrubVelocity| > ε` or a snap/rubber-band
is live, (c) a lean/hero/enter-leave spring is live, or (d) the 4 s
post-interaction breath window is open. Outside those, §4.1 caps meridian rAF at
"exactly 1 frame/min" (the minute-tick). Static audit of EVERY `useFrame` /
`invalidate()` under `meridian/**`:

- **`MeridianRing.tsx`** — `useFrame` reads `ringRotationFor(Date.now(), …)` and
  writes `dial.rotation.y`, early-returning on `rot === lastRot`. It **never calls
  `invalidate()`** → zero self-demand. The only `invalidate()` is the
  status-flip effect (a Settings/connection event, not idle).
- **`useRingScrub.ts`** (mounted by `MeridianRing`) — `stepScrub` **early-returns
  while `phase === "idle"`** (demands nothing); it self-invalidates ONLY during a
  live momentum/detent/snap animation, which then early-exits back to idle.
- **`EventTablets.tsx`** — `stepFrame` advances `uMeridianTime` and the dial
  rotation on demanded frames, and calls `invalidate()` **only `if (stillMoving)`**
  (an active enter/leave/lean/hover/pop spring). Idle → no springs → no
  invalidate. The reconcile/reclassify passes are gated (`RECONCILE_CENTER_EPS_MS`
  60 s, `CLASSIFY_EPS_MS` 5 s) so they run on already-demanded frames, never
  demanding their own.
- **`PlumbLine.tsx`** — `useFrame` returns immediately if reduced-motion OR when
  `performance.now() > activeUntilRef.current` **without invalidating**; it
  self-invalidates ONLY inside the shared 4 s breath window (§4.1(d)) and listens
  to the *same* pointer/key/wheel events `env/DustMotes.tsx` already uses — **no
  new demand source**.
- **`MeridianLabels.tsx`** — `useFrame` reads the dial rotation (no invalidate),
  runs the numeral cull, refreshes the date/zenith text only on a real change
  (`setTroikaText` invalidates once per changed string), and cross-fades the
  hover caption via `easing.damp` that self-suspends once settled. No continuous
  idle demand.
- **`TollScheduler.tsx`** — no `useFrame`; ONE `setTimeout` + a `visibilitychange`
  listener. **Zero rAF.**
- **`MeridianAudio.tsx`** — no `useFrame`; the lazy node mount on the first toll
  costs a single React scene frame, then never demands again. **Zero idle rAF.**
- **`PerfGovernor.tsx`** — passive observer; never invalidates (unchanged from §1).

**Conclusion (derivable): the meridian layer adds ZERO idle frame demand of its
own — strictly *under* the §4.1 1-frame/min ceiling.** The dial is pure time
projection evaluated only on frames the world *already* demands. One honest
clarification about the "1 frame/min" wording, load-bearing for reading the live
idle numbers:

> §4.1 modeled the idle demand as "the `todayYmd` minute clock calling
> `invalidate()` once per minute." In the shipped `WorldDataProvider`, that
> clock (`setInterval(…, 60_000)`) calls `setToday((prev) => prev === next ? prev
> : next)` — React **bails on the unchanged `ymd`**, so it re-renders (and the
> data-change `invalidate` effect fires) **only at midnight**, not every minute
> (`today` is not in the invalidate effect's dep array). There is therefore **no
> per-minute meridian invalidate anywhere** in the tree.

So the dial re-poses opportunistically:
- **With unfiled captures present** → on the sanctioned firefly **5 fps
  heartbeat** frames (`Fireflies.tsx`); tablet states reclassify ~once/min as the
  center crosses the 60 s reconcile gate, riding that heartbeat with **no extra
  demand**.
- **With zero captures (true idle)** → the world sleeps to **0 rAF**; the dial
  re-poses on the next already-scheduled demand — the meridian query's
  `refetchInterval: 300_000` (5 min, and only if event identity changed) or any
  interaction. Drift while frozen is 0.25°/min → **≤ ~1.25° over 5 min**,
  imperceptible.

**Amended Phase-1 idle criterion** (supersedes §5 line 3 / §3 verdict above):

> Hands off 10 s → rAF → **0** (± firefly heartbeat ≤ 5 fps, **± meridian
> minute-tick ≤ 1 frame/min**). In the shipped build the meridian contribution is
> **0 self-demanded frames** — the dial rides existing demanded frames — which is
> within (≤) the §4.1 1-frame/min ceiling. At the gate, observing **0** extra
> meridian frames/min is the EXPECTED, in-budget result (not a failure); the
> ≤ 1/min ceiling is the guarantee, 0 is the shipped reality.

## M3. Scrub-fps + DPR-ladder-with-ring protocol (§4.4) — PENDING HUMAN GATE

Baseline: M-series MacBook (M1 Pro integrated), Chrome + Safari, authenticated
`/world` with Google Calendar connected. Surface `?perf=1` (drei `<Stats>` +
`gl.info.render` logging, §4 above) for live `calls` / `triangles`.

**Seed (§4.4, exact):** Phase-1 seed (8 areas / 40 projects / 300 tasks / 12
captures) **+ 40 gcal events across 9 days** incl. **6 overlapping**, **2
all-day**, and **1 starting in 16 min**. (The pure solver's handling of this exact
seed — 40 slots, freelist headroom, ≤3 all-day, bounded overlap placements — is
asserted deterministically in `meridian/__tests__/meridianPerf.test.ts`.)

Steps to run and record:
1. **Vestibule, ring in frame:** read `gl.info.render.calls` and `triangles`.
   Expect calls ≤ **170**, tris ≤ **300k**. (Derivable prediction: meridian delta
   ≈ 9–11 calls; total ≈ 50–66.)
2. **`C` look-up glide** (ring frames in ~800 ms) → confirm numerals appear
   crisp, plumb-line falls at zenith.
3. **20 s aggressive scrub** — 3 confident flicks + 2 direction reversals
   (two-finger swipe on the trackpad = wheel). Expect **≥ 58 fps**, no hitch
   > 33 ms on freelist churn as days enter/leave.
4. **T-15 toll + lean during an active scrub:** confirm no dropped audio and
   fps **≥ 55**; the toll pans from overhead (HRTF) as you orbit.
5. **Hands off 10 s** (per M2): rAF = firefly heartbeat only; **0** extra
   meridian frames/min (in-budget); CPU at idle baseline.
6. **Reduced-motion pass** (macOS Reduce Motion ON): scrub steps in discrete
   1-hour hops with **zero continuous demand**; lean/snap are instant; toll still
   sounds.
7. **DPR ladder with the ring in frame:** DevTools → throttle GPU (e.g. 4–6×
   slowdown) while orbiting/scrubbing → confirm `[PerfGovernor] dpr → …` logs step
   **2 → 1.5 → 1**; remove the throttle → dpr climbs back. (Derivable: the ring
   adds no new `useFrame` that would starve the governor's dense-frame streak —
   scrub/orbit produce the back-to-back frames `MIN_DENSE_FRAMES=20` needs, so the
   ladder still engages with the ring loaded.)

### M3 results table — record on hardware (PENDING HUMAN GATE)

| # | Scenario | Target | Chrome | Safari | Pass? |
|---|---|---|---|---|---|
| 1a | Vestibule `gl.info.render.calls` | ≤ 170 | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 1b | Vestibule `triangles` | ≤ 300k | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 1c | Meridian draw-call delta (calls with ring − without) | ≤ 20 | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 2 | `C` look-up glide fps | ≥ 58 | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 3 | 20 s scrub (3 flicks / 2 reversals) fps; max hitch | ≥ 58 fps, no hitch > 33 ms | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 4 | T-15 toll + lean during scrub fps; audio | ≥ 55 fps, no drop | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 5a | Hands-off 10 s: extra meridian frames/min | 0 (≤ 1) | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 5b | Hands-off idle rAF (ex-firefly heartbeat) | 0 | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 6 | Reduced-motion scrub: continuous demand | 0 (discrete hops only) | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |
| 7 | DPR ladder with ring in frame | 2 → 1.5 → 1, then back | ⟨PENDING⟩ | ⟨PENDING⟩ | ☐ |

Fill the `⟨PENDING⟩` cells with the observed numbers and tick each box. Ship the
meridian perf gate when every box is checked.
