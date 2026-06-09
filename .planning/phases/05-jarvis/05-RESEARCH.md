# Phase 5: JARVIS - Research

**Researched:** 2026-05-14
**Domain:** Anthropic streaming + strict tool use, pnpm workspace factor, Next.js 16 SSE, chrono + IANA + DST
**Confidence:** HIGH

## Summary

Four narrow priorities verified against current Anthropic platform docs (May 2026), npm registry, Vercel docs, and the in-repo Phase 2 composer. Three corrections to CLAUDE.md surfaced:

1. **`@anthropic-ai/sdk` is at `0.96.0`** (verified npm 2026-05-13). CLAUDE.md says `0.94.x` — one minor behind. Use `^0.96.0`.
2. **`structured-outputs-2025-11-13` beta header is no longer required** — structured outputs went GA. Set `strict: true` per tool definition.
3. **`parallel_tool_use` is ON by default** for Claude 4 models. No flag, no header.

Other load-bearing facts: `pnpm-workspace.yaml` already includes `packages/*` (no config change); Vercel Pro default function duration is 300s with fluid compute (JARVIS-15 p95 < 10s well within); chrono-node v2 cannot accept IANA strings — wrap results in `@date-fns/tz` `TZDate` for DST correctness.

**Primary recommendation:** Build `/api/jarvis` around `client.messages.stream()` with the SDK's `.on("contentBlock", ...)` helper for completed tool_use blocks. Pipe events through `new ReadableStream({ start, cancel })` as `text/event-stream` with `X-Accel-Buffering: no` (Vercel-load-bearing). Client consumes via `fetch + body.pipeThrough(new TextDecoderStream()).getReader()` (not `EventSource` — POST unsupported). chrono parses grammar; `TZDate` interprets components in user's IANA zone.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** JARVIS Console REPLACES `/today` as the authenticated homescreen.
- **D-02:** Reuse Phase 2's TipTap composer; add `$project` mention extension as sibling to `#hashtag`.
- **D-03:** Auto-execute on tool emit with 5s sonner undo toast. Multi-action sentences → N separate execute+undo flows.
- **D-04:** Undo: task soft-delete; capture soft-delete; event `events.delete()` against gcal (best-effort).
- **D-05:** Terminal-style scrollback. Single column, top-down, mono for resolved fields + EB Garamond for human text. Input pinned at bottom.
- **D-06:** Session memory IS the scrollback. Refresh clears both. Last-N-turns sent to model.
- **D-07:** Slash commands at input start (`/task`, `/capture`, `/event`, `/help`). Default no-slash = auto-infer.
- **D-08:** Three Zod schemas in `jarvis-core` → JSON Schema via Zod 4 `.toJSONSchema()`. Server-side validation BEFORE execution.
- **D-09:** `cache_control: { type: "ephemeral" }` on system prompt + tool definitions + static project list.
- **D-10:** `chrono-node@2` runs CLIENT-SIDE. Resolves relative dates to ISO using `users.timezone`.
- **D-11:** `jarvis_events` Postgres table (RES-05) — additive migration.
- **D-12:** `packages/jarvis-core` is pure TypeScript workspace package. Zero React/Next imports.
- **D-13:** v1 thinking-word indicator with Motion 12 crossfade.
- **D-14:** "Convert to task" affordance on JARVIS-created captures. `captures.created_via = 'jarvis'` additive column.
- **D-15:** Adversarial prompt-injection test suite. No destruction tools structurally. Server-side ID re-derivation.
- **D-16:** System prompt establishes British formal JARVIS personality. Phase 7 adds voice addendum + `voice_summary` field.

### Claude's Discretion

Thinking-word list. Slash command autocomplete UI. Receipt block layout. Empty-state copy. Last-N-turns window (5-10). Adversarial fixture corpus (~10 cases).

### Deferred Ideas (OUT OF SCOPE)

`/insights` page (Phase 6). Sentry (Phase 6). Update/Delete via JARVIS. Persistent conversation memory. Multi-turn entity references. Voice. CLI. Action chaining. Multi-model fallback. Conversational follow-ups.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- `@anthropic-ai/sdk` `^0.96.0` (verified npm — supersedes CLAUDE.md's 0.94).
- `claude-sonnet-4-6` model ID.
- Direct SDK only — Vercel AI SDK and raw `fetch` forbidden.
- `@supabase/ssr` with `getClaims()` for server-side auth.
- Drizzle for queries; supabase-js for auth/realtime.
- Zod 4 `.toJSONSchema()` for tool definitions.
- Strict TypeScript.
- Motion 12 via `motion/react`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JARVIS-08 | Streaming UI with thinking-word indicator | Priority 1: streaming event sequence |
| JARVIS-09 | Prompt caching | Priority 1: `cache_control` placement |
| JARVIS-10 | Session memory from scrollback | Priority 1: last-N-turns message shape |
| JARVIS-11 | Cache hit verification | Priority 1: `usage.cache_read_input_tokens` |
| JARVIS-12 | RLS enforcement at executor | Priority 3: server-side userId re-derivation |
| JARVIS-14 | Adversarial prompt-injection resistance | Priority 1: strict tool use + no destruction tools |
| JARVIS-15 | p95 < 10s end-to-end | Priority 3: Vercel 300s duration |
| JARVIS-16 | `packages/jarvis-core` pure TS | Priority 2: workspace setup + import-boundary test |
| TEST-01 | Date-parser fixture corpus | Priority 4: chrono + TZDate fixtures |
| TEST-05 | Adversarial / prompt-injection suite | Priority 1: strict tool use guarantees |

---

## Priority 1 — Anthropic SDK 0.96 Streaming + Strict Tool Use + Caching

### 1.1 Streaming event sequence for multi-action responses

Verified against [Anthropic streaming docs](https://platform.claude.com/docs/en/api/streaming). For "pick up groceries fri + dinner 8pm sat + #idea sandwich shop", the stream emits:

```
message_start                                    → { message: { id, content: [], usage: { input_tokens } } }
[optional preamble text block at index 0]
content_block_start  (index=1, type=tool_use)    → { content_block: { id, name: "create_task", input: {} } }
content_block_delta  (input_json_delta) ...      → partial_json: "{\"title\":..."
content_block_stop   (index=1)
content_block_start  (index=2, type=tool_use)    → name: "create_event"
content_block_delta  ...                         (more input_json_delta)
content_block_stop   (index=2)
content_block_start  (index=3, type=tool_use)    → name: "create_capture"
...
content_block_stop   (index=3)
message_delta                                    → { stop_reason: "tool_use", usage: { output_tokens } }
message_stop
```

Key facts:
- `tool_use.input` arrives as `input_json_delta` partial JSON chunks. Don't parse mid-stream; wait for `content_block_stop` (or use SDK helper events).
- Parallel emission is default-on for Claude 4 (Sonnet 4.5+, 4.6). One assistant message → N `tool_use` blocks.

### 1.2 Recommended pattern: SDK helper events

The TS SDK exposes both a typed async-iterator and an event-emitter. For JARVIS, use `.on("contentBlock")` (fires on completed blocks — SDK handles JSON delta accumulation) plus `await stream.finalMessage()` for usage telemetry.

```typescript
const stream = client.messages.stream(
  {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system,                            // array shape with cache_control on last block
    tools,                             // last tool has cache_control + strict: true
    tool_choice: { type: "auto" },     // parallel_tool_use is ON by default
    messages,
  },
  { signal: abortController.signal },  // ← AbortController support
);

stream.on("contentBlock", async (block) => {
  if (block.type === "tool_use") {
    // block.input is fully-parsed JSON. Validate + dispatch.
    await onCompletedToolUse(block);
  }
});

stream.on("text", (delta) => onTextDelta(delta));   // for any preamble text

const final = await stream.finalMessage();
// final.usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
```

### 1.3 `cache_control` placement — EXACT shape (verified)

From [prompt caching docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching): cache markers go on the **LAST block of each cached section**. Hierarchy: `tools` → `system` → `messages`. Up to 4 markers total. **5-minute default TTL.** Minimum 1,024 tokens to take effect.

```typescript
{
  model: "claude-sonnet-4-6",
  // SYSTEM: marker on LAST block caches everything before it.
  system: [
    { type: "text", text: JARVIS_PERSONALITY },                       // D-16
    { type: "text", text: TOOL_USE_RULES },
    { type: "text", text: buildProjectListContext(projects),
      cache_control: { type: "ephemeral" } },                          // ← breakpoint
  ],
  // TOOLS: marker on LAST tool caches all tools.
  tools: [
    { name: "create_task",    description: "...", input_schema: zCreateTask.toJSONSchema(),    strict: true },
    { name: "create_capture", description: "...", input_schema: zCreateCapture.toJSONSchema(), strict: true },
    { name: "create_event",   description: "...", input_schema: zCreateEvent.toJSONSchema(),   strict: true,
      cache_control: { type: "ephemeral" } },                          // ← breakpoint
  ],
  // MESSAGES: last-N-turns. Current user turn NOT cached.
  messages: [...priorTurns, { role: "user", content: currentInput }],
  tool_choice: { type: "auto" },
}
```

**Verify hits at runtime:** `final.usage.cache_read_input_tokens > 0` = cache hit; `cache_creation_input_tokens > 0` = wrote new cache on this turn.

### 1.4 Parallel tool use — default-on, no flag needed

From [parallel tool use docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/parallel-tool-use): "By default, Claude may use multiple tools to answer a user query." Sonnet 4.6 reliably emits 3 `tool_use` blocks for multi-action sentences.

Optional system-prompt strengthening (D-16 compatible):
```
For maximum efficiency, whenever the user describes multiple independent actions
in one sentence, invoke all relevant tools simultaneously rather than sequentially.
```

To disable: `tool_choice: { type: "auto", disable_parallel_tool_use: true }`.

### 1.5 Strict tool use — replaces deprecated beta header

`structured-outputs-2025-11-13` beta header is **no longer required** ("beta headers are no longer required" per current docs). Use per-tool `strict: true`:

```typescript
{ name: "create_task", description: "...", input_schema: zCreateTask.toJSONSchema(), strict: true }
```

With `strict: true`: `additionalProperties: false` enforced, all `required` fields guaranteed, no malformed types. **Combined with the fact that no `delete_*` or `update_*` tools exist**, destruction is structurally impossible — load-bearing for JARVIS-14 / TEST-05.

### 1.6 AbortController propagation

```typescript
export async function POST(req: Request) {
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort(), { once: true });
  const stream = client.messages.stream({ /* params */ }, { signal: upstream.signal });
  // If client disconnects, stream closes cleanly and SDK throws AbortError.
}
```

### 1.7 Pitfalls (P1)

- **CLAUDE.md SDK version is stale** (`0.94.x` → `^0.96.0`).
- **`structured-outputs-2025-11-13` beta header is deprecated.** Don't pass it. Use `strict: true` per tool.
- **`tool_choice` changes invalidate cached MESSAGES** (tools + system remain cached). Keep `tool_choice: { type: "auto" }` always; shape via system prompt for slash commands.
- **Partial JSON deltas are not parseable mid-stream.** Use `.on("contentBlock")` (fires after `content_block_stop`) or `stream.finalMessage()`.
- **Tool-result formatting governs future parallel emission.** N/A for MVP (creation-only), but: all results from one assistant turn must land in a single user message.

---

## Priority 2 — `packages/jarvis-core` Workspace Package

### 2.1 Workspace already configured

`pnpm-workspace.yaml` (verified in-repo):
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`packages/jarvis-core/` auto-discovered. The `packages/` directory itself doesn't exist yet — create as part of the first task.

### 2.2 Directory shape

```
packages/jarvis-core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                       # public barrel
│   ├── personality.ts                 # JARVIS_PERSONALITY (D-16)
│   ├── prompt-builder.ts              # buildSystemPrompt({ projects, voiceActive? })
│   ├── tools/
│   │   ├── index.ts                   # buildToolDefinitions({ voiceActive? })
│   │   ├── create-task.ts             # zCreateTask
│   │   ├── create-capture.ts
│   │   └── create-event.ts
│   ├── parsers/
│   │   ├── dates.ts                   # parseDates(text, tz)
│   │   ├── priority.ts                # parsePriority(text)
│   │   └── slash-command.ts           # parseSlashCommand(text)
│   ├── executor/interface.ts          # ActionExecutor (impl injected)
│   └── types.ts
└── tests/
    ├── purity.test.ts                 # forbidden-import grep
    ├── dates.test.ts                  # TEST-01 fixtures
    └── tools.test.ts
```

### 2.3 `packages/jarvis-core/package.json`

```json
{
  "name": "@hyperpolymath/jarvis-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tools": "./src/tools/index.ts",
    "./parsers": "./src/parsers/index.ts"
  },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.96.0",
    "@date-fns/tz": "^1.4.1",
    "chrono-node": "^2.9.1",
    "date-fns": "^4.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^3.0.0" }
}
```

`main: "./src/index.ts"` — no build step; Next.js/Turbopack transpiles TS via `transpilePackages`. **No `react`, `next`, `@supabase/*`, `googleapis`, `drizzle-orm` deps** — these belong to the consumer.

### 2.4 `packages/jarvis-core/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "types": []
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**`"lib": ["ES2022"]` (no `DOM`)** — any `window`/`document` reference becomes a compile error.

### 2.5 Consumer wiring

`apps/web/package.json`: `"@hyperpolymath/jarvis-core": "workspace:*"`

`apps/web/next.config.ts`: `transpilePackages: ["@hyperpolymath/jarvis-core"]` (without this you'll get an ESM import error).

### 2.6 Public API (verbatim from D-12)

```typescript
// packages/jarvis-core/src/index.ts
export { JARVIS_PERSONALITY } from "./personality";
export { buildSystemPrompt } from "./prompt-builder";
export { buildToolDefinitions, zCreateTask, zCreateCapture, zCreateEvent } from "./tools";
export { parseDates, parsePriority, parseSlashCommand } from "./parsers";
export type { ActionExecutor, ExecutionContext, ExecutorResult } from "./executor/interface";
export type { ActionType, CreateTaskAction, CreateCaptureAction, CreateEventAction, JarvisTurn, ParsedDate } from "./types";
```

```typescript
// packages/jarvis-core/src/executor/interface.ts
export interface ExecutionContext {
  userId: string;             // ← re-derived from getClaims() at the boundary, NEVER trusted from model
  userTimezone: string;       // IANA
  defaultCalendarId: string | null;
}

export type ExecutorResult =
  | { ok: true; id: string; receipt: Record<string, unknown> }
  | { ok: false; error: string };

export interface ActionExecutor {
  createTask(input: CreateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  createCapture(input: CreateCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  createEvent(input: CreateEventAction, ctx: ExecutionContext): Promise<ExecutorResult>;
}
```

### 2.7 Import-boundary enforcement (Vitest grep test)

Skip ESLint plugins; one Vitest test catches violations in CI:

```typescript
// packages/jarvis-core/tests/purity.test.ts
const FORBIDDEN = [/from ['"]react['"]/, /from ['"]next\//, /from ['"]@supabase\//, /from ['"]drizzle-orm/, /from ['"]googleapis['"]/];
// walk src/, read each .ts, expect(content).not.toMatch(pattern) for each FORBIDDEN
```

### 2.8 Pitfalls (P2)

- **Don't compile to `dist/`.** Direct TS via `transpilePackages` is simplest.
- **Mixed CJS/ESM is the #1 monorepo footgun.** Keep `"type": "module"` everywhere.
- **`@anthropic-ai/sdk` is a runtime dep of `jarvis-core`** (tool defs typed against `Anthropic.Tool`). Fine — the SDK is isomorphic.

---

## Priority 3 — SSE Streaming on Next.js 16 Route Handler

### 3.1 Server: Route Handler shape

```typescript
// apps/web/app/api/jarvis/route.ts
export const runtime = "nodejs";     // NOT "edge" — googleapis + postgres are Node-only
export const maxDuration = 60;       // JARVIS-15 p95 < 10s well under

export async function POST(req: NextRequest) {
  // 1. Auth — re-derive userId at boundary (D-15)
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return new Response("Unauthorized", { status: 401 });
  const userId = data.claims.sub;

  // 2. Abort propagation
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort(), { once: true });

  // 3. Build prompt + tools (jarvis-core, voiceActive forward-compat)
  const { input, history, parsedDates, slashCommand, voiceActive } = await req.json();
  const projects = await loadProjects(userId);
  const system = buildSystemPrompt({ projects, voiceActive });
  const tools = buildToolDefinitions({ voiceActive });

  // 4. Stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // DON'T await here — let Response return so headers ship immediately.
      const anthStream = new Anthropic().messages.stream(
        { model: "claude-sonnet-4-6", max_tokens: 1024, system, tools,
          tool_choice: { type: "auto" },
          messages: buildMessages(history, input, parsedDates, slashCommand) },
        { signal: upstream.signal },
      );

      anthStream.on("contentBlock", async (block) => {
        if (block.type !== "tool_use") return;
        const validated = validateTool(block.name, block.input);   // Zod re-validate server-side
        if (!validated.ok) return controller.enqueue(encoder.encode(sse("error", { message: validated.error })));
        const result = await executor.execute(block.name, validated.input, { userId, userTimezone, defaultCalendarId });
        controller.enqueue(encoder.encode(sse("action", { toolUseId: block.id, name: block.name, result })));
      });
      anthStream.on("text", (delta) => controller.enqueue(encoder.encode(sse("text", { delta }))));

      try {
        const final = await anthStream.finalMessage();
        await logJARVISEvent({ userId, promptText: input, usage: final.usage, latencyMs });
        controller.enqueue(encoder.encode(sse("done", { usage: final.usage })));
      } catch (err) {
        if (err?.name !== "AbortError")
          controller.enqueue(encoder.encode(sse("error", { message: String(err) })));
      } finally { controller.close(); }
    },
    cancel() { upstream.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",     // ← LOAD-BEARING on Vercel
    },
  });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
```

### 3.2 Client: fetch + ReadableStream (not EventSource — POST unsupported)

```typescript
const response = await fetch("/api/jarvis", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload), signal: controller.signal,
});
const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += value;
  // SSE messages separated by blank lines (\n\n). Parse "event: foo\ndata: {...}\n\n" per chunk.
  let i = buffer.indexOf("\n\n");
  while (i !== -1) {
    const chunk = buffer.slice(0, i);
    buffer = buffer.slice(i + 2);
    i = buffer.indexOf("\n\n");
    const eventName = chunk.match(/^event: (\w+)$/m)?.[1];
    const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? "null");
    // dispatch: text → onText(data.delta), action → onAction(data), done → onDone(data.usage), error → onError
  }
}
```

### 3.3 Vercel specifics (verified May 2026)

- **Default Hobby/Pro function duration: 300s** with fluid compute (default-on). Pro max 800s. JARVIS sits well within.
- **`X-Accel-Buffering: no`** is load-bearing — without it, Vercel's proxy can buffer SSE chunks until ~4KB or end-of-stream.
- **`runtime = "nodejs"`** required — Edge doesn't support `postgres` driver, `googleapis`, or Drizzle.

### 3.4 `voiceActive` forward-compat for Phase 7

Plumbing pass-through only; Phase 5 ignores the flag:

```typescript
export function buildSystemPrompt(opts: { projects: ProjectSummary[]; voiceActive?: boolean }): SystemBlock[] {
  const blocks: SystemBlock[] = [
    { type: "text", text: JARVIS_PERSONALITY },
    { type: "text", text: TOOL_USE_RULES },
    { type: "text", text: buildProjectListContext(opts.projects), cache_control: { type: "ephemeral" } },
  ];
  // Phase 7: if (opts.voiceActive) blocks.unshift({ type: "text", text: VOICE_ADDENDUM });
  return blocks;
}
```

### 3.5 Pitfalls (P3)

- **`X-Accel-Buffering: no` is mandatory** on Vercel.
- **Don't `await` blocking work in `ReadableStream.start()` before returning the `Response`.** Let `start()` kick off async work and let the Response return immediately so headers ship.
- **`pipeThrough(new TextDecoderStream())` not `.text()`** — `.text()` resolves only after the whole body arrives.
- **Node runtime required**, not Edge.

---

## Priority 4 — chrono-node + IANA + DST + TEST-01 Fixtures

### 4.1 The wiring decision

chrono-node v2 does NOT accept IANA timezone strings. It accepts: (a) short tz codes mapped to offset minutes, or (b) ambiguous-tz objects with DST start/end functions per zone. Maintaining DST functions for every IANA zone is intractable.

**Recommended pattern:** chrono parses grammar → extracts wall-clock components; `@date-fns/tz` `TZDate` interprets those components in the user's IANA zone (DST-aware). Neither library does the other's job.

```typescript
// packages/jarvis-core/src/parsers/dates.ts
import * as chrono from "chrono-node";
import { TZDate } from "@date-fns/tz";

export interface ParsedDate {
  text: string;            // original phrase: "tomorrow 3am"
  start: string;           // ISO 8601 UTC
  end?: string;
  allDay?: boolean;
}

export function parseDates(text: string, ianaTz: string, refDate: Date = new Date()): ParsedDate[] {
  // 1. Reference date IN user's zone so "tomorrow" interprets relative to their local "today".
  const refInTz = new TZDate(refDate, ianaTz);

  // 2. chrono returns Date objects with wall-clock components inferred from grammar.
  const results = chrono.parse(text, refInTz, { forwardDate: true });

  return results.map((r) => {
    const c = r.start.knownValues;   // { year, month, day, hour?, minute?, ... }
    // 3. Re-interpret the inferred wall-clock components in user's IANA zone.
    //    TZDate handles DST: spring-forward "skipped" hours shift forward; fall-back ambiguity picks DST.
    const startInTz = new TZDate(c.year, (c.month ?? 1) - 1, c.day ?? 1, c.hour ?? 0, c.minute ?? 0, 0, ianaTz);
    return {
      text: r.text,
      start: startInTz.toISOString(),
      end: r.end ? buildEnd(r.end, ianaTz) : undefined,
      allDay: c.hour === undefined,
    };
  });
}
```

### 4.2 DST anchor dates (2026)

- **Spring-forward:** Sun Mar 8, 2026, 2:00 AM → 3:00 AM (US)
- **Fall-back:** Sun Nov 1, 2026, 2:00 AM → 1:00 AM (US)

### 4.3 TEST-01 Vitest fixture corpus (~12 cases)

```typescript
// packages/jarvis-core/tests/dates.test.ts
import { describe, it, expect } from "vitest";
import { parseDates } from "../src/parsers/dates";

const NY = "America/New_York";

describe("parseDates", () => {
  // Reference: Mon May 11 2026 10:00 EDT (= 14:00 UTC)
  const ref = new Date("2026-05-11T14:00:00.000Z");

  it("today (all-day)", () => {
    const out = parseDates("pick up groceries today", NY, ref);
    expect(out[0].start).toMatch(/^2026-05-11T/);
    expect(out[0].allDay).toBe(true);
  });

  it("tomorrow with time", () => {
    const out = parseDates("dinner tomorrow 8pm", NY, ref);
    expect(out[0].start).toBe("2026-05-13T00:00:00.000Z");  // May 12 20:00 EDT
  });

  it("this friday (all-day)", () => {
    const out = parseDates("call mom this friday", NY, ref);
    expect(out[0].start).toMatch(/^2026-05-15/);
    expect(out[0].allDay).toBe(true);
  });

  it("next friday", () => {
    const out = parseDates("call mom next friday", NY, ref);
    expect(out[0].start).toMatch(/^2026-05-22/);
  });

  it("M/D forwardDate jumps to next year", () => {
    const out = parseDates("project deadline 3/15", NY, ref);
    expect(out[0].start).toMatch(/^2027-03-15/);
  });

  it("time range '8-9pm friday'", () => {
    const out = parseDates("dinner 8-9pm friday", NY, ref);
    expect(out[0].start).toBe("2026-05-16T00:00:00.000Z");  // 8pm EDT
    expect(out[0].end).toBe("2026-05-16T01:00:00.000Z");    // 9pm EDT
  });

  it("am/pm explicit", () => {
    const out = parseDates("flight 6am tuesday", NY, ref);
    expect(out[0].start).toMatch(/T10:00:00.000Z$/);  // 6am EDT = 10:00 UTC
  });

  it("midnight tomorrow", () => {
    const out = parseDates("midnight tomorrow", NY, ref);
    expect(out[0].start).toBe("2026-05-13T04:00:00.000Z");
  });

  it("DST spring-forward — valid 3am EDT", () => {
    const refMar7 = new Date("2026-03-07T15:00:00.000Z");
    const out = parseDates("tomorrow 3am", NY, refMar7);
    expect(out[0].start).toBe("2026-03-08T07:00:00.000Z");  // 3am EDT = 07:00 UTC
  });

  it("DST spring-forward — non-existent 2:30am resolves forward", () => {
    const refMar7 = new Date("2026-03-07T15:00:00.000Z");
    const out = parseDates("tomorrow 2:30am", NY, refMar7);
    expect(out[0].start).toBe("2026-03-08T07:30:00.000Z");  // shifts to 3:30 EDT
  });

  it("DST fall-back — ambiguous 1:30am picks first occurrence (EDT)", () => {
    const refOct31 = new Date("2026-10-31T14:00:00.000Z");
    const out = parseDates("sunday 1:30am", NY, refOct31);
    expect(out[0].start).toBe("2026-11-01T05:30:00.000Z");  // 1:30 EDT first
  });

  it("no date phrase returns empty", () => {
    expect(parseDates("pick up groceries", NY, ref)).toEqual([]);
  });
});
```

### 4.4 Pitfalls (P4)

- **Don't pass IANA strings to chrono's `timezones` option.** It's offset-based and breaks at every DST boundary.
- **`forwardDate: true`** is critical for "pick up groceries 3/15" style — without it, chrono returns the most recent past March 15.
- **DST receipt copy.** When TZDate shifts a non-existent time (e.g., "2:30am" on Mar 8 → 3:30am), the receipt should say what happened: "Scheduled for Sun Mar 8, 3:30 AM EDT (2:30 AM doesn't exist due to spring-forward)." JARVIS doesn't ask clarifying questions (D-15) — but it should say what it did.
- **Reference date matters.** "tomorrow" depends on `refDate`. Pass `new Date()` from the **client** — the user's wall clock is what they mean.

---

## Environment Availability

| Dependency | Required By | Available | Version | Source |
|------------|------------|-----------|---------|--------|
| `@anthropic-ai/sdk` | Streaming, tool use | ✓ | 0.96.0 | npm 2026-05-13 |
| `chrono-node` | Date pre-parser | ✓ | 2.9.1 | npm 2026-05-06 |
| `@date-fns/tz` | IANA wrapper | ✓ | 1.4.1 | npm 2025-08-12 |
| `date-fns` | Already in stack | ✓ | 4.1.0 | npm 2025-08-03 |
| pnpm workspace `packages/*` | jarvis-core factor | ✓ | configured | pnpm-workspace.yaml |

No missing dependencies blocking execution.

## Sources

### Primary (HIGH)
- [Anthropic Streaming Messages](https://platform.claude.com/docs/en/api/streaming) — event sequence
- [Anthropic Tool Use Overview](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview) — tool_choice options, strict mode
- [Anthropic Parallel Tool Use](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/parallel-tool-use) — default-on for Claude 4
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) — cache_control placement
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — beta header deprecated
- [`@anthropic-ai/sdk` npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — 0.96.0 (2026-05-13)
- [Anthropic SDK TypeScript GitHub](https://github.com/anthropics/anthropic-sdk-typescript) — AbortController, helper events
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) — 300s default
- [chrono-node npm](https://www.npmjs.com/package/chrono-node) — 2.9.1
- [@date-fns/tz npm](https://www.npmjs.com/package/@date-fns/tz) — TZDate IANA wrapper

### Secondary (MEDIUM)
- [Strapi: Next.js 16 Route Handlers](https://strapi.io/blog/nextjs-16-route-handlers-explained-3-advanced-usecases) — SSE patterns
- [Upstash: SSE streaming LLMs in Next.js](https://upstash.com/blog/sse-streaming-llm-responses) — Vercel buffering fix
- [Medium: fixing slow SSE on Vercel](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996) — X-Accel-Buffering

### In-repo (HIGH)
- `pnpm-workspace.yaml` — `packages/*` configured
- `apps/web/components/captures/CaptureComposer.tsx` — Phase 2 TipTap + Mention (reused for `$project`)
- `apps/web/components/captures/tiptap-suggestions.ts` — Mention suggestion render lifecycle
- `apps/web/components/captures/HashtagSuggestionList.tsx` — forwardRef + useImperativeHandle keyboard pattern

## Metadata

**Confidence:**
- Anthropic streaming + tool use + caching: **HIGH** (verified current platform.claude.com docs May 2026)
- Workspace factor: **HIGH** (config confirmed in-repo)
- SSE on Next.js 16: **HIGH** (Web Streams + Vercel docs)
- chrono + DST: **MEDIUM-HIGH** (TZDate pattern verified; specific DST timestamps documented but not runtime-tested — TEST-01 validates at implementation)

**Research date:** 2026-05-14
**Valid until:** 2026-06-13

---

## 5-Line Summary

1. **SDK pattern:** `client.messages.stream({ model: "claude-sonnet-4-6", system: [...cache_control on last], tools: [...strict: true, cache_control on last], tool_choice: { type: "auto" }, messages }, { signal })`. Use `.on("contentBlock")` for completed tool_use; `await stream.finalMessage()` for `cache_read_input_tokens`. Bump CLAUDE.md from `0.94.x` to `^0.96.0` and drop the deprecated `structured-outputs-2025-11-13` beta header.
2. **Workspace setup:** `pnpm-workspace.yaml` already has `packages/*`. Create `packages/jarvis-core/` with `"main": "./src/index.ts"`, `"type": "module"`, ESM TS source. Add `transpilePackages: ["@hyperpolymath/jarvis-core"]` to `next.config.ts`. Enforce purity with Vitest grep test (no react/next/supabase/drizzle/googleapis imports).
3. **SSE pattern:** Node-runtime Route Handler, `maxDuration = 60`. Wrap Anthropic stream in `new ReadableStream({ start, cancel })`. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, **`X-Accel-Buffering: no`** (load-bearing on Vercel). Client uses `fetch + body.pipeThrough(new TextDecoderStream()).getReader()` (not EventSource — POST unsupported).
4. **chrono + tz wiring:** chrono parses grammar; `TZDate` from `@date-fns/tz` re-interprets wall-clock components in `users.timezone`. Only DST-correct pattern. ~12-case TEST-01 corpus sketched: Mar 8 spring-forward (non-existent 2:30am shifts to 3:30am) and Nov 1 fall-back (ambiguous 1:30am picks EDT first).
5. **Needs user sign-off:** (a) Bump CLAUDE.md SDK version `0.94.x` → `^0.96.0` and remove `structured-outputs-2025-11-13` beta header (replaced by per-tool `strict: true`). (b) Confirm `users.timezone` populated before Wave 1 — fallback to `Intl.DateTimeFormat().resolvedOptions().timeZone` client-side if not. (c) DST receipt copy ("Scheduled for ... (2:30 AM doesn't exist due to spring-forward)") yes/no.
