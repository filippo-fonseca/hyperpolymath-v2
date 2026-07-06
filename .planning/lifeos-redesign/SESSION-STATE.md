# bgsd session — LifeOS Spatial Redesign (First-Person POV)

**Scale:** project. **Conductor:** Kiwi (Opus). **Persona pill on every message.**

## Model doctrine (user-mandated)
- **Fable** (`claude-fable-5-thinking-high`): planner / creative director / orchestrator. **NEVER writes code** — markdown vision/plans only (expensive on Fable). Leverage extensively; every Opus pipeline unit gets a Fable pre-plan seed.
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

### 🔄 Wave 2 — IN FLIGHT (launched, background)
- 🧠 Fable pre-plan U-07 camera-rig → 03e2adc1-68cd-497f-a6c3-1e3d35cd1816 → preplans/U-07-camera-rig.md
- 🧠 Fable pre-plan U-09 ember-system → 0ec400e1-e698-4944-ad27-52b848d074a4 → preplans/U-09-ember-system.md
- 🔧 U-06 tree-geometry (opus) → fe2ee18f-f022-4f1b-ab5c-7a97577bb80a → tree/{Trunk,Boughs}.tsx, exports boughFocusPose
- 🔧 U-08 atmosphere-post (opus) → 0c4a1827-ee0c-4180-ad47-ffd65ca365b9 → env/{Atmosphere,PostFX,DustMotes}.tsx, exports inlayRegistry
- 🔧 U-10 lantern-system (opus) → bfadd41d-0e8f-4ed2-840d-e812af5f64f2 → tree/Lanterns.tsx, exports lanternPickMap

### Wave 2 — remaining Conductor duties
1. When U-07 pre-plan lands → launch U-07 EXEC (opus), but only AFTER U-06 + U-10 committed (needs boughFocusPose + lantern poses).
2. When U-09 pre-plan lands → launch U-09 EXEC (opus) (needs only U-03/U-04, already done).
3. When all Wave-2 execs committed → wire into WorldScene at boundary (Conductor edit): <Atmosphere/> <PostFX/> <Trunk/> <Boughs/> <Lanterns/> <Embers/> <CameraRig/>; remove smoke-test placeholder; atomic commit. Then open Wave 3.

## Conductor wiring duty
WorldScene.tsx is the shared integration point — Conductor wires each wave's components into it at the wave boundary (not the unit agents) to avoid collisions. Commit planning docs as one docs(planning) commit after pre-plans finish writing.

## Next steps
1. When U-01 (deps) + U-03/U-04 pre-plans land → launch Wave 1b Opus executors: U-02 island-scaffold, U-03 tokens-materials (seed=preplans/U-03), U-04 data-bridge (seed=preplans/U-04). Pin claude-opus-4-8-thinking-high.
2. Freeze contracts (treeLayout/mappings/tokens/worldEvents/cameraBus/fireflyBus) after Wave 1.
3. Wave 2 (U-06,07*,08,09*,10), Wave 3 (U-11,12,13*,14*,15), Wave 4 (U-16*,17*,18,19), Wave 5 (U-20,21). * = Fable pre-plan (fresh Fable subagent, model pinned, docs only), then Opus exec.
4. Per-unit verify; then MVP verification checklist (PLAN §11). Model: Opus code, Sonnet docs, Fable plans only.
NOTE: never resume Fable agents (resume drops model to Opus) — always spawn fresh with model pinned.
