---
phase: 31-in-document-jarvis-engine-integration
plan: 01
subsystem: jarvis
tags: [jarvis, in-document, scope-resolver, page-serializer, sse-route, engine-reuse, blocknote, wiki]

# Dependency graph
requires:
  - phase: 16-jarvis-crud-undo
    provides: runJarvisTurnStream + createServerExecutor + 5s universal undo (the engine reused unforked)
  - phase: 21-wiki-data-model
    provides: BlockNote Wiki pages (editor.document, blocksToMarkdownLossy) the scope resolver + serializer target
provides:
  - "Pure resolveScope(document, cursorBlockId, prompt?) -> ScopeTarget (block | sub-block | section | page), block-default + smart-inference default-picker (JDOC-ENGINE-02)"
  - "serializePageContext(editor, scope, opts?) -> { targetMarkdown, pageMarkdown, truncated } from the LIVE editor, capped by MAX_CONTEXT_CHARS=48000 (JDOC-ENGINE-03)"
  - "POST /api/jarvis/in-document — getClaims auth, context-injection on the model message only, shared runJarvisTurnStream, SSE stream, server-side persistence of both jarvis_turns rows with full ScrollbackAction receipts (JDOC-ENGINE-01/04/05)"
  - "invokeInDocumentJarvis(args) -> { turnId, text, actions } — the thin client seam Phase 32 renders the pill/autocomplete UI on top of"
affects: [32-in-document-jarvis-ux]

key-files:
  created:
    - apps/web/lib/jarvis/scope-resolver.ts
    - apps/web/lib/jarvis/serialize-page-context.ts
    - apps/web/app/api/jarvis/in-document/route.ts
    - apps/web/lib/jarvis/invoke-in-document.ts
    - apps/web/tests/scope-resolver.test.ts
    - apps/web/tests/serialize-page-context.test.ts
    - apps/web/tests/in-document-route.test.ts
  modified: []

requirements-completed: [JDOC-ENGINE-01, JDOC-ENGINE-02, JDOC-ENGINE-03, JDOC-ENGINE-04, JDOC-ENGINE-05]

completed: 2026-06-21
---

# Phase 31 Plan 01: In-document @JARVIS engine integration

**An inline @JARVIS invocation inside a Wiki page now runs the SAME unforked runJarvisTurnStream + createServerExecutor path the console uses, resolves "this/the above" against the live page, and persists a real jarvis_turns user+assistant pair with console-parity receipts and the same 5s undo — delivered as four source files plus three test files, with the inline pill UX deferred to Phase 32 by design.**

## Accomplishments

- **JDOC-ENGINE-01 (zero engine fork):** the new route imports and calls `runJarvisTurnStream` from `@/lib/jarvis/run-turn`. No copied agentic loop, no new executor. `run-turn.ts`, `executor.ts`, `undo.ts`, and `packages/jarvis-core` are untouched (verified via `git status` — no diffs).
- **JDOC-ENGINE-02 (scope resolver):** pure `resolveScope` maps the cursor to block | sub-block | section | page. Block is the default; smart inference is a default-picker layered on top (empty trailing block -> enclosing section; prompt phrasing upgrades to section/sub-block/page). Section = nearest preceding heading through the next equal-or-higher heading, absorbing lower sub-headings. Never returns an empty target.
- **JDOC-ENGINE-03 (whole-page context):** `serializePageContext` serializes the LIVE whole page (never the lossy `pages.content` mirror) plus the scoped subset, capped by `MAX_CONTEXT_CHARS`. The route injects this on the model-visible message ONLY; the persisted user `jarvis_turns.text` stays the original prompt (D-02).
- **JDOC-ENGINE-04 (turn persistence parity):** the route persists both rows server-side (modeled on `voice/text`). Assistant `actions` jsonb is normalized to the FULL ScrollbackAction shape `{ toolUseId, name, status: "done", result, undone: false }` (D-09) so the conversation tab renders receipts + the undo affordance identically to console turns.
- **JDOC-ENGINE-05 (undo parity):** actions execute via the same `createServerExecutor` inside `runJarvisTurnStream`; receipts carry the same `id`/`receipt` data the existing 5s undo path reads — no undo changes needed.
- **Thin client seam:** `invokeInDocumentJarvis` composes resolve -> serialize -> POST -> SSE-parse into one framework-agnostic call returning `{ turnId, text, actions }`, with optional `onTextDelta`/`onAction` callbacks. No React/UI — Phase 32 builds the pill on top.

## Test / Typecheck / Build Results

- **New tests:** 25/25 green across the three files.
  - `tests/scope-resolver.test.ts` — 10/10 (block default, null/unknown -> page, section heading-range boundary incl. lower sub-headings, sub-block children, prompt-driven section/sub-block/page upgrades, empty-trailing-block -> section, never-empty invariant).
  - `tests/serialize-page-context.test.ts` — 8/8 (whole-page serialization independent of scope, target subset, one-level children collection, missing-id skip, page==target equality, truncation marker + truncated flag, under-cap intact, MAX_CONTEXT_CHARS default).
  - `tests/in-document-route.test.ts` — 7/7 (401 no claims, 413 over-long prompt, 400 invalid body, routes through runJarvisTurnStream with injected context on the model message, user row == original prompt, assistant actions full shape, turn-start SSE).
- **`pnpm --filter web typecheck`:** clean for all Phase 31 code. The only remaining errors are the 6 pre-existing, known-ignorable `tests/api-jarvis-tts.test.ts` `Request`-vs-`NextRequest` errors (untouched by this plan).
- **`pnpm --filter web build`:** compiled successfully (TypeScript step passes; `/api/jarvis/in-document` builds).

## Confirmation: no engine files modified

`git status` against `apps/web/lib/jarvis/run-turn.ts`, `apps/web/lib/jarvis/executor.ts`, `apps/web/lib/jarvis/undo.ts`, and `packages/jarvis-core` shows zero changes. The whole point of the phase — reuse, not fork — holds.

## Key constant

- **`MAX_CONTEXT_CHARS = 48000`** (~12k tokens), exported from `serialize-page-context.ts`. This is a DoS/safety CEILING, not the normal path (real pages fall far under it). The route additionally caps `pageContext`/`targetContext` at 64000 chars defensively in body validation. Per D-07, this per-turn context is NOT prompt-cached (run-turn caches the system prompt only), an accepted eyes-open cost.

## Deviations from Plan

1. **Worktree execution environment (process, not code).** The task asked to edit the main checkout on `fix/pages-create-ux` directly, but the harness sandboxed this session inside an isolated git worktree (`worktree-agent-ac7df75987a63a284`) with a path guard that blocks writes to the main checkout. All seven files were therefore created in the worktree and committed to its branch. The worktree shares the main repo's object store, so the four commits are cherry-pickable / mergeable onto `fix/pages-create-ux`. The worktree also branched from an older base that predates the Phase 31 planning directory, so that directory (and this SUMMARY) were created fresh here.
2. **Test fixture UUID.** Zod 4's `.uuid()` enforces a valid version/variant nibble, so the route test's `pageId` uses a well-formed v4 UUID (`...-4111-8111-...`). Route code unchanged.

No functional deviations from the plan's behavior, file list, decisions (D-01..D-09), or acceptance criteria.

## Phase 32 deferral (by design)

The inline invocation UX — the `@`-autocomplete pill, `@J`+Enter / Cmd+Enter submit, loading->receipt transform, hover-original-prompt tooltip, `/Jarvis` slash entry, the nav-bar hide-receipts toggle, and export exclusion — is **Phase 32 (JDOC-UX-*)** and intentionally out of scope here. This plan ships only the callable, tested engine seam; `invokeInDocumentJarvis` is the single entry point Phase 32 will render on top of.

---
*Phase: 31-in-document-jarvis-engine-integration*
*Plan: 31-01*
*Completed: 2026-06-21*
