# Phase 3 Foundation Audit — "Stark Makerspace" Pivot

**Repo:** `hyperpolymath-v2` · **App:** `apps/web` · **Branch:** `lifeos-studiolo`
**Audited by:** Opus foundation-audit scout (read-only; this doc is the only write)
**For:** a Fable planner designing the new milestone — first-person makerspace where
LifeOS surfaces become holographic widgets you swipe in and out of view.

> **Headline verdict:** Do **NOT** rebuild. Phases 1 (Studiolo scaffold + tree +
> Jarvis + boot + TodayPanel) and the M-01 gcal **data bridge** are a strong,
> reusable foundation. The **TodayPanel is already a working swipeable-widget
> prototype** and is the direct template for the new milestone. The **Meridian
> Ring's presentation layer** (the overhead brass annulus + tablet instancing +
> zoetrope scrub — ~4,100 LOC) is the "a bit shit" part and is where the pivot
> spends its demolition budget; its **data + pure math survive**, its **geometry +
> tablet runtime largely do not.** The single biggest technical wall the planner
> must design around is the **≤3 transmission-material cap, which is already
> fully consumed** — a wall of glass panels cannot each be `MeshTransmissionMaterial`.

---

## 1. The reusable 3D foundation (`apps/web/components/world/`)

All of this is **KEEP**. It is aesthetic-neutral plumbing that any widget system
plugs into unchanged.

### 1.1 Canvas & loader (the island boundary)
- **`WorldLoader.tsx`** — the client boundary. `dynamic(() => import("./WorldCanvas"), { ssr:false })`
  so three/R3F/uikit are code-split and ship on `/world` only. Runs a WebGL2
  capability gate → `<FallbackCard>` (branded parchment card) or `<WorldSkeleton>`;
  avoids hydration mismatch by rendering the skeleton on SSR + first client render,
  then swapping post-mount. **Props contract:** `{ userId, initialTree, initialTasks,
  initialCaptures, initialMeridian }`.
- **`WorldCanvas.tsx`** — the **single** R3F `<Canvas>`. Load-bearing config lives
  here and nowhere else: `frameloop="demand"` (world sleeps when idle), `dpr={[1,2]}`,
  `antialias`, `high-performance`, camera seed `position=[0,1.6,6] fov=55`, clear
  color `#120E0B`. Renders `<WorldScene/>`.
- **`WorldScene.tsx`** — **the composition root and the primary integration seam.**
  Every system is a single-line `<Component/>` mount inside `<WorldDataProvider>`.
  Documented mount-slot discipline: `<PostFX/>` MUST be the last child (wraps the
  composer), `<JarvisRing/>` immediately before it. **A new `<WidgetRig/>` mounts
  here as one line**, before `<PerfGovernor/>`.
- **`WorldSkeleton.tsx`** — loading fallback (2D DOM).

### 1.2 The data bridge (`data/`) — "one truth, two theatres"
- **`data/WorldDataProvider.tsx`** — **THE seam between live app data and the scene,
  and the most important file to reuse.** There is *no* world store. It mounts the
  **exact same `useQuery` calls the 2D app runs** (same keys, same queryFns, same
  Realtime subscriptions), so world + Page are two observers of one TanStack Query
  cache. Current queries:
  - areas → `tableKey("areas", userId)` / `getAreasForCurrentUser`
  - tasks → `tableKey("tasks", userId)` / `getTasksForCurrentUser`
  - captures → `[...tableKey("captures", userId), null]` / `getCapturesForCurrentUser`
  - meridian/gcal → `["calendar-events", userId, calIds, timeMin, timeMax]` / `listEventsForUser`
    + `useGcalConnectionStatus()`

  Plus `useTableSubscription(...)` for areas/projects/tasks/tasks_projects/captures,
  a midnight `todayYmd` tick, memoized `solveTreeLayout`/`buildEmberSlots`, the task
  & capture **snapshot differs** (emit `task-completed`/`capture-created`), and a
  **demand-mode `invalidate()` on any data change**. **Adding a new widget's data =
  add one `useQuery` here with the identical 2D key/fn + its `useTableSubscription`.**
- **`data/useWorldData.ts`** — `useWorldData()` context hook; `WorldData` shape
  (plain data only, read in render, never per-frame). This is what every widget reads.
- **`data/diffing.ts`** — the `worldEvents` mitt-style emitter with **6 FROZEN event
  names** (`task-completed`, `capture-created`, `chime`, `jarvis-action`,
  `boot-complete`, `meridian-toll`); the `CameraBus`/`FireflyBus`/`CameraPose`
  interfaces; and `diffSnapshots`/`diffEventSnapshots`. **Note the freeze:** adding
  a new world event requires an "orchestrator amendment"; a widget-swipe bus should
  be a **separate module singleton** (pattern: `jarvisWorldBus`, `meridianBus`), not
  a 7th `worldEvents` name.
- **`data/treeLayout.ts`** / **`data/mappings.ts`** — pure deterministic solvers
  (boughs/lanterns/ember slots; `classifyTask`, `hash01`, palette). Reusable math.

### 1.3 Camera system (`camera/`) — the swipe engine, already built
- **`camera/CameraRig.tsx`** — the **sole flight authority**. Owns the single
  `<CameraControls>` (truck/pan disabled → guided flight, never free-look), the
  `cameraBus.flyTo(pose, ms)` singleton (the ONLY way the camera relocates; honors
  reduced motion with an instant cut), the `focus → pose → flyTo` effect, the
  `boot-complete` gate (`bootDone()`), and pose save/restore to `sessionStorage`
  (`world:cameraPose`). Exposes `VESTIBULE_POSE`, `lanternFocusPose`,
  `setRingScrubActive`. Timing: `smoothTime≈0.35` ⇒ ~700 ms felt glide.
- **`camera/useFocusStack.ts`** — module-singleton focus **stack** as a rank-ordered
  prefix chain (`vestibule=0, bough=1, lantern=2, ring=1|2`), `useSyncExternalStore`
  for reactive reads, `push/pop/reset`. **This is the swipe/navigation state machine
  the widget system extends** (add a `{kind:"widget", widgetId}` level).
- **`camera/useWorldKeys.ts`** — the world's **single** keydown listener
  (capture-phase, so it beats `GlobalHotkeys`). Handles `Esc` (pop), `C` (ring),
  `1–9` (focus Nth bough — the template for "jump to widget N"), `Cmd/Ctrl+K`
  (summon Jarvis). Typing guard + modifier bail copied verbatim from `GlobalHotkeys`.

### 1.4 Cross-cutting systems
- **`prefs/useWorldPrefs.ts`** — the one source of truth for reduced motion:
  `worldPrefersReducedMotion()` (module, read-at-call) + `useWorldPrefs()` (live hook).
- **`perf/PerfGovernor.tsx`** — adaptive dpr governor (`2 → 1.5 → 1`) via drei
  `<PerformanceMonitor>`; passive (never demands a frame), ignores sparse idle
  samples. Automatic — new widgets inherit it for free.
- **`materials/tokens.ts`** — `STUDIOLO` palette (verbatim brand hex), `NODE_PALETTE`
  + `pickNodeColor` (2D/3D color identity), `oklchToThreeColor`.
- **`materials/hologram.ts`** — `makeHologramMaterial()` (the fresnel-rim
  `MeshPhysicalMaterial` — the cheap, unlimited holographic look), `chainOnBeforeCompile`
  (sanctioned shader-chunk stacking), and **`heroGlass()` + the `HERO_GLASS_CAP=3`
  dev registry** (see §5, the hard constraint).
- **`materials/sharedGeometries.ts`** — module-const geometry singletons (ember,
  taper, lantern, firefly).
- **`text/` (`fonts.ts`, `WorldLabels.tsx`, `Ledger.tsx`)** — SDF text via troika
  (drei `<Text>`): EB Garamond regular/italic TTFs, `preloadWorldFonts()`, glyph-set
  discipline, billboarding, opacity-damp fades. One font URL per style; bounded
  `<Text>` count. (Note: uikit `<Text>` is a *separate* MSDF path — see §2.)
- **`env/` (`Atmosphere.tsx`, `DustMotes.tsx`, `PostFX.tsx`)** — lighting/IBL/floor;
  drifting motes; and **`PostFX` = the ONLY `<EffectComposer>`** (Bloom
  `luminanceThreshold={1}` + Vignette). Glow is opt-in: `toneMapped:false` + color/
  emissive > 1.

---

## 2. Phase-1 systems — keepers

| Path | What it is | Verdict |
|---|---|---|
| `tree/Trunk.tsx`, `tree/Boughs.tsx`, `tree/Lanterns.tsx` | Dais/trunk; one limb per area (pickable→focus); one lantern per project (pickable→focus). Data-driven off `treeLayout`. | **KEEP** — the spatial "geography" of areas/projects; boughs/lanterns already are focusable objects. |
| `tree/Embers.tsx`, `tree/Fireflies.tsx` | Every task = an ember (instanced, state-pulsing); every unfiled capture = a firefly (instanced). | **KEEP** — living ambient data viz; complements panel widgets rather than competing. |
| `jarvis/JarvisRing.tsx`, `jarvis/useJarvisWorld.ts`, `jarvis/JarvisRibbon.tsx`, `jarvis/useJarvisChoreography.ts`, `jarvis/LightThread.tsx` | The full Kiwi/JARVIS familiar in-world: camera-parented cyan ring (createPortal), state machine + SSE streaming reusing `streamJarvis`, routing choreography, session persistence. | **KEEP — this IS the "Stark's assistant."** The makerspace's voice/command surface already exists and is wired to the real agent. |
| `boot/Litany.tsx`, `boot/useLitanySequence.ts` | Boot shutter + typed greeting; gates navigation until done. | **KEEP** (may reframe the greeting copy for the new space). |
| `audio/Chimes.tsx`, `audio/synth.ts` | WebAudio voice (glass-bell/cork-pop/two-note), event-driven, renders null. | **KEEP** — swipe/dock sounds are a natural extension. |
| `ModeToggle.tsx` | `Cmd+\` flip between Page ↔ `/world` with a fade; DOM-level (no three). | **KEEP.** |
| `app/(app)/world/page.tsx` | Server Component; SSR-seeds tree/tasks/captures/meridian; `force-dynamic`. | **KEEP** (may add SSR seeds for new widget data). |

### 2.1 `panels/TodayPanel.tsx` — **THE swipeable-widget template** (dissected)

This is the proof-of-concept the new milestone generalizes. Read it as the spec.

- **Toolkit:** `@react-three/uikit` `<Root>` / `<Container>` / `<Text>` + the
  `@react-three/uikit-default` `<Button>`. Flexbox layout in 3D
  (`flexDirection`, `padding`, `gap`, `borderRadius`, `overflow="scroll"`, etc.).
  **This is the entire panel-content vocabulary the widgets will use.**
- **Placement:** a **fixed** `<group position={[-1.85,1.5,1.5]} rotation={[0,0.42,0]}>`
  — deliberately **NOT camera-attached**, because tracking the camera would require
  a per-frame transform write and break the demand-mode idle. (Implication for the
  pivot: swiping should move *the camera to face a fixed panel*, not move panels to
  follow the camera — see §4.)
- **Live data:** reads `useWorldData()` (`tasks`, `todayYmd`, `userId`); derives rows
  in `useMemo` (never per-frame); caps at `ROW_CAP=12` with an "and N more" footer so
  uikit never lays out an unbounded tree.
- **Real bidirectional interaction:** a per-row `<Button>` completes a task by calling
  the **same server action the 2D widget uses** (`updateTaskStatus({ id, newStatus:"lesno" })`),
  with the same optimistic pattern (local `checkedOff` Set) and the same cache
  invalidation (`invalidateQueries({ queryKey: tableKey("tasks", userId) })`). That
  flows DB → Realtime → shared cache → the U-04 differ → `task-completed` → the
  ember ascends. **This proves the "widget writes through the shared cache" loop end-to-end.**
- **Skin:** STUDIOLO tokens — translucent deep-vellum slab (`opacity={0.7}`), brass
  border/accents, parchment text, coral overdue tick. **No transmission material** —
  the holographic look comes from uikit translucency + tokens, not glass.
- **Documented uikit 1.0.73 limitations (the planner inherits these):** a single
  per-element `opacity` (no separate `backgroundOpacity`/`borderOpacity`); no
  `fontStyle`/italic on the default font; the Inter MSDF atlas lacks some glyphs
  (a "○" renders as tofu → use a bordered `<Container>` instead of a glyph).

---

## 3. The Meridian Ring / calendar view — honest assessment

**Filippo's read ("a bit shit") is essentially correct for the *presentation*.** The
overhead canted brass annulus you must tilt your head up to read (via the `C` key,
a relaxed `minPolarAngle`, and a wheel-hijack scrub) is a beautiful but awkward
metaphor that fights a first-person makerspace. It is also the **single largest sunk
cost** in the codebase: `meridian/` is **~4,100 LOC across 14 files**. The pivot
should be candid that most of the *rendering* is demoted.

**What is genuinely salvageable (high value, keep):**
- **The M-01 gcal data bridge** — the meridian slice of `WorldDataProvider.tsx`
  (query key `["calendar-events", userId, calIds, timeMin, timeMax]`, `listEventsForUser`,
  rolling window math, `useGcalConnectionStatus`, the `force-dynamic` SSR seed in
  `world/page.tsx`). This is real, correct, reusable plumbing. **KEEP wholesale — it
  feeds a flat calendar widget verbatim.**
- **`meridian/meridianLayout.ts` pure functions** — especially `classifyTablet`
  (past/current/imminent/upcoming), `linkEventToProject` (the conservative title→
  project/course-code linker → area color), `timeToAngle`, `visibleSlots`,
  `resolveOverlaps`. `classify`/`link` are representation-agnostic and reusable in a
  flat agenda panel. **KEEP / REFRAME** (dial-angle helpers get demoted with the ring).
- **`meridian/meridianMaterials.ts` + `meridianMappings.ts`** — parchment-tablet
  hologram + brass + tint resolution. Reusable material recipes.

**What the swipeable-widget direction demotes or replaces (drop):**
- **`MeridianRing.tsx`** — the overhead annulus geometry/rotation. The metaphor the
  pivot is moving away from. **DROP** (or keep only as an optional ambient "clock"
  decoration, not the calendar UX).
- **`EventTablets.tsx` (1,122 LOC)** — the hand-rolled SoA instanced-tablet freelist
  with enter/leave springs, lean, hover, and a **zenith hero-glass swap that consumes
  the scarce transmission slot**. Enormously over-engineered for what becomes a flat
  list of uikit rows. **DROP** the runtime; a calendar widget renders events as
  `<Container>`/`<Text>` rows like `TodayPanel`.
- **`useRingScrub.ts` + `CameraRig.setRingScrubActive`** — the zoetrope time-scrub
  that hijacks the mouse wheel and relaxes the polar limit. **DROP** — and this
  *frees the wheel/trackpad to become the widget-swipe input* (a direct win).
- **`MeridianLabels.tsx` (584), `PlumbLine.tsx`, `TollScheduler.tsx`,
  `MeridianAudio.tsx`, `meridianPoses.ts`, `meridianHover.ts`, `meridianBus.ts`,
  `meridianGeometries.ts`** — all serve the annulus. **DROP** with it (the toll
  concept could be reborn as a generic reminder chime via `Chimes`).
- **`focusStack` ring levels** (`{kind:"ring"}`, `{kind:"ring", eventId}`) and their
  `poseForFocus` cases in `CameraRig` — **REFRAME** into the generic widget-focus level.

**Verdict:** The ring does **not** survive as the calendar UX. The calendar becomes a
**flat swipeable panel** (a `CalendarWidget` sibling of `TodayPanel`) that reuses the
M-01 bridge + `classifyTablet`/`linkEventToProject`. The annulus geometry and the
tablet instancing runtime are the demolition target.

---

## 4. The 2D LifeOS widget catalog — candidates for the makerspace

Every surface below already reads its data through a shared TanStack Query key +
server action, so a world widget can reuse it **verbatim** ("one truth, two theatres").
Surfaces already surfaced spatially in-world are noted.

| 2D surface | Route / key client | Shared query key → source | Already in world? |
|---|---|---|---|
| **Tasks** | `tasks/page.tsx` → `TasksClient` | `tableKey("tasks", userId)` / `getTasksForCurrentUser` | Embers + TodayPanel (partial) |
| **Captures** | `captures/page.tsx` → `CapturesClient` | `[...tableKey("captures", userId), tag]` / `getCapturesForCurrentUser`; `tableKey("hashtags", userId)` | Fireflies (partial) |
| **Calendar** | `calendar/page.tsx` → `CalendarClient` | `["calendar-events", userId, …]` / `listEventsForUser` | Meridian (being replaced) |
| **Areas** | `areas/page.tsx`; `shell/Sidebar` | `tableKey("areas", userId)` / `getAreasForCurrentUser` | Boughs |
| **Projects** | `projects/[projectId]` → `ProjectDetailClient` | `tableKey("projects", userId)` / `getProjectsForCurrentUser` | Lanterns |
| **Today / Jarvis** | `today/page.tsx` → `JarvisConsole` | `jarvis_turns` (Realtime) + `jarvis-turns` actions | JarvisRing (full) |
| **Journaling** | `journaling/JournalingClient` | `["journaling", userId, date]` / `getJournalEntry`, `getJournalEntries` | — |
| **Habits** | `habits/page.tsx` → `HabitsClient` | `tableKey("habits", userId)`, `["habits_archived"]`, `[...tableKey("habit_completions"), …]` | — |
| **Nutrition** | `nutrition/page.tsx` → `NutritionClient` | `["food_logs", userId, date]`, `["meals", userId]` | — |
| **Training** | `training/page.tsx` → `TrainingClient` | `["training_activities", userId, startISO, endISO]` | — |
| **Wiki / Pages** | `wiki/…` → `PagesListClient`/`PageDetailClient` | `tableKey("pages", userId)` / `getPagesForCurrentUser`; folders; `["daily-pages", userId]` | — |
| **People** | `people/page.tsx` → `PeopleClient` | `tableKey("people", userId)` / `getPeopleForCurrentUser` | — |
| **Search** | `search/…` → `SearchProvider` | `["search-snapshot", userId]` | — |
| **Health / Insights / Graph / Settings** | resp. | various (lower priority) | — |

**Top widget candidates** (smallest, shared-cache, highest "route one sentence to the
right place" leverage — the natural first wave after generalizing `TodayPanel`):
1. **Tasks list** (already 90% done via TodayPanel — generalize it).
2. **Captures inbox** (`getCapturesForCurrentUser` + hashtags; complete/file actions).
3. **Calendar / agenda** (flat panel replacing the ring; reuses M-01 + `classifyTablet`).
4. **Journaling — today's entry** (single `getJournalEntry`, one editable panel).
5. **Habits — today's grid** (small, toggle completions through the shared cache).

---

## 5. Feasibility seams for "swipeable widgets in a Stark makerspace"

### 5.1 Arrangement & swipe — reuse the flight system, don't fight it
- Lay panels on an **arc/ring/wall of fixed poses** around the vestibule eye-line,
  each a fixed `<group position rotation>` (the `TodayPanel` pattern). A pure
  `widgetLayout(count)` solver (sibling of `treeLayout`/`meridianLayout`) computes an
  arc of `{ position, rotation, cameraPose }`.
- **Swiping = flying the guided camera to face the next panel**, NOT moving panels to
  follow the camera. This reuses `CameraRig` + `cameraBus.flyTo` + `focusStack`
  wholesale: add `FocusLevel {kind:"widget", widgetId}`, a `poseForFocus` case, and
  swipe = `focusStack.push` next/prev. Comfort glide (~700 ms) and reduced-motion
  instant-cut come for free. This is the **strongest-fit** approach and preserves the
  "no per-frame transform writes on the panels" contract.
- Alternative (a rotating carousel container) is possible but reintroduces per-frame
  work + an idle-rAF risk; prefer the camera-glide model.

### 5.2 Input model
- **Wheel/trackpad** is freed once the ring scrub is dropped (`setRingScrubActive` /
  `useRingScrub` removed) → repurpose horizontal wheel/drag as swipe-between-widgets.
- **Keys:** extend the single `useWorldKeys` listener — arrow keys for prev/next,
  `1–9` to jump to widget N (the existing bough handler is the exact template).
- **Pointer:** uikit panels already handle hover/click (TodayPanel `<Button>`), so
  intra-panel interaction is solved; the swipe layer sits above it.

### 5.3 What uikit gives us for rich content
Flexbox `<Root>`/`<Container>`, `<Text>`, scroll containers, and the
`@react-three/uikit-default` component kit (`<Button>`, etc.). Sufficient for lists,
forms, toggles, headers. **Constraints to design around (from TodayPanel):** single
`opacity` per element, no italic on the default font, MSDF glyph gaps (avoid exotic
glyphs; use bordered containers for icons). Rich editing (TipTap-style) is **not**
available in uikit — journaling/wiki widgets should be read/quick-edit in-world and
defer deep editing to the 2D Page (via `Cmd+\`).

---

## 6. Hard constraints the new milestone inherits

1. **⚠️ Transmission-material cap (≤3) — ALREADY CONSUMED. The #1 wall.**
   `materials/hologram.ts` enforces `HERO_GLASS_CAP = 3` live
   `MeshTransmissionMaterial` instances (dev registry throws on the 4th). The
   documented budget is *focused-lantern swap + Jarvis ribbon + one reserve*, and
   `EventTablets`' zenith hero already claims the reserve. **A makerspace of glassy
   panels CANNOT each be transmission glass.** Achieve the Stark-hologram look with
   `makeHologramMaterial` (fresnel rim + Bloom, unlimited) and **uikit translucency**
   (TodayPanel uses `opacity` with zero transmission), reserving true transmission for
   at most 1–2 genuine hero moments. Dropping the meridian hero frees one slot.
2. **Draw-call / triangle budget.** §7 target ~300k tris (instanced families ~91k
   worst case). Each uikit `<Root>` owns its own draw batches, so N panels ≈ N+ draw
   calls — **keep the live panel count bounded** and cap rows per panel
   (`ROW_CAP=12`). `PostFX` must remain the **last** child; `<JarvisRing/>` immediately
   before it.
3. **Idle-rAF rule (`frameloop="demand"`).** The world must sleep at **0 rAF** when
   idle. No `useFrame` may call `invalidate()` unless actively animating; damps/springs
   must self-terminate on convergence; data changes kick exactly one frame via the
   provider's `invalidate()`. **TodayPanel is the gold standard: zero per-frame work;
   uikit requests a frame per discrete change, then sleeps.** Any swipe glide must
   self-terminate (cameraBus already does).
4. **Reduced motion.** Everything routes through `worldPrefersReducedMotion()` /
   `useWorldPrefs()`; every glide/spring honors an instant cut. `cameraBus.flyTo`
   already complies — reuse it and inherit compliance.
5. **Shared-cache discipline ("one truth, two theatres").** Widgets MUST read/write
   through the **identical** TanStack Query keys + server actions as the 2D app —
   never a parallel store. New widget data → add its `useQuery` (identical key/fn) +
   `useTableSubscription` to `WorldDataProvider`, exactly as the existing queries do.
6. **Code-split boundary.** All three/R3F/uikit/troika code stays under
   `components/world/**` behind the `ssr:false` island. Never import it into 2D bundles
   (and never import 2D component trees into the world — copy tokens, don't cross-import).
7. **Boot gate.** Navigation is ignored until the Litany completes (`bootDone()`);
   the widget nav must respect the same gate.

---

## 7. Seams the widget system will plug into (checklist)

- **`WorldScene.tsx`** — mount `<WidgetRig/>` as one line (before `<PerfGovernor/>`;
  `<PostFX/>` stays last, `<JarvisRing/>` just before it).
- **`useWorldData()` / `WorldDataProvider.tsx`** — add one `useQuery` (+ matching
  `useTableSubscription`) per new widget surface, using the 2D key/fn verbatim.
  Add matching SSR seeds in `world/page.tsx`.
- **`camera/useFocusStack.ts`** — extend the `FocusLevel` union with
  `{kind:"widget", widgetId}` (+ rank); **`camera/CameraRig.tsx`** — add the
  `poseForFocus` case → swipe glides ride `cameraBus.flyTo`.
- **`camera/useWorldKeys.ts`** — add widget-nav keys (arrows / `1–9`) in the existing
  single listener.
- **New module-singleton bus** for widget swipe/dock intents (pattern:
  `jarvisWorldBus` / `meridianBus`) — do **not** add a 7th `worldEvents` name.
- **`materials/hologram.ts` + `materials/tokens.ts`** — `makeHologramMaterial` +
  `STUDIOLO` for panel skins; `heroGlass()` only within the ≤3 cap.
- **`@react-three/uikit` + `@react-three/uikit-default`** — panel content toolkit;
  **template = `panels/TodayPanel.tsx`** (generalize it into a reusable `<WorldPanel>`).
- **`prefs/useWorldPrefs`** (reduced motion) and **`perf/PerfGovernor`** (dpr) — inherited automatically.
- **Reused pure logic** — `data/treeLayout.ts`, `meridian/meridianLayout.ts`
  (`classifyTablet`, `linkEventToProject`) for a calendar widget.

---

## 8. KEEP / REFRAME / DROP / NET-NEW (file-path level)

### KEEP (verbatim — the reusable foundation)
| Path | Role |
|---|---|
| `world/WorldLoader.tsx`, `WorldCanvas.tsx`, `WorldScene.tsx`, `WorldSkeleton.tsx` | Island boundary, single Canvas, composition root |
| `world/data/WorldDataProvider.tsx`, `useWorldData.ts`, `diffing.ts`, `treeLayout.ts`, `mappings.ts` | Shared-cache data bridge, differs, pure solvers |
| `world/camera/CameraRig.tsx`, `useFocusStack.ts`, `useWorldKeys.ts` | Flight authority, focus stack, single key listener |
| `world/prefs/useWorldPrefs.ts`, `perf/PerfGovernor.tsx` | Reduced motion, adaptive dpr |
| `world/materials/tokens.ts`, `hologram.ts`, `sharedGeometries.ts` | Palette, fresnel hologram + heroGlass cap, geometry singletons |
| `world/text/fonts.ts`, `WorldLabels.tsx`, `Ledger.tsx` | SDF text (troika) |
| `world/env/Atmosphere.tsx`, `DustMotes.tsx`, `PostFX.tsx` | Lighting, motes, the one composer |
| `world/tree/Trunk.tsx`, `Boughs.tsx`, `Lanterns.tsx`, `Embers.tsx`, `Fireflies.tsx` | Data-driven geography + ambient viz |
| `world/jarvis/*` (JarvisRing, useJarvisWorld, JarvisRibbon, useJarvisChoreography, LightThread) | The in-world Kiwi/JARVIS assistant |
| `world/boot/Litany.tsx`, `useLitanySequence.ts`; `world/audio/Chimes.tsx`, `synth.ts` | Boot ritual, world voice |
| `world/ModeToggle.tsx`; `app/(app)/world/page.tsx` | Page↔World toggle, SSR entry |
| `world/data/WorldDataProvider.tsx` **meridian slice** + `app/(app)/world/page.tsx` gcal seed | The M-01 gcal bridge (feeds the calendar widget) |

### REFRAME (keep the code, change its role)
| Path | From → To |
|---|---|
| `world/panels/TodayPanel.tsx` | The single hardcoded panel → **the generalized `<WorldPanel>` widget template** (extract layout/interaction into a reusable component + a task widget instance) |
| `world/camera/useFocusStack.ts` (ring levels) + `CameraRig.poseForFocus` (ring cases) | Ring-specific focus → generic `{kind:"widget"}` focus + pose |
| `world/meridian/meridianLayout.ts` | Dial-angle solver → keep `classifyTablet` / `linkEventToProject` / event mapping for a **flat calendar widget**; retire the angle helpers |
| `world/meridian/meridianMaterials.ts`, `meridianMappings.ts` | Ring/tablet materials → reusable parchment/brass tint recipes for panels |
| `world/boot/Litany.tsx` (greeting copy) | Studiolo greeting → makerspace greeting (optional copy change) |

### DROP (the "a bit shit" annulus presentation — ~4,100 LOC target)
| Path | Why |
|---|---|
| `world/meridian/MeridianRing.tsx` | Overhead annulus metaphor being abandoned |
| `world/meridian/EventTablets.tsx` (1,122 LOC) | Instanced-tablet runtime + zenith hero-glass (frees a transmission slot); replaced by flat uikit calendar rows |
| `world/meridian/useRingScrub.ts` + `CameraRig.setRingScrubActive` | Wheel-hijack time scrub; drop frees the wheel for swipe |
| `world/meridian/MeridianLabels.tsx` (584), `PlumbLine.tsx`, `TollScheduler.tsx`, `MeridianAudio.tsx`, `meridianPoses.ts`, `meridianHover.ts`, `meridianBus.ts`, `meridianGeometries.ts` | All serve the annulus; toll/chime concept can reappear via `audio/Chimes` |

### NET-NEW (the milestone builds these on top)
| New | Description |
|---|---|
| `world/panels/WorldPanel.tsx` (extracted) | Reusable holographic panel primitive (uikit Root/Container skin + STUDIOLO tokens + shared-cache write pattern), factored out of `TodayPanel` |
| `world/panels/*Widget.tsx` | Per-surface widgets: Tasks, Captures, Calendar (flat), Journaling, Habits, … each reusing its 2D query key/action |
| `world/panels/WidgetRig.tsx` + `widgetLayout.ts` | Arc/wall arrangement solver + the mount that places widgets around the first-person camera |
| `world/panels/useWidgetSwipe.ts` (or a `widgetBus` singleton) | Swipe/dock intent → `focusStack.push` `{kind:"widget"}` → `cameraBus.flyTo` |
| `FocusLevel {kind:"widget", widgetId}` + `poseForFocus` case | Widget navigation through the existing flight authority |
| `WorldDataProvider` additions | `useQuery` + `useTableSubscription` for journaling / habits / nutrition / pages / people as widgets demand them |
| Wheel/drag/arrow **swipe input** wiring | In `useWorldKeys` + a wheel listener (reclaimed from the dropped ring scrub) |

---

*Grounded in the code as of this audit; every path above was opened and read. The
foundation is strong — the milestone is a generalization of `TodayPanel` onto a
camera-glide widget carousel, plus a demolition of the meridian annulus, not a rebuild.*
