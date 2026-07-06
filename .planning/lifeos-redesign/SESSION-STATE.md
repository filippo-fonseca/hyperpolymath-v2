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
- ✅ U-01 deps-config — commit 74744b4 (pnpm, versions pinned, three transpiled).
- ✅ U-05 assets — commit fe44ab6 (EB Garamond TTF+OFL+fonts.ts; HDRI→Environment preset, SFX→WebAudio synth documented).
- ✅ U-02 island-scaffold — commit 4d4cfd1 (/world route, ssr:false island, WebGL2 gate, code-split confirmed). NOTE: real capture type is `CaptureWithLinks` via `getCapturesForUser` (NOT placeholder CaptureRow) — U-04 must match.
- ✅ fonts.ts glyph-set syntax fix — commit 8be520c (Conductor fix; U-05's ASCII-quote bug).
- ✅ U-03 pre-plan → preplans/U-03-tokens-materials.md (froze shader contract: chainOnBeforeCompile, aState itemSize2, cache key studiolo:sf@1|ember@1, embers own material instance).
- ✅ U-04 pre-plan → preplans/U-04-data-bridge.md
- ⏳ U-03 tokens-materials EXEC (opus) — 4d0785c0-ccdf-4b5e-84f6-d8b108e40bf1
- ⏳ U-04 data-bridge EXEC (opus) — b9975cc9-04de-47b0-9707-e19ab20cbbfa

## When Wave 1 done (U-02, U-03, U-04 committed):
1. docs(planning) commit for .planning/lifeos-redesign/** (VISION, TECH, PLAN, CODEBASE-MAP, SESSION-STATE, preplans).
2. Wire WorldDataProvider into WorldScene/WorldCanvas (Conductor edit, atomic commit).
3. Read frozen contracts from U-03/U-04 reports; open Wave 2: U-06 tree-geometry, U-07 camera-rig(+Fable pre-plan), U-08 atmosphere-post, U-09 ember-system(+Fable pre-plan), U-10 lantern-system. Fable pre-plans first (fresh, model pinned), then Opus execs. Wire each into WorldScene at boundary.

## Conductor wiring duty
WorldScene.tsx is the shared integration point — Conductor wires each wave's components into it at the wave boundary (not the unit agents) to avoid collisions. Commit planning docs as one docs(planning) commit after pre-plans finish writing.

## Next steps
1. When U-01 (deps) + U-03/U-04 pre-plans land → launch Wave 1b Opus executors: U-02 island-scaffold, U-03 tokens-materials (seed=preplans/U-03), U-04 data-bridge (seed=preplans/U-04). Pin claude-opus-4-8-thinking-high.
2. Freeze contracts (treeLayout/mappings/tokens/worldEvents/cameraBus/fireflyBus) after Wave 1.
3. Wave 2 (U-06,07*,08,09*,10), Wave 3 (U-11,12,13*,14*,15), Wave 4 (U-16*,17*,18,19), Wave 5 (U-20,21). * = Fable pre-plan (fresh Fable subagent, model pinned, docs only), then Opus exec.
4. Per-unit verify; then MVP verification checklist (PLAN §11). Model: Opus code, Sonnet docs, Fable plans only.
NOTE: never resume Fable agents (resume drops model to Opus) — always spawn fresh with model pinned.
