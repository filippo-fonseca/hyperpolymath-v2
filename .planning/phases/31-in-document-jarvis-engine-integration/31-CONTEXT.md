# Phase 31: In-document @JARVIS engine integration - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Make inline @JARVIS invocations inside a Wiki page run through the SAME JARVIS engine path the console uses — `jarvis-core` tools + `createServerExecutor` + `runJarvisTurnStream` — with no forked agent logic, so agent improvements propagate everywhere automatically. A scope resolver decides what the invocation targets (whole page / section / current block / sub-block, block-first). Page content is serialized and provided so JARVIS can resolve references like "this", "the above", "the feature ideas I mentioned". Each invocation persists as a real `jarvis_turns` turn (user + assistant) with full action receipts and the same 5s universal-undo semantics, indistinguishable from a console turn in the conversation tab.

This is an **engine-reuse / plumbing phase**, not greenfield agent design. The inline UX (the `@`-autocomplete pill, loading→receipt transform, slash entry, hide-receipts toggle) is **Phase 32** and is out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Engine path (locked by requirement, not gray)
- **D-01:** Model the new in-document server route on `apps/web/app/api/jarvis/voice/text/route.ts` (server-side turn persistence), NOT on `/api/jarvis` (the browser console persists turns client-side — reusing it forces a fork of the turn-finalization path). Inject context server-side; keep the client thin (resolve scope → serialize → POST → render receipt). Satisfies JDOC-ENGINE-01/04/05 with the least new code.
- **D-02:** Context is injected on the **model-visible user message only** (the same seam the console route uses at `route.ts:122-156`). The persisted `jarvis_turns.text` for the user turn stores the **original prompt**, not the context-augmented message.

### Scope resolver (Decision 1 — DECIDED: smart inference approved)
- **D-03:** Default scope target is the **current block** (per JDOC-ENGINE-02), **plus smart inference layered on top** — e.g. cursor on an empty trailing block defaults to the enclosing section; a prompt like "this list" expands to the list block's children. Scope remains an **explicit, overrideable target** (the inference is a default-picker, never a hard override), so it can be tuned later without re-architecting.
- **D-04:** Scope-to-content mapping (no native BlockNote "section" node): **block** = the single block at the cursor; **sub-block** = that block's `children`; **section** = from the nearest preceding heading at-or-above the cursor through all following blocks until the next heading of equal-or-higher level; **page** = `editor.document`.

### Context serialization (Decision 2 — DECIDED: whole page)
- **D-05:** Serialize the **whole page** as model context on every invocation (override of the research's block+section recommendation) — maximizes reference-resolution quality, which matters more than per-turn token cost for this single-user app. Serialize client-side from the **live** `editor.blocksToMarkdownLossy(editor.document)`, NOT from the `pages.content` DB mirror (the mirror lags by one debounce cycle, so "the above" could resolve to stale content).
- **D-06:** Even with whole-page default, apply a **sane upper character cap** on serialized context (mirror the existing `MAX_TEXT_CHARS` bound) as a safety/DoS guard against pathologically long pages. The cap is a ceiling, not the normal path. (Claude's discretion on the exact value; match the established constant.)
- **D-07:** Note for the planner: the prompt-cache breakpoints in `run-turn.ts` cache the **system** prompt, not per-turn user content — so whole-page context is paid in full each invocation. This is an accepted, eyes-open cost, not a bug to optimize away in this phase.

### Turn surfacing (Decision 3 — DECIDED: history-only with inline receipt)
- **D-08:** The in-document turn is **history-only** in the conversation tab: persist it server-side, let the tab surface it via the **existing realtime subscription on `jarvis_turns`** (already used by the console) on next view / while open. Do NOT push live into the console's client-side scrollback state (that adds coupling). The live feedback surface is the inline receipt pill (Phase 32); the turn appears in the tab **after** the receipt resolves.
- **D-09:** Normalize the in-document `actions` jsonb to the **full `ScrollbackAction` shape** before insert (`{ toolUseId, name, status: "done", result, undone: false }`), NOT the leaner `{ toolUseId, name, result }` the voice/text route writes — so receipts and the undo affordance render identically to console turns in the tab. Verify against `JarvisScrollback.tsx` (`isUndoable` at ~:88 and the receipt renderer) during planning (Assumption A1).

### Claude's Discretion
- New-file layout for the route + client-side scope resolver + serializer (research proposes a structure; planner finalizes).
- Exact `MAX_TEXT_CHARS`-equivalent cap value (match the established constant).
- SSE stream wiring details (follow the voice/text route pattern).

### Folded Todos
None — no matching pending todos for this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 31 research (read first)
- `.planning/phases/31-in-document-jarvis-engine-integration/31-RESEARCH.md` — full engine-surface map, file paths + signatures, fork-risk analysis, 4 pitfalls, code skeletons, and the three now-decided design decisions.

### Engine path to reuse (exact integration surface)
- `apps/web/lib/jarvis/run-turn.ts` — `runJarvisTurnStream` (the shared turn helper; emits via callbacks, does NOT persist).
- `apps/web/lib/jarvis/executor.ts` — `createServerExecutor` (the action executor; same 5s-undo semantics).
- `apps/web/app/api/jarvis/voice/text/route.ts` — **THE TEMPLATE**: server-side persistence of both `jarvis_turns` rows.
- `apps/web/app/api/jarvis/route.ts` §122-156 — the context-injection seam (system hints appended to model-visible message); also `getClaims` auth pattern. Reference for the seam, NOT the persistence model.

### Persistence + undo + renderer
- `jarvis_turns` table in the Drizzle schema (`schema.ts:457`) — columns + `actions` jsonb shape.
- `apps/web/lib/jarvis/undo.ts` — `undoJarvisActionForUser` (`:134`), 5s universal undo (Phase 16).
- `JarvisScrollback.tsx` (~:88 `isUndoable`, receipt renderer) — confirm the `actions` shape the tab requires (Assumption A1 / D-09).

### Wiki / Pages data model (scope + serialization)
- `apps/web/components/pages/PageBlockEditor.tsx:199` — `editor.blocksToMarkdownLossy(...)` serialization API; block/section/sub-block are positions inside `pages.contentJson` (BlockNote doc), there is **no `blocks` table** (Assumption A2).

### Roadmap / requirements
- `.planning/ROADMAP.md` — Phase 31 section (goal, success criteria, dependencies: Phases 5, 5.1, 16, 21).
- `.planning/REQUIREMENTS.md` — JDOC-ENGINE-01 through JDOC-ENGINE-05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runJarvisTurnStream`, `createServerExecutor`, the `jarvis-core` tool set, `undoJarvisActionForUser` — all reused untouched. No new external packages.
- The `/api/jarvis/voice/text` route is a near-complete template for server-side turn persistence + SSE streaming.
- The context-injection seam (`/api/jarvis/route.ts`) shows exactly how to append context to the model-visible message without polluting persisted text.

### Established Patterns
- Two existing turn-writers disagree on `actions` jsonb shape (console = full `ScrollbackAction`; voice/text = lean). In-doc must match the **full** shape (D-09).
- Serialize from the **live editor document**, never the lossy DB mirror (Pitfall 3).
- Writes always go through the executor with server-validated IDs; serialized page content grants **reference-resolution context only**, never write authority (Pitfall 3 / Assumption A3).

### Integration Points
- New: a thin in-document server route (server-side persist), a client-side scope resolver, and a page-content serializer. Everything else is reused.
- Realtime on `jarvis_turns` (existing) carries the turn into an open conversation tab — no new live-push channel.

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose **whole-page context** over the cheaper block+section default — reference quality over token cost, consistent with this being a personal single-user app where the value is "JARVIS resolves what I mean."
- User approved **smart scope inference** rather than the strict literal block-only default — wants the resolver to be helpful about "this/above", with block as the fallback.
- User chose **history-only** surfacing — the inline receipt (Phase 32) is the live surface; the tab is the durable record, populated after.

</specifics>

<deferred>
## Deferred Ideas

- The inline invocation UX (`@`-autocomplete pill, `@J`+Enter, Cmd+Enter submit, loading→receipt transform, hover-original-prompt tooltip, `/Jarvis` slash entry, nav-bar hide-receipts toggle, export exclusion) — **Phase 32 (JDOC-UX-*)**, by design.
- Tuning / expanding the smart-inference ruleset beyond the initial heuristics (D-03) — can iterate post-Phase-31 since scope is an explicit overrideable target.

None other — discussion stayed within phase scope.

</deferred>

---

*Phase: 31-In-document @JARVIS engine integration*
*Context gathered: 2026-06-21*
