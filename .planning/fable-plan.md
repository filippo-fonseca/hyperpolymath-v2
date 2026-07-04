# Fable plan — unit "progress-bus" (run sesh-1783128035668)

Emit real-time `jarvis-routine-progress` events over the existing physical SSE bus as a
synthesize(+parallel) routine gathers its sources, so the sibling "hud-loader" desktop unit
can render a live loader + progress ring + ticking source checklist. This unit PRODUCES the
events end-to-end (runner hooks → bus → SSE route → desktop sse-client listener export); it
does NOT build any HUD UI.

---

## 1. Verified ground truth (path:line, current worktree)

| What | Where | Verified |
|---|---|---|
| Gather hooks on the runner handler contract | `apps/web/lib/jarvis/routine-runner.ts:141-143` — `onGatherBlockStart?(blockId, index, total, tool)` / `onGatherBlockDone?(result, index, total)` | ✅ fire in synth mode only, both sequential and parallel paths (`routine-runner.ts:311`, `:326`, `:384`) |
| Synthesis lifecycle hooks | `onSynthesisStart` fired at `routine-runner.ts:530`, `onSynthesisDone` at `:566`; both called from `runSynthesisTurn` which runs after all gathers (`:475-477`) | ✅ |
| Block-id defaulting | `routine-runner.ts:306` — `block.id && block.id.length > 0 ? block.id : \`${runId}:b${index}\`` | ✅ must be mirrored for the skeleton event (see §4.3 — export a helper) |
| `fireRoutineOverBus(blocks, opts)` | `apps/web/lib/jarvis/routine-fire.ts:74` — HAS the `blocks: RoutineBlock[]` array up front ✅ and computes `runId` at `:75` before calling `runRoutine`. `opts.synthesize` at `:59`, `opts.routineName` at `:51`. Handlers already wire `onOpener`/`onSynthesisStart`/`onSynthesisDelta`/`onSynthesisDone` (`:117-133`) but NOT the gather hooks — those are unconsumed today. |
| Physical bus | `apps/web/lib/voice/physical-extension/bus.ts` — `PHYSICAL_EVENTS` allowlist at `:24-31` (gates the cross-instance Realtime relay at `:66`), `emitEverywhere` at `:87`, emitter exports at `:103-125` | ✅ new event MUST be added to `PHYSICAL_EVENTS` or it silently drops cross-instance on Vercel |
| Payload types | `apps/web/lib/voice/physical-extension/types.ts` (no imports today; keep it dependency-free — use `string` for tool, not `JarvisToolName`) | ✅ |
| SSE fan-out route | `apps/web/app/api/jarvis/physical/events/route.ts:145-157` (handler registration), `:167-180` (cleanup) — each bus event needs a `send` handler + `on` + `off` | ✅ |
| Desktop consumer | `apps/desktop/src/physical-extender/sse-client.ts` — per-event payload interfaces (`:47-69`), listener Sets + `onJarvisX` exports (`:75-108`), `addEventListener` blocks (`:171-203`) | ✅ pattern to clone |
| Existing UPPERCASE label derivation (synthesis receipts only) | `routine-runner.ts:494-498` `labelFor` — strips `get_|read_|find_` prefix, underscores→spaces, uppercase | reference for the new human-label map |
| jarvis-core routines subpath | `packages/jarvis-core/src/routines/{index,types,schema,match}.ts`, exported via `"./routines": "./src/routines/index.ts"` in `packages/jarvis-core/package.json` | ✅ home for the shared label map |
| Runner test harness (mock pattern to reuse) | `apps/web/lib/jarvis/__tests__/routine-runner.test.ts:39-47` — mocks `@/lib/jarvis/run-turn` at module boundary, driver queue, `deferredDriver` helper at `:114` | ✅ |

Non-synthesize routines: `runBlock` only fires the gather hooks when `synth === true`
(`routine-runner.ts:311`, `:384`), and `runSynthesisTurn` is gated on `synth`
(`:475`). So gating ALL progress emission on `opts.synthesize === true` inside
`fireRoutineOverBus` (for the routine-level `start` event) plus relying on the runner's
own gating (for gather/synth events) gives exactly the required "none emitted for a
non-synthesize routine" behavior.

---

## 2. FROZEN CONTRACT (hud-loader builds against this — do not drift)

### 2.1 SSE / bus event name

```
jarvis-routine-progress
```

One event name for the whole lifecycle; the payload's `phase` discriminates. This matches
the existing bus style (one name per semantic stream, e.g. `jarvis-response-chunk`) and
keeps the `PHYSICAL_EVENTS` allowlist, the SSE route, and the desktop client each a
one-entry addition.

### 2.2 Payload TypeScript type

Added to `apps/web/lib/voice/physical-extension/types.ts` (server side) and mirrored as a
local interface in `apps/desktop/src/physical-extender/sse-client.ts` (desktop side — the
desktop app does not import from `apps/web`; every existing payload is mirrored the same
way, see `sse-client.ts:47-69`).

```ts
/** One gather source in the routine, as shown on the HUD checklist. */
export interface PhysicalRoutineProgressSource {
  /** Runner-resolved block id — matches blockId on gather-start/gather-done. */
  blockId: string;
  /** Authored block order (0-based) — checklist render order. */
  index: number;
  /** Raw tool name, e.g. "read_gmail" (string, not JarvisToolName — types.ts stays dependency-free). */
  tool: string;
  /** Human label, e.g. "Email". Derived server-side; desktop renders it verbatim. */
  label: string;
}

export type PhysicalJarvisRoutineProgressPhase =
  | "start"          // instant: routine fired; carries the full source skeleton
  | "gather-start"   // source began executing
  | "gather-done"    // source settled (ok=false when it errored/was skipped)
  | "synthesizing"   // all gathered; the single brief turn is composing
  | "done";          // brief finished streaming; progress lifecycle over

export interface PhysicalJarvisRoutineProgress {
  /** The fireRoutineOverBus runId — correlates all events of one run. */
  runId: string;
  /** Human routine name, e.g. "Morning Brief" — HUD header copy. */
  routineName: string;
  phase: PhysicalJarvisRoutineProgressPhase;
  /** Total gather sources. Present on EVERY phase (lets the HUD ring size itself from any event). */
  total: number;
  /** phase "start" only: the full checklist skeleton, in authored order. */
  sources?: PhysicalRoutineProgressSource[];
  /** phases "gather-start" | "gather-done": which source. */
  blockId?: string;
  index?: number;
  tool?: string;
  label?: string;
  /** phase "gather-done" only: false when the block errored or was skipped (unknown tool). */
  ok?: boolean;
  /** phase "gather-done" only, when ok === false: short error message. */
  error?: string;
  /** Wall-clock ms epoch, same convention as every other bus payload. */
  at: number;
}
```

### 2.3 Emission sequence guarantees (what hud-loader may assume)

For a synthesize routine with N blocks fired through `fireRoutineOverBus`:

1. Exactly one `phase:"start"` with `sources.length === N === total`, emitted
   synchronously before any gather begins (drives the instant "one moment, sir" opener +
   skeleton checklist).
2. Exactly N `gather-start` and N `gather-done` events. `gather-start` events arrive in
   index order (the pool grabs indices in order — `routine-runner.ts:437`); `gather-done`
   events arrive in COMPLETION order and interleave arbitrarily with later `gather-start`s
   when `parallel` is on. Each carries `blockId`/`index`/`tool`/`label`; `gather-done`
   additionally carries `ok` (+ `error` when `ok:false`). Errored and unknown-tool-skipped
   blocks STILL emit both events (`routine-runner.ts:311`, `:326`) — the checklist ticks
   every row, possibly with an error state.
3. Exactly one `synthesizing` after the last `gather-done` and before the brief's
   `jarvis-response-start` (`onSynthesisStart` fires before the synthesis turn streams,
   `routine-runner.ts:530`; the ordering of the progress emit vs. the response-start emit
   inside the same handler tick is progress-first — see §4.4).
4. Exactly one `done` after the brief's `jarvis-response-end` cycle completes
   (`onSynthesisDone`, `routine-runner.ts:566`).
5. For a NON-synthesize routine: zero `jarvis-routine-progress` events, ever.
6. All events of one run share the same `runId` (which is also the return value of
   `fireRoutineOverBus` and the `${runId}:brief` / `${runId}:opener` turnId prefix, so the
   HUD can correlate progress with the opener/brief response streams if it wants to).

### 2.4 Desktop listener export (hud-loader's subscribe point)

```ts
// apps/desktop/src/physical-extender/sse-client.ts
export function onJarvisRoutineProgress(
  fn: (payload: JarvisRoutineProgressPayload) => void,
): () => void; // returns unsubscribe, same as every sibling onJarvisX export
```

`JarvisRoutineProgressPayload` is the desktop-local mirror of
`PhysicalJarvisRoutineProgress` (identical shape, exported from sse-client.ts so
hud-loader can import the type).

### 2.5 Shared label map (recommendation: BOTH map-in-core AND label-in-event)

**Recommendation: put the canonical map in jarvis-core, but ALSO carry the resolved
`label` inside every event.** Rationale:

- The desktop app deliberately mirrors payload types instead of importing web/server code
  (see every interface at `sse-client.ts:47-69`); making the HUD depend on
  `@hyperpolymath/jarvis-core` just for labels would be its first such dependency and is
  unnecessary coupling for the hud-loader unit. Label-in-event means the HUD renders
  verbatim, zero imports, and label copy changes ship server-side without a desktop build.
- The map still belongs in jarvis-core (not buried in routine-fire) because the web
  routine EDITOR and future surfaces (mobile, web HUD) want the same human names, and
  jarvis-core is where the tool-name source of truth lives (`src/tool-names.ts`).

New file `packages/jarvis-core/src/routines/labels.ts`, exported from
`packages/jarvis-core/src/routines/index.ts`:

```ts
import type { JarvisToolName } from "../types";

/** Human source labels for routine progress/HUD surfaces. Explicit entries for
 * the gather-ish tools; everything else falls back to a prefix-stripped
 * Title Case derivation (same stripping as the synthesis receipt labels). */
const SOURCE_LABELS: Partial<Record<JarvisToolName, string>> = {
  get_weather: "Weather",
  read_gmail: "Email",
  get_news: "News",
  read_whatsapp: "WhatsApp",
  find_tasks: "Tasks",
  find_events: "Calendar",
  find_captures: "Captures",
  find_people: "People",
  web_search: "Web",
  play_music: "Music",
  take_screenshot: "Screen",
  computer_use: "Computer",
};

/** "get_weather" → "Weather"; unknown/unmapped tools → e.g. "some_tool" → "Some Tool".
 * Accepts string (not JarvisToolName) so skipped unknown-tool blocks still label. */
export function sourceLabelForTool(tool: string): string {
  const known = SOURCE_LABELS[tool as JarvisToolName];
  if (known) return known;
  return tool
    .replace(/^(get|read|find)_/, "")
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
```

(Fallback dovetails with `labelFor` in `routine-runner.ts:494-498`, but Title Case
instead of UPPERCASE — HUD copy, not model receipts. Do NOT change
`buildSynthesisReceipts`; its uppercase labels are part of the narrator prompt.)

---

## 3. Files to change (ordered)

1. **`packages/jarvis-core/src/routines/labels.ts`** (NEW) — `sourceLabelForTool` + map, as §2.5.
2. **`packages/jarvis-core/src/routines/index.ts`** — add `export * from "./labels";` (or named export, matching existing style in that index).
3. **`apps/web/lib/voice/physical-extension/types.ts`** — append `PhysicalRoutineProgressSource`, `PhysicalJarvisRoutineProgressPhase`, `PhysicalJarvisRoutineProgress` (§2.2). No imports added.
4. **`apps/web/lib/voice/physical-extension/bus.ts`**
   - `:24-31` add `"jarvis-routine-progress"` to `PHYSICAL_EVENTS` (REQUIRED for the cross-instance Realtime relay — the allowlist check at `:66` drops unknown events).
   - after `:125` add:
     ```ts
     export function emitJarvisRoutineProgress(payload: PhysicalJarvisRoutineProgress): void {
       emitEverywhere("jarvis-routine-progress", payload);
     }
     ```
   - extend the type import at `:5-12`.
5. **`apps/web/lib/jarvis/routine-runner.ts`** — export the block-id defaulting as a tiny pure helper so routine-fire's skeleton uses IDENTICAL ids to the runner's gather events:
   ```ts
   /** The runner's block-id defaulting — shared with routine-fire's progress skeleton. */
   export function resolveBlockId(block: RoutineBlock, runId: string, index: number): string {
     return block.id && block.id.length > 0 ? block.id : `${runId}:b${index}`;
   }
   ```
   and replace the inline expression at `:306` with `resolveBlockId(block, runId, index)`. Behavior-neutral.
6. **`apps/web/lib/jarvis/routine-fire.ts`** — wire it (see §4).
7. **`apps/web/app/api/jarvis/physical/events/route.ts`** — forward the event:
   - import `PhysicalJarvisRoutineProgress` type (`:5-12`);
   - `const routineProgressHandler = (data: PhysicalJarvisRoutineProgress) => send("jarvis-routine-progress", data);` next to `:150`;
   - `physicalBus.on("jarvis-routine-progress", routineProgressHandler);` next to `:157`;
   - matching `physicalBus.off(...)` in `cleanup()` next to `:173`.
8. **`apps/desktop/src/physical-extender/sse-client.ts`** — clone the sibling pattern:
   - `JarvisRoutineProgressPayload` (+ `RoutineProgressSourcePayload`, `JarvisRoutineProgressPhase`) interfaces mirroring §2.2, EXPORTED (hud-loader imports the type), placed after `:69`;
   - `const routineProgressListeners = new Set<RoutineProgressListener>();` + `export function onJarvisRoutineProgress(fn) { ... }` after `:108`;
   - `source.addEventListener("jarvis-routine-progress", (e) => { parse → console.log phase/runId → fan out })` after the `jarvis-response-end` block (`:196-203`).
9. **`apps/web/lib/jarvis/__tests__/routine-fire.test.ts`** (NEW) — see §5.
10. **`packages/jarvis-core/src/routines/labels.test.ts`** (NEW, colocated like `extract-facts.test.ts` in web; jarvis-core runs vitest per its package.json) — see §5.

No changes to `routine-runner.ts` handler semantics, `runRoutine` control flow, the
mobile app, or any migration. Zero DB surface.

---

## 4. Wiring detail — `routine-fire.ts`

### 4.1 Imports

```ts
import { sourceLabelForTool } from "@hyperpolymath/jarvis-core/routines";
import { emitJarvisRoutineProgress, /* existing four */ } from "@/lib/voice/physical-extension/bus";
import { resolveBlockId, runRoutine } from "@/lib/jarvis/routine-runner";
```

### 4.2 Gate

All progress emission is wrapped in `const progress = opts.synthesize === true;`. The
gather/synthesis handlers only fire in synth mode anyway (runner-gated), but the
routine-level `start` emit lives in routine-fire and needs its own gate; using one local
flag keeps intent obvious and satisfies the "none for non-synthesize" test cheaply.

### 4.3 The `start` skeleton (emitted synchronously in `fireRoutineOverBus`, after `runId` is computed at `:75`, before `void runRoutine(...)`)

```ts
const total = blocks.length;
const sources = blocks.map((b, i) => ({
  blockId: resolveBlockId(b, runId, i),
  index: i,
  tool: b.tool as string,
  label: sourceLabelForTool(b.tool as string),
}));
if (progress) {
  emitJarvisRoutineProgress({
    runId, routineName: opts.routineName, phase: "start", total, sources, at: Date.now(),
  });
}
```

Emitting BEFORE `runRoutine` guarantees `start` precedes the opener and every gather
event (runRoutine's first awaitless work — `onOpener` — happens inside the `void`ed
async call, i.e. after the current synchronous frame).

Compute `sources` once and close over it: the gather handlers reuse
`sources[index].label` instead of re-deriving.

### 4.4 New handlers in the `runRoutine` handlers object (after `onSynthesisDone`, `:133`)

```ts
onGatherBlockStart: (blockId, index, totalBlocks, tool) => {
  emitJarvisRoutineProgress({
    runId, routineName: opts.routineName, phase: "gather-start",
    total: totalBlocks, blockId, index, tool, label: sourceLabelForTool(tool),
    at: Date.now(),
  });
},
onGatherBlockDone: (result, index, totalBlocks) => {
  emitJarvisRoutineProgress({
    runId, routineName: opts.routineName, phase: "gather-done",
    total: totalBlocks, blockId: result.blockId, index, tool: result.tool,
    label: sourceLabelForTool(result.tool),
    ok: !result.error, ...(result.error ? { error: result.error } : {}),
    at: Date.now(),
  });
},
```

(No `progress` gate needed here — runner only calls these in synth mode — but adding
`if (!progress) return;` costs nothing and is belt-and-braces; either is fine.)

### 4.5 `synthesizing` and `done` — extend the EXISTING synthesis handlers

`onSynthesisStart` (`:125-127`) becomes: emit progress `synthesizing` FIRST, then the
existing `emitJarvisResponseStart` — so the HUD flips to "composing" before/with the
brief's first token stream. `onSynthesisDone` (`:131-133`) becomes: existing
`emitJarvisResponseEnd` first, then progress `done` — so `done` is truly terminal (the
HUD can key dismissal off it after the brief ends).

```ts
onSynthesisStart: (turnId) => {
  if (progress) emitJarvisRoutineProgress({ runId, routineName: opts.routineName, phase: "synthesizing", total, at: Date.now() });
  emitJarvisResponseStart({ turnId, at: Date.now() });
},
onSynthesisDone: (turnId) => {
  emitJarvisResponseEnd({ turnId, at: Date.now() });
  if (progress) emitJarvisRoutineProgress({ runId, routineName: opts.routineName, phase: "done", total, at: Date.now() });
},
```

Note: if the synthesis TURN itself errors, `runSynthesisTurn` still calls
`onSynthesisDone` after settle (`routine-runner.ts:559-566` — onError → settle → fall
through to `handlers.onSynthesisDone`), so `done` is guaranteed even on synthesis
failure. No extra error path needed.

---

## 5. Vitest plan

### 5.1 `apps/web/lib/jarvis/__tests__/routine-fire.test.ts` (NEW — the core assertion)

Mock strategy (both at module boundary, matching house style):

```ts
vi.mock("@/lib/jarvis/run-turn", () => ({ runJarvisTurnStream: ... }));   // reuse the
// driver-queue + deferredDriver harness from routine-runner.test.ts:29-125 (copy the
// ~40 lines; do NOT import across test files).
vi.mock("@/lib/voice/physical-extension/bus", () => ({
  emitJarvisResponseStart: vi.fn(), emitJarvisResponseChunk: vi.fn(),
  emitJarvisResponseEnd: vi.fn(), emitJarvisToolCall: vi.fn(),
  emitJarvisRoutineProgress: vi.fn((p) => progressEvents.push(p)),
}));
```

`db`/drizzle are NOT touched by `fireRoutineOverBus` itself (only `getEnabledRoutines`
uses db), so no db mock is needed — but `routine-fire.ts` imports `@/lib/db` at module
top for the other exports, so add `vi.mock("@/lib/db", () => ({ db: {} }))` and
`vi.mock("@/lib/db/schema", () => ({ routines: {} }))` to keep the import graph inert
under vitest (check whether the existing web vitest setup already aliases these; if
`extract-facts.test.ts`-style tests run without it, keep the mocks anyway — cheap).

`fireRoutineOverBus` is fire-and-forget (returns runId synchronously) — tests await
completion with `await vi.waitFor(() => expect(phases()).toContain("done"))`.

Tests:

1. **Full ordered lifecycle (parallel synthesize, 3 blocks: get_weather, read_gmail, get_news).**
   Queue 3 deferred gather drivers + 1 synthesis driver. Assert:
   - `progressEvents[0]` is `phase:"start"` with `total:3` and `sources` =
     `[{index:0,tool:"get_weather",label:"Weather",blockId:...}, ...]` in authored order,
     and that it was emitted BEFORE any `runJarvisTurnStream` call (compare against the
     turn-call log length captured inside the first driver's onStart).
   - Release gathers out of order (2, 0, 1): exactly 3 `gather-start` (index order 0,1,2)
     and 3 `gather-done` in release order (2,0,1), each with matching
     blockId/tool/label, `ok:true`.
   - Then exactly one `synthesizing`, then one `done`; `synthesizing` emitted before the
     brief's `emitJarvisResponseStart` mock call (assert via mock invocationCallOrder),
     `done` after `emitJarvisResponseEnd`.
   - Total event count = 1 + 3 + 3 + 1 + 1 = 9, all sharing `runId` = the function's
     return value and `routineName` = opts.routineName.
2. **blockId skeleton/gather agreement.** Blocks authored with empty `id:""` — assert the
   `start` skeleton's blockIds equal the blockIds later seen on gather-start/done
   (`${runId}:b0` etc., via `resolveBlockId` parity).
3. **Errored gather.** One driver calls `opts.onError("boom")` — its `gather-done` has
   `ok:false, error:"boom"`; lifecycle still reaches `synthesizing` + `done`.
4. **Non-synthesize routine emits NOTHING.** Same 3 blocks, `synthesize` undefined (and a
   second case: `synthesize:false`), default drivers. Await the last block's
   `emitJarvisResponseEnd`, then assert `emitJarvisRoutineProgress` was never called.
5. **Sequential synthesize (parallel:false) still emits the full sequence** — start,
   strictly alternating gather-start/gather-done pairs in index order, synthesizing, done.

### 5.2 `packages/jarvis-core/src/routines/labels.test.ts` (NEW)

- Explicit map hits: `get_weather→"Weather"`, `read_gmail→"Email"`, `get_news→"News"`,
  `read_whatsapp→"WhatsApp"`, `find_events→"Calendar"`.
- Fallback derivation: `run_applescript→"Run Applescript"`, `find_tasks` (mapped) vs. a
  hypothetical `read_foo_bar→"Foo Bar"`, unknown junk `"totally_fake"→"Totally Fake"`.

### 5.3 Existing tests

`routine-runner.test.ts` — no assertions change (the runner contract is untouched; the
`resolveBlockId` extraction is behavior-neutral). Run it to prove that.

---

## 6. Atomic commit task list (order = dependency order)

1. `feat(jarvis-core): sourceLabelForTool human labels for routine progress` — files 1, 2 (+ labels.test.ts may ride here or in commit 6; prefer here, test-with-unit).
2. `feat(web): jarvis-routine-progress payload type + bus emitter` — files 3, 4.
3. `refactor(web): extract resolveBlockId from runBlock (no behavior change)` — file 5.
4. `feat(web): emit routine progress lifecycle from fireRoutineOverBus` — file 6.
5. `feat(web): forward jarvis-routine-progress on the physical SSE route` — file 7.
6. `feat(desktop): jarvis-routine-progress SSE event + onJarvisRoutineProgress listener` — file 8.
7. `test(web): routine-fire progress emission ordering` — file 9.

Stage with explicit pathspecs per commit (house rule).

## 7. Verification

- `pnpm --filter @hyperpolymath/jarvis-core test` and `... typecheck` (labels).
- `pnpm --filter web test` (new routine-fire suite + untouched routine-runner suite green).
- `pnpm --filter web build` from repo root (Next build catches the route + bus type plumbing).
- Desktop typecheck: `pnpm --filter desktop typecheck` (or the desktop package's script name — verify in `apps/desktop/package.json` before running).
- Manual (optional, if a dev stack is running): fire a synthesize+parallel routine via
  `/api/jarvis/routines/run`, `curl -N .../api/jarvis/physical/events?token=hpd_...` and
  watch the `jarvis-routine-progress` frames tick.

## 8. Out of scope / notes for hud-loader (sibling unit)

- No HUD/UI. hud-loader subscribes via `onJarvisRoutineProgress` and renders: `start` →
  show loader + skeleton checklist from `sources` (ring denominator = `total`);
  `gather-done` → tick row `index` (error style when `ok:false`), ring numerator++;
  `synthesizing` → "composing your brief" state; `done` → dismiss.
- The opener speech ("Welcome home, sir — one moment.") still arrives as a normal
  response cycle under `${runId}:opener` — progress events are additive, not a
  replacement; the HUD can correlate via `runId` prefix if needed.
- `trigger`-only ESP32 hardware path and the web `use-physical-extension.ts` consumer are
  untouched; unknown SSE event types are ignored by EventSource consumers by default, so
  shipping the producer before the HUD is safe.
- Owner-gating and auth on the SSE route are unchanged (progress events flow through the
  same authenticated stream).
