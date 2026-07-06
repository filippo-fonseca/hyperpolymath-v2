# U-04 · data-bridge — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/data/{WorldDataProvider.tsx, useWorldData.ts, treeLayout.ts, mappings.ts, diffing.ts}`.
> Every query key, function name, type, and field below was read from the live repo on 2026-07-06 (file:line cited). Nothing here is assumed.
> This memo REFINES the sketches in `PLAN.md §6 U-04`; where the two differ (noted inline), this memo wins — it is the wave-1 contract that gets frozen.

---

## 0. The one rule

**There is no world store.** The provider mounts the EXACT `useQuery` calls the 2D app already runs — same keys, same queryFns, same Realtime hooks — so the world and the Page are two observers of ONE TanStack Query cache. A completion on `/tasks` in another tab reaches `/world` through the same invalidate → refetch path with zero new plumbing. If you find yourself writing a fetch, a Zustand store, or a new query key, stop: you are off-plan.

Nothing in `data/` runs per-frame. Data changes at Realtime cadence; `useFrame` animation belongs to wave-2+ units.

---

## 1. Shared-cache wiring (verbatim, from the live files)

### 1.1 `tableKey` — the key factory

```47:52:apps/web/lib/realtime/query-keys.ts
export function tableKey(
  table: RealtimeTable,
  userId: string,
): readonly [RealtimeTable, string] {
  return [table, userId] as const;
}
```

Import: `import { tableKey } from "@/lib/realtime/query-keys";`

### 1.2 Areas + projects (the sidebar tree)

`Sidebar.tsx` is the canonical consumer. Its subscriptions (`apps/web/components/shell/Sidebar.tsx:126-127`):

```ts
useTableSubscription("areas", userId);
useTableSubscription("projects", userId);
```

Its query (`apps/web/components/shell/Sidebar.tsx:132-144`) — copy ALL FOUR options verbatim; the `initialDataUpdatedAt` + `staleTime` pair is deliberate (the comment at Sidebar.tsx:136-141 explains: without it, TanStack 5 treats SSR `initialData` as instantly stale and any invalidate triggers a spurious refetch):

```ts
const { data: activeAreas = initialActiveAreas } = useQuery({
  queryKey: tableKey("areas", userId),
  queryFn: getAreasForCurrentUser,
  initialData: initialActiveAreas,
  initialDataUpdatedAt: Date.now(),
  staleTime: Number.POSITIVE_INFINITY,
});
```

- **Key:** `["areas", userId]` — note it is the plain `tableKey("areas", userId)`, NOT a bespoke "sidebar-tree" key. PLAN §2.3's "copy the sidebar's key verbatim" resolves to exactly this.
- **queryFn:** `getAreasForCurrentUser` from `@/app/actions/areas` (`apps/web/app/actions/areas.ts:263-271`) — a server action that auths via `getClaims()` then returns `getSidebarTree(claims.sub, false)`. Return type: `SidebarArea[]`.
- The provider mounts INSIDE `AppShell`, where `Sidebar` is always mounted, so this cache slice is already warm; our `useQuery` is a second observer, and our SSR seed `initialData` is ignored when the entry exists (correct behavior — pass it anyway for the direct-`/world`-load case).
- There is no separate "projects" query to mount: projects ride inside `SidebarArea.projects`. The `useTableSubscription("projects", userId)` channel invalidates `["projects", userId]`, which no query observes here — but mounting it is still required? **No.** Read carefully: `useTableSubscription` invalidates only `tableKey(table, userId)` plus fanout keys (`apps/web/lib/realtime/useTableSubscription.ts:110-126`). A `projects` table change must invalidate the `["areas", userId]` tree query. Use the hook's `alsoInvalidate` option (`useTableSubscription.ts:61-68`):

```ts
useTableSubscription("areas", userId);
useTableSubscription("projects", userId, {
  alsoInvalidate: [tableKey("areas", userId)],
});
```

  (The Sidebar gets away without `alsoInvalidate` because its own mutations invalidate explicitly, e.g. `TasksClient.tsx:136-138` invalidates `tableKey("projects", userId)` after inline project creation — but a cross-device project rename must reach the world's tree, so the fanout is the robust wiring. The channel is a refcounted module-level singleton (`useTableSubscription.ts:34, 88-93`), so this ADDS a fanout key to the shared `projects` channel; it does not open a second socket.)

### 1.3 Tasks (+ `tasks_projects` junction)

Identical to `TasksClient.tsx`. Query (`apps/web/components/tasks/TasksClient.tsx:146-150`):

```ts
const { data: tasks = initialTasks } = useQuery({
  queryKey: tableKey("tasks", userId),
  queryFn: getTasksForCurrentUser,
  initialData: initialTasks,
});
```

Subscriptions (`TasksClient.tsx:156-157`):

```ts
useTableSubscription("tasks", userId);
useTableSubscription("tasks_projects", userId);
```

- **Key:** `["tasks", userId]`. **queryFn:** `getTasksForCurrentUser` from `@/app/actions/tasks` (`apps/web/app/actions/tasks.ts:618-626`) → `getAllTasksForUser(claims.sub)`. Return type: `TaskWithProjects[]`.
- Same nuance as 1.2 applies to the junction: the `tasks_projects` channel invalidates `["tasks_projects", userId]`, which nothing observes. In the 2D app this still works because project-link edits also touch `tasks` rows or invalidate explicitly. For the world, wire the fanout so a link-only change (task moved to a different project ⇒ different lantern) re-solves slots:

```ts
useTableSubscription("tasks_projects", userId, {
  alsoInvalidate: [tableKey("tasks", userId)],
});
```

- Do NOT copy the `useOptimisticList` overlay from `TasksClient.tsx:164` — the world renders the canonical cache only. Optimistic overlays are a 2D-input concern; the world's mutations (U-12's panel) invalidate the shared key and the world reacts to the refetch.

### 1.4 Captures

Identical to `RecentCapturesWidget.tsx`. Subscription (`apps/web/components/lifeos/RecentCapturesWidget.tsx:36`):

```ts
useTableSubscription("captures", userId);
```

Query (`RecentCapturesWidget.tsx:38-42`) — note the trailing `null` (the hashtag-filter slot; `null` = unfiltered feed):

```ts
const { data: capturesData = initialCaptures } = useQuery({
  queryKey: [...tableKey("captures", userId), null] as const,
  queryFn: () => getCapturesForCurrentUser(),
  initialData: initialCaptures,
});
```

- **Key:** `["captures", userId, null]`. **queryFn:** `() => getCapturesForCurrentUser()` from `@/app/actions/captures` (`apps/web/app/actions/captures.ts:329-336`) → `getCapturesForUser(claims.sub, {})`, limit 100, reverse-chronological. Return type: `CaptureWithLinks[]`.
- The Realtime channel invalidates the PREFIX `["captures", userId]` (`useTableSubscription.ts:110-112`); TanStack prefix-matching therefore invalidates `["captures", userId, null]` too. No fanout needed here.
- **Firefly rows = unconverted captures.** `CaptureWithLinks` has no `convertedAt`/`taskId` field (`apps/web/lib/db/queries/captures.ts:13-35`) — conversion DELETES/creates rows via the convert dialog, so "unconverted" = "present in the feed". Render all fetched captures as fireflies (cap at the instanced max 64; take the newest 64).

### 1.5 QueryClient context (for awareness, not modification)

`QueryProvider` (`apps/web/components/providers/QueryProvider.tsx:13-25`) sets defaults `staleTime: 30_000`, `refetchOnMount: false`, `refetchOnWindowFocus: false`, and owns visibility-recovery invalidation. The provider inherits all of this by mounting inside `(app)/layout.tsx`'s provider stack — no QueryClient work in U-04.

### 1.6 `invalidate()` wiring (demand-mode frame on data change)

`WorldCanvas` runs `frameloop="demand"`. The provider is the bridge from "cache changed" to "draw one frame":

```ts
const invalidate = useThree((s) => s.invalidate);
useEffect(() => {
  invalidate();
}, [tree, tasks, captures, invalidate]);
```

Query data identity changes exactly when a refetch lands (structural sharing means unchanged data keeps its reference — no wasted frames). This effect ALSO covers the initial mount frame. `WorldDataProvider` must therefore live INSIDE `<Canvas>` (it already does per PLAN §2.2) since `useThree` requires R3F context.

---

## 2. `treeLayout.ts` — the solver, precise and deterministic

### 2.1 Inputs and constants

```ts
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { Vector3Tuple } from "three"; // type-only import; no runtime three needed
```

`SidebarArea` / `SidebarProject` (`apps/web/lib/db/queries/sidebar.ts:10-26`): area = `{ id, name, emoji, orderIndex, archivedAt, projects[] }`; project = `{ id, name, icon, orderIndex, isClass, archivedAt }`.

Module constants (all frozen; exported for tests):

```ts
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399963 rad
export const AZIMUTH_OFFSET = Math.PI / 2;   // bough 0 faces the vestibule camera (+z)
export const TRUNK_RADIUS = 0.35;            // limb roots start on the trunk surface
export const BOUGH_ROOT_Y = 1.7;             // base height of limb roots
export const BOUGH_LEN_MIN = 3.5, BOUGH_LEN_MAX = 5.0;   // meters (PLAN §6)
export const BOUGH_ELEV_MIN = 20, BOUGH_ELEV_MAX = 35;   // degrees off horizontal (PLAN §6)
export const BOUGH_SAG = 0.15;               // fraction of length, downward control-point droop
export const LANTERN_T_MIN = 0.4, LANTERN_T_MAX = 0.98;  // outer 60% of the curve
export const LANTERN_HANG = 0.18;            // lanterns hang below the limb
export const EMBER_SHELL_RADIUS = 0.35;      // Fibonacci shell around a lantern (PLAN §6)
export const TRUNK_SHELL_RADIUS = 0.6;       // unprojected-task cluster
export const TRUNK_SHELL_Y = 1.2;            // its base height (PLAN §6)
```

### 2.2 Deterministic jitter — `hash01`

The ONLY randomness source. Same djb2 recipe as `pickNodeColor` (`apps/web/components/areas/AreasTree.tsx:66-70`), normalized to `[0, 1)`:

```ts
export function hash01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
}
```

No `Math.random`, no `Date.now`, no iteration-order dependence anywhere in the solver. **Determinism guarantee: `solveTreeLayout` is a pure function — same input array ⇒ deep-equal output, byte for byte.**

### 2.3 Color — private verbatim copy

`layout.color = pickNodeColor(areaId)` using the EXACT palette + hash from `AreasTree.tsx:57-70` (6 OKLCH strings, djb2, `Math.abs(h) % 6`). **U-03 (`materials/tokens.ts`) also copies this and both are wave-1 parallel units, so `treeLayout.ts` must NOT import from `materials/` — keep a module-private copy** (22 lines) with a comment pointing at `AreasTree.tsx:57-70` as the source of truth. Byte-identical copies hash identically; a post-wave-1 cleanup commit may dedupe to `tokens.ts`.

```ts
const NODE_PALETTE = [
  "oklch(72% 0.13 210)", "oklch(74% 0.14 350)", "oklch(72% 0.14 305)",
  "oklch(74% 0.13 175)", "oklch(76% 0.15 155)", "oklch(80% 0.13 70)",
] as const;
function pickNodeColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];
}
```

### 2.4 Bough placement (per active area)

1. **Filter + order.** Drop `archivedAt !== null` areas (PLAN §6 mapping table). Sort by `(orderIndex asc, id asc)` — `getSidebarTree` already orders by `(orderIndex, createdAt)` (`sidebar.ts:51`) but the explicit re-sort with an `id` tiebreak makes the solver self-sufficiently deterministic. Let `i` be the sorted rank (also the `1–9` key order for U-07).
2. **Azimuth (golden angle by rank):** `θᵢ = AZIMUTH_OFFSET + i · GOLDEN_ANGLE` (radians, unnormalized is fine — only used via cos/sin). Golden-angle spacing never stacks two boughs even at 9 areas, and — because θ depends only on rank — adding an area with a LARGER orderIndex does not move existing boughs.
3. **Load factor:** `load = clamp(area.projects.filter(p => p.archivedAt === null).length / 8, 0, 1)` (8 projects ≈ "full" bough).
4. **Length:** `L = BOUGH_LEN_MIN + (BOUGH_LEN_MAX − BOUGH_LEN_MIN) · load` — heavy areas reach farther.
5. **Elevation:** `φ = radians(BOUGH_ELEV_MAX − (BOUGH_ELEV_MAX − BOUGH_ELEV_MIN) · load)` — heavy areas sit flatter (20°), light ones lift steeper (35°): more hang room where there are more lanterns.
6. **Endpoints:**
   - `start = [cos θᵢ · TRUNK_RADIUS, BOUGH_ROOT_Y + 0.3·(hash01(areaId) − 0.5), sin θᵢ · TRUNK_RADIUS]` (±0.15 m root stagger so limbs don't share a ring).
   - `end = start + L · [cos θᵢ · cos φ, sin φ, sin θᵢ · cos φ]`.

### 2.5 The canonical bough curve — `boughPoint`

U-06 builds the visible `TubeGeometry` along "the bough curve"; U-04 hangs lanterns along it. Both MUST use the same math, so U-04 exports it and U-06 samples it (builds its `CatmullRomCurve3` through points sampled from this function — coincidence guaranteed):

Quadratic Bézier with a droop control point:
- `P0 = start`, `P2 = end`, `P1 = midpoint(start, end) + [0, −BOUGH_SAG · L, 0]`.
- `boughPoint(b, t) = (1−t)²·P0 + 2(1−t)t·P1 + t²·P2`, `t ∈ [0, 1]`.

```ts
export function boughPoint(b: BoughLayout, t: number): Vector3Tuple;
```

(PLAN §6 U-06 says "CatmullRom with sag control points"; the frozen contract is this Bézier evaluated by `boughPoint` — U-06's Catmull is fitted THROUGH its samples, so the phrase survives and the seam stays exact. The "CatmullRom param" for lantern distribution in PLAN §6 preamble is this `t`.)

### 2.6 Lantern distribution (per project)

For each bough, take active projects sorted by `(orderIndex asc, id asc)`, `j = 0..n−1`:

1. **Curve param, even spread over the outer 60% + hash jitter:**
   `t_j = clamp(0.4 + 0.6·(j+1)/(n+1) + 0.05·(hash01(projectId) − 0.5), LANTERN_T_MIN, LANTERN_T_MAX)`.
2. **Position:** `boughPoint(b, t_j) + [0, −LANTERN_HANG, 0]` plus a small horizontal jitter perpendicular to the bough's azimuth so lanterns don't form a perfect line: `+ 0.16·(hash01(projectId + ":r") − 0.5) · [−sin θᵢ, 0, cos θᵢ]`.
3. `color` = parent bough color; `isClass` passes through from `SidebarProject.isClass`.

### 2.7 Ember slots — Fibonacci shell / trunk shell

Slot **positions** live here (geometry); slot **assembly** lives in `mappings.ts` (§3.4).

**Projected tasks** (task has ≥1 project): parent lantern = `projects[0].id` (`TaskWithProjects.projects` is `{id, name}[]`, first link wins — PLAN §6 mapping table). Within one lantern, tasks are ranked `k = 0..N−1` by `(createdAt asc, id asc)`. Fibonacci-sphere lattice on a shell of radius `EMBER_SHELL_RADIUS` around the lantern position:

```
y_k = 1 − 2(k + 0.5)/N               // in [−1, 1]
r_k = sqrt(1 − y_k²)
θ_k = k · GOLDEN_ANGLE + 2π · hash01(taskId)   // per-task phase so re-ranks don't rotate the whole shell in lockstep
slot = lantern.position + EMBER_SHELL_RADIUS · [r_k·cos θ_k, y_k, r_k·sin θ_k]
```

Note `N` enters the formula, so adding a task nudges its siblings' targets — intended; U-09's `easing.damp3` glides them to the new lattice (a living cluster, not a teleport).

**Unprojected tasks** (`projects.length === 0`): trunk-shell helix, ranked `k` by `(createdAt asc, id asc)` across ALL unprojected tasks:

```
θ_k = k · GOLDEN_ANGLE
y_k = TRUNK_SHELL_Y + 0.8 · frac(k · 0.61803398875)
slot = [TRUNK_SHELL_RADIUS·cos θ_k, y_k, TRUNK_SHELL_RADIUS·sin θ_k]
```

Export both as pure helpers (consumed by `mappings.buildEmberSlots`, unit-testable alone):

```ts
export function emberShellPosition(lantern: Vector3Tuple, k: number, n: number, taskId: string): Vector3Tuple;
export function trunkShellPosition(k: number): Vector3Tuple;
```

### 2.8 Types + entry point (PLAN §6 shared vocabulary, unchanged)

```ts
export interface BoughLayout {
  areaId: string; name: string; emoji: string | null;
  color: string;               // pickNodeColor(areaId) — OKLCH string
  azimuth: number;             // θᵢ, radians
  start: Vector3Tuple; end: Vector3Tuple;
  projects: LanternLayout[];
}
export interface LanternLayout {
  projectId: string; areaId: string; name: string; isClass: boolean;
  position: Vector3Tuple;
  color: string;
}
export interface EmberSlot {
  taskId: string;
  lanternId: string | null;    // null → trunk cluster
  basePosition: Vector3Tuple;
  state: EmberState;           // from mappings.ts
}
export interface TreeLayoutResult {
  boughs: BoughLayout[];
  byArea: Map<string, BoughLayout>;
  byProject: Map<string, LanternLayout>;
}
export function solveTreeLayout(areas: SidebarArea[]): TreeLayoutResult;
```

(`TreeLayoutResult` is the named alias PLAN §6 U-16 already references — export it.)

---

## 3. `mappings.ts` — the grammar codified

### 3.1 `todayYmd` — how the app actually computes "today"

The 2D task surfaces compute today in the **user's local timezone** via `toYmd(new Date())` from `@/lib/tasks/date-shortcuts` (`apps/web/lib/tasks/date-shortcuts.ts:11-16` — local `getFullYear/getMonth/getDate`, zero-padded). `TasksClient.tsx:174` uses exactly this for the default kanban day, and the long comment at `TasksClient.tsx:339-345` documents WHY: `task.dueDate` is a plain `YYYY-MM-DD` DATE string from Drizzle, and round-tripping through `new Date(ymd)` introduces UTC-midnight drift in negative-UTC timezones.

**Rules, frozen:**
- `todayYmd = toYmd(new Date())` (import `toYmd`; do not reimplement).
- Do NOT use `todayISODate()` from `@/lib/projects/archive-status` (`archive-status.ts:6-8`) — that one is UTC (`toISOString().slice(0,10)`) and exists for server-side project expiry, not task due-days.
- Compare `dueDate` to `todayYmd` as **strings** (`===`, `<`). Zero-padded `YYYY-MM-DD` orders lexicographically; never construct a `Date` from `dueDate`.
- The provider recomputes `todayYmd` once per minute (`setInterval`, 60 000 ms) into React state, setting state **only when the string actually changed** — i.e. one re-render per midnight, not per minute.

### 3.2 `classifyTask` — the truth table

Field names from `TaskWithProjects` (`apps/web/lib/db/queries/tasks.ts:14-37`): `status: "not started" | "up next" | "in progress" | "almost done" | "lesno"`, `priority: "P∞" | "P1" | "P2" | "P3"`, `dueDate: string | null`.

```ts
export type EmberState = "ambient" | "today" | "overdue" | "ascending";

export function classifyTask(t: TaskWithProjects, todayYmd: string): EmberState {
  if (t.status === "lesno") return "ascending";          // done — checked FIRST, trumps dates
  if (t.dueDate !== null && t.dueDate < todayYmd) return "overdue";
  if (t.dueDate === todayYmd) return "today";
  return "ambient";                                       // undated or future-dated
}
```

Branch-order rationale: the 2D app's overdue predicate explicitly excludes lesno (`TasksClient.tsx:325-327` and `:369`); putting the `lesno` check first encodes the same precedence. `"ascending"` is what a completed row classifies as — but completed rows never get slots (§3.4), so the state only manifests through the differ's transition event; U-09 owns the ascent runtime.

Priority is **orthogonal** to state (a filament flag, per PLAN §6: P∞/P1 get a vertical taper):

```ts
export function hasFilament(t: TaskWithProjects): boolean {
  return (t.priority === "P∞" || t.priority === "P1") && t.status !== "lesno";
}
export function filamentScaleY(t: TaskWithProjects): number {
  return t.priority === "P∞" ? 2.8 : 2.2;   // P∞ taller than P1 (PLAN §6 mapping table)
}
```

### 3.3 Visual constants co-located (the ember grammar, single source)

So U-09 reads numbers, not prose:

```ts
export const EMBER_VISUALS = {
  today:    { color: "#E8C46B", pulseHz: 0.5, emissiveMin: 1.6, emissiveMax: 2.6, yOffset: 0 },
  overdue:  { color: "#FF6B4A", pulseHz: 0,   emissive: 1.8,                      yOffset: -0.12 },
  ambient:  { color: "#F2E9D8", pulseHz: 0.2, emissive: 0.9,                      yOffset: 0 },
  ascending:{ flareMs: 300, flareMul: 3, riseY: 6, riseMs: 2200, ease: "easeIn" },
} as const;
```

(Values verbatim from PLAN §1.7 + §6 mapping table. U-03's tokens carry the palette too; these are the EMBER-specific parameters and duplication of two hex literals is accepted — the mapping table is authoritative for embers.)

### 3.4 `buildEmberSlots` — tasks → slots

```ts
export function buildEmberSlots(
  tasks: TaskWithProjects[],
  layout: TreeLayoutResult,
  todayYmd: string,
): EmberSlot[];
```

Algorithm:
1. Drop `status === "lesno"` rows — completed tasks have no resident ember (their exit is the ascent animation, driven by the differ event, animated by U-09 on the ember's LAST known transform).
2. Partition remainder: `projects.length > 0` → lantern group keyed by `projects[0].id`; else trunk group. A task whose `projects[0].id` is NOT in `layout.byProject` (project archived / area archived) falls back to the trunk group — never dropped silently.
3. Within each group sort `(createdAt asc, id asc)`, rank `k`, position via `emberShellPosition` / `trunkShellPosition` (§2.7).
4. `state = classifyTask(t, todayYmd)`; `lanternId` = the lantern's projectId or `null`.

Pure, deterministic, O(n log n). Memoized by the provider on `[tasks, layout, todayYmd]`.

---

## 4. `diffing.ts` — the snapshot differ + `worldEvents`

### 4.1 The differ

Refinement over PLAN §6's sketch (authorized here): the differ returns completions AND row churn, because U-09 needs spring-in/out and PLAN §9 requires "new row = spring-in ember; removal = spring-out".

```ts
export interface TaskTransition {
  taskId: string;
  from: EmberState;          // classifyTask(prevRow, todayYmd) — 'ambient' | 'today' | 'overdue'
  to: "ascending";
  slot: EmberSlot;           // the slot the ember occupied BEFORE completion (ascent origin)
}
export interface SnapshotDiff {
  completed: TaskTransition[];
  added: TaskWithProjects[];     // ids in next, absent from prev (non-lesno only)
  removedIds: string[];          // ids in prev, absent from next
}
export function diffSnapshots(
  prev: Map<string, TaskWithProjects>,
  next: TaskWithProjects[],
  prevSlots: Map<string, EmberSlot>,   // provider's slot index from the PREVIOUS snapshot
  todayYmd: string,
): SnapshotDiff;
```

Semantics, frozen:
- **Completion** = `prevRow !== undefined && prevRow.status !== "lesno" && nextRow.status === "lesno"`. This is the ONLY trigger for `task-completed` — a transition, never a level. A row that is already `lesno` in both snapshots emits nothing (idempotent across refetches).
- `from = classifyTask(prevRow, todayYmd)`; `slot = prevSlots.get(taskId)`. **If the slot is missing** (task created and completed between snapshots — no ember ever existed), the completion is silently dropped from `completed` (nothing on screen to ascend; the bell without a spark would lie).
- `added` excludes rows arriving already-`lesno` (no ember to spring in). `removedIds` includes everything that vanished — U-09 frees the instance slot either way; if the ember is mid-ascent the ascent runtime owns it until dissolve.
- O(n) with Maps: one pass over `next` against `prev`, one pass over `prev` keys against a `Set` of next ids. Zero allocation beyond the result arrays.

### 4.2 The provider's prev-ref pattern (exact)

```ts
const prevTasksRef = useRef<Map<string, TaskWithProjects> | null>(null);
const prevSlotsRef = useRef<Map<string, EmberSlot>>(new Map());

useEffect(() => {
  if (prevTasksRef.current !== null) {
    const diff = diffSnapshots(prevTasksRef.current, tasks, prevSlotsRef.current, todayYmd);
    for (const tr of diff.completed) worldEvents.emit("task-completed", tr);
    // added/removed are consumed by U-09 via useWorldData() slot reconciliation,
    // not via events — the slot array IS the declarative source; events are for
    // one-shot choreography only.
  }
  prevTasksRef.current = new Map(tasks.map((t) => [t.id, t]));
  prevSlotsRef.current = new Map(emberSlots.map((s) => [s.taskId, s]));
}, [tasks, emberSlots, todayYmd]);
```

- First snapshot emits nothing (no boot storm of bells).
- StrictMode double-invocation is safe: the second run sees `prev == next` ⇒ empty diff.
- Captures get the same treatment with a `Set<string>` of prev capture ids: a NEW capture id ⇒ `worldEvents.emit("capture-created", { captureId })`. (U-14 reacts with spring-in and emits the `chime`/cork-pop itself; the differ never emits chimes.)

### 4.3 `worldEvents` — the tiny mitt-style emitter (frozen)

Event names are FROZEN — exactly these five, no additions without an orchestrator amendment:

```ts
import type { JarvisActionEvent } from "@/components/jarvis/jarvis-stream-client"; // type-only; exported at jarvis-stream-client.ts:66

export type WorldEventMap = {
  "task-completed": TaskTransition;
  "capture-created": { captureId: string };
  "chime": { kind: "glass-bell" | "cork-pop" | "two-note" };
  "jarvis-action": JarvisActionEvent;
  "boot-complete": void;
};

export const worldEvents: {
  on<K extends keyof WorldEventMap>(ev: K, fn: (payload: WorldEventMap[K]) => void): () => void; // returns unsubscribe
  emit<K extends keyof WorldEventMap>(ev: K, payload: WorldEventMap[K]): void;
};
```

Implementation: module-level `Map<string, Set<Function>>`, ~15 lines, NOT React state, no dependency (do not install `mitt`). Emit iterates a copied array so a listener may unsubscribe during dispatch. Listener errors are caught + `console.error`'d so one bad subscriber can't kill choreography.

**Emitter/listener ownership (so no one double-emits):**

| Event | Emitted by | Consumed by |
|---|---|---|
| `task-completed` | U-04 provider (differ) | U-09 embers (ascent), U-12 panel (row exit sync) |
| `capture-created` | U-04 provider (differ) | U-14 fireflies (spring-in + cork-pop chime) |
| `chime` | U-09 (glass-bell at apex), U-14 (cork-pop, two-note) | U-18 audio |
| `jarvis-action` | U-13 (`onAction` callback) | U-16 routing choreography |
| `boot-complete` | U-17 litany | U-07 camera (input gate) |

### 4.4 Bus signatures other units depend on (FROZEN here, implemented elsewhere)

These live in their owners' files but their SHAPES freeze at end of wave 1 with this memo:

```ts
// camera/CameraRig.tsx (U-07 implements):
export interface CameraPose { position: Vector3Tuple; target: Vector3Tuple }
export const cameraBus: { flyTo(pose: CameraPose, ms?: number): Promise<void> };

// tree/Fireflies.tsx (U-14 implements):
export interface FlightRequest { captureId?: string; toAreaId: string; toProjectId?: string; kind: "task" | "note" }
export const fireflyBus: { fly(req: FlightRequest): Promise<void> };  // resolves at landing
```

---

## 5. `WorldDataProvider.tsx` + `useWorldData.ts` — full signatures

### 5.1 Provider

```ts
"use client";
interface WorldDataProviderProps {
  userId: string;
  initialTree: SidebarArea[];          // SSR seed: getSidebarTree(user.id, false)
  initialTasks: TaskWithProjects[];    // SSR seed: getAllTasksForUser(user.id)
  initialCaptures: CaptureWithLinks[]; // SSR seed: captures list (getCapturesForUser)
  children: React.ReactNode;
}
export function WorldDataProvider(props: WorldDataProviderProps): JSX.Element;
```

Internal composition order (all cheap, all memoized):
1. Three `useQuery` calls + five `useTableSubscription` calls exactly per §1 (subscriptions: `areas`, `projects`+fanout, `tasks`, `tasks_projects`+fanout, `captures`).
2. `todayYmd` minute-tick state (§3.1).
3. `layout = useMemo(() => solveTreeLayout(tree), [tree])`.
4. `emberSlots = useMemo(() => buildEmberSlots(tasks, layout, todayYmd), [tasks, layout, todayYmd])`.
5. Differ effect (§4.2) + capture-diff effect.
6. `invalidate()` effect (§1.6).
7. Context value memoized on its fields.

### 5.2 Context hook

```ts
// useWorldData.ts
export interface WorldData {
  userId: string;
  tree: SidebarArea[];             // active areas (the query already excludes archived)
  layout: TreeLayoutResult;
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];
  captures: CaptureWithLinks[];
  todayYmd: string;
}
export function useWorldData(): WorldData;  // throws with a clear message outside the provider
```

Context object identity changes only when a constituent changes (Realtime cadence). Scene systems read it in render; per-frame work stays in `useFrame` downstream — enforce by exporting only plain data (no callbacks that tempt per-frame reads).

### 5.3 CONTRACT-FREEZE list (wave 2+ may consume, never modify)

1. Types: `BoughLayout`, `LanternLayout`, `EmberSlot`, `TreeLayoutResult`, `EmberState`, `TaskTransition`, `SnapshotDiff`, `WorldData`, `WorldEventMap`, `CameraPose`, `FlightRequest`.
2. Functions: `solveTreeLayout(areas)`, `boughPoint(b, t)`, `emberShellPosition`, `trunkShellPosition`, `classifyTask(t, todayYmd)`, `hasFilament(t)`, `filamentScaleY(t)`, `buildEmberSlots(tasks, layout, todayYmd)`, `diffSnapshots(prev, next, prevSlots, todayYmd)`, `useWorldData()`, `hash01`.
3. Values: `worldEvents` with exactly the five event names; the layout constants of §2.1; `EMBER_VISUALS`.
4. Bus shapes: `cameraBus.flyTo`, `fireflyBus.fly` (§4.4).
5. Query wiring: the three key/queryFn pairs of §1 — no unit may introduce a new query key for areas/tasks/captures data.

---

## 6. Vitest test plan

Location: `apps/web/components/world/data/__tests__/` (repo convention: `lib/**/__tests__/*.test.ts`; config `apps/web/vitest.config.mts` exists). All three modules under test are pure TS — no jsdom, no mocks of Supabase/TanStack needed. Shared fixture helper `mkTask(over: Partial<TaskWithProjects>): TaskWithProjects` filling the full shape from `tasks.ts:14-37` (incl. `hashtags: []`, `people: []`, `recurrence: null`).

### 6.1 `mappings.test.ts` — `classifyTask` truth table (`todayYmd = "2026-07-06"`)

| # | status | dueDate | priority | expect |
|---|---|---|---|---|
| 1 | `"in progress"` | `"2026-07-06"` | P3 | `today` |
| 2 | `"not started"` | `"2026-07-05"` | P3 | `overdue` |
| 3 | `"not started"` | `"2025-12-31"` | P3 | `overdue` (cross-year lexicographic) |
| 4 | `"lesno"` | `"2026-07-05"` | P3 | `ascending` (lesno trumps overdue) |
| 5 | `"lesno"` | `null` | P∞ | `ascending` |
| 6 | `"up next"` | `null` | P3 | `ambient` |
| 7 | `"almost done"` | `"2026-07-07"` | P1 | `ambient` (future) |
| 8 | `"in progress"` | `"2026-07-06"` | P∞ | `today` + `hasFilament=true` + `filamentScaleY=2.8` |
| 9 | `"in progress"` | `null` | P1 | `hasFilament=true`, `filamentScaleY=2.2` |
| 10 | `"in progress"` | `null` | P2 | `hasFilament=false` |
| 11 | `"lesno"` | `null` | P1 | `hasFilament=false` (done kills the filament) |

Plus `buildEmberSlots`: lesno rows excluded; task with unknown `projects[0].id` lands in trunk group (`lanternId === null`); slot count = non-lesno task count.

### 6.2 `diffing.test.ts` — single-completion semantics

- **Exactly one transition:** prev = {A ambient, B today (slot in prevSlots)}; next = same rows but B.status → `"lesno"` ⇒ `completed.length === 1`, `{ taskId: "B", from: "today", to: "ascending", slot: <B's slot> }`; `added = []`, `removedIds = []`.
- **No re-emit:** run again with prev already containing lesno-B ⇒ `completed = []`.
- **Missing slot dropped:** completion of a task absent from `prevSlots` ⇒ `completed = []`.
- **Added/removed:** next gains C (non-lesno) ⇒ `added = [C]`; next gains D already-lesno ⇒ NOT in `added`; prev-only E ⇒ `removedIds = ["E"]`.
- **worldEvents:** `on` returns working unsubscribe; `emit` reaches 2 listeners; a throwing listener doesn't block the next.

### 6.3 `treeLayout.test.ts` — stability + geometry invariants

- **Determinism:** `solveTreeLayout(fixture)` called twice ⇒ `toEqual` deep match (and `JSON.stringify` equality for byte-level paranoia).
- **Input-order independence:** shuffle the input array ⇒ identical output (internal sort owns order).
- **Rank stability:** append an area with the LARGEST orderIndex ⇒ every pre-existing bough's `azimuth`/`start`/`end` deep-equal the 6-area run.
- **Archived exclusion:** area with `archivedAt: new Date()` produces no bough; its id absent from `byArea`.
- **Load scaling:** area with 8+ projects ⇒ length ≈ 5.0 and elevation ≈ 20°; 0 projects ⇒ 3.5 / 35° (assert via `start`→`end` vector length and y-component).
- **Lantern params:** with 3 projects all hang points satisfy `t ∈ [0.4, 0.98]` (recover t by nearest-point search over `boughPoint`, or assert positions are within `LANTERN_HANG + jitter` of the curve) and lie below the limb (`y < boughPoint(t).y`).
- **Ember shell:** for a 5-task lantern group, every `emberShellPosition` is exactly `EMBER_SHELL_RADIUS` (±1e-9) from the lantern position; all 5 distinct.
- **Trunk helix:** `trunkShellPosition(k)` for k=0..9: xz-radius exactly `TRUNK_SHELL_RADIUS`, y ∈ [1.2, 2.0], all distinct.
- **`boughPoint` endpoints:** `t=0` ⇒ `start`, `t=1` ⇒ `end` (±1e-9); `t=0.5` y sits below the chord midpoint by `BOUGH_SAG·L` × 0.5 (Bézier midpoint property: `B(0.5) = ¼P0 + ½P1 + ¼P2`).

Run: `npx vitest run components/world/data` inside `apps/web/`.

---

## 7. Ordered build checklist (atomic commits, explicit pathspecs)

1. **`data/treeLayout.ts`** — constants, `hash01`, private `pickNodeColor` copy (verbatim from `AreasTree.tsx:57-70`), bough solve, `boughPoint`, lantern distribution, `emberShellPosition`/`trunkShellPosition`, `solveTreeLayout`, all §2.8 types. *Commit 1.*
2. **`data/__tests__/treeLayout.test.ts`** — §6.3 suite green. *Commit 2 (may fold into 1).*
3. **`data/mappings.ts`** — `EmberState`, `classifyTask`, `hasFilament`, `filamentScaleY`, `EMBER_VISUALS`, `buildEmberSlots` (imports `toYmd` NOT reimplemented). **+ `data/__tests__/mappings.test.ts`** (§6.1). *Commit 3.*
4. **`data/diffing.ts`** — `worldEvents` emitter + `WorldEventMap` (five frozen names), `TaskTransition`, `SnapshotDiff`, `diffSnapshots`. **+ `data/__tests__/diffing.test.ts`** (§6.2). *Commit 4.*
5. **`data/useWorldData.ts`** — context object, `WorldData` interface, throwing hook. *Commit 5 (may fold into 6).*
6. **`data/WorldDataProvider.tsx`** — the three §1 queries (options copied verbatim incl. `initialDataUpdatedAt`/`staleTime` for areas), five subscriptions with the two `alsoInvalidate` fanouts, `todayYmd` minute tick, layout/slot memos, differ effects, capture-diff effect, `invalidate()` effect, context provision. *Commit 6.*
7. **Verify:** `npx vitest run components/world/data` green; `tsc --noEmit` green; grep the diff to confirm zero runtime `three` imports in `data/` (only `import type { Vector3Tuple }`) and zero new query keys beyond §1. *No commit; gate.*

Depends on U-02 only for the SSR-seed prop types at integration time — every file here compiles standalone against existing app modules (`@/lib/db/queries/*`, `@/lib/realtime/*`, `@/lib/tasks/date-shortcuts`, `@/components/jarvis/jarvis-stream-client` type-only), so U-04 truly parallelizes within wave 1.

*— Fable. Contracts are real, cited, and frozen. Build it.*
