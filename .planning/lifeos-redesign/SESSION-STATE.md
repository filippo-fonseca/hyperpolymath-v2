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

---

## PHASE 2 — THE MERIDIAN RING (Google Calendar overhead) — IN PROGRESS
Gate approved 2026-07-06 (defaults shipped: title→class tint heuristic ON; 60s stale + focus + 5-min poll; M-15 month-zoetrope DEFERRED to stretch; ring Litany swing-up DEFERRED; wheel-scrub claim focus-scoped; zenith tablet takes the 3rd/final heroGlass slot). Plan: `.planning/lifeos-redesign/PHASE-2-PLAN.md` (`e421b03`). 15 units / 5 waves. Fable plan is the ONLY pre-plan (no per-wave seeds). Opus=code, Sonnet=docs(M-14), Haiku UNAVAILABLE as subagent model → M-04 ran on Sonnet.

### ✅ Wave M1 — DONE + integration-gate green (tsc: baseline-only, no new errors)
- M-04 toll-asset 4558984 (Sonnet): ring-toll.mp3 13KB, 220Hz A3, CC0 ffmpeg synth.
- M-03 meridian-materials (2 commits): meridian/{meridianMaterials,meridianGeometries}.ts. brass/strip/tablet(chain-ready)/god-ray + RING/TABLET(unit-arc)/TICK/BAND/SHAFT geoms.
- M-01 data-bridge-amendment (6 commits; amendment **4e83131**): SSR gcal seed on /world, WorldDataProvider meridian query (key `["calendar-events",uid,calIds,tMin,tMax]`, stale60s/focus/5-min poll), worldEvents 5→6 (+meridian-toll), focusStack +{kind:"ring";eventId?}, WorldData.meridian, diffEventSnapshots (7/7). CameraRig `case "ring"` stub (M-08 fills).
- M-02 meridian-solver (4 commits): meridian/{meridianLayout,meridianMappings,meridianBus}.ts + 31/31 tests (incl. NY DST). FROZEN contracts: §2.3 layout types + `meridianBus` (stub via `__registerMeridianBusImpl`, M-10 registers real impl). colorHex = area-hue-or-parchment, NEVER gcal bg (stricter per §5).

### ✅ Wave M2 — DONE + integration-gate green (tsc baseline-only, build exit 0, /world emitted)
- M-05 ring-structure 667772e → meridian/MeridianRing.tsx (canted brass annulus, instanced ticks, minute-tick rotation reading meridianBus offset).
- M-06 tablet-system (2 commits) → meridian/EventTablets.tsx + meridian/meridianHover.ts (tabletHoverBus seam). ONE InstancedMesh(128)+band InstancedMesh(8)+zenith hero; cache key `studiolo:sf@1|tablet@1`; transmission cap still 3 (lantern/ribbon/zenith).
- M-07 plumb-line b04845d → meridian/PlumbLine.tsx (now-line zenith→trunk + additive god-ray cone; rides DustMotes activity window, no new demand).
- M-08 lookup-camera 82018ec/6c70e12/72114dd → camera/{useWorldKeys,CameraRig} + meridian/meridianPoses.ts (C key, RING_VIEW_POSE/tabletFocusPose, Esc→snapToNow then home).
- **Conductor mount e8ea705:** `<MeridianRing/><EventTablets/><PlumbLine/>` mounted after `<Embers/>` before `<CameraRig/>`. JarvisRing before PostFX; PostFX last. Verified green.

### 🔄 Wave M3 — LAUNCHING (parallel, file-disjoint; deps = M2)
- M-09 toll-scheduler [40e845f2] → meridian/{TollScheduler(null),MeridianAudio}.tsx. One setTimeout at T-15, session dedupe Set, visibilitychange recompute; PositionalAudio at zenith reusing Chimes' unlock+mute flags (NO 2nd AudioContext).
- M-10 zoetrope-scrub [92e8f475] → meridian/useRingScrub.ts (implements+registers meridianBus via __registerMeridianBusImpl) + surgical meridian/MeridianRing.tsx (mount hook) + camera/CameraRig.tsx (owns `setRingScrubActive` seam this wave). Heavy brass momentum, 30-min detent, frames-demanded-only-while-scrubbing, reduced-motion=discrete 1h steps.
- M-11 labels-ledger [a8de94cf] → meridian/MeridianLabels.tsx + surgical text/Ledger.tsx (next-event clause + test) + text/fonts.ts (glyph audit). 8 old-style numerals riding dial (replicated transform, does NOT edit MeridianRing), date line, hover caption via tabletHoverBus, zenith caption. ≤11 live Text.
- Conductor mounts at M3 close: `<MeridianLabels/>` beside `<WorldLabels/>`; `<TollScheduler/><MeridianAudio/>` after `<Chimes/>`. (useRingScrub self-mounts inside MeridianRing.)
### ✅ Wave M3 — DONE + integration-gate green (tsc baseline-only, build exit 0)
- M-09 toll-scheduler (3898b9c/c08fd28) → meridian/{TollScheduler(null),MeridianAudio}.tsx + synth.ts seam (isAudioUnlocked/isMuted; NO 2nd AudioContext). One timer, session dedupe Set, visibilitychange recompute, all-day excluded.
- M-10 zoetrope-scrub (3 commits) → meridian/useRingScrub.ts (implements+registers meridianBus, module refs, no React state) + surgical MeridianRing (hook mount) + CameraRig (setRingScrubActive: wheel=NONE + relax polar). Heavy 350ms friction → 30-min detent, snapToNow ~700ms, edge rubber-band, idle→0 frames, reduced-motion=discrete 1h.
- M-11 labels-ledger (3 commits) → meridian/MeridianLabels.tsx (8 old-style numerals replicating dial transform, date line, hover+zenith captions via tabletHoverBus) + Ledger next-event clause (22 tests green) + fonts.ts (+× U+00D7). 11 live Text (at budget).
- **Conductor mount 380174c:** `<TollScheduler/><MeridianAudio/>` after `<Chimes/>`; `<MeridianLabels/>` after `<WorldLabels/>`. useRingScrub self-mounts in MeridianRing. Verified green.

### 🔄 Wave M4 — SEQUENTIAL CLOSEOUT (M-13/M-14 must reflect M-12's final state)
- M-12 honesty-sweep (Opus, LAUNCHING) → reduced-motion collapse across ALL meridian surfaces (scrub discrete [M-10 done, verify], lean-down/snap instant, boot fade crossfade, god-ray breathe off) + connection-state honesty (not_connected→dark petrified brass, no tablets/plumb, 1 Garamond zenith line reusing caption slot; expired/revoked→"Reconnect"; empty-but-connected→bright ring, no tablets, plumb still falls, wordless). Touches meridian components; sequential = no collision.
- AFTER M-12: M-13 perf-hardening (Opus, tests + components/world/__tests__ perf doc, §4.4 protocol; live-fps numbers pending human gate) ‖ M-14 docs-changelog (Sonnet, README meridian section + CHANGELOG + .planning). File-disjoint from each other.
### Wave M5 (STRETCH, deferred): M-15 month-zoetrope.

### PENDING HUMAN GATE (Phase 2, before push/merge): in-browser smoke §6 (needs Filippo's gcal-connected auth session) — ring overhead matches /calendar, C look-up, scrub momentum, T-15 toll from above, Jarvis event rivets in, disconnect→petrified ring. Dev stack currently UP on :3000 (web shell) + local Supabase (Docker).
