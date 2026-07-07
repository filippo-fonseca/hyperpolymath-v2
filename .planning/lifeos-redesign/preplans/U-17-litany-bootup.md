# U-17 · litany-bootup — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/boot/Litany.tsx` +
> `boot/useLitanySequence.ts` — the ~6-second "Tree at Night" WAKE. Design memo only; no code
> exists for this unit yet. Everything below was verified on 2026-07-06 against the COMMITTED
> wave-1/2/3 contracts (file:line cited). Where PLAN §6 U-17's sketch (PLAN.md:536-543) and
> this memo differ, this memo wins — it resolves the sketch against the frozen code.
>
> Files you will create (nothing else): `boot/Litany.tsx`, `boot/useLitanySequence.ts`
> (PLAN.md:130-132). The orchestrator wires `<Litany/>` into `WorldScene.tsx` at the wave-4
> slot (WorldScene.tsx:75) — AFTER `<CameraRig/>` in sibling order (so your mount effects run
> after CameraRig publishes its singletons) and BEFORE `<JarvisRing/>`/`<PostFX/>` (those two
> must stay last, WorldScene.tsx:78-80). You do NOT touch WorldScene.
>
> Frozen inputs you consume, never modify:
> - `data/diffing.ts` — `worldEvents` (diffing.ts:100-136). **You EMIT `"boot-complete"`
>   (payload `void`, diffing.ts:94) exactly once per world mount.** You MAY emit `"chime"`
>   with a frozen kind (`"glass-bell" | "cork-pop" | "two-note"`, diffing.ts:92). No new
>   event names (diffing.ts:87-88).
> - `env/Atmosphere.tsx` — `inlayRegistry: Map<areaId, THREE.MeshBasicMaterial>`
>   (Atmosphere.tsx:36), one strip material per active area, `opacity: 0` at rest
>   (Atmosphere.tsx:57), `toneMapped:false` so you may push `color` > 1 to bloom
>   (Atmosphere.tsx:58, doc 12-22). This registry is the seam BUILT for you.
> - `camera/CameraRig.tsx` — `cameraBus.flyTo(pose, ms)` (CameraRig.tsx:150-178; note the
>   smoothTime clamp at :157 — see §5), `VESTIBULE_POSE` (:100-103), the boot gate + 8s
>   failsafe (:92, :142-147, :263-279), instant `setLookAt(...VESTIBULE_POSE, false)` /
>   saved-pose restore on mount (:232-261). `bootDone()` persists `true` across same-session
>   remounts (:286 — deliberate, for you).
> - `camera/useWorldKeys.ts` — swallows nothing pre-boot (`if (!bootDone()) return`,
>   useWorldKeys.ts:37) and explicitly leaves the any-key skip to you (:94-95). It is
>   capture-phase (:98) and CameraRig mounts before you → its handler runs before yours.
> - `tree/Trunk.tsx`, `tree/Boughs.tsx`, `tree/Lanterns.tsx`, `tree/Embers.tsx`,
>   `tree/Fireflies.tsx`, `env/DustMotes.tsx` — read-only neighbors. You animate their
>   MATERIALS from outside via committed stable handles (§2.3). You import nothing from them.
> - `text/fonts.ts` — `EB_GARAMOND_ITALIC` (fonts.ts:19), `WORLD_GLYPH_SET` (:30-36; covers
>   the greeting + date), `preloadWorldFonts()` (:49 — already called by Ledger at mount,
>   Ledger.tsx:86-88; call it again anyway, it is idempotent-cheap).
> - `components/world/ModeToggle.tsx` — how revisits happen: `Cmd+\` does `router.push`
>   under a Nightwalnut cover (ModeToggle.tsx:64-92, 159-175), so the world island fully
>   unmounts/remounts within one browser session and `sessionStorage` survives. That is
>   the mechanism your same-session skip flag rides (§1).
>
> Hard rules inherited: zero per-frame React state; zero allocation in the frame loop; the
> boot demands frames for exactly its own duration and then the world truly sleeps
> (PLAN §7.5); ≤2 extra draw calls during boot, 0 after (§10); everything pre-mounted —
> the Litany reveals, it never mounts/unmounts world content (PLAN.md:541).

---

## 0. Orientation — what this unit actually is

The Litany is a **conductor, not an actor**. Every object in the chamber is already mounted
at full brightness by its own frozen unit; the Litany (a) darkens them all in a layout
effect before the first painted frame, (b) drives one absolute-time keyframe timeline that
raises them back in the VISION Hero-I order (VISION.md:296-309: candle-point → inlay lines
race outward → boughs fade up in sequence → fireflies blink awake → a written line), (c)
flies the establishing camera move, and (d) emits `worldEvents.emit("boot-complete")` —
which is what actually unlocks the world (CameraRig gate :142-147, useWorldKeys :37).

It owns exactly two scene objects of its own:

1. **The shutter** — one camera-anchored Nightwalnut quad (renderOrder 1000, depthTest off)
   whose opacity 1→0 is the "true dark" of the first second. 1 draw call while visible.
2. **The greeting** — one troika `<Text>` (italic Garamond, camera-anchored, renderOrder
   1001) typed letter-by-letter via ref `.text` mutation + `.sync()` (PLAN.md:539 —
   NEVER setState). 1 draw call while visible.

Component skeleton (structure, not code):

```
boot/Litany.tsx
  export function Litany(): ReactElement
    ├─ useWorldData()                       → layout (bough order for the stagger)
    ├─ mode = decideMode()                  → "play" | "instant"   (§1, computed once)
    ├─ refs: anchorGroup, shutterMesh, greetingText (troika)
    ├─ useLitanySequence({ mode, refs })    → the conductor hook (all logic)
    └─ return <group ref={anchor}> <mesh shutter/> <Text greeting/> </group>

boot/useLitanySequence.ts
  export function useLitanySequence(opts): { skip(): void }
    ├─ useLayoutEffect([layout])            → collect kindle targets + snapshot originals
    │                                         + apply(t=0) BEFORE first paint (§2.4)
    ├─ useEffect(mount)                     → session flag, camera cut-to-start, skip
    │                                         listeners, chime, boot-complete promise (§5–§8)
    ├─ useFrame                             → clock → apply(t) → invalidate() while playing
    └─ cleanup                              → restore ALL originals, remove listeners
```

---

## 1. Boot decision matrix + the session flag

Decide ONCE, in render, before any effect (all three inputs are synchronous):

| condition (checked in this order) | mode | behavior |
|---|---|---|
| `matchMedia("(prefers-reduced-motion: reduce)").matches` | `instant` | No timeline, no camera move, no shutter. Apply end state §3-finals synchronously in the mount effect, set the session flag, **emit `boot-complete` immediately** (the prompt's hard rule: reduced motion still emits). |
| `sessionStorage.getItem("world:litanyPlayed") !== null` (try/catch → on storage error treat as **unplayed**, mirroring ModeToggle's best-effort pattern, ModeToggle.tsx:67-79) | `instant` | Same as above minus the flag write. This is the same-session revisit: ModeToggle's `router.push` round-trip (ModeToggle.tsx:171) remounted the island; CameraRig already restored the saved pose (CameraRig.tsx:232-247) — you must NOT touch the camera. |
| otherwise | `play` | The full §3 timeline. |

**Flag semantics:** `sessionStorage["world:litanyPlayed"] = "1"`, written **when the play
timeline STARTS** (mount effect), not at completion — so a `Cmd+\` exit mid-boot does not
replay the litany on return. Key is a new constant `LITANY_SESSION_KEY` exported from
`useLitanySequence.ts` (namespaced like `world:cameraPose` / `world:lastPageRoute`,
CameraRig.tsx:91, ModeToggle.tsx:35).

**`instant` mode always still emits `boot-complete`.** Even though `bootDone()` is already
`true` on revisits (module flag survives unmount, CameraRig.tsx:286), the emit clears
CameraRig's fresh 8s failsafe timer (:264-271) so it never fires its dev warning. Known
minor wart, accepted: CameraRig's `boot-complete` handler calls `focusStack.reset()`
(:273-279), so a revisit that saved a lantern-depth pose restores the CAMERA to the lantern
but the FOCUS stack to vestibule — the first Esc is a no-op. That reset-on-boot-complete is
CameraRig's frozen behavior, not yours to change.

---

## 2. The kindle strategy (the load-bearing design decision)

### 2.1 What the committed code rules out

- **A shared `bootProgress` signal that units read** — rejected. Trunk, Boughs, Lanterns,
  Embers, Fireflies, DustMotes, Atmosphere are all committed and read no such signal;
  threading one through means amending six frozen files. Maximal coupling for zero visual
  gain over §2.3.
- **Composer / exposure fade-from-black** — rejected on physics. Every bloom actor in the
  world is `toneMapped:false` (sap Trunk.tsx:49, bough cores Boughs.tsx:147, inlays
  Atmosphere.tsx:58, ember/lantern instanceColor paths, firefly material Fireflies.tsx:184).
  `gl.toneMappingExposure` does not touch `toneMapped:false` materials — the tree would
  glow at full brightness inside a "dark" room. Also PostFX is frozen as the ONLY composer
  with exactly two effects (PostFX.tsx:23-30); adding a fade pass is an amendment.
- **Whole-scene shutter only** — rejected as the sole mechanism. It gives fade-from-black
  but loses the signature per-bough sequential kindle (VISION.md:299-302). Kept as ONE
  beat of the design (the first 1000 ms) — see §2.2.
- **`visible` toggling per object** — rejected. WorldLabels toggles `visible` per frame
  itself (distance cull) and Lanterns' hero swap manages instance scale; fighting other
  units' visibility logic is the fragile version of this idea.

### 2.2 What we do instead (zero amendments)

**Opacity is the one dial every family already exposes and nothing else writes.** The one
per-frame material write in the whole committed world is Boughs' breath — and it writes
`coreMaterial.color` (`color.setScalar(mult)`, Boughs.tsx:220-226), NOT `.opacity`. So:

- The Litany snapshots each target material's original `opacity` (and `transparent` flag)
  once, sets opacity to 0 before first paint, and drives every value back up on the §3
  timeline. Materials that ship `transparent:false` (sap `MeshBasicMaterial` Trunk.tsx:47-50,
  bough-core merged `MeshBasicMaterial` Boughs.tsx:144-148, class-ring
  `MeshStandardMaterial` Lanterns.tsx:55-62) get `transparent = true` for the boot and
  restored at the end (toggling `transparent` changes blend/render-list state only — no
  program recompile, no `needsUpdate` dance).
- Alpha gates emission: with standard alpha blending, `opacity 0` fully hides emissive
  output AND its bloom contribution (Bloom reads the post-blend frame, PostFX.tsx:10-15).
  So dark means dark, bloom included.
- The floor (`MeshStandardMaterial`, lit-only, never blooms — Atmosphere.tsx:111-118) is
  revealed by ramping the two LIGHTS instead (key `pointLight` 0→2.2, moon
  `directionalLight` 0→0.35, Atmosphere.tsx:99-109) — the candle catching the room.
- The inlays need no snapshot: their frozen rest state IS opacity 0 (Atmosphere.tsx:57);
  the Litany walks `inlayRegistry` per its designed contract (§4).
- The first second of "true dark" is the Litany's own shutter quad (§0), because the room
  (floor under IBL `<Environment preset="night">`, Atmosphere.tsx:96, plus the Ledger,
  labels, Today panel — all tone-mapped parchment surfaces we deliberately do NOT
  choreograph) would otherwise be faintly visible at t=0.

### 2.3 The handle table (collected once by scene traversal)

Collect via `useThree(s => s.scene)` traversal in a layout effect. Every identifier below
is committed and stable:

| target | handle (committed) | animated value | rest value (snapshot) |
|---|---|---|---|
| Floor inlays (per area) | `inlayRegistry.get(areaId)` — walk via `layout.boughs` order (insertion order of the Map is the same, Atmosphere.tsx:69-80; `layout.boughs` is orderIndex-sorted, treeLayout.ts:122-129) | `opacity` 0→**1.0** + `color` scalar flash (§4) | opacity 0 by contract; color = brass |
| Trunk sap | group `name === "trunk"` (Trunk.tsx:69) → child mesh with `MeshBasicMaterial` (:72) | `opacity` 0→1 (+ transparent toggle) | opaque, color candleflame×1.4 |
| Trunk + dais brass | same group → meshes sharing the hologram `MeshPhysicalMaterial` (:70-71; one material, two meshes) | `opacity` 0→snapshot (0.14, hologram.ts:66-67,131) | 0.14 |
| Bough outer limbs (per area) | group `name === "boughs"` (Boughs.tsx:229) → meshes with `userData.kind === "bough"`, keyed by `userData.areaId` (:235) | `opacity` 0→snapshot (0.14), staggered per area (§4) | 0.14 |
| Bough core veins (merged, ONE material) | same group → the mesh WITHOUT `userData.kind` (:242-244) | `opacity` 0→1 (+ transparent toggle). Never touch `.color` — the breath owns it (:225) | opaque |
| Lanterns | group `name === "lanterns"` (Lanterns.tsx:109) → InstancedMesh materials (module-stable `lanternMaterial` :47, `classRingMaterial` :55) | `opacity` 0→snapshots (0.14 / 1 + transparent toggle on the ring) | 0.14 / opaque |
| Embers + tapers | meshes `name === "embers"` (Embers.tsx:292) / `"ember-filaments"` (:323) | `opacity` 0→snapshots (0.55 / 0.5, Embers.tsx:261-266, 310-314) | 0.55 / 0.5 |
| Fireflies | mesh `name === "fireflies"` (Fireflies.tsx:193) | `opacity` 0→1 (already `transparent:true`, :185) | 1 |
| Dust motes | the ONLY `THREE.Points` in the MVP scene (DustMotes.tsx:131; identify by `.isPoints`) | `opacity` 0→snapshot (0.55, :69) | 0.55 |
| Key light | the ONLY `.isPointLight` (Atmosphere.tsx:99-104) | `intensity` 0→snapshot (2.2) | 2.2 |
| Moon fill | the ONLY `.isDirectionalLight` (Atmosphere.tsx:105-109) | `intensity` 0→snapshot (0.35) | 0.35 |

NOT choreographed (deliberately): WorldLabels, Ledger, TodayPanel, JarvisRing. They are
dim tone-mapped surfaces that simply appear as the shutter thins (~0.3-1.0 s) — quiet
furniture, not actors. The VISION beat of "the Ledger writes itself" (VISION.md:303-304)
is carried by the Litany's OWN greeting line instead (§6); the committed Ledger renders
its full line declaratively (Ledger.tsx:90,148) and amending it is not worth one beat.

### 2.4 Collection discipline

- **`useLayoutEffect`, keyed on `[layout]`.** Layout effects run synchronously before the
  browser paints, so the zeroing is invisible even though the world mounted bright.
- **Snapshot-once, restore-on-cleanup.** Cleanup restores every snapshot (opacity,
  transparent, intensity) — this makes StrictMode's double-invoke idempotent (collect →
  zero → restore → re-collect → re-zero) and guarantees a mid-boot unmount never leaves
  the world dark.
- **Layout change mid-boot** (Realtime echo during the 6 s): Boughs rebuilds its meshes
  and materials on layout identity change (Boughs.tsx:157-169). The effect's `[layout]`
  key re-runs collection, re-snapshots the NEW materials, and immediately calls
  `apply(currentT)` + `invalidate()` so fresh materials never flash bright for more than
  the current commit.
- **`apply(t)` is stateless**: it computes every animated value from absolute `t` on every
  call. That makes skip trivial (`apply(T_END)`), makes dropped frames harmless, and
  needs no per-target bookkeeping.

---

## 3. The timeline (T_END = 5800 ms; keyframes, exact)

All times in ms from `t0 = performance.now()` at play start. Easings: `outCubic(u) =
1-(1-u)³`, `inOutQuad`, linear where noted. `N = layout.boughs.length`,
`S = N > 1 ? min(320, 1900/(N-1)) : 0` (the stagger step, §4).

| t (ms) | beat | exact behavior |
|---|---|---|
| 0 | **conduct** | Session flag written. All §2.3 targets zeroed (already done pre-paint). `cameraBus.flyTo(LITANY_START_POSE, 600)` issued — the reposition happens behind the opaque shutter (§5). One `invalidate()` kick; the loop self-sustains from here. |
| 0–300 | **true dark** | Shutter opacity held at 1. The chamber does not exist yet. |
| 200–1200 | **the candle-point** | Trunk sap opacity 0→1 `outCubic` — the single vein of light on the dais, first thing alive (VISION.md:297-298). |
| 300–1000 | **the room breathes in** | Shutter opacity 1→0 `inOutQuad`. Set `shutter.visible = false` at 1000. |
| 600–1800 | trunk + dais brass | opacity 0→0.14 `outCubic`. |
| 700–2600 | **the candle catches** | Key pointLight intensity 0→2.2 `inOutQuad` — the walnut floor emerges. |
| 900 + i·S (each 800 ms) | **the inlays walk** — the signature move | Inlay i ignites per §4: opacity 0→1 over 450 ms `outCubic`; color scalar 2.6→1.0 over 800 ms (HDR flash > 1 blooms per Atmosphere.tsx:58, then settles to plain brass). Last ignition starts ≤2800. |
| 900 | soft wake tone | `worldEvents.emit("chime", { kind: "two-note" })` — best-effort: U-18's AudioContext is gesture-unlocked (PLAN.md:548), so on a true cold boot this is silent; after any prior same-tab gesture it plays. Never blocks anything. |
| (900 + i·S) + 450 (each 700 ms) | **boughs fade up in sequence** | Bough i's outer limb opacity 0→0.14 `outCubic` — each limb kindles 450 ms after its own floor line reaches it, root-to-alcove reading preserved. |
| 1400–3200 | dust motes | opacity 0→0.55 linear. |
| 1600–3900 | core veins | merged core opacity 0→1 `inOutQuad` (one material — the per-area sequencing is carried by the inlays + outer limbs; the vein brightening globally underneath reads as sap rising). |
| 2000–3800 | moonlight | directionalLight intensity 0→0.35 `inOutQuad`. |
| 2900–4100 | **lanterns bloom** | lantern material opacity 0→0.14 `outCubic`; class rings 0→1 over 3100–4300. |
| 3400 | **the establishing move** | `cameraBus.flyTo(VESTIBULE_POSE, 900)` — the push-in from the low pulled-back start to the money shot (§5). Settles ≈4.9–5.4 s. |
| 3500–4700 | **embers kindle** | ember opacity 0→0.55 `outCubic`; tapers 0→0.5 over 3600–4800. Pulse/shimmer are already running GPU-side (Embers' clock advances on every demanded frame, Embers.tsx:727-730) — they surface as the opacity rises. |
| 3800 → 3800+45·len | **the whispered line** | Greeting types at 45 ms/char (§6). For the ~31-char line, done ≈5.2 s. |
| 4300–5100 | **fireflies blink awake** | firefly material opacity 0→1 `outCubic` (VISION.md:302-303). |
| 5300–5800 | the line exhales | Greeting `fillOpacity` 1→0 `inOutQuad`; `visible = false` at 5800. |
| 5800 | **finals + restore** | `apply(T_END)` (all values exactly at rest), restore `transparent` flags (sap, core, ring), stop self-invalidating. |
| ≤6800 | **`boot-complete`** | Emitted per §7's rule: after BOTH `t ≥ 5800` AND the establishing flight's promise resolves, with a hard ceiling of t=6800 (`Promise.race`). |

Felt duration ≈ 5.8–6.0 s. Hard worst case 6.8 s — 1.2 s inside CameraRig's 8 s failsafe.

---

## 4. The inlayRegistry stagger algorithm (exact)

Walk `layout.boughs` (already orderIndex-sorted — School first on a Monday is whatever the
user's order says, treeLayout.ts:122-129, 192-194) and look each `areaId` up in
`inlayRegistry`. Do NOT iterate the Map directly — the layout array is the order contract;
the Map is the handle store. Skip (and warn once in dev) any areaId missing from the
registry (an archive race; Atmosphere prunes, Atmosphere.tsx:83-91).

For inlay index `i` of `N`:

```
S        = N > 1 ? min(320, 1900 / (N - 1)) : 0      // last start ≤ 900 + 1900 = 2800
start_i  = 900 + i * S
u        = clamp((t - start_i) / 800, 0, 1)          // 800 ms ignition envelope
opacity  = outCubic(clamp((t - start_i) / 450, 0, 1))            // 0 → 1.0 (final)
colorMul = 1 + 1.6 * (1 - u)²                                     // 2.6 → 1.0
material.opacity = opacity
material.color.copy(BRASS_LINEAR).multiplyScalar(colorMul)        // preallocated scratch
```

- `BRASS_LINEAR = new THREE.Color(STUDIOLO.brass)` — module-level constant + one scratch
  `THREE.Color`; zero allocation in the loop.
- The `colorMul` overshoot is the "racing" read: each strip flashes past white-hot brass
  (>1 → blooms, by the frozen contract Atmosphere.tsx:20-21,58) and cools to plain
  marquetry as the next strip ignites. Final state: `opacity 1`, `color` = base brass —
  exactly the "walks the map, staggering opacity 0→1" contract (Atmosphere.tsx:17-21).
- At 6 areas: S=320 → starts at 900/1220/1540/1860/2180/2500. At 2 areas: S=320. At 9+:
  S compresses so the last ignition always starts ≤2800.
- Bough limb `i` reuses `start_i` (+450 ms) — the floor line "reaches" the trunk and its
  limb catches. One schedule, two actors.

Export the pure schedule (`litanySchedule(n): { inlayStart: number[]; boughStart: number[] }`)
for the Vitest below.

---

## 5. The establishing camera move (and why it's shaped this way)

**Constraint discovered in the frozen code:** `cameraBus.flyTo` clamps
`smoothTime = clamp(ms/2000, 0.30, 0.45)` (CameraRig.tsx:157) — a felt glide is capped at
~900 ms no matter what `ms` you pass. A 3-second cinematic dolly through the bus is
impossible, and the bus is the ONLY sanctioned way to move the camera (CameraRig.tsx:12).
So the boot uses **two short flights hidden/framed by the light choreography** instead of
one long one:

1. **Cut-to-start (invisible).** CameraRig's mount already did an instant
   `setLookAt(...VESTIBULE_POSE, false)` (CameraRig.tsx:251-261 — no saved pose exists on
   a cold boot). At t=0 the Litany issues `cameraBus.flyTo(LITANY_START_POSE, 600)`. The
   ~600 ms felt reposition happens entirely behind the opaque shutter (fade starts at 300,
   mostly opaque till ~600); any visible tail reads as intentional drift in the dark.

   ```
   LITANY_START_POSE = { position: [0, 1.15, 8.2], target: [0, 1.5, 0] }
   ```
   Low and pulled back — the eye of someone who just opened the door: dais at center
   frame, tree crown out of frame above.

2. **The push-in (the move).** At t=3400: `cameraBus.flyTo(VESTIBULE_POSE, 900)` —
   forward 2.2 m and the eye-line lifts from the dais (target y 1.5) up the trunk toward
   the bough crown (target y 2.2, CameraRig.tsx:100-103). SmoothDamp's long exponential
   tail means the camera is still settling as the embers/fireflies kindle — the room
   *arrives* around you. The flyTo promise resolves on camera-controls' `rest` event
   (raced with `sleep(900+2000)` internally, CameraRig.tsx:171), ≈ t=4900–5400, worst
   case t=6300.

- Flight 2 superseding flight 1 is safe by design (the `flightSeq` token,
  CameraRig.tsx:97,174-175).
- The boot gate means no user navigation can interleave (CameraRig ignores focus changes
  until `bootDone()`, :301; useWorldKeys returns pre-boot, :37).
- `instant` mode issues NO flights — CameraRig's own mount pose (vestibule or restored)
  is already correct.
- The whole move is driven **purely via cameraBus** — the Litany never touches
  `controlsInstance`, never changes `smoothTime`, needs no CameraRig amendment.

---

## 6. The typewriter line

One drei `<Text>` owned by the Litany (the PLAN §6 U-17 SDF typewriter, PLAN.md:539),
NOT the Ledger (see §2.3 rationale).

- **Content**, composed once at mount (export `composeGreeting(now: Date): string` for
  tests): hour < 12 → `"Good morning"`, < 18 → `"Good afternoon"`, else `"Good evening"`;
  then the date via `date-fns` `format(now, "EEEE, MMMM do")` (already a workspace dep):

  > `Good evening. Monday, July 6th.`

  Every glyph is in `WORLD_GLYPH_SET` (fonts.ts:30-36). No name ("Filippo" is not in any
  data contract the world holds — the greeting stays second-person-silent, which is more
  studiolo anyway).
- **Rendering**: `font={EB_GARAMOND_ITALIC}`, `fontSize 0.07`, `color parchment`,
  `anchorX/Y center`, `sdfGlyphSize 64`, `renderOrder 1001` + depthTest/depthWrite off via
  the same `onSync` material patch the Ledger uses (Ledger.tsx:135-146). Tone-mapped fill —
  it must NOT bloom (ink, not light — Ledger.tsx:26-29 rationale applies verbatim).
- **Anchoring**: the Litany's single `anchorGroup` copies `camera.position/quaternion`
  each frame in its own `useFrame` (the Ledger pattern, Ledger.tsx:106-114) — only while
  `playing`, and frames are already being demanded continuously by the timeline, so this
  is free. Local offset `[0, -0.42, -1.6]` — above the Ledger's `[0, -0.62, -1.6]`
  (Ledger.tsx:49), center-low, a whisper not a headline. The shutter quad
  (`PlaneGeometry(8, 8)` at `[0, 0, -1]`, comfortably covering fov 55 at any aspect)
  lives in the same group.
- **The typewriter mechanism** (PLAN.md:539, verbatim intent): keep
  `charCount = floor((t - 3800) / 45)` in the frame loop; when it changes (throttled by
  integer comparison — NOT per-frame), mutate `textRef.current.text =
  full.slice(0, charCount)` and call `textRef.current.sync()`. drei's `<Text>` ref exposes
  the troika mesh; `.sync()` schedules the SDF layout; the already-running demand loop
  paints it. Zero React state. Glyphs never pop: `preloadWorldFonts()` primed the full
  atlas (fonts.ts:49-68).
- Fade `fillOpacity` 1→0 over 5300–5800 via the same ref (troika exposes `fillOpacity`),
  then `visible = false`.

---

## 7. `boot-complete` emit timing (and the 8 s failsafe fit)

Emit **exactly once per mount**, guarded by a ref, from whichever comes first:

```
emitAt = min( max(timelineDone(5800), establishingFlightSettled), hardCeiling(6800) )
skip() → emit immediately (§8)
instant mode → emit in the mount effect, synchronously after applying finals
```

Implementation: `Promise.race([ Promise.all([timelineDone, flight2Promise]),
sleep(3000).then(...) ])` armed at t=3800 — but a plain absolute check in the frame loop
(`t ≥ 5800 && flightSettledRef.current`, plus a 6800 hard check) is simpler and
allocation-free; prefer the loop check. Budget proof against CameraRig's failsafe
(`BOOT_FAILSAFE_MS = 8000`, CameraRig.tsx:92):

| path | emit time |
|---|---|
| normal | ≈5.8–5.9 s (flight rests ≈5.4 s < timeline end) |
| slow rest (flyTo's internal race worst case: 3400 + 900 + 2000) | 6.3 s |
| hard ceiling (flight promise lost entirely) | 6.8 s |
| skip / instant / reduced-motion | < 50 ms after trigger |

All ≥1.2 s inside the failsafe. On emit, CameraRig resets focus, flips `_bootDone`, and
clears the failsafe (CameraRig.tsx:273-279) — interactivity unlocks. After emitting: the
frame loop early-returns forever (no invalidate), both Litany objects are
`visible = false`, and the Litany contributes zero draw calls and zero rAF — the world's
sleep discipline is untouched (PLAN §7.5).

Dispose the shutter's geometry/material and let drei dispose the Text on world unmount
(standard unmount effect); never dispose anything from §2.3 — those belong to their units.

---

## 8. Skip logic

### 8.1 Any-key / any-click (during play)

- Register in the mount effect, only in `play` mode, and remove on completion/cleanup:
  `window.addEventListener("keydown", onSkip, { capture: true })` and
  `window.addEventListener("pointerdown", onSkip, { capture: true, passive: true })`.
- **Every key and every button skips.** No modifier filtering (pressing `Meta` alone
  skips — fine; the flag is already set so a `Cmd+\` exit loses nothing). No
  `preventDefault`, no `stopPropagation`: the world's other capture listener already
  stands down pre-boot (useWorldKeys.ts:37) and explicitly defers the any-key skip to you
  (:94-95); ModeToggle's `Cmd+\` must keep working THROUGH a skip (skip + navigate is
  correct behavior).
- `skip()` does, synchronously: set clock so `t = T_END` → `apply(T_END)` → restore
  transparent flags → hide shutter/greeting → `cameraBus.flyTo(VESTIBULE_POSE, 600)`
  (a fast comfortable settle from wherever the boot camera was; instant cuts aren't
  reachable through the frozen bus and a 600 ms ease is kinder anyway) →
  `worldEvents.emit("boot-complete")` → remove skip listeners → `invalidate()`.
- Emit does NOT wait for the settle: the gate opens immediately; any follow-up user
  flight simply supersedes the settle (flightSeq token). Known, intended interaction:
  a pointer-skip's subsequent `click` on a bough lands AFTER `boot-complete` (pointerdown
  precedes click), so the world may immediately glide to the clicked bough — the world
  answering the click that woke it. Correct, keep it.
- Idempotent: `skip()` after done is a no-op (check the emitted ref first).

### 8.2 Same-session revisit

Covered by §1's decision matrix + flag. Verified against the actual navigation mechanism:
ModeToggle stores the 2D route and `router.push`es (ModeToggle.tsx:64-92); the island
remounts; `sessionStorage` persists per-tab; `mode = "instant"` — no replay, no camera
touch, immediate emit.

---

## 9. Reduced motion

`instant` mode, first row of §1's matrix (own check via `matchMedia`, mirroring
CameraRig.tsx:118-123 — U-19 will centralize into `useWorldPrefs` later; keep your check a
single named function so U-19's diff is one line, same courtesy as CameraRig's). Behavior:
no shutter (never visible), no greeting, no camera flights, no timeline; apply end state,
set flag, emit `boot-complete` in the mount effect. Total added frames: the one
`invalidate()` after applying finals. The prompt's hard rule — instant to end state,
**still emit** — satisfied by construction.

---

## 10. Demand-mode / perf discipline

- **While playing**: the Litany's `useFrame` computes `t = performance.now() - t0`, calls
  `apply(t)`, copies the camera transform onto the anchor group, and calls `invalidate()`
  — a self-sustaining 60 fps loop for ≤6 s, exactly the sanctioned "active runtime"
  pattern (PLAN §7.5(e); same shape as Embers' ascent loop, Embers.tsx:832-834). One
  deviation from the PLAN sketch, deliberate: PLAN.md:539 sketched a `useSpring` duration
  timeline; a plain clock in ONE `useFrame` is chosen instead because the timeline is
  linear (no springiness anywhere), skip needs an absolute-time jump (`api.set` round-trip
  is clumsier than `t0 = -∞`), and it matches the house imperative-runtime style of every
  committed animated unit. No new dependency usage either way.
- **After done/skip/instant**: `useFrame` early-returns on the first check (`playing ===
  false`, a ref) — cost one boolean per demanded frame, zero demanded frames caused. The
  world sleeps on the committed units' own terms.
- **Zero allocation in the loop**: module-level scratch `THREE.Color` for the inlay flash;
  all handle arrays/Maps built at collection time; `apply(t)` writes numbers only.
- **Zero per-frame React state**; the ONLY React in this unit is the mount-time mode
  decision. No setState anywhere.
- **Draw calls**: +2 while the shutter/greeting are visible (within §7.2's ≥60 headroom),
  0 after. No lights added, no materials created beyond the shutter's.
- **The boot animates, so it demands frames; it ends, so it sleeps** — acceptance test in
  §13 makes this measurable.

---

## 11. TypeScript signatures (write exactly these)

```ts
// boot/useLitanySequence.ts
export const LITANY_SESSION_KEY = "world:litanyPlayed";
export type LitanyMode = "play" | "instant";

/** Pure — decided once per mount, in render. Exported for tests. */
export function decideLitanyMode(): LitanyMode;

/** Pure schedule for the signature stagger (§4). Exported for tests. */
export function litanySchedule(boughCount: number): {
  inlayStart: number[];   // 900 + i*S
  boughStart: number[];   // inlayStart[i] + 450
};

/** Pure greeting composer (§6). Exported for tests. */
export function composeGreeting(now: Date): string;

export interface LitanySequenceOptions {
  mode: LitanyMode;
  anchor: React.RefObject<THREE.Group | null>;       // camera-copied group
  shutter: React.RefObject<THREE.Mesh | null>;       // the Nightwalnut quad
  greeting: React.RefObject<TroikaText | null>;      // drei <Text> ref (troika mesh:
                                                     //   .text, .sync(), .fillOpacity)
}

/** The conductor. Collects targets, runs the timeline, owns skip + emit. */
export function useLitanySequence(opts: LitanySequenceOptions): { skip(): void };

// boot/Litany.tsx
/** Mounts the two Litany-owned scene objects and the conductor. Renders ~nothing
 *  after boot (both objects visible=false; zero draw calls, zero rAF). */
export function Litany(): React.ReactElement;
```

Internal (not exported, but design-fixed): `interface KindleTargets` holding
`{ inlays: { areaId: string; material: THREE.MeshBasicMaterial }[]; boughOuter: Map<string,
THREE.MeshPhysicalMaterial>; core; sap; brass; lanterns; rings; embers; tapers; fireflies;
dust; keyLight; moonLight }` each paired with its snapshot; `collectTargets(scene, layout):
KindleTargets`; `applyTimeline(t, targets, refs): void` (stateless, §2.4);
`LITANY_START_POSE: CameraPose` (§5).

---

## 12. Ordered build checklist (atomic commits, explicit pathspecs)

1. **`boot/useLitanySequence.ts` — pure layer.** `LITANY_SESSION_KEY`, `decideLitanyMode`,
   `litanySchedule`, `composeGreeting`, easings, `LITANY_START_POSE`, the keyframe
   constants table (§3) as named consts. Commit.
2. **Vitest** (`boot/__tests__/useLitanySequence.test.ts`): `litanySchedule` truth table
   (N=1,2,6,9,12 — last start ≤2800, monotonic, bough=inlay+450); `composeGreeting`
   morning/afternoon/evening + date formatting; `decideLitanyMode` under mocked
   matchMedia/sessionStorage. Commit.
3. **Collection + apply.** `collectTargets` (traversal per §2.3 handle table, snapshots,
   dev-warn on missing handles), `applyTimeline` (all §3 keyframes, allocation-free).
   Commit.
4. **The conductor hook.** Layout-effect zeroing keyed on `[layout]`, mount effect
   (flag, flight 1, chime, skip listeners), frame loop (clock → apply → anchor copy →
   invalidate), flight 2 dispatch at 3400, typewriter mutation+`sync()`, emit rule (§7),
   skip (§8), instant mode (§1/§9), full snapshot restore on cleanup. Commit.
5. **`boot/Litany.tsx`.** Anchor group + shutter quad + greeting `<Text>`, refs into the
   hook, dispose-own-objects unmount effect. Commit.
6. **Manual verification pass** (cold boot in dev: timeline order, 60 fps, skip via key +
   click, revisit skip, reduced-motion instant, idle rAF=0 after boot, `gl.info` draw
   delta 0 post-boot). Fix, commit.
7. Hand `<Litany/>` placement note to the orchestrator (WorldScene wave-4 slot, after
   `<TodayPanel/>`, before `<JarvisRing/>` — §0 preamble). NOT your commit.

---

## 13. Acceptance

- [ ] Cold `/world` load: darkness → candle-point (sap) → inlays ignite one-per-area in
      sidebar order with a brass bloom-flash each → each bough limb fades up 450 ms after
      its inlay → lights raise the floor → lanterns, embers (already pulsing as they
      surface), fireflies → the italic greeting types itself at 45 ms/char and exhales —
      all in ≈5.8 s at 60 fps, ending on the exact `VESTIBULE_POSE` money shot.
- [ ] `boot-complete` observed (once) between 5.8 s and 6.8 s on every path; CameraRig's
      8 s failsafe warning never fires; clicking a bough after boot glides normally.
- [ ] ANY key or pointer-down mid-litany: end state within one frame, camera settles to
      the vestibule in ≤600 ms felt, `boot-complete` emitted immediately, no console
      errors, no half-dark materials (spot-check ember opacity 0.55, lantern 0.14,
      inlays 1.0, sap/core/ring `transparent` restored).
- [ ] Second `/world` visit in the same tab session (via `Cmd+\` round-trip): no litany,
      no camera movement beyond CameraRig's own restore, `boot-complete` emitted
      immediately.
- [ ] macOS Reduce Motion ON: instant end state, still emits `boot-complete`, no shutter
      ever visible.
- [ ] 10 s hands-off after boot: zero rAF from this unit (devtools performance trace);
      `gl.info.render.calls` identical before/after Litany completion (+0 post-boot).
- [ ] Vitest: schedule/greeting/mode suites green.
- [ ] Unmount mid-boot (navigate away at ~3 s) and remount: no dark leftovers, no double
      emit, no listener leaks (StrictMode clean).

*— Fable. The chamber is dark, the match is struck. Hand the torch to Opus.*
