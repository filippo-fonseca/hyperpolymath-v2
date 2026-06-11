# Phase 16: Smarter JARVIS — Session Memory + CRUD - Research

**Researched:** 2026-06-11
**Domain:** Anthropic multi-turn tool use, JARVIS pipeline modification, Drizzle CRUD, Google Calendar event mutation
**Confidence:** HIGH — all findings derived directly from reading the actual codebase files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Model-visible history with real tool blocks** — Replace `buildHistory()` text-summary flattening with history preserving `tool_use`/`tool_result` content blocks including created-entity IDs. `create_*` tool results must return the full created entity into the `tool_result` block.

2. **Session-entities scratchpad** — Structured block listing the last ~10 entities created/updated/deleted this session (id, type, title, timestamp, last action). Injected AFTER the cached static prompt prefix so Phase 11 cache breakpoints are not invalidated.

3. **CRUD tools** — New tools: `update_task`, `delete_task`, `update_capture`, `delete_capture`, `update_event`, `delete_event` in `packages/jarvis-core/src/tools/`, registered in `buildToolDefinitions()` with strict mode. Executor wraps existing Server Actions / query layer; `userId` ownership re-verified in every WHERE clause. Hard-delete semantics. Events via gcal API.

4. **Find tools + resolution policy** — New tools: `find_tasks`, `find_captures`, `find_events` — fuzzy lookup by text/date/status returning compact match lists with real ids. System-prompt policy in `TOOL_USE_RULES`: session → find_* → ask_clarification. NEVER hallucinate ids.

5. **Multi-pass agentic loop** — Route loops while `stop_reason === "tool_use"` (cap ~5 passes), feeding `tool_result` blocks back so find → act chains complete in one user turn. Single-pass turns must not regress latency.

6. **Receipt UI** — New receipt variants: find (compact match list), update (field diff), delete (tombstone). Undo gated to creates only. All persisted in `jarvis_turns`.

### Claude's Discretion

- Exact scratchpad format and turn-limit interplay with HISTORY_TURN_LIMIT (currently 10).
- Whether tool blocks are reconstructed from persisted `jarvis_turns` receipts or stored verbatim.
- `find_*` query implementation (ILIKE vs full-text) — single-user scale, keep it simple.
- Voice path inherits improvements wherever it shares the route; no voice-specific work required.

### Deferred Ideas (OUT OF SCOPE)

- Cross-session long-term memory via Anthropic memory tool
- Project/area CRUD via JARVIS
- Voice-specific conversational behaviors (barge-in corrections, etc.)
- Backlog 999.3 (JARVIS read layer) — reconcile when Phase 16 ships
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMJ-01 | Model-visible history: `buildHistory()` replaced with rich tool_use/tool_result blocks carrying entity IDs | Section: buildHistory() Current Shape; Anthropic multi-turn format |
| SMJ-02 | Session-entities scratchpad block injected after Phase 11 cache breakpoint | Section: prompt-builder.ts Cache Layout |
| SMJ-03 | `update_task`, `delete_task` tools + executor methods with userId ownership check | Section: Executor Patterns; tasks Drizzle schema |
| SMJ-04 | `update_capture`, `delete_capture` tools + executor methods | Section: Executor Patterns; captures Drizzle schema |
| SMJ-05 | `update_event`, `delete_event` tools + executor methods via gcal API | Section: GCal Event Update/Delete |
| SMJ-06 | `find_tasks`, `find_captures`, `find_events` tools + executor methods (ILIKE or tsvector) | Section: Find Query Patterns |
| SMJ-07 | TOOL_USE_RULES system-prompt policy: session → find_* → ask_clarification resolution | Section: personality.ts / TOOL_USE_RULES |
| SMJ-08 | Multi-pass agentic loop in `run-turn.ts` (cap ~5), feeding tool_result blocks back | Section: Current run-turn.ts Loop; Agentic Loop Architecture |
| SMJ-09 | `JarvisToolDefinition` union expanded to 11 tools; `JarvisToolDefinition.name` type updated | Section: tools/index.ts Registration Pattern |
| SMJ-10 | `ScrollbackAction.name` union expanded; new receipt variants in JarvisReceipt | Section: jarvis-types.ts; JarvisReceipt Pattern |
| SMJ-11 | `jarvis_turns.actions` JSONB schema carries new action types; no migration needed | Section: jarvis_turns Schema |
| SMJ-12 | Tests updated: delete_task no longer SSE-errors; adversarial suite updated | Section: Test Contract Changes |
| SMJ-13 | `buildHistory()` and `JarvisRequestBody.history` type updated to carry rich content blocks | Section: Client-Side History Reconstruction |
</phase_requirements>

---

## Summary

Phase 16 is a pipeline-wide surgery across four layers: the Anthropic message format, the prompt builder, the executor, and the receipt UI. It does NOT require new database tables — `jarvis_turns.actions` is already JSONB and can carry whatever shape is needed. No migrations are needed for the six locked decisions; a migration is only needed if the session-entities scratchpad is stored server-side (it need not be).

The biggest architectural decision is the **agentic loop** in `run-turn.ts`. Currently `runJarvisTurnStream` calls `anth.messages.stream()` once and settles all `tool_use` blocks in parallel via `Promise.allSettled(pendingActions)`. The agentic loop must replace this with a `while (stop_reason === "tool_use")` loop that collects tool results into an `assistant` + `user` (tool_result) message pair and feeds them back to Anthropic. The SSE protocol (route.ts) stays unchanged — it just gets more `queued`/`action` events per turn.

The second key decision is **history format**. Today `buildHistory()` in `JarvisConsole.tsx` produces `Array<{ role: "user"|"assistant"; content: string }>` — plain text summaries. For multi-turn CRUD the model needs to see real `tool_use` + `tool_result` content blocks so it can resolve "the qc" to a specific entity id from the previous turn. The new format must use the Anthropic multi-turn content-block shape. The `JarvisRequestBody.history` field type and `buildHistory()` must both change.

**Primary recommendation:** Implement the agentic loop in `run-turn.ts` first (SMJ-08) because it gates everything else. Then expand tools (SMJ-03..07), then update history format (SMJ-01, SMJ-13), then receipt UI (SMJ-10).

---

## Standard Stack

### Core (no new dependencies required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.94.x (already installed) | Multi-turn messages with content blocks | Already in use; streaming + tool_result format is SDK-native |
| `drizzle-orm` | 0.36.x (already installed) | Typed UPDATE/DELETE + ILIKE queries for find_* | Already in use for all DB access |
| `zod` | 4.x (already installed) | Schemas for 6 new tools | Existing pattern — all tools use Zod 4 + `z.toJSONSchema()` |
| `googleapis` | 144.x (already installed) | GCal event patch/delete | `patchEvent` + `deleteEvent` wrappers already exist in `lib/gcal/events.ts` |

**No new npm packages.** All tooling already present.

---

## Architecture Patterns

### Current JARVIS Pipeline (what exists today)

```
POST /api/jarvis/route.ts
  └─ runJarvisTurnStream (lib/jarvis/run-turn.ts)
       ├─ ONE anth.messages.stream() call
       ├─ contentBlock handler → parallel executor dispatch
       ├─ Promise.allSettled(pendingActions)
       └─ onDone(usage)
```

**Current history shape** (JarvisConsole.buildHistory, line 171):
```typescript
// TODAY — flat text summaries, no entity ids
Array<{ role: "user" | "assistant"; content: string }>
```

**Target history shape** (Anthropic multi-turn content blocks):
```typescript
// AFTER — content blocks with tool_use + tool_result
Array<{
  role: "user" | "assistant";
  content: string | Array<ContentBlock>;
}>
// Where assistant turns include:
//   [{ type: "text", text: "Handled, sir..." },
//    { type: "tool_use", id: "toolu_xxx", name: "create_capture", input: {...} }]
// And user turns (for tool results) include:
//   [{ type: "tool_result", tool_use_id: "toolu_xxx", content: JSON.stringify(result) }]
```

### Pattern 1: Agentic Loop in run-turn.ts

**What:** Replace the single `anth.messages.stream()` call with a `while` loop that feeds tool_result blocks back until stop_reason is not `tool_use` or the loop cap (5) is hit.

**When to use:** Always — but single-tool single-pass turns must not regress (the loop exits after one pass when stop_reason is `end_turn`).

**Constraint:** The existing SSE event protocol (`queued`, `action`, `text`, `done`) is unchanged. The loop just emits more events across multiple passes.

```typescript
// Sketch — actual implementation in run-turn.ts
const loopMessages = [...anthropicMessages];
let passCount = 0;
const LOOP_CAP = 5;

while (passCount < LOOP_CAP) {
  passCount++;
  const stream = anth.messages.stream({ ..., messages: loopMessages });

  // collect text deltas + tool_use blocks from this pass
  const toolResults: ToolResultBlock[] = [];

  for await (const event of stream) {
    // emit onTextDelta, onQueued as before
    // on tool_use block: run executor, collect result into toolResults
  }

  const final = await stream.finalMessage();
  if (final.stop_reason !== "tool_use" || toolResults.length === 0) break;

  // Append assistant turn + tool_result user turn and loop
  loopMessages.push({ role: "assistant", content: final.content });
  loopMessages.push({
    role: "user",
    content: toolResults.map(r => ({
      type: "tool_result",
      tool_use_id: r.id,
      content: JSON.stringify(r.result),
    }))
  });
}
```

**Loop cap rationale:** find_tasks → delete_task is 2 passes. find_captures → update_capture → confirm is at most 3. Cap of 5 gives two passes of margin.

### Pattern 2: Session-Entities Scratchpad Placement

**Cache breakpoint layout in prompt-builder.ts (Phase 11):**

```
Block 1: JARVIS_PERSONALITY               (no cache_control)
Block 2: TOOL_USE_RULES                   (no cache_control)
Block 3: USER CONTEXT (displayName)       (no cache_control)
Block 4: USER PROJECTS (project list)     — cache_control 1h  ← LAST when no facts
       OR
Block 4: USER PROJECTS                    (no cache_control when facts present)
Block 5: JARVIS MEMORY (facts)            — cache_control 1h  ← LAST when facts present
```

Then in **run-turn.ts**, the snapshot block is appended after `buildSystemPrompt()`:
```typescript
system.push({
  type: "text",
  text: snapshotString,          // per-turn state (5min TTL)
  cache_control: { type: "ephemeral" }  // default 5min
});
```

**Session-entities scratchpad MUST go after the snapshot block** — it's per-turn volatile data (changes every time JARVIS acts). Append it in `run-turn.ts` the same way the snapshot is appended, AFTER the snapshot push. Do NOT add it to `buildSystemPrompt()` in `prompt-builder.ts` — that would invalidate the 1h cache.

```typescript
// In run-turn.ts, after system.push(snapshotBlock):
if (sessionEntities.length > 0) {
  system.push({
    type: "text",
    text: buildSessionEntitiesBlock(sessionEntities),
    // NO cache_control — volatile per-pass, must not cache
  });
}
```

### Pattern 3: New Tool Schema Pattern (matches existing)

Reference `packages/jarvis-core/src/tools/create-task.ts`. Each new tool gets its own file. The `buildToolDefinitions()` union type must expand:

```typescript
// tools/index.ts — JarvisToolDefinition.name union expands
name: "create_task" | "create_capture" | "create_event" |
      "remember_fact" | "ask_clarification" |
      "update_task" | "delete_task" |
      "update_capture" | "delete_capture" |
      "update_event" | "delete_event" |
      "find_tasks" | "find_captures" | "find_events";
```

The `cache_control` breakpoint stays on the LAST tool in the array (currently `ask_clarification`). With 6 new tools + 3 find tools, the new LAST tool will be `find_events` (or whichever is placed last). Moving the breakpoint is a one-line change.

### Pattern 4: Executor Methods for Update/Delete

**Task update/delete** — Drizzle `db.update(tasks).set({...}).where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)))`. The double WHERE is the ownership check. Return rowcount; if 0 → `{ ok: false, kind: "not_found" }`.

**Capture update/delete** — Same pattern on `captures` table.

**Event update/delete** — Use `getValidGcalToken(ctx.userId)` then `patchEvent` / `deleteEvent` from `lib/gcal/events.ts`. Both wrappers already exist (confirmed in `events.ts` lines 43–58). Throw/catch `GcalTokenRevokedError` / `GcalNotConnectedError` the same way `createEvent` does.

### Pattern 5: Find Queries

Single-user scale. Use Drizzle `ilike()` for text search — no need for full-text here.

```typescript
// find_tasks: ILIKE on title, optional status/priority filter
db.select({ id, title, status, priority, dueDate })
  .from(tasks)
  .where(and(
    eq(tasks.userId, ctx.userId),
    ilike(tasks.title, `%${query}%`),
  ))
  .limit(10)
```

```typescript
// find_captures: ILIKE on content
db.select({ id, content: sql`substr(content, 1, 120)`, createdAt })
  .from(captures)
  .where(and(
    eq(captures.userId, ctx.userId),
    ilike(captures.content, `%${query}%`),
  ))
  .limit(10)
```

**find_events**: Calls `getValidGcalToken` then `listEvents` from `lib/gcal/events.ts` with a `q` (free-text) param and `timeMin`/`timeMax` window. GCal's own full-text search is better than ILIKE for event titles.

### Pattern 6: buildHistory() Reconstruction

The new `buildHistory()` must emit Anthropic-compatible multi-turn content blocks, not text summaries. Options:

**Option A — Reconstruct from persisted receipts** (recommended per CONTEXT.md discretion note):
- `jarvis_turns.actions` is already JSONB carrying `{ toolUseId, name, result, status }`.
- For each assistant turn: emit `{ type: "text", text: textDelta }` + one `{ type: "tool_use", id: toolUseId, name, input: reconstructed_input }`.
- For the following user turn: emit `tool_result` blocks from `result`.
- Limitation: `input` is not stored — only `result`. Reconstruct a minimal `input` from the receipt fields (e.g., `create_task` receipt has `title`, `priority`, `due`, `project_ids`).

**Option B — Store raw tool_use input in jarvis_turns** (heavier, requires schema + migration):
- Add `tool_use_blocks jsonb` column to `jarvis_turns`.
- Store the raw `b.input` from the stream alongside `actions`.
- Reconstruct faithfully.

**Recommendation:** Option A for MVP (no migration, uses data already stored). The reconstructed input from receipt fields is sufficient for the model to understand what it did. The critical identity-carrying field is `toolUseId` → `tool_result.tool_use_id`, which is already in `jarvis_turns.actions`.

**New JarvisRequestBody.history type:**
```typescript
// route.ts currently:
history: Array<{ role: "user" | "assistant"; content: string }>;
// Must become:
history: Array<{
  role: "user" | "assistant";
  content: string | ContentBlock[];
}>;
```

The Anthropic SDK accepts `content` as either a string or an array of content blocks. This is a compatible widening.

### Anti-Patterns to Avoid

- **Storing session-entities in the 1h cached prefix** — invalidates cache on every tool call. Must go in the per-turn volatile block after the snapshot.
- **Reconstructing history inside the agentic loop from already-accumulated loop messages** — loop messages already accumulate tool_use/tool_result; don't mix in the external history reconstruction logic. The `loopMessages` array is the single source of truth for the current turn's multi-pass context.
- **Calling `find_*` inside the executor synchronously blocking the SSE stream** — find results are returned as `tool_result` blocks, same as create results. The agentic loop handles sequencing.
- **Setting `tool_choice: { type: "tool", name: "find_*" }` for forced find turns** — the model must be able to choose between find and act autonomously; don't override tool_choice for the inner loop passes.
- **Emitting undo button on delete/update receipts** — Undo is gated to creates only (locked decision 6). Delete tombstone has no undo. Update diff has no undo.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GCal event fetch for find_events | Custom REST fetch | `listEvents` in `lib/gcal/events.ts` | Wrapper already handles OAuth + token refresh |
| GCal event update | Raw googleapis call | `patchEvent` in `lib/gcal/events.ts` | Already exists at line 43 |
| GCal event delete | Raw googleapis call | `deleteEvent` in `lib/gcal/events.ts` | Already exists at line 52 |
| Token refresh | Manual refresh logic | `getValidGcalToken(userId)` | Already handles expiry, revocation, re-encryption |
| Strict tool JSON Schema | Manual JSON Schema | `z.toJSONSchema(schema, { target: "openapi-3.1" })` + `additionalProperties: false` | Existing pattern in `tools/index.ts:toJsonSchema()` |

---

## Detailed Codebase Findings

### run-turn.ts — Current Loop (lines 278–376)

The current implementation calls `anth.messages.stream()` once. Tool_use blocks are handled via a `contentBlock` event listener that spawns async `work` promises collected in `pendingActions: Promise<void>[]`. The stream settles with `await anthStream.finalMessage()` then `await Promise.allSettled(pendingActions)`.

**What changes for the agentic loop:**
1. Replace the single stream call with a `while` loop.
2. In each pass, collect tool_use id + name + executor result as a `toolResults` array.
3. After `finalMessage()`, if `stop_reason === "tool_use"`, append `assistant` + `user`(tool_result) messages and loop.
4. The `onQueued`/`onAction`/`onTextDelta` callbacks still fire per event — the SSE protocol is unchanged.
5. `usage` on `onDone` must aggregate across all passes (sum token counts).

**The `executor` dispatch in the contentBlock handler stays unchanged** — it already covers the branching logic for each named tool. The 6 new tools (update/delete/find) add new `else if` branches.

### JarvisRequestBody.history (route.ts lines 53–66)

Currently typed as `Array<{ role: "user" | "assistant"; content: string }>`. This type is shared between the HTTP body and `anthropicMessages` passed into `runJarvisTurnStream`. Both must widen to accept content-block arrays.

**The `JarvisRequest` in `jarvis-stream-client.ts`** (used by JarvisConsole to build the fetch body) will also need updating — but this is likely a `history` field that mirrors the route body type.

### buildHistory() in JarvisConsole.tsx (lines 170–202)

Currently maps each assistant ScrollbackTurn to a text string by joining prose + action summaries. **Replacement:**

For each assistant ScrollbackTurn:
- Emit one `{ role: "assistant", content: ContentBlock[] }` where content contains:
  - `{ type: "text", text: turn.textDelta }` (if non-empty)
  - For each `action` with `status === "done"` and `result.ok === true`:
    - `{ type: "tool_use", id: action.toolUseId, name: action.name, input: reconstructInputFromReceipt(action) }`
- Immediately follow with `{ role: "user", content: ToolResultBlock[] }`:
  - `{ type: "tool_result", tool_use_id: action.toolUseId, content: JSON.stringify(action.result) }`

The `reconstructInputFromReceipt` function rebuilds a minimal valid input from the receipt fields. This only needs to produce valid input for the fields the model cares about for reference resolution (primarily `id`, `title`, `content`).

**CRITICAL:** Anthropic requires that after an assistant turn with tool_use blocks, the immediately following user turn must contain `tool_result` blocks for all tool_use ids from that turn. No user text turn may appear between them. This means each assistant turn with actions generates a synthetic pair: `assistant (text + tool_use) → user (tool_result)`. The actual next user message comes after.

### prompt-builder.ts — Cache Breakpoint Layout (confirmed)

The last system block carries `cache_control: { type: "ephemeral", ttl: "1h" }`. In `run-turn.ts`, the snapshot block is appended after `buildSystemPrompt()` with `cache_control: { type: "ephemeral" }` (5min default). The session-entities scratchpad must be appended AFTER the snapshot, with NO cache_control (it changes on every agentic loop pass within a single user turn).

### executor.ts — Existing Method Structure

`createServerExecutor()` returns an object with 5 methods: `createTask`, `createCapture`, `createEvent`, `askClarification`, `rememberFact`. Each takes `(input, ctx: ExecutionContext)`. The `ExecutionContext` contains `userId`, `userTimezone`, `defaultCalendarId`, `preValidatedProjectIds`, `source`.

**New methods to add:**
- `updateTask(input, ctx)` — Drizzle `db.update(tasks).set({...}).where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))`
- `deleteTask(input, ctx)` — Drizzle `db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))`
- `updateCapture(input, ctx)` — Same on captures table
- `deleteCapture(input, ctx)` — Same on captures table
- `updateEvent(input, ctx)` — `getValidGcalToken(ctx.userId)` → `patchEvent(cal, input.calendar_id, input.id, patches)`
- `deleteEvent(input, ctx)` — `getValidGcalToken(ctx.userId)` → `deleteEvent(cal, input.calendar_id, input.id)`
- `findTasks(input, ctx)` — Drizzle ilike query
- `findCaptures(input, ctx)` — Drizzle ilike query
- `findEvents(input, ctx)` — `getValidGcalToken` → `listEvents` with `q` param

### ActionExecutor Interface (packages/jarvis-core/src/types.ts)

The `ActionExecutor` interface (imported in executor.ts) must be extended to declare the 9 new methods. This is in `@hyperpolymath/jarvis-core` — changes here propagate to both the web app executor and any future CLI.

### jarvis_turns Schema — No Migration Needed

`jarvis_turns.actions` is `jsonb NOT NULL DEFAULT '[]'` (confirmed in schema.ts line 353 and migration `0009_jarvis_turns.sql`). The JSONB column already carries `ScrollbackAction[]`. The new tool names (`update_task`, `delete_task`, `find_tasks`, etc.) just become new values in the existing `name` field — no schema change needed.

**The `ScrollbackAction.name` union in `jarvis-types.ts`** (line 48) must be expanded to include the 9 new names.

### Test Contract Changes

**`apps/web/tests/jarvis-route.test.ts`** — Test 8 asserts:
> "Fabricated tool name (e.g. 'delete_task') → SSE 'error' event, NO 'action' event, executor never dispatched."

Once `delete_task` is a real tool, this test must be updated. The adversarial defense must instead use a truly fabricated name (e.g., `drop_database`, `destroy_all`). Test 8's comment block explicitly calls out this contract change (line 18 of the test file).

**`apps/web/tests/jarvis-adversarial.test.ts`** — Same issue. The suite tests "tool-fabrication for every shape the model might invent (delete, drop, update, system, exec)." The `delete_*` and `update_*` fabrication tests must be updated to use names that will never be real tools (`drop_database`, `exec_sql`, etc.).

**`packages/jarvis-core/tests/ask-clarification.test.ts`** — Likely unaffected (tests clarification tool schema, not the route loop).

### Voice Path (mobile /api/jarvis/voice/text and desktop)

**`/api/jarvis/voice/text/route.ts`** (confirmed read) calls `runJarvisTurnStream` directly — the same helper used by the browser route. Since the agentic loop lives in `runJarvisTurnStream`, the voice text route inherits the improvements automatically. No voice-specific changes required. The route does not construct `history` from `buildHistory()` (it's a single-turn voice input with no browser session state), so the history format change in `JarvisConsole` does not affect it.

### find_events — GCal API Query

`listEvents` in `lib/gcal/events.ts` already wraps `cal.events.list(params)`. The `find_events` executor method will call:
```typescript
const cal = await getValidGcalToken(ctx.userId); // returns calendar_v3.Calendar
const resp = await listEvents(cal, {
  calendarId: "primary",  // or iterate ctx.defaultCalendarId
  q: input.query,         // GCal free-text search
  timeMin: input.time_min ?? new Date().toISOString(),
  timeMax: input.time_max,
  singleEvents: true,
  maxResults: 10,
});
```

### Session-Entities Scratchpad Format (Claude's Discretion)

Recommended format (XML-tagged plain text, consistent with Phase 11 snapshot style):

```
SESSION ENTITIES (this session only — use these ids for update/delete, do not re-find):
[TASK] id=abc123 title="Finish the report" status="not started" action=created at=2026-06-11T14:22:00Z
[CAPTURE] id=def456 content="Note about X..." action=created at=2026-06-11T14:23:00Z
[EVENT] id=evt789 title="Coffee with Brian" calendar_id=primary action=created at=2026-06-11T14:24:00Z
```

Keep last ~10 entities. Trim oldest first when list exceeds 10. Include all CRUD actions (created, updated, deleted). Deleted entities stay in the list (so JARVIS knows "you can't update something you just deleted").

This block is built in-memory per-turn from the executor results collected during the agentic loop. NOT stored in `jarvis_turns` — it is session-scoped and reconstructed from `ScrollbackTurn.actions` at submit time in `JarvisConsole`.

### Receipt UI — New Variants

`JarvisReceipt.tsx` currently handles: `create_task`, `create_capture`, `create_event`, `remember_fact`, `ask_clarification`.

New variants needed:
- **`find_tasks` / `find_captures` / `find_events`**: Compact match list. Show up to 5 results with id truncation. No undo.
- **`update_task` / `update_capture` / `update_event`**: Field diff (before → after). Show only changed fields. No undo.
- **`delete_task` / `delete_capture` / `delete_event`**: Tombstone render. Show deleted entity title in strikethrough. No undo. Intent dot: `--ink-coral` (destructive).

`INTENT_META` in `JarvisReceipt.tsx` must be extended with entries for each new tool name.

`ScrollbackAction.name` type gate in `JarvisReceipt` (line 121: `if (!meta) return null`) provides automatic safety for unmapped tools.

### Undo Gating

`handleUndoAction` in `JarvisConsole.tsx` (lines 705–784) already checks `action.name` to build `UndoTarget`. It only handles `create_task`, `create_capture`, `create_event`. Update/delete/find tools must NOT be wired to undo — simply don't add them to the switch. The receipt's `undoEligible` check (line 218 of JarvisReceipt) gates on `onUndo` being defined, which is only passed by `JarvisScrollback` when the parent wires it. The parent only wires undo for `create_*` names.

---

## Common Pitfalls

### Pitfall 1: Tool result format in multi-turn messages
**What goes wrong:** Passing tool results as a string instead of the Anthropic content block format causes API 400 errors.
**Why it happens:** The Anthropic SDK's TypeScript types for multi-turn messages with tool_result are strict. `content` must be an array when mixing types.
**How to avoid:** Tool result user messages must use:
```typescript
{ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: stringifiedResult }] }
```
**Warning signs:** 400 Bad Request from Anthropic with "content must be array" in message.

### Pitfall 2: Mixing loop-accumulated messages with external history
**What goes wrong:** Appending the external `buildHistory()` result inside the agentic loop after pass 1 causes duplicate context.
**Why it happens:** The loop accumulates its own growing `loopMessages`. The external history is already baked in at loop start.
**How to avoid:** Initialize `loopMessages` with `[...anthropicMessages]` BEFORE the loop. External history is only in the seed. Loop iterations only append assistant + tool_result turns.

### Pitfall 3: Cache invalidation from session-entities block
**What goes wrong:** Placing the session-entities scratchpad inside `buildSystemPrompt()` invalidates the 1h prompt cache on every action (because entity ids change every turn).
**Why it happens:** Cache breakpoints cache everything BEFORE them. A volatile block inside the static prefix breaks the cache.
**How to avoid:** Append session-entities AFTER `system.push(snapshotBlock)` in `run-turn.ts`, with no `cache_control`. The snapshot already has its own 5min breakpoint.

### Pitfall 4: delete_task test regression
**What goes wrong:** Existing test in `jarvis-route.test.ts` asserts `delete_task` is an unknown fabricated tool → SSE error. This breaks the moment `delete_task` is added to `buildToolDefinitions()`.
**Why it happens:** The test was written when delete tools didn't exist — this is documented explicitly in the test file header.
**How to avoid:** Update the fabricated tool test to use `drop_database` or `exec_sql` before or during the same wave as SMJ-03.

### Pitfall 5: find_events 404 when GCal not connected
**What goes wrong:** `find_events` executor throws `GcalNotConnectedError` if user has no GCal token; this surfaces as an executor error mid-loop rather than a graceful response.
**Why it happens:** `getValidGcalToken` throws typed errors rather than returning null.
**How to avoid:** Catch `GcalNotConnectedError` in `findEvents` executor method and return `{ ok: false, kind: "revoked", error: "..." }` — same pattern as `createEvent`.

### Pitfall 6: Anthropic strict mode rejects new tool schemas with unsupported JSON Schema keywords
**What goes wrong:** `find_tasks` schema uses `z.array(z.string()).optional()` for status filter — Anthropic strict mode rejects schemas with certain array keywords (`uniqueItems`, `maxItems`).
**Why it happens:** Documented in existing codebase comment (`ask-clarification.ts` line 20: "Array `.max()` is intentionally omitted — Anthropic's strict tool use rejects JSON Schema `maxItems`").
**How to avoid:** Do NOT use `.max()` on array fields in new tool schemas. Enforce limits in personality copy only.

### Pitfall 7: Token budget inflation from 9 new tools
**What goes wrong:** Adding 9 tool definitions (6 CRUD + 3 find) to `buildToolDefinitions()` meaningfully increases the token count of the tools cache tier. The cache TTL is 1h but the cache write cost is paid once per hour.
**Why it happens:** Each tool definition has a description + JSON Schema in the Anthropic messages call.
**How to avoid:** Keep new tool descriptions short (1–2 sentences). The existing tools average ~40 tokens each. 9 new tools ≈ +360 tokens — acceptable but measurable. Log `cache_creation_input_tokens` on the first turn after shipping to confirm the new baseline.

---

## Code Examples

### Agentic loop skeleton (run-turn.ts)

```typescript
// Source: codebase analysis — follows existing run-turn.ts patterns
const loopMessages: AnthropicMessage[] = [...anthropicMessages];
let passCount = 0;
const LOOP_CAP = 5;
let totalUsage: RunTurnUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

while (passCount < LOOP_CAP) {
  passCount++;
  const pendingActions: Promise<{ id: string; name: string; result: unknown }[]> = [];

  const anthStream = anth.messages.stream({
    model: JARVIS_MODEL,
    max_tokens: 1024,
    system: system as never,
    tools: tools as never,
    tool_choice: passCount === 1 ? toolChoice : { type: "auto" } as never,
    messages: loopMessages as never,
  }, { signal: upstream.signal });

  // ... collect events, emit SSE callbacks ...

  const final = await anthStream.finalMessage();
  await Promise.allSettled(pendingActions);

  // Accumulate usage
  totalUsage.input_tokens += final.usage.input_tokens;
  // ...

  if (final.stop_reason !== "tool_use") break;

  // Build tool_result blocks for next pass
  const toolResultBlocks = toolResultsThisPass.map(r => ({
    type: "tool_result" as const,
    tool_use_id: r.id,
    content: JSON.stringify(r.result),
  }));
  loopMessages.push({ role: "assistant", content: final.content });
  loopMessages.push({ role: "user", content: toolResultBlocks });
}

opts.onDone(totalUsage);
```

### Update task executor method

```typescript
// Source: codebase analysis — follows existing createTask pattern
async updateTask(input: UpdateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult> {
  const updateFields: Partial<typeof tasks.$inferInsert> = {};
  if (input.title !== undefined) updateFields.title = input.title;
  if (input.priority !== undefined) updateFields.priority = input.priority;
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.due !== undefined) updateFields.dueDate = new Date(input.due).toISOString().slice(0, 10);

  const rows = await db
    .update(tasks)
    .set({ ...updateFields, updatedAt: new Date() })
    .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
    .returning({ id: tasks.id, title: tasks.title });

  if (rows.length === 0) {
    return { ok: false, kind: "not_found", error: "Task not found or not owned by user" };
  }
  return { ok: true, id: input.id, receipt: { id: input.id, changes: updateFields } };
}
```

### Delete capture executor method

```typescript
// Source: codebase analysis — follows undoJarvisActionForUser pattern
async deleteCapture(input: DeleteCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult> {
  const rows = await db
    .delete(captures)
    .where(and(eq(captures.id, input.id), eq(captures.userId, ctx.userId)))
    .returning({ id: captures.id, content: captures.content });

  if (rows.length === 0) {
    return { ok: false, kind: "not_found", error: "Capture not found" };
  }
  return {
    ok: true,
    id: input.id,
    receipt: { id: input.id, content: rows[0]!.content.slice(0, 80), deleted: true }
  };
}
```

### Session-entities scratchpad builder

```typescript
// Source: codebase analysis — follows Phase 11 snapshot XML style
function buildSessionEntitiesBlock(entities: SessionEntity[]): string {
  const lines = entities.slice(-10).map(e =>
    `[${e.type.toUpperCase()}] id=${e.id} title="${e.title ?? e.content?.slice(0, 60) ?? ""}" action=${e.action} at=${e.timestamp}`
  );
  return [
    "SESSION ENTITIES (ids are real — use for update/delete without calling find_* again):",
    ...lines
  ].join("\n");
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-pass Anthropic stream | Agentic loop (this phase) | Phase 16 | find→act chains complete in one user turn |
| Text-summary history | Rich tool_use/tool_result blocks | Phase 16 | Model can resolve entity references ("the qc") |
| 5 tools (create + utils) | 14 tools (+ CRUD + find) | Phase 16 | Full session CRUD without leaving JARVIS |
| Undo on all creates | Undo gated to creates only | Phase 16 | Explicit: delete is permanent, no undo |

---

## Open Questions

1. **Usage aggregation across loop passes**
   - What we know: each `finalMessage()` returns its own `usage` object. `onDone` currently fires once.
   - What's unclear: whether `jarvis_events` logging should show per-pass or total tokens. Current `logJarvisEvent` accepts a single usage object.
   - Recommendation: Sum all pass token counts before calling `onDone`. Log the aggregate. Keep per-pass granularity in a `metadata` jsonb field if needed.

2. **Session-entities scratchpad — where is the source of truth?**
   - What we know: CONTEXT.md says "Claude's discretion" on reconstruction vs storage. `jarvis_turns.actions` has all entity ids already.
   - What's unclear: On page reload, should the scratchpad be rebuilt from `jarvis_turns`? If yes, it needs to be populated from persisted receipts at the start of `buildHistory()`.
   - Recommendation: Rebuild from `ScrollbackTurn.actions` at `buildHistory()` call time (same array used for scrollback). This keeps it session-coherent without server-side storage changes.

3. **find_events calendar scope**
   - What we know: `ctx.defaultCalendarId` is available. Users may have multiple visible calendars (`gcalVisibleCalendarIds`).
   - What's unclear: Should `find_events` search across ALL visible calendars or just the default?
   - Recommendation: Search the default calendar only for MVP simplicity. The `find_events` tool description can note this constraint.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified beyond existing integrations already wired in the codebase — GCal, Anthropic, Drizzle all already in use).

---

## Sources

### Primary (HIGH confidence — all from direct codebase reads)

- `apps/web/app/api/jarvis/route.ts` — SSE event protocol, request body shape, toolChoice logic
- `apps/web/lib/jarvis/run-turn.ts` — Full agentic helper: Anthropic stream, contentBlock handler, executor dispatch, pending actions pattern
- `packages/jarvis-core/src/tools/index.ts` — Tool registration pattern, cache breakpoint, toJsonSchema helper
- `packages/jarvis-core/src/tools/create-task.ts` — Schema pattern to replicate for new tools
- `packages/jarvis-core/src/tools/ask-clarification.ts` — Strict mode array constraint (no .max())
- `packages/jarvis-core/src/prompt-builder.ts` — Cache breakpoint layout (Phase 11); where scratchpad must go
- `packages/jarvis-core/src/personality.ts` — TOOL_USE_RULES location for resolution policy copy
- `apps/web/lib/jarvis/executor.ts` — ActionExecutor interface and all current methods; createEvent gcal error handling pattern
- `apps/web/components/jarvis/JarvisConsole.tsx` — buildHistory() current shape; handleUndoAction; persistTurn
- `apps/web/components/jarvis/JarvisReceipt.tsx` — INTENT_META, receipt render patterns, UndoButton, undo-eligible check
- `apps/web/components/jarvis/jarvis-types.ts` — ScrollbackAction, ScrollbackTurn types
- `apps/web/lib/db/schema.ts` — tasks, captures, jarvisTurns table schemas
- `apps/web/lib/gcal/events.ts` — patchEvent, deleteEvent wrappers (already exist)
- `apps/web/lib/gcal/token.ts` — getValidGcalToken error contract
- `apps/web/tests/jarvis-route.test.ts` — Test 8 delete_task contract (must change)
- `apps/web/tests/jarvis-adversarial.test.ts` — Fabricated tool tests (must update)
- `apps/web/app/api/jarvis/voice/text/route.ts` — Voice path uses runJarvisTurnStream directly; inherits loop automatically
- `apps/web/drizzle/0009_jarvis_turns.sql` — jarvis_turns JSONB schema confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all tools already present
- Architecture (agentic loop): HIGH — Anthropic SDK multi-turn format is well-understood; current code is the template
- Architecture (cache placement): HIGH — prompt-builder.ts cache layout read directly
- Pitfalls: HIGH — all pitfalls identified from direct code inspection, not inference
- Test contract changes: HIGH — test file comment explicitly documents the delete_task contract change

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable Anthropic SDK + Drizzle; low churn domain)
