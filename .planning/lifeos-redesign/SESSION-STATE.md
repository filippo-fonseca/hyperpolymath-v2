# bgsd session — LifeOS Spatial Redesign (First-Person POV)

**Scale:** project. **Conductor:** Kiwi (Opus). **Persona pill on every message.**

## Model doctrine (user-mandated)
- **Fable** (`claude-fable-5-thinking-high`): planner / creative director / orchestrator. **NEVER writes code** — markdown vision/plans only (expensive on Fable). Leverage extensively.
- **Fable pre-plan granularity:** PHASE 1 → per-unit seeds for complex units (as done). PHASE 2+ → **ONE Fable pre-plan per PHASE is enough** (user directive 2026-07-06); do NOT spawn a Fable seed per wave/per unit after Phase 1. Opus executors work from that single phase memo + the frozen contracts.
- **Opus**: all code (executor/pipeline). Conductor runs on Opus.
- **Sonnet**: docs / medium value. **Haiku**: trivial.

## The hard gate (user-requested)
Do NOT spawn any code-writing Opus pipeline agent until the user has reviewed Fable's VISION + build plan and approved. Check in after "the fable stuff."

## Preserve vs replace
- **Preserve:** `apps/web/components/areas/AreasTree.tsx` (areas tree) + its `getSidebarTree` data contract + `apps/web/app/actions/areas.ts`.
- **Replace:** all `apps/web/components/lifeos/*` (except areas embed) + `/lifeos` page composition.
- Agent is **JARVIS** via `POST /api/jarvis` SSE (`streamJarvis`). No 3D libs installed yet.

## Vision (user's words)
First-person POV video-game interface to run his life. Swipeable holographic panels in a workspace; widgets live in a 3D world; areas tree = spatial spine. JARVIS/Iron-Man energy fused with brand warmth (EB Garamond, Renaissance/journal). Inspo: Iron-Man HUD, JARVIS holographic desk, floating 3D orb, warehouse digital-twin, life dashboard.

## Agent roster
- ✅ `lifeos-map` (explore) → `CODEBASE-MAP.md`.
- ✅ `spatial-web-stack` (generalPurpose) → `TECH.md`. Verdict: R3F v9 + drei v10 + @react-three/uikit, ssr:false island, WebGL v1, 2D-primary.
- ✅ `lifeos-world` Fable-Vision → `VISION.md`. Concept: **"The Studiolo"** (areas tree = living tree world; projects=lanterns, tasks=embers, captures=fireflies, calendar=Meridian Ring, Jarvis=cyan ring). MVP slice = "The Tree at Night."
- ✅ GATE 1 (direction) — user LOVED "The Studiolo". Direction locked.
- ✅ `build-plan` Fable-Architect (Fable 5) → `PLAN.md`. 21 Phase-1 units, 5 waves, per-unit APIs/signatures/difficulty, hard perf budget, model routing (8 Fable pre-plans), verified data contracts, verifier checklist.
- 🔶 GATE 2 (plan approval) — awaiting user sign-off before Opus pipeline.

## Execution plan (post-GATE-2)
Phase 1 waves (file-disjoint, parallel within a wave):
- Wave 1: U-01 deps-config, U-02 island-scaffold, U-03 tokens-materials*, U-04 data-bridge*, U-05 assets(Haiku)
- Wave 2: U-06 tree-geometry, U-07 camera-rig*, U-08 atmosphere-post, U-09 ember-system*, U-10 lantern-system
- Wave 3: U-11 labels-ledger, U-12 today-panel, U-13 jarvis-ring*, U-14 firefly-system*, U-15 mode-toggle
- Wave 4: U-16 jarvis-routing-choreography*, U-17 litany-bootup*, U-18 chimes, U-19 reduced-motion-gating
- Wave 5: U-20 perf-hardening, U-21 docs-changelog(Sonnet)
(* = gets a Fable pre-plan seed before Opus build. Executors: Opus xhigh. Contract freeze after Wave 1: treeLayout/mappings/tokens/worldEvents/buses.)

## ✅ GATE 2 approved — BUILDING. Branch: `lifeos-studiolo` (never commit main; no push w/o approval).

## MODE: AUTONOMOUS CONDUCT — user is away; drive all waves without asking permission. bgsd workflow, subagents, atomic commits.

## Live status
### ✅ Wave 1 — DONE + integrated
- U-01 deps-config 74744b4 · U-05 assets fe44ab6 · U-02 island-scaffold 4d4cfd1 · fonts fix 8be520c · U-03 materials 68a9b36 · U-04 data-bridge (2 commits, 38 tests green).
- Integration: WorldDataProvider mounted in WorldScene 974670e · docs(planning) 5f9f3fa.
- FROZEN contracts (do not break): `worldEvents` 5 names (task-completed/capture-created/chime/jarvis-action/boot-complete); `CameraBus`/`CameraPose` (U-07 implements `export const cameraBus`); `FireflyBus`/`FlightRequest` (U-14); `solveTreeLayout`/`boughPoint`/`emberShellPosition`/`trunkShellPosition`/`classifyTask`/`hasFilament`/`filamentScaleY`/`buildEmberSlots`/`diffSnapshots`/`useWorldData`/`hash01`; `EMBER_VISUALS`; shader treaty in hologram.ts (`chainOnBeforeCompile`, `aState` itemSize2, cache key `ember@1`, embers own material instance).
- Capture type is `CaptureWithLinks`; query keys: areas `tableKey("areas",uid)`, tasks `tableKey("tasks",uid)`, captures `[...tableKey("captures",uid),null]`.

### 🔄 Wave 2 — IN FLIGHT
DONE + committed:
- 🔧 U-06 tree-geometry 6dff37c → tree/{Trunk,Boughs}.tsx; exports `boughFocusPose`.
- 🔧 U-08 atmosphere-post f08b9ad → env/{Atmosphere,PostFX,DustMotes}.tsx; exports `inlayRegistry`; ONLY EffectComposer.
- 🔧 U-10 lantern-system 34e17c4 → tree/Lanterns.tsx; exports `lanternPickMap`; `useFocusedLanternId()` stub for U-07.
- 🧠 U-07 pre-plan preplans/U-07-camera-rig.md · 🧠 U-09 pre-plan preplans/U-09-ember-system.md
STILL RUNNING (opus execs, disjoint files):
- 🔧 U-07 camera-rig → e2a0b45f-be55-4a56-b4d6-b53838d3826f → camera/{useFocusStack,CameraRig,useWorldKeys}. Exports `cameraBus`/`focusStack`/`useFocusStack`/`VESTIBULE_POSE`/`lanternFocusPose`/`bootDone`. Replaces U-10 `useFocusedLanternId()` stub — verify after.
- 🔧 U-09 ember-system → e83f70e1-8239-47cf-8a17-db516548a3ec → tree/Embers.tsx; exports `Embers`/`emberPickMap`; adds ember@1 shader chunk.

### Deferred perf notes (for U-20 perf-hardening)
- U-08 inlayRegistry is per-area material → 1 draw call/area. ≤6 areas fine; a 9-area tree pushes atmosphere >8. If needed, batch inlay strips into one merged/instanced mesh while keeping per-area material identity for the Litany walk.

### ✅ Wave 2 — DONE + integrated + build-verified
- U-06 6dff37c · U-08 f08b9ad · U-10 34e17c4 · U-07 (2 commits) · U-09 ba47b12 · scene assembly 7fbdcaf · click wiring 94149d6.
- Font blocker fixed: troika-three-text@0.52.4 added + ambient d.ts; `a961651`. drei has NO `preloadFont` export.
- `pnpm --filter web build` GREEN (36s); `/world` emits as dynamic route; full app compiles. tsc clean except `tests/api-jarvis-tts.test.ts` baseline.

### 🔄 Wave 3 — IN FLIGHT
🧠 Fable pre-plans (docs only, model-pinned):
- U-13 jarvis-ring → 11060255-9afb-491a-966b-213c789516b6 → preplans/U-13-jarvis-ring.md
- U-14 firefly-system → 2738852e-1b57-4b81-a975-9946dd773d66 → preplans/U-14-firefly-system.md
🔧 Opus execs (disjoint files, none touch WorldScene):
- U-11 labels-ledger → 26548036-40e4-4e06-8a19-b1cd2eca3cec → text/{WorldLabels,Ledger}.tsx
- U-12 today-panel → b736767d-ca4c-41a8-b8b0-ae7397b874f6 → panels/TodayPanel.tsx (reuses real task completion action)
- U-15 mode-toggle → b46d3240-0035-4fda-acd6-89b103b28a71 → Cmd+\ Page↔World (may edit shell layout — its own domain)

### ✅ Wave 3 — DONE + integrated + build-verified
- U-11 4d6566e/752354e · U-12 8137a2f · U-15 71ceea4 · U-13 (6 commits) · U-14 f88aa36 · scene mount ae2dd32.
- `pnpm --filter web build` GREEN; /world emits. U-13 added `/world` guard to GlobalJarvisDialog.tsx (Cmd+K owned by ring on world route).

### 🔄 Wave 4 — IN FLIGHT (3 execs; U-19 GATED for last)
- 🧠 pre-plans done: preplans/U-16-jarvis-choreography.md, preplans/U-17-litany-bootup.md.
- 🔧 U-16 jarvis-choreography → 7d37da71-1127-4089-b556-b85e7fe9cff7 → jarvis/{useJarvisChoreography.ts,LightThread.tsx} + export seams in JarvisRing.tsx & Fireflies.tsx (ringWorldOrigin, captureSpawnPosition). ZERO invalidation. Mount deferred to boundary.
- 🔧 U-17 litany-bootup → 0c92d3b2-6a21-4f42-b907-cdfc4bb5fb76 → boot/{Litany.tsx,useLitanySequence.ts}+tests. Emits boot-complete ≤6.8s. Zero contract amendments.
- 🔧 U-18 chimes → 69e5e09c-2fd5-4ce0-877d-0c4490c045b9 → audio/{Chimes.tsx,synth.ts}. WebAudio synth, gesture-unlock, subscribes worldEvents chime.
- ⏳ U-19 reduced-motion-gating — HELD: rewires `prefersReducedMotion()` seam → central `useWorldPrefs` across CameraRig/Embers/Fireflies/JarvisRing/LightThread/Litany/Chimes. Must run AFTER U-16/17/18 committed (edits their files). Launch solo, then boundary.

### ✅ Wave 4 — DONE + integrated + build-verified
- U-18 chimes 5752c4e · U-16 choreography (4 commits, 16/16 resolver tests) · U-17 litany (5 commits, 39/39 tests) · scene mount afc8d54.
- build GREEN; /world emits. Final WorldScene tail: …TodayPanel, JarvisChoreographer, Litany, JarvisRing, PostFX; Chimes after CameraRig.

### 🔄 U-19 reduced-motion-gating — IN FLIGHT (solo)
- e3c9b9b8-336a-446b-964b-fc8c6b48b338 → prefs/useWorldPrefs + rewire prefersReducedMotion seams across units. Verify tsc+build.

### ✅ Wave 5 — DONE + integrated + build-verified
- U-20 perf-hardening (3 commits e99fed3/c540d4a/a9f596b): adaptive-resolution PerfGovernor (0 draw calls, 0 idle rAF), camera-pose SAVE→sessionStorage, inlay non-batching decision documented.
- U-21 docs-changelog 011e420: Studiolo architecture README + changelog.
- U-19 reduced-motion (7c5cbae/ec1025d): central `useWorldPrefs` reduced-motion source; all seams rewired.

## ✅ PHASE 1 COMPLETE — "The Tree at Night" (MVP) — BUILD GREEN
**All 21 units, all 5 waves committed + integrated.** Final integration gate (whole branch assembled together) passed 2026-07-06.
- **Branch:** `lifeos-studiolo` (never pushed; main untouched).
- **Final commit:** `a9f596b` (`a9f596b0335172ec0aac5d732da2c2bd815d658b`) — 48 commits ahead of main.
- **tsc:** clean except the 6 pre-existing `tests/api-jarvis-tts.test.ts` NextRequest-typing baseline errors — **ZERO new errors from any world file.**
- **`pnpm --filter web build`:** exit 0; `/world` emitted as a dynamic route; full app compiles. Only pre-existing warnings (wiki `::highlight()` CSS, next.config NFT trace) — none from world.
- **World Vitest:** 93/93 green across 5 files (treeLayout, mappings, diffing, useLitanySequence, useJarvisChoreography). (Repo-wide suite has 33 pre-existing failures in DB/RLS + jarvis/voice suites — none in `components/world/**`, none introduced by this build.)
- **WorldScene composition audit:** PASS — all systems mounted; ordering invariants hold (PostFX LAST, JarvisRing immediately before PostFX, PerfGovernor before JarvisRing).

### ⏳ PENDING HUMAN GATE (before any push/merge)
Authenticated in-browser smoke test (needs Filippo's Supabase session) + explicit approval. Static verification is complete; the remaining PLAN §11 items are runtime/visual and require a logged-in `/world` load:
1. `/world` renders (trunk + boughs/lanterns/embers from live data).
2. Litany boot plays ~6 s on cold load; any key skips; same-session revisit skips.
3. Click bough/lantern → camera glides; Esc walks back; `1–9` fly to areas.
4. Complete a task (Today panel + 2D other tab) → ember ascends + glass bell.
5. `Cmd+K` → Jarvis ring streams SSE; routed sentence → firefly flight + new ember.
6. `Cmd+\` round-trips World↔2D with camera pose intact.
7. Reduced-motion path: fades not glides; WebGL2-disabled fallback card, no crash.
8. No console errors; idle 10 s → rAF drops to 0; `gl.info.render.calls ≤ 150`.

Then report to Filippo for review before any push/merge.

### Wave 3 — remaining Conductor duties (DONE)
1. When U-13/U-14 pre-plans land → launch their Opus execs (jarvis/JarvisRing, tree/Fireflies). U-13 uses cameraBus/focusStack/streamJarvis; U-14 implements `fireflyBus`, hands off to embers.
2. When all Wave-3 execs committed → wire into WorldScene at boundary: <WorldLabels/> <Ledger/> <TodayPanel/> <JarvisRing/> <Fireflies/> (Ledger/panel/ring may be camera-anchored — place appropriately). U-15 self-wires shell. Verify tsc + build. Atomic commit.
3. Open Wave 4: U-16 jarvis-routing-choreography(+Fable), U-17 litany-bootup(+Fable), U-18 chimes, U-19 reduced-motion-gating.

### Deferred small follow-ups
- Camera-pose SAVE: U-07's CameraRig has the `world:cameraPose` sessionStorage RESTORE seam but nothing writes it. Add a save (on flight-settle / route-leave) so World↔Page revisits keep the exact camera. Small CameraRig-side edit; do with Wave-3 boundary or Wave 5 polish.

### Deferred integration checks
- After ALL waves: in-browser smoke (needs Supabase auth session) — verify /world renders, camera flies, an ember ascends on completion, no console errors, idle→0 rAF.

## Conductor wiring duty
WorldScene.tsx is the shared integration point — Conductor wires each wave's components into it at the wave boundary (not the unit agents) to avoid collisions. Commit planning docs as one docs(planning) commit after pre-plans finish writing.

## Next steps
1. When U-01 (deps) + U-03/U-04 pre-plans land → launch Wave 1b Opus executors: U-02 island-scaffold, U-03 tokens-materials (seed=preplans/U-03), U-04 data-bridge (seed=preplans/U-04). Pin claude-opus-4-8-thinking-high.
2. Freeze contracts (treeLayout/mappings/tokens/worldEvents/cameraBus/fireflyBus) after Wave 1.
3. Wave 2 (U-06,07*,08,09*,10), Wave 3 (U-11,12,13*,14*,15), Wave 4 (U-16*,17*,18,19), Wave 5 (U-20,21). * = Fable pre-plan (fresh Fable subagent, model pinned, docs only), then Opus exec.
4. Per-unit verify; then MVP verification checklist (PLAN §11). Model: Opus code, Sonnet docs, Fable plans only.
NOTE: never resume Fable agents (resume drops model to Opus) — always spawn fresh with model pinned.
