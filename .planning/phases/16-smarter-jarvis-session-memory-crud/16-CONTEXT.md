# Phase 16: Smarter JARVIS — session memory + CRUD - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Source:** Conversation with user (GitHub issue #15 "smarter jarv") — user approved scope verbatim ("okay do the phase. cook with this")

<domain>
## Phase Boundary

JARVIS can hold a real conversation: it remembers what it did this session and acts on corrective follow-ups. Canonical acceptance scenario (from issue #15): user says "add a quick capture about X", JARVIS creates it, user says "no, delete the qc please" — JARVIS resolves "the qc" to the capture it just created and deletes it, in one turn, without asking which one.

This is a context-engineering phase, NOT fine-tuning. Research confirmed (Anthropic context-engineering guidance, production assistant patterns): session memory = tool results with entity IDs kept in the model-visible transcript + a structured session-entities block; never model weights.

</domain>

<decisions>
## Implementation Decisions

### 1. Model-visible history with real tool blocks (LOCKED)
- Replace the current `buildHistory()` text-summary flattening (JarvisConsole) with history that preserves `tool_use`/`tool_result` content blocks including created-entity IDs.
- `create_*` tool results must return the full created entity (`id`, type, title/content, key fields) into the `tool_result` block — not just an ok/receipt string.

### 2. Session-entities scratchpad (LOCKED)
- Structured block listing the last ~10 entities created/updated/deleted this session (id, type, title, timestamp, last action).
- Injected AFTER the cached static prompt prefix so it does not break the Phase 11 prompt-cache breakpoints. Verify cache placement against `prompt-builder.ts` cache_control layout.

### 3. CRUD tools (LOCKED)
- New tools: `update_task`, `delete_task`, `update_capture`, `delete_capture`, `update_event`, `delete_event` in `packages/jarvis-core/src/tools/`, registered in `buildToolDefinitions()` with strict mode.
- Executor methods wrap existing Server Actions / query layer; `userId` ownership re-verified at the executor boundary in every WHERE clause.
- Hard-delete semantics consistent with existing manual deleteTask/deleteCapture. Events delete/update via gcal API (gcal is source of truth — events are never in Postgres).

### 4. Find tools + resolution policy (LOCKED)
- New tools: `find_tasks`, `find_captures`, `find_events` — fuzzy lookup by text/date/status returning compact match lists with real ids.
- System-prompt policy in TOOL_USE_RULES: resolve references from session entities first → if unknown/ambiguous, call find_* → if still ambiguous, ask_clarification. NEVER hallucinate ids; update/delete MUST use an id obtained from session context or a find_* result.

### 5. Multi-pass agentic loop (LOCKED)
- JARVIS route loops while stop_reason === "tool_use" (cap ~5 passes), feeding tool_result blocks back so find → act chains complete inside one user turn.
- Turns with no find_* calls must still terminate in a single pass (no latency regression — Phase 9-11 latency work must not regress).

### 6. Receipt UI (LOCKED)
- New receipt variants in JarvisReceipt: find (compact match list), update (field-level before → after diff), delete (tombstone render).
- ~~Undo button gated to creates only.~~ **SUPERSEDED 2026-06-11 (user, mid-execution):** universal 5-second undo on EVERY JARVIS action — undo create = delete; undo update = revert to before-values (already captured for the diff receipt); undo delete = restore from a pre-delete row snapshot returned by the executor (gcal events re-inserted). 5s window matches the existing mobile undo and Phase 5's per-receipt undo countdown / `undoJarvisAction` infrastructure. Implemented as plan 16-06 (16-05 shipped the creates-only gate first; 16-06 removes it).
- Persist all of this in jarvis_turns so scrollback re-renders correctly after reload.

### Claude's Discretion
- Exact scratchpad format and turn-limit interplay with HISTORY_TURN_LIMIT (currently 10).
- Whether tool blocks are reconstructed from persisted jarvis_turns receipts or stored verbatim — pick whichever keeps the jarvis_turns schema sane.
- find_* query implementation (ILIKE vs full-text) — single-user scale, keep it simple.
- Voice path (mobile /api/jarvis/voice/text, desktop) should inherit the improvements wherever they share the route; no voice-specific work required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### JARVIS pipeline (files to modify)
- `apps/web/app/api/jarvis/route.ts` — request shape, streaming, where the agentic loop lands
- `packages/jarvis-core/src/tools/index.ts` — buildToolDefinitions(), strict mode
- `packages/jarvis-core/src/tools/create-task.ts` (et al.) — tool schema pattern to replicate
- `packages/jarvis-core/src/personality.ts` — JARVIS_PERSONALITY + TOOL_USE_RULES
- `packages/jarvis-core/src/prompt-builder.ts` — system prompt assembly + Phase 11 cache_control breakpoints (scratchpad placement constraint)
- `apps/web/lib/jarvis/executor.ts` — executor pattern, userId ownership, randomUUID id generation
- `apps/web/components/jarvis/JarvisConsole.tsx` — buildHistory(), HISTORY_TURN_LIMIT, persistTurn
- `apps/web/components/jarvis/JarvisReceipt.tsx` — receipt variants
- `apps/web/lib/db/schema.ts` — jarvis_turns table

### Tests (existing contract to preserve)
- `apps/web/tests/jarvis-route.test.ts` — fabricated tool name (e.g. "delete_task") currently expected to SSE-error; this contract CHANGES when delete_task becomes real
- `apps/web/tests/jarvis-adversarial.test.ts` — same
- `packages/jarvis-core/tests/ask-clarification.test.ts`

</canonical_refs>

<specifics>
## Specific Ideas

- A 2026-05-27 design session specified this exact surface (9 tools, find-first pattern, agentic loop, receipt variants, owner-only DELETE RLS on jarvis_turns) but the code never landed — `git log --all -S "find_tasks"` is empty. Reuse that blueprint.
- Research recommendation (2026-06-11): "rich tool results + session entity registry + fuzzy lookup tools + resolution policy" is the production-standard pattern (ChatGPT/Claude memory/LangGraph all converge on it). Fine-tuning explicitly rejected.
- Core value alignment: "Type one sentence into Kiwi → the right action lands in the right place — every time." Corrective follow-ups are part of "every time."

</specifics>

<deferred>
## Deferred Ideas

- Cross-session long-term memory via Anthropic memory tool (jarvis_facts/remember_fact already covers basic persistent facts)
- Project/area CRUD via JARVIS
- Voice-specific conversational behaviors (barge-in corrections, etc.)
- Backlog 999.3 (JARVIS read layer) is partially subsumed by find_* tools — reconcile backlog entry when this ships

</deferred>

---

*Phase: 16-smarter-jarvis-session-memory-crud*
*Context gathered: 2026-06-11 from issue #15 conversation + codebase forensics*
