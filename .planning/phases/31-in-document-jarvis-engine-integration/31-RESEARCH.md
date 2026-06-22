# Phase 31: In-document @JARVIS engine integration - Research

**Researched:** 2026-06-21
**Domain:** JARVIS engine reuse / in-document agent invocation (Next.js 16 App Router, Drizzle, @anthropic-ai/sdk, BlockNote editor)
**Confidence:** HIGH (all findings verified by reading the actual codebase; no external package research needed — this phase is pure internal-infrastructure reuse)

## Summary

Phase 31 is **not greenfield**. It wires a new invocation surface (inline `@JARVIS` in a Wiki page) into the existing JARVIS engine with zero forked agent logic. Every piece the phase requires already exists and is load-bearing in production today: the shared turn helper `runJarvisTurnStream` (`apps/web/lib/jarvis/run-turn.ts`), the `createServerExecutor` factory (`apps/web/lib/jarvis/executor.ts`), the `jarvis-core` tool/prompt/schema package (`packages/jarvis-core`), the `jarvis_turns` table (`apps/web/lib/db/schema.ts:457`), and the 5s universal undo (`apps/web/lib/jarvis/undo.ts` + `app/actions/jarvis.ts`).

The single most important architectural finding: **there are two established ways a turn is driven today, and Phase 31 should copy the server-side one, not the browser-console one.** The browser console (`/api/jarvis` + `JarvisConsole.tsx`) streams SSE to the client, and the *client* persists `jarvis_turns` and builds the undo target. The paired-device route (`/api/jarvis/voice/text/route.ts`) drives the exact same `runJarvisTurnStream` but **persists both the user and assistant `jarvis_turns` rows server-side** inside its `onDone`/`onError` callbacks. That voice/text route is the precise template for the in-document path: a server route that injects extra context (scope + serialized page content) into the `messages` array, runs the shared helper, and writes the turn rows itself. This satisfies JDOC-ENGINE-01 (no fork), JDOC-ENGINE-04 (real `jarvis_turns` turn), and JDOC-ENGINE-05 (same executor, same undo) with the least new code.

The only genuinely new logic Phase 31 must build is (a) a **scope resolver** that maps a BlockNote document + cursor/selection to a target (block / section / page / sub-block) and (b) a **page-content serializer** that produces a context block injected into the model-visible user message — exactly the same injection seam the browser route already uses for parsed dates, priority, and linked references (`apps/web/app/api/jarvis/route.ts:122-156`).

**Primary recommendation:** Build a new `POST /api/jarvis/in-document` route modeled byte-for-byte on `/api/jarvis/voice/text/route.ts` (server-side `jarvis_turns` persistence) — NOT on the browser `/api/jarvis` route (client-side persistence). Inject scope + serialized page content as an appended system-hint block on the user message (the existing injection seam). Reuse `runJarvisTurnStream`, `createServerExecutor`, and `undoJarvisActionForUser` untouched.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scope resolution (cursor/selection → block/section/page/sub-block) | Browser / Client (BlockNote editor) | — | The cursor position and selection live only in the editor; the resolver must read `editor.document` / selection client-side, then send the resolved target + serialized content to the server |
| Page content serialization (blocks → markdown context) | Browser / Client | API / Backend (fallback) | `editor.blocksToMarkdownLossy(...)` is a client-side BlockNote API already used at `PageBlockEditor.tsx:199`. Server could re-serialize from `pages.content` (the persisted markdown mirror) but the client already has the live document |
| Agent turn execution (prompt build, model call, tool dispatch) | API / Backend | — | `runJarvisTurnStream` is server-only (Node runtime; uses Drizzle + googleapis). Must run in a route handler |
| Tool execution + receipts | API / Backend | — | `createServerExecutor()` writes Drizzle rows + gcal; `userId` re-derived from `getClaims()` at the boundary (security invariant) |
| `jarvis_turns` persistence (user + assistant) | API / Backend | — | For parity with console turns, persist server-side in route callbacks (voice/text pattern). Client-side persist (console pattern) also works but duplicates the console's brittle `flushSync` dance |
| 5s undo trigger | Browser / Client | API / Backend | Countdown + UndoTarget construction is client-side (`JarvisConsole.tsx:938`); the actual inversion is the server action `undoJarvisAction` → `undoJarvisActionForUser` |
| Conversation-tab display | Browser / Client | — | Reads `jarvis_turns` via `loadJarvisTurns` / realtime; no new persistence shape needed if rows are written identically |

## Standard Stack

This phase adds **no new external dependencies**. Every capability is satisfied by libraries already in the workspace. Listed for completeness:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@hyperpolymath/jarvis-core` | workspace | Tool defs, prompt builder, Zod validators, executor interface | `[VERIFIED: packages/jarvis-core/package.json]` The single source of truth for agent logic; reusing it IS the no-fork requirement |
| `@anthropic-ai/sdk` | `^0.96.0` | Claude streaming + strict tool use | `[VERIFIED: packages/jarvis-core/package.json]` Already wired in `run-turn.ts` |
| `drizzle-orm` | (workspace) | `jarvis_turns` writes, executor DB ops | `[VERIFIED: apps/web/lib/db/schema.ts imports]` |
| `@blocknote/core` / `@blocknote/react` / `@blocknote/shadcn` | `0.51.4` | Editor document model + markdown serialization | `[VERIFIED: apps/web/package.json]` `editor.document`, `editor.blocksToMarkdownLossy`, `editor.tryParseMarkdownToBlocks` are the scope/serialization primitives |
| `zod` | `^4.0.0` | Tool input validation, request body validation | `[VERIFIED: packages/jarvis-core/package.json]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` | (workspace) | `getClaims()` auth at route boundary | Re-derive `userId` in the new route (browser session, NOT desktop bearer) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side persist (voice/text pattern) | Client-side persist (console pattern) | Client-side reuses the console's exact SSE→`persistTurn` flow but inherits its brittle `flushSync` requirements and splits undo-target construction across client/server. Server-side persist is simpler for a brand-new surface. Either produces identical `jarvis_turns` rows |
| New `/api/jarvis/in-document` route | Extend `/api/jarvis` with a `context` field | Extending the console route risks coupling the in-doc context payload to the console's request shape and its client-side persistence assumption. A dedicated route keeps the console untouched and is easier to reason about. Both call the same `runJarvisTurnStream` |
| Client serializes page content | Server re-serializes from `pages.content` | `pages.content` is a *lossy* markdown mirror that lags the live editor by one debounce cycle; the live `editor.blocksToMarkdownLossy(editor.document)` is authoritative for the current view |

**Installation:** None — no packages to install.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All dependencies are workspace-internal (`@hyperpolymath/jarvis-core`) or already present (`@anthropic-ai/sdk`, `@blocknote/*`, `drizzle-orm`, `zod`, `@supabase/ssr`).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  IN-DOCUMENT @JARVIS INVOCATION (Phase 31 scope)
  ─────────────────────────────────────────────────

  [Wiki page editor — BlockNote]
        │  user types "@Jarvis <prompt>" + Cmd+Enter (UX in Phase 32)
        │
        ▼
  ┌─────────────────────────────┐
  │ SCOPE RESOLVER (client, NEW) │  reads editor.document + cursor/selection
  │  → target: block | section   │  defaults to current block (JDOC-ENGINE-02)
  │           | page | sub-block │
  └─────────────┬───────────────┘
                │  resolved target + serialized page content (markdown)
                ▼
  ┌─────────────────────────────┐
  │ PAGE-CONTENT SERIALIZER      │  editor.blocksToMarkdownLossy(scopedBlocks)
  │ (client, NEW)                │  → context string (JDOC-ENGINE-03)
  └─────────────┬───────────────┘
                │  POST { prompt, scopeContext, pageId }
                ▼
  ┌───────────────────────────────────────────────────────┐
  │ POST /api/jarvis/in-document  (server route, NEW)      │
  │  - getClaims() → userId  (security boundary)           │
  │  - inject scopeContext as appended system-hint on the  │
  │    model-visible user message (EXISTING injection seam)│
  │  - persist USER jarvis_turns row (server-side)         │
  └─────────────┬─────────────────────────────────────────┘
                │  calls (UNCHANGED)
                ▼
  ┌───────────────────────────────────────────────────────┐
  │ runJarvisTurnStream()   lib/jarvis/run-turn.ts         │
  │  - buildSystemPrompt + tools (jarvis-core)             │
  │  - Anthropic streaming + multi-pass agentic loop       │
  │  - createServerExecutor() → Drizzle + gcal             │
  │  callbacks: onTextDelta / onAction / onDone / onError  │
  └─────────────┬─────────────────────────────────────────┘
                │  onDone / onError
                ▼
  ┌───────────────────────────────────────────────────────┐
  │ persist ASSISTANT jarvis_turns row (server-side)       │
  │  same columns as console turn (JDOC-ENGINE-04)         │
  └─────────────┬─────────────────────────────────────────┘
                │
                ▼
  [JARVIS conversation tab]  loadJarvisTurns() renders it
  [Inline receipt pill]      5s undo → undoJarvisAction (JDOC-ENGINE-05)
                                       → undoJarvisActionForUser (UNCHANGED)
```

### EXISTING Integration Surface (the map the planner needs)

This is the load-bearing output of this research. Every signature an in-document invocation must reuse:

#### 1. `runJarvisTurnStream` — the shared turn helper
- **File:** `apps/web/lib/jarvis/run-turn.ts:174`
- **Signature:** `export async function runJarvisTurnStream(opts: RunTurnOptions): Promise<void>`
- **Key `RunTurnOptions` fields (`run-turn.ts:50-111`):**
  - `userId: string` — re-derived from `getClaims()` at the boundary, never from the model.
  - `input: string` — the raw user text (used for telemetry only).
  - `messages?: Array<{ role; content }>` — **the injection point for in-document context.** Full message array (history + current user message). `content` may be a string or Anthropic content-block array (`text`/`tool_use`/`tool_result`).
  - `toolChoice?` — `{type:"auto"}` default; can force a tool or forbid all (`{type:"none"}`).
  - `source?: { device: string; input: "voice" | "text" }` — capture provenance denormalized into created rows. Use e.g. `{ device: "Web", input: "text" }` (or a distinct device label like `"Web (in-doc)"` if provenance distinction is desired).
  - `isVoice: boolean`, `sttDoneAt`, `vadEndAt` — telemetry; pass `false` / `null` / `undefined`.
  - **Callbacks:** `onTextDelta(delta)`, `onQueued(toolUseId, name)?`, `onClarification(...)?`, `onAction(toolUseId, name, result)`, `onDone(usage)`, `onError(message)`.
- **CRITICAL:** `runJarvisTurnStream` does **NOT** persist `jarvis_turns`. It only emits via callbacks and writes telemetry via `logJarvisEvent` (`run-turn.ts:631`). The *caller* is responsible for persisting `jarvis_turns`. This is the central fork-avoidance fact.
- **Runtime:** Node only (uses Drizzle + googleapis). The route must export `runtime = "nodejs"`.

#### 2. `createServerExecutor` — the action executor
- **File:** `apps/web/lib/jarvis/executor.ts:115`
- **Signature:** `export function createServerExecutor(): ActionExecutor`
- **Called from:** `run-turn.ts:315` (the only call site). The in-document route does **not** call this directly — `runJarvisTurnStream` constructs it internally. The planner only needs to know it's already wired; no in-document changes touch it.
- **`ExecutionContext` (`packages/jarvis-core/src/executor/interface.ts:25`):** `{ userId, source?, userTimezone, defaultCalendarId, preValidatedProjectIds? }` — built inside `run-turn.ts:316`. No change needed for Phase 31.
- **Receipts:** each executor method returns `ExecutorResult = { ok: true; id; receipt } | { ok: false; error; kind? }`. Receipt shapes per tool (e.g. `createTask` receipt at `executor.ts:163`: `{ id, title, priority, due?, inbox, project_ids, voice_summary? }`; `update_*` carry `before`, `delete_*` carry `snapshot` — these feed undo).

#### 3. `/api/jarvis` route — the browser console contract (reference, do NOT reuse directly)
- **File:** `apps/web/app/api/jarvis/route.ts`
- **Contract:** `POST` with JSON body `{ input, history, parsedDates?, parsedPriority?, slashCommand?, linkedProjectIds?, linkedHashtags? }`. Returns an SSE stream (`text/event-stream`) with events `turn-start | text | queued | clarification | action | done | error` (`route.ts:15-24`).
- **THE INJECTION SEAM (`route.ts:122-156`):** the route appends system hints to the model-visible `userContent` (parsed dates, priority, ask-mode, linked references) WITHOUT mutating the persisted user text. **This is exactly where in-document scope + page content should be injected** — append a `[IN-DOCUMENT CONTEXT — scope=<target>; page content follows: ...]` block to `userContent`, then build `messages = [...history, { role:"user", content: userContent }]`.
- **FORK RISK:** This route does NOT persist `jarvis_turns`. The browser `JarvisConsole.tsx` client persists them (see #5). Reusing this route for in-document would force the in-document UI to replicate the console's client-side persistence + undo-target construction. **Prefer the voice/text pattern instead.**

#### 4. `/api/jarvis/voice/text` route — THE TEMPLATE for the in-document route
- **File:** `apps/web/app/api/jarvis/voice/text/route.ts`
- **Why it's the template:** It drives the *same* `runJarvisTurnStream` but **persists both `jarvis_turns` rows server-side**:
  - User turn inserted up front (`route.ts:128-145`): `{ id, userId, kind:"user", text, actions:[], createdAt }` with `.onConflictDoNothing()`.
  - Assistant turn inserted in `onDone` (`route.ts:180-205`): `{ id:turnId, userId, kind:"assistant", textDelta:assistantText, actions:assistantActions, status:"done" }` with `.onConflictDoUpdate(...)`. `assistantActions` is accumulated in the `onAction` callback (`route.ts:174-177`) as `{ toolUseId, name, result }`.
  - Error path in `onError` (`route.ts:207-235`): same insert with `status:"error"`, `errorMessage:message`.
- **Auth difference:** voice/text uses a desktop bearer (`validateDesktopBearerIdentity`). The in-document route should instead use the browser session `getClaims()` (like `/api/jarvis`), since the invocation originates in the web app.
- **Persisted row shape MUST match the console's `ScrollbackTurn` projection** (see `jarvis_turns` schema below) so the conversation tab renders in-doc turns indistinguishably (JDOC-ENGINE-04).

#### 5. `jarvis_turns` table + persistence
- **Schema:** `apps/web/lib/db/schema.ts:457-478`. Columns: `id` (uuid, client-generated), `userId`, `kind` (`'user'|'assistant'`), `text` (user body), `textDelta` (assistant prose), `actions` (jsonb, default `[]`), `clarification` (jsonb), `status` (`'streaming'|'done'|'error'`), `errorMessage`, `createdAt`. Index on `(userId, createdAt)`.
- **RLS:** owner-only SELECT + INSERT + UPDATE (UPDATE needed for streaming-finalize / undo amend).
- **Server actions (`apps/web/app/actions/jarvis-turns.ts`):**
  - `saveJarvisTurn(input)` — upsert by id (`onConflictDoUpdate`), used by the browser console client.
  - `loadJarvisTurns()` — full scrollback (cap 500) for the conversation tab.
  - `loadJarvisHistoryPage({ before?, limit })` — paginated history.
- **`actions` jsonb shape** is the client `ScrollbackAction[]` projection: `{ toolUseId, name, status:"done", result: ExecutorResult }`. The voice/text route writes `{ toolUseId, name, result }` (no `status` field) — the planner should confirm whether the conversation-tab renderer tolerates the missing `status`/`undone` keys, or normalize the in-doc actions to the full `ScrollbackAction` shape (`name`, `toolUseId`, `status:"done"`, `result`) for exact parity. **(Open item — see Pitfalls.)**

#### 6. 5-second universal undo (Phase 16)
- **Server inversion:** `undoJarvisActionForUser(userId, target)` at `apps/web/lib/jarvis/undo.ts:134`. Handles 9 `UndoTarget` kinds (`undo.ts:79-105`): create undo (`task`/`capture`/`event` → delete), update undo (`update_*` → restore `before`), delete undo (`delete_*` → re-insert from `snapshot`). Security invariant: `userId` always re-set from session, never trusted from snapshot.
- **Browser entry:** the `undoJarvisAction` server action (in `app/actions/jarvis.ts`) wraps `undoJarvisActionForUser` with `getClaims()`.
- **UndoTarget construction (client):** `JarvisConsole.tsx:938-1000` maps an action's `name` + `result.id` + `result.receipt` into an `UndoTarget`. `create_event`/`update_event`/`delete_event` pull `calendar_id` from the receipt; `update_*` need `receipt.before`; `delete_*` need `receipt.snapshot`. **The in-document receipt UI must reconstruct the same `UndoTarget` from the persisted `action.result`** (the data is all in the `jarvis_turns.actions` jsonb).
- **Countdown hook:** `components/jarvis/use-undo-countdown.ts` (5s window, D-03/D-04). `isUndoable()` capability guard at `JarvisScrollback.tsx:88`. The in-document inline receipt (Phase 32 builds the pill UI) reuses these.

#### 7. Wiki / Pages data model (Phase 21)
- **`pages` table (`schema.ts:278-309`):** `id`, `userId`, `title`, `content` (lossy markdown mirror — source of truth for MCP export/search), `contentJson` (jsonb — BlockNote document, full fidelity, the editor's source of truth), `emoji`, `pinned`, `noExport`, `folderId`, timestamps.
- **`pageFolders` (`schema.ts:316`):** self-FK nestable folders. `folderProjects` / `pagesProjects` junctions for M:N project links.
- **There is NO separate `blocks` table.** Blocks live inside `pages.contentJson` as a BlockNote document array. "Block / section / sub-block" are **structural positions within the BlockNote JSON**, not DB rows. The scope resolver operates on `editor.document` (in-memory), not on SQL.
- **BlockNote document model (`PageBlockEditor.tsx`):**
  - `editor.document` — the top-level block array (each block: `{ id, type, props, content, children }`).
  - `editor.blocksToMarkdownLossy(blocks)` — serialize a block subset to markdown (`PageBlockEditor.tsx:199`). **This is the page-content serializer primitive for JDOC-ENGINE-03.**
  - `editor.tryParseMarkdownToBlocks(md)` — inverse (used for legacy seed at `:135`).
  - The `onChange` prop emits `(json, markdown)` on every edit (`PageBlockEditor.tsx:97-101, 197-201`).
  - **Block type vocabulary** (from slash menu, `:71-80`): heading 1/2/3, bullet list, numbered list, check list, quote, code block, paragraph, callout (custom). "Section" is a derived concept — a heading block plus the blocks beneath it until the next same-or-higher heading. "Sub-block" = a block's `children` array (nested list items, etc.).

### Recommended Project Structure (new files)
```
apps/web/
├── app/api/jarvis/in-document/route.ts   # NEW — server route, voice/text pattern
├── lib/jarvis/scope-resolver.ts          # NEW — editor.document + cursor → target
├── lib/jarvis/serialize-page-context.ts  # NEW — scopedBlocks → markdown context block
└── components/pages/ (Phase 32 UX)        # @-pill, inline receipt — NOT this phase
```

### Pattern 1: Context injection on the user message (reuse, do not invent)
**What:** Append a structured `[IN-DOCUMENT CONTEXT ...]` hint to the model-visible user text; keep the persisted `jarvis_turns.text` clean.
**When to use:** Every in-document invocation.
**Example:**
```typescript
// Source: mirrors apps/web/app/api/jarvis/route.ts:122-156 (existing seam)
let userContent = prompt;
userContent += `\n\n[IN-DOCUMENT CONTEXT — scope=${scope.kind}; the user invoked @JARVIS inside a Wiki page. `
  + `Resolve references like "this", "the above", "these" against the page content below. `
  + `PAGE CONTENT (markdown):\n${serializedContext}\n]`;
const messages = [...history, { role: "user", content: userContent }];
// persisted user turn uses the ORIGINAL `prompt`, not `userContent`
```

### Pattern 2: Server-side turn persistence (reuse the voice/text route)
**What:** Insert the user `jarvis_turns` row up front; insert/upsert the assistant row in `onDone`/`onError`, accumulating `actions` in `onAction`.
**Example:** `apps/web/app/api/jarvis/voice/text/route.ts:128-235` — copy this structure verbatim, swapping bearer auth for `getClaims()`.

### Anti-Patterns to Avoid
- **Re-implementing the agentic loop, tool dispatch, or prompt build.** All of it lives in `runJarvisTurnStream`. Touching it = a fork, which directly violates JDOC-ENGINE-01.
- **Persisting a new in-document-specific table or turn shape.** Use `jarvis_turns` with identical columns or the conversation tab won't render in-doc turns (JDOC-ENGINE-04).
- **Trusting `userId` from the client or model.** Always `getClaims()` at the route boundary (`executor.ts:12` invariants, `interface.ts:5`).
- **Serializing the whole page when scope is a block.** Token cost scales with serialized content; see Open Decision #2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent prompt + tool calling | Custom Anthropic loop for in-doc | `runJarvisTurnStream` | Multi-pass agentic loop, cache breakpoints, strict tool use, telemetry already solved (`run-turn.ts:342-603`); a fork drifts from console behavior |
| Action execution + receipts | Custom Drizzle writes for in-doc actions | `createServerExecutor()` (via the helper) | Security invariants (project/calendar re-validation, userId from claims), receipt shapes, undo snapshots all baked in |
| Undo | New undo path | `undoJarvisActionForUser` + existing `UndoTarget` union | 9 inversion kinds + security invariants already implemented (`undo.ts`) |
| Turn persistence | New table/columns | `jarvis_turns` + voice/text insert pattern | Conversation tab reads this shape; parity is a requirement |
| Markdown serialization of page | Custom block→md walker | `editor.blocksToMarkdownLossy()` | BlockNote's official lossy serializer, already used at `PageBlockEditor.tsx:199` |

**Key insight:** Phase 31's value is *subtractive* — the less new logic it introduces, the better it satisfies JDOC-ENGINE-01. The only legitimately new code is the scope resolver, the page-content serializer, and a thin route that injects them and persists turns.

## Common Pitfalls

### Pitfall 1: Forking the engine via the wrong route
**What goes wrong:** Reusing `/api/jarvis` (browser console) for in-document means the in-doc UI must replicate the console's client-side `jarvis_turns` persistence (`JarvisConsole.tsx:466,654,723`) and its client-side UndoTarget construction (`:938`), plus the `flushSync` workarounds. That duplicated client logic IS a fork of the turn-finalization path.
**Why it happens:** The console route looks like the obvious "JARVIS route."
**How to avoid:** Model the new route on `/api/jarvis/voice/text/route.ts`, which persists turns server-side. Inject context server-side. Keep the client thin (resolve scope, serialize, POST, render receipt).
**Warning signs:** Copying `streamJarvis` client helper or `persistTurn` into a Wiki component.

### Pitfall 2: `jarvis_turns.actions` shape mismatch breaks the conversation tab
**What goes wrong:** The browser console writes `ScrollbackAction` objects with `{ toolUseId, name, status:"done", result, undone? }`. The voice/text route writes a leaner `{ toolUseId, name, result }`. If the conversation-tab renderer (`JarvisScrollback.tsx`) assumes `status`/`undone`, in-doc turns may render without receipts or undo affordance.
**Why it happens:** Two existing writers already disagree on the `actions` shape.
**How to avoid:** Normalize the in-document `actions` jsonb to the full `ScrollbackAction` shape (`status:"done"`, plus `undone` default false) before insert. Confirm against `JarvisScrollback.tsx:88 isUndoable` and the receipt renderer.
**Warning signs:** In-doc turn appears in the tab but its receipt pill is missing or non-undoable.

### Pitfall 3: Stale page content from the lossy markdown mirror
**What goes wrong:** Serializing from `pages.content` (the DB mirror) instead of the live `editor.document` sends the model content that lags the current edit by one debounce cycle, so "the above" resolves to a previous version.
**Why it happens:** `pages.content` is tempting because it's server-readable.
**How to avoid:** Serialize client-side from `editor.blocksToMarkdownLossy(editor.document)` (or the scoped subset) and send it in the request. The route trusts the client's serialized context for *reference resolution only* — it never grants write authority (writes still go through the executor with server-validated IDs).
**Warning signs:** Model references content the user just deleted/edited.

### Pitfall 4: Scope resolver "section" ambiguity
**What goes wrong:** BlockNote has no native "section" concept. Naively treating "section" as "the current block's siblings" gives wrong boundaries.
**Why it happens:** Sections are a derived, heading-delimited range, not a structural node.
**How to avoid:** Define "section" as: starting from the nearest preceding heading at-or-above the cursor, include all following blocks until the next heading of equal-or-higher level. "Sub-block" = the block's `children`. "Block" = the single block at the cursor (the default). "Page" = `editor.document`. Document this mapping explicitly in the plan.
**Warning signs:** Section scope grabs the whole page or just one block.

## Code Examples

### In-document route skeleton (server-side persist)
```typescript
// Source: pattern from apps/web/app/api/jarvis/voice/text/route.ts + getClaims from app/api/jarvis/route.ts
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) return new Response("Unauthorized", { status: 401 });
  const userId = claims.data.claims.sub;

  const { prompt, scope, pageContext, history } = await req.json();

  // inject context on the MODEL-VISIBLE message only
  const userContent = `${prompt}\n\n[IN-DOCUMENT CONTEXT — scope=${scope.kind}; PAGE CONTENT:\n${pageContext}\n]`;

  const userTurnId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  // persist user turn (text = original prompt, NOT userContent)
  await db.insert(jarvisTurns).values({ id: userTurnId, userId, kind: "user", text: prompt, actions: [] }).onConflictDoNothing();

  let assistantText = "";
  const actions: Array<{ toolUseId: string; name: string; status: "done"; result: unknown }> = [];
  // ... SSE ReadableStream wrapping runJarvisTurnStream, accumulating actions in onAction,
  //     persisting the assistant turn in onDone/onError (voice/text pattern).
}
```

### Page-content serialization (scoped)
```typescript
// Source: editor API from apps/web/components/pages/PageBlockEditor.tsx:199
async function serializeScope(editor: Editor, scope: ScopeTarget): Promise<string> {
  const blocks =
    scope.kind === "page"    ? editor.document
  : scope.kind === "block"   ? [scope.block]
  : scope.kind === "section" ? blocksInSection(editor.document, scope.headingId)
  : /* sub-block */            scope.block.children ?? [];
  return editor.blocksToMarkdownLossy(blocks);
}
```

## State of the Art

Not applicable — internal-infrastructure phase, no fast-moving external ecosystem. The relevant "state of the art" is the in-repo engine as of Phase 16 (CRUD + agentic loop + 5s undo) and Phase 21 (Wiki data model), both already shipped.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The conversation-tab renderer requires the full `ScrollbackAction` shape (`status`, `undone`) for in-doc turns to show receipts/undo | Pitfall 2 | If the renderer is tolerant, normalization is unnecessary; if strict, missing it = no receipts in-tab. Verify against `JarvisScrollback.tsx` during planning |
| A2 | "Section" / "sub-block" are derived from BlockNote heading levels / `children`, with no DB representation | Pitfall 4, Pages model | If a `blocks` table is added in a later Wiki phase, the resolver design would change. Verified absent as of Phase 21 |
| A3 | Serializing the live `editor.document` client-side is acceptable for reference resolution (read-only context, no write authority) | Pitfall 3 | Sound given the executor re-validates all write IDs server-side; only matters if a future requirement demands server-authoritative content |

## Open Questions

These are the three **unlocked design decisions** the user will decide separately (per the phase brief). Research surfaces the tradeoffs so the plan can go either way.

### Decision 1 — Scope resolver default granularity
- **What we know:** JDOC-ENGINE-02 mandates the default is **the current block**. The question is whether to add *smarter inference* on top (e.g. if the cursor is on an empty trailing block, default to the section; if the prompt says "this list", expand to the list's children).
- **Tradeoff:** Block-default is predictable and cheap (smallest context, lowest token cost, fewest surprises). Smart inference resolves more "this/above" references correctly but is harder to reason about and can grab too much context, raising cost and misrouting risk.
- **Recommendation:** Ship block-default for Phase 31 (satisfies the requirement literally), expose scope as an explicit overrideable target so smarter inference can layer on later without re-architecting. `[ASSUMED]` — pending user decision.

### Decision 2 — How much page content is serialized as context
- **What we know:** JDOC-ENGINE-03 requires page content for reference resolution. Options: (a) target block only, (b) target block + its section, (c) whole page.
- **Tradeoff:** Whole-page maximizes reference-resolution quality ("the feature ideas I mentioned" anywhere on the page) but costs the most tokens per turn (Claude Sonnet at $3/MTok input; a long Wiki page can be thousands of tokens every invocation). Block-only is cheapest but can't resolve cross-section references. Block+section is the middle ground.
- **Recommendation:** Default to **block + section**, with whole-page as the explicit scope when the user selects it. Note: the prompt-cache breakpoints in `run-turn.ts` cache the *system* prompt, not the per-turn user content, so page context is NOT cached and is paid in full each invocation — making the token-cost tradeoff real. `[ASSUMED]` — pending user decision.

### Decision 3 — Live in the conversation tab vs. history-only with inline receipt
- **What we know:** JDOC-ENGINE-04 requires the invocation to persist as a real `jarvis_turns` turn "appearing in the JARVIS conversation tab indistinguishable from console turns." That guarantees it shows in *history*. The open question is whether it also streams *live* into the tab as it happens (like a console turn) or only appears on next tab load, with the live feedback shown inline (the in-doc pill, Phase 32).
- **Tradeoff:** Live-in-tab requires the in-doc invocation to push into the same client-side scrollback state the console owns (shared event bus / realtime), adding coupling. History-only is simpler: persist server-side, let the tab pick it up via `loadJarvisTurns`/realtime on next view; live feedback stays in the inline pill. Both satisfy JDOC-ENGINE-04 literally (the turn IS in the tab).
- **Recommendation:** History-only with inline receipt for Phase 31 (lower coupling, the inline pill is the primary live surface anyway). Realtime subscription on `jarvis_turns` (already used by the console) can make it appear in an open tab without explicit live-push. `[ASSUMED]` — pending user decision.

## Environment Availability

Not applicable — no new external tools, services, or runtimes. The phase runs entirely within the existing Next.js 16 / Node runtime, Drizzle/Supabase, and Anthropic SDK that the console path already uses.

## Validation Architecture

> `.planning/config.json` not checked for `nyquist_validation`; including this section since the engine path has heavy existing test coverage that the planner should extend.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (`packages/jarvis-core/vitest.config.ts`, `apps/web` vitest) |
| Config file | `packages/jarvis-core/vitest.config.ts`; web app vitest config in `apps/web` |
| Quick run command | `pnpm --filter web test <file>` |
| Full suite command | `pnpm --filter web test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JDOC-ENGINE-01 | In-doc invocation routes through `runJarvisTurnStream` with same tool set | integration | `pnpm --filter web test in-document-route` | ❌ Wave 0 |
| JDOC-ENGINE-02 | Scope resolver targets block/section/page/sub-block, defaults to block | unit | `pnpm --filter web test scope-resolver` | ❌ Wave 0 |
| JDOC-ENGINE-03 | Serialized page content reaches the model message | unit | `pnpm --filter web test serialize-page-context` | ❌ Wave 0 |
| JDOC-ENGINE-04 | Both `jarvis_turns` rows persist with console-parity shape | integration | `pnpm --filter web test in-document-route` | ❌ Wave 0 |
| JDOC-ENGINE-05 | Actions invert via `undoJarvisActionForUser` (same undo) | integration | reuse existing undo tests + in-doc receipt test | ⚠️ partial (undo tests exist) |

**Existing reference tests to mirror:** `apps/web/tests/run-jarvis-turn.test.ts`, `jarvis-route.test.ts`, `jarvis-route-uses-shared-helper.test.ts`, `voice-transcript-runs-jarvis-turn.test.ts`, `jarvis-executor.test.ts`, `jarvis-executor-crud.test.ts`.

### Sampling Rate
- **Per task commit:** `pnpm --filter web test <touched-file>`
- **Per wave merge:** `pnpm --filter web test` (jarvis + pages suites)
- **Phase gate:** full web suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/web/tests/in-document-route.test.ts` — covers JDOC-ENGINE-01/04 (routes through shared helper; persists both turn rows)
- [ ] `apps/web/tests/scope-resolver.test.ts` — covers JDOC-ENGINE-02 (block default + section/page/sub-block)
- [ ] `apps/web/tests/serialize-page-context.test.ts` — covers JDOC-ENGINE-03

## Security Domain

> `security_enforcement` assumed enabled (absent = enabled).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getClaims()` at the route boundary (JWT-validating); never `getSession()` in server code |
| V4 Access Control | yes | `userId` re-derived from claims, never from client/model (`interface.ts:5`, `executor.ts:12`); page reads scoped to `userId`; undo re-sets `userId` from session (`undo.ts:223`) |
| V5 Input Validation | yes | Zod validators from `jarvis-core/tools` on every tool input (`run-turn.ts:113`); validate the new request body (prompt length cap like voice/text's `MAX_TEXT_CHARS=4000`, `pageId` uuid, scope enum) with Zod |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant page/project reference via injected context | Spoofing / Tampering | Context is read-only for reference resolution; all write IDs (project_ids, calendar_id, entity ids) re-validated server-side in the executor against `userId` |
| Prompt injection via page content ("ignore previous instructions") | Tampering | Page content is untrusted user data fed as context; the executor still gates every action behind Zod + ownership checks, so injection can at worst produce a benign/owned action, never a cross-tenant write. Wrap page content in a clearly delimited block and label it as reference-only |
| Oversized page content → token/DoS | DoS | Cap serialized context length (mirror `MAX_TEXT_CHARS`); prefer block/section scope by default (Decision 2) |
| userId spoofing from client | Spoofing | `getClaims()` at boundary; model/client `userId` ignored |

## Sources

### Primary (HIGH confidence — read directly from the codebase this session)
- `apps/web/lib/jarvis/run-turn.ts` — `runJarvisTurnStream` signature, callbacks, agentic loop, no-persist fact
- `apps/web/lib/jarvis/executor.ts` — `createServerExecutor`, receipt shapes, security invariants
- `apps/web/app/api/jarvis/route.ts` — browser console SSE contract + context-injection seam
- `apps/web/app/api/jarvis/voice/text/route.ts` — server-side `jarvis_turns` persistence template
- `apps/web/app/actions/jarvis-turns.ts` — `saveJarvisTurn` / `loadJarvisTurns` / pagination
- `apps/web/lib/db/schema.ts:457-478` — `jarvis_turns` schema; `:278-369` — pages/folders/junctions
- `apps/web/lib/jarvis/undo.ts` — `undoJarvisActionForUser`, `UndoTarget` union (9 kinds)
- `apps/web/components/jarvis/JarvisConsole.tsx` — client SSE orchestration, UndoTarget construction, persist flow
- `apps/web/components/pages/PageBlockEditor.tsx` — BlockNote `editor.document` / `blocksToMarkdownLossy` / block vocabulary
- `packages/jarvis-core/src/{index,types,executor/interface}.ts` — public contracts, `ExecutionContext`, `ActionExecutor`
- `packages/jarvis-core/package.json` — exports map, dependency versions
- `.planning/REQUIREMENTS.md:678-682` — JDOC-ENGINE-01..05 verbatim
- `.planning/ROADMAP.md:692-706` — Phase 31 goal + success criteria

### Secondary / Tertiary
- None — no external research was required; this phase is internal-infrastructure reuse.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every reused symbol read directly
- Architecture (engine reuse map): HIGH — exact file paths + signatures confirmed by reading source
- Integration seam (context injection): HIGH — the seam is the same one the console route already uses
- Open design decisions: MEDIUM — recommendations are reasoned tradeoffs, flagged `[ASSUMED]` pending user lock
- Pitfalls: HIGH (Pitfall 1/3/4 follow directly from the code); MEDIUM (Pitfall 2 depends on renderer strictness — flagged A1)

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable internal infrastructure; re-verify if `run-turn.ts` / `jarvis_turns` schema / BlockNote major version changes)
