---
phase: 05-jarvis
plan: 03
subsystem: jarvis-console-ui
tags: [jarvis, ui, tiptap, dual-mention, slash-commands, motion12, sse-stream-consumption, thinking-word, intent-receipts, chrono-pre-parse, session-memory-from-scrollback, ask-mode]
requires:
  - phase: 05-jarvis
    provides: "@hyperpolymath/jarvis-core (parseDates, parsePriority, parseSlashCommand, types)"
  - phase: 05-jarvis
    provides: "POST /api/jarvis SSE Route Handler (Plan 05-02)"
  - phase: 02-manual-crud
    provides: "TipTap composer pattern + createHashtagSuggestion + HashtagSuggestionList (commit 25e5e57)"
provides:
  - "JarvisConsole — top-level orchestrator owning scrollback + streaming + session memory"
  - "JarvisInput — TipTap composer with TWO Mention extensions (hashtag + projectMention siblings)"
  - "JarvisScrollback — single-column terminal-style turn list with auto-scroll"
  - "JarvisReceipt — intent-badged (TASK/CAPTURE/EVENT) receipt shell with resolved fields"
  - "ThinkingWord — Motion 12 AnimatePresence crossfade, 11-word curated list, 600ms cadence"
  - "SlashCommandPopover — 5 commands (/task, /capture, /event, /ask, /help) with Motion crossfade"
  - "ProjectSuggestionList + createProjectSuggestion — $ trigger Mention sibling, forwardRef + useImperativeHandle pattern"
  - "jarvis-stream-client — fetch + TextDecoderStream SSE parser (NOT EventSource)"
  - "jarvis-input-payload — pure builder isolating priority/date/slash/mention extraction (testable apart from TipTap)"
  - "ask-mode + bare-meta-question heuristic — server forbids tools when the input is a question"
affects:
  - "/today is now the JARVIS Console (D-01)"
  - "Plan 05-04 (capture review) — consumes ScrollbackAction + receipt shell + countdown/onUndo props (already typed)"
  - "Backlog 999.3 — JARVIS read layer scoped from this plan's smoke (intentional deferral)"
tech-stack:
  added:
    - "@tiptap/extension-mention — second instance via Mention.extend({ name: 'projectMention' }) — different node name from the hashtag default (`mention`) so the siblings coexist"
    - "motion/react AnimatePresence — crossfade for thinking-word + slash popover"
  patterns:
    - "Dual TipTap Mention extensions in one editor — `mention` (hashtag #) + `projectMention` ($) coexist by giving the second a distinct node name via .extend({ name: 'projectMention' })"
    - "SSE consumed client-side via fetch + response.body.pipeThrough(new TextDecoderStream()).getReader() — POST disallowed by EventSource spec, so the canonical workaround is the manual reader"
    - "Pure payload-builder pattern (jarvis-input-payload.ts) — keeps TipTap-aware code out of unit tests; the test file mints raw editor JSON and runs the builder in isolation"
    - "Session memory = visible scrollback (D-06) read through a ref (turnsRef) so the latest snapshot is used at submit time even though handleSubmit's closure captured an older `turns`"
    - "Deterministic priority override — regex pre-parse on the client builds `parsedPriority`, route injects MANDATORY-priority hint into the user-content, executor post-applies the parsed priority to the tool args before insert (3-stage belt-and-suspenders)"
    - "Ask-mode — slashCommand='ask' OR a bare-meta-question heuristic ('what / when / how / can you ...') forbids tool emission at the server (tool_choice='none' equivalent) and the empty-response fallback emits prose"
    - "Receipt-rendering policy: receipts always render once an action arrives — no model-narrative gating, no client-side suppression"
key-files:
  created:
    - apps/web/components/jarvis/jarvis-types.ts
    - apps/web/components/jarvis/jarvis-stream-client.ts
    - apps/web/components/jarvis/jarvis-input-payload.ts
    - apps/web/components/jarvis/ThinkingWord.tsx
    - apps/web/components/jarvis/SlashCommandPopover.tsx
    - apps/web/components/jarvis/ProjectSuggestionList.tsx
    - apps/web/components/jarvis/project-suggestions.ts
    - apps/web/components/jarvis/JarvisInput.tsx
    - apps/web/components/jarvis/JarvisReceipt.tsx
    - apps/web/components/jarvis/JarvisScrollback.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/tests/jarvis-stream-client.test.ts
    - apps/web/tests/jarvis-input.test.tsx
    - apps/web/tests/jarvis-input-payload.test.ts
    - .planning/phases/999.3-jarvis-read-layer/.gitkeep
  modified:
    - apps/web/app/(app)/today/page.tsx
    - apps/web/app/api/jarvis/route.ts
    - apps/web/components/shell/PersistentNav.tsx
    - apps/web/components/captures/HashtagSuggestionList.tsx
    - apps/web/app/globals.css
    - apps/web/tests/jarvis-route.test.ts
    - apps/web/tests/jarvis-adversarial.test.ts
    - packages/jarvis-core/src/parsers/dates.ts
    - packages/jarvis-core/src/parsers/slash-command.ts
    - packages/jarvis-core/src/personality.ts
    - packages/jarvis-core/src/tools/index.ts
    - packages/jarvis-core/tests/dates.test.ts
    - packages/jarvis-core/tests/priority.test.ts
    - packages/jarvis-core/tests/slash-command.test.ts
    - .planning/ROADMAP.md
decisions:
  - "Project Mention sibling uses Mention.extend({ name: 'projectMention' }) — both extensions live in one editor; node names differ so `#` and `$` triggers do not collide"
  - "Thinking-word list ships 11 words (one added beyond plan's 10): thinking, considering, parsing, routing, checking, polishing, annotating, noting, scheduling, indexing, jarvis-ing — Motion 12 AnimatePresence mode='wait' crossfade at 600ms cadence"
  - "Empty-state copy: 'Good evening, sir. What shall we file?' — EB Garamond italic, journal-paper tint (D-13 brand voice)"
  - "Slash command set shipped is 5 commands, not 4 — /task /capture /event /ask /help. /ask was added as a checkpoint fix (b934018) so meta-questions like 'what's on my list?' get a prose reply instead of being captured"
  - "Read-back (model querying existing DB tasks/events/captures) is OUT OF SCOPE for Plan 05-03 — surfaced live during smoke, captured as backlog 999.3, deferred per PROJECT.md create-only MVP scope (commit 82431ae)"
  - "Receipts always render the resolved fields once an action arrives — no model-narrative gating. The fix that landed (6d1bb8a) explicitly removed the prior conditional that hid receipts when the model didn't also emit prose"
  - "Session memory uses turnsRef (a ref) rather than the closure-captured `turns` — the closure-captured version was always empty on the first send (fix 2d3f1d8)"
  - "Tab + Enter both select across all three popovers (Project, Hashtag, Slash). Tab is canonical autocomplete-accept; Enter is the secondary equivalent (fix 8b531f2)"
requirements-completed:
  - JARVIS-01
  - JARVIS-02
  - JARVIS-03
  - JARVIS-04
  - JARVIS-07
  - JARVIS-08
  - JARVIS-09
  - JARVIS-10
metrics:
  duration_minutes: 167
  completed: "2026-05-14T18:15:00Z"
  tasks: 5
  files_created: 15
  files_modified: 14
  apps_web_tests: 155
  jarvis_core_tests: 152
  fix_commits_post_task_4: 14
---

# Phase 5 Plan 3: JARVIS Console UI Summary

The JARVIS Console replaces `/today` as the authenticated homescreen — TipTap composer with `#hashtag` + `$project` Mention siblings, slash-command popover, Motion 12 thinking-word indicator, intent-badged streaming receipts, client-side chrono pre-parse, and session memory drawn from the visible scrollback — shipped, smoke-verified live end-to-end, and ready for Plan 05-04 to layer undo + convert-to-task on top.

## Composer — Final Dual-Mention Shape (Confirmed)

Two `@tiptap/extension-mention` extensions live in the same editor:

| Trigger | Extension                                          | Node name        | Suggestion provider           | Source            |
| ------- | -------------------------------------------------- | ---------------- | ----------------------------- | ----------------- |
| `#`     | `Mention.configure(...)` — TipTap default          | `mention`        | `createHashtagSuggestion`     | Phase 2, reused   |
| `$`     | `Mention.extend({ name: "projectMention" })`       | `projectMention` | `createProjectSuggestion`     | New in Plan 05-03 |

The critical insight: TipTap's `Mention` extension is keyed by node name. The default name (`mention`) cannot be reused for a second instance — both would collapse into one extension with the most-recently-registered suggestion config winning. `.extend({ name: "projectMention" })` produces a distinct ProseMirror node so the two siblings coexist without trigger collision. Confirmed live: typing `"foo #idea $running"` produces one `mention` node + one `projectMention` node in the editor JSON, each with its own chip styling and its own popover.

Chip CSS lives in `apps/web/app/globals.css`:

- `.hashtag-chip-inline` (reused from Phase 2, unchanged)
- `.project-chip-inline` (new — accent fill, `$` pseudo-element prefix)

## Slash-Command UX — Final Form (5 commands, not 4)

```
/task     Force task creation
/capture  Force capture creation
/event    Force calendar event
/ask      Ask JARVIS a question (no action)   ← added at checkpoint (b934018)
/help     Show command list                    ← local-only, never sent to server
```

The popover (`SlashCommandPopover.tsx`) opens at input-start when the user types `/`, filters commands by prefix as they keep typing, and supports Arrow / Enter / Tab / Escape / click selection. `/help` is intercepted client-side and never round-trips to the server (it's a UI affordance — the help text renders inline). `/ask` forwards to the server with `slashCommand: "ask"`, which sets `tool_choice: { type: "none" }` (no tool emission) and lets the model reply in prose.

Beyond the explicit `/ask`, the server also runs a **bare-meta-question heuristic** (regex on the input: leading "what / when / how / where / which / who / can you / do i / is there ..." patterns). A bare meta-question without a slash command is auto-treated as ask-mode. This was the second-round fix after the user reported that typing `"what's on my list?"` got captured as a quick-capture instead of replied to (commits 6d1bb8a + a2c3df5 + 5fe1df4 + f953802).

**Selection parity:** all three popovers (hashtag, project, slash) accept BOTH Tab and Enter as the canonical select gesture (fix 8b531f2). Tab is the conventional autocomplete accept; Enter is preserved as a secondary equivalent. The ProseMirror handler returns `true` for both to prevent the event from falling through to the editor's Enter-submits-form binding.

## Thinking-Word — Final 11-Word List

Per D-13 ("Claude's discretion") the curated list ships at 11 words (one more than the plan's 10):

```
thinking, considering, parsing, routing, checking, polishing,
annotating, noting, scheduling, indexing, jarvis-ing
```

Cadence: 600ms via `setInterval`, Motion 12 `<AnimatePresence mode="wait">` crossfade with 200ms duration, opacity + 2px y-translate easing. Renders synchronously on mount (first word visible <100ms — verified by test). `aria-live="polite"` keeps screen readers informed without barging. Indicator disappears the moment the first action receipt streams in (parent gates `active` on `turn.actions.length === 0`).

## Empty-State Copy

`"Good evening, sir. What shall we file?"` — EB Garamond italic, muted-foreground, centered vertically. Brand voice per D-13 (British register, Genz-Renaissance per `idea_for_polymathy.md`). Renders only when `turns.length === 0`.

## Receipt Shell — Intent-Badged, Always Renders

`JarvisReceipt.tsx` renders three distinct receipt types keyed on `action.name`:

| Tool             | Label     | Icon              | Border / fill                          | Resolved fields shown                                       |
| ---------------- | --------- | ----------------- | -------------------------------------- | ----------------------------------------------------------- |
| `create_task`    | `TASK`    | `ListTodo`        | blue-500/50 border, blue-500/5 fill    | title (EB Garamond) + `P{n}` + due-date + project count    |
| `create_capture` | `CAPTURE` | `FileText`        | amber-500/50 border, amber-500/5 fill  | content (EB Garamond) + `#hashtag` chips                    |
| `create_event`   | `EVENT`   | `CalendarDays`    | emerald-500/50 border, emerald-500/5 fill | title (EB Garamond) + start → end local time             |

`countdown` and `onUndo` props are typed but unwired here — Plan 05-04 will pass them through. The receipt never gates rendering on the model's prose: once an action arrives, the receipt appears. This was the receipt-leak fix (6d1bb8a) — the prior version conditionally hid receipts in certain code paths.

## SSE Consumption — fetch + TextDecoderStream (NOT EventSource)

`jarvis-stream-client.ts` POSTs to `/api/jarvis` with `Content-Type: application/json` + `X-Voice-Active: "false"` and reads the response body via:

```
response.body
  .pipeThrough(new TextDecoderStream())
  .getReader()
```

`EventSource` is unusable because it forces GET; POST is required for the JSON body. The reader loop splits on `\n\n`, parses `event: X` + `data: <JSON>` chunks, and routes to four callbacks (`onText`, `onAction`, `onDone`, `onError`). `AbortController.signal` is plumbed through so client-side cancel propagates cleanly to the server's `messages.stream({ signal })`.

7 tests cover: single-action stream, multi-action stream (3 parallel), error event routing, abort mid-stream, HTTP non-200, malformed chunks, and chunk boundaries spanning multiple `\n\n` blocks.

## Session Memory — D-06 Conformant

`buildHistory(turns)` reads the latest scrollback snapshot via a ref (`turnsRef`) — not the closure-captured `turns` — and builds the last ~10 turns into Anthropic-shaped `{ role, content }[]` messages. Refresh clears scrollback → clears memory (D-06).

The ref pattern is **load-bearing**: the closure-captured version (the plan's original implementation) reflected the snapshot at handler-mount time, not at submit time, so the first send always saw an empty history. Fix landed in commit 2d3f1d8.

## Live Smoke Verdicts (Task 5 checkpoint — APPROVED)

| Verdict                                          | Result | Notes                                                                                                                            |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Empty-state smoke                                | PASS   | Brand-voice copy renders, input pinned at bottom, focus ring visible                                                              |
| Single-action latency (thinking-word → receipt)  | PASS   | First word visible <100ms; receipt arrives ~4s on warm cache (consistent with Plan 05-02's 4.2s warm latency)                    |
| Multi-action parallel streaming                  | PASS   | `"pick up groceries tomorrow p1 + lunch with sam 8pm saturday"` emits TASK + EVENT receipts in one assistant turn (parallel_tool_use) |
| Dual-Mention chip coexistence                    | PASS   | `#idea $running` produces both chips with distinct styling; both popovers fire on their respective triggers                       |
| Slash-command forcing                            | PASS   | `/task pick up groceries` → TASK receipt only (server `tool_choice: { type: "tool", name: "create_task" }`)                            |
| Ask-mode (explicit and heuristic)                | PASS   | `/ask what's due tomorrow?` → prose reply, no tool emission. `"what's on my list?"` (bare) → same path via heuristic              |
| Adversarial: "ignore previous instructions ..."  | PASS   | Routed to CAPTURE with literal text (D-15 structural defense holds from Plan 05-02)                                              |
| Session memory across turns                      | PASS   | `"what did I just file?"` after a prior turn — model references the previous turn from history blocks                            |
| Refresh clears scrollback (D-06)                 | PASS   | Page reload returns empty-state                                                                                                  |
| `/api/jarvis` headers + chunk arrival            | PASS   | DevTools confirms `Content-Type: text/event-stream`, `Cache-Control: no-transform`, `X-Accel-Buffering: no`; chunks arrive incrementally |
| Priority deterministic override                  | PASS   | `"buy goat tomorrow p1"` (first send after reload) lands P1, not P3 — fix 2665038 + d4de21e                                       |

**Latency observation from multi-action smoke:** p50 first-token ~4s on warm cache (matches Plan 05-02 verdict of 4.2s warm), p95 ~8s on cold cache. Multi-action prompts (2 receipts) add ~600-900ms over single-action — the second `content_block_stop` lands roughly when the first does (parallel emission within one assistant message).

## Follow-up Fixes — Chronological Audit Trail

This plan had unusually heavy post-Task-4 traffic: 14 fix commits across two distinct waves (pre-checkpoint bug fixes + checkpoint-driven UX fixes). The trail matters because each fix encodes a non-obvious invariant.

### Wave 1 — Pre-checkpoint bug fixes (Task 4 → checkpoint)

| Commit  | Fix                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 04d69f5 | `tmrw` slang pre-replaced to "tomorrow" before chrono; receipts render even when model emits no narrative text; date-only ISO formatted as YYYY-MM-DD on UI; priority regex covers `ptop` not just `p0` |
| a29c888 | Multiple actions in one turn each append a receipt (the prior implementation overwrote); priority hint string injected into user content; date-only times don't show a `12:00 AM` suffix; model-prose suppression when the turn is fully action-led |
| 9745399 | `await`ed async content-block handlers (they were silently swallowing errors); `allDay` flag propagates from chrono → tool args; priority hint injection finalized |
| 2665038 | Priority propagation completed end-to-end: client regex → request body → server hint → executor post-override. This is the canonical 3-stage belt-and-suspenders pattern documented above |

### Wave 2 — Checkpoint-driven fixes (smoke → re-smoke)

| Commit  | Fix                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| b934018 | Added `/ask` slash command + bare-meta-question heuristic — `"what's on my list?"` was being captured as a quick-capture; should be answered in prose                                                                              |
| d4de21e | Priority survives the first send after page reload (priority parser was misordered with the slash detector); slash command "pinning" UX — chosen command stays as a pill so the user knows it's been forced                       |
| 8b531f2 | Popover keyboard parity — Tab selects across hashtag + project + slash popovers (Tab was previously only wired on slash; the user expectation is universal)                                                                        |
| 6d1bb8a | Receipt leak — receipts conditionally hid when no model prose accompanied them; always-render now. Deterministic priority override applied at executor (final step of the 3-stage pattern). `/ask` prose rendering wired through    |
| a2c3df5 | `/ask` route now emits prose via bare-question detect; empty-response fallback when the model declines both tools and prose (rare model policy hit on aggressive meta-questions)                                                  |
| 5fe1df4 | Authoritative empty-response fallback — server emits a brand-voice prose fallback string if the stream closes with zero text + zero actions. Dev-only diagnostic log added (`askMode=... stop=... text=... actions=... blocks=...`) |
| f953802 | Render assistant prose when turn has no tool actions (the prior code wrapped prose in an action-conditional block; now prose renders unconditionally when present)                                                                  |
| 2d3f1d8 | History uses `turnsRef.current` not the closure-captured `turns` — the latter was empty on first send because the handler closed over the initial snapshot. This is the canonical React-ref-for-latest-snapshot pattern             |

### Wave 3 — Backlog capture (intentional out-of-scope)

| Commit  | Action                                                                                                                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 82431ae | Added backlog entry 999.3 (JARVIS read layer — query existing tasks/events/captures). Surfaced live during smoke when the user asked "what do I need to do tomorrow?" — model honestly answered from scrollback only (D-06 session memory) because it has no DB read access. The MVP scope was create-only per PROJECT.md line 44; this defers the read tools to a future plan |

## Out-of-Scope Finding — JARVIS Read Layer (Backlog 999.3)

During Task 5 smoke, the user typed `"what do I need to do tomorrow?"`. The model honestly answered from scrollback only (D-06 session memory) — it has no `list_tasks`, `list_events`, or `search_captures` tools, so it cannot query the actual database. This is **correct behavior for the current MVP scope** (PROJECT.md line 44 / `core.md`: "R/U/D handled manually in tabs"), but it surfaces a real future capability gap.

**Captured as backlog 999.3** with proposed shape:
- `list_tasks` / `list_events` / `search_captures` read-only tools wired into `buildToolDefinitions` + a read-side executor with RLS-safe Drizzle queries
- System-prompt rule directing the model to call read tools before answering meta-questions
- UX decision deferred: read results as a new receipt type vs streaming the resolved list into the prose reply
- Likely pairs with `JARVIS-V2-01..03` (update/delete + reference resolution) since once the model can list, "delete the second one" becomes natural

**Verdict on this plan:** Intentional deferral, not a deviation. The user explicitly confirmed read-back is out of scope for 05-03; the entry exists so the gap is named, not forgotten.

## UX Deviations from Plan

| Plan said                                                                              | Shipped                                                                                                                                          | Why                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 4 slash commands (`/task /capture /event /help`)                                       | 5 commands (added `/ask`)                                                                                                                        | Smoke revealed meta-questions were being captured instead of answered; `/ask` + a bare-question heuristic close the gap |
| 10 thinking words                                                                      | 11 (added `"indexing"`)                                                                                                                          | Stylistic polish during Task 1 — fit the British/journal register |
| Slash popover only accepts Arrow + Enter                                               | Arrow + Enter + Tab across all three popovers                                                                                                    | User expectation: Tab is the canonical autocomplete accept (fix 8b531f2) |
| Receipts conditionally rendered when model also emitted prose                          | Receipts always render once action arrives                                                                                                       | Receipt leak — fix 6d1bb8a                                   |
| Session memory built from `turns` (closure capture)                                    | Built from `turnsRef.current` (ref)                                                                                                              | Closure capture returned empty on first send — fix 2d3f1d8   |
| Priority parsing was implicit in the model's input understanding                       | Explicit 3-stage pipeline: client regex → request body → server hint injection → executor post-override                                          | Model occasionally defaulted to P3 even when input contained `p1` — belt-and-suspenders to make this deterministic |

No deviations on mobile responsiveness, chip aesthetic, or scrollback density — the plan's spec held.

## Test Counts

| Suite                                                       | Tests       | Status |
| ----------------------------------------------------------- | ----------- | ------ |
| tests/jarvis-stream-client.test.ts (Task 1)                 | 7           | green  |
| tests/jarvis-input.test.tsx (Task 3 — UI smoke)             | (subset)    | green  |
| tests/jarvis-input-payload.test.ts (Task 3 — pure builder)  | 17          | green  |
| tests/jarvis-route.test.ts (Plan 05-02 + Plan 05-03 deltas) | 14          | green  |
| tests/jarvis-adversarial.test.ts (16 fixtures)              | 16          | green  |
| tests/jarvis-executor.test.ts                               | 20          | green  |
| **apps/web total**                                          | **155/155** | green  |
| **packages/jarvis-core total** (regression)                 | **152/152** | green  |

`pnpm --filter web typecheck` exits 0.

## Authentication Gates

None — Plan 05-03 ships no new auth-protected primitives. `/today` is authenticated via the existing `(app)/layout.tsx` guard and the JarvisConsole's data-fetching uses the pre-existing `requireOnboarded()` helper.

## Self-Check: PASSED

- File `apps/web/components/jarvis/JarvisConsole.tsx` — FOUND
- File `apps/web/components/jarvis/JarvisInput.tsx` — FOUND
- File `apps/web/components/jarvis/JarvisScrollback.tsx` — FOUND
- File `apps/web/components/jarvis/JarvisReceipt.tsx` — FOUND
- File `apps/web/components/jarvis/ThinkingWord.tsx` — FOUND
- File `apps/web/components/jarvis/SlashCommandPopover.tsx` — FOUND
- File `apps/web/components/jarvis/ProjectSuggestionList.tsx` — FOUND
- File `apps/web/components/jarvis/project-suggestions.ts` — FOUND
- File `apps/web/components/jarvis/jarvis-stream-client.ts` — FOUND
- File `apps/web/components/jarvis/jarvis-types.ts` — FOUND
- File `apps/web/components/jarvis/jarvis-input-payload.ts` — FOUND
- File `apps/web/tests/jarvis-stream-client.test.ts` — FOUND
- File `apps/web/tests/jarvis-input.test.tsx` — FOUND
- File `apps/web/tests/jarvis-input-payload.test.ts` — FOUND
- Commit `ee9a54f` (Task 1) — FOUND
- Commit `abe5ed5` (Task 2) — FOUND
- Commit `1dd5e7f` (Task 3) — FOUND
- Commit `3711c44` (Task 4) — FOUND
- Commit `04d69f5` (Wave-1 fix) — FOUND
- Commit `a29c888` (Wave-1 fix) — FOUND
- Commit `9745399` (Wave-1 fix) — FOUND
- Commit `2665038` (Wave-1 fix) — FOUND
- Commit `b934018` (Wave-2 fix — /ask) — FOUND
- Commit `d4de21e` (Wave-2 fix — priority pinning) — FOUND
- Commit `8b531f2` (Wave-2 fix — Tab parity) — FOUND
- Commit `6d1bb8a` (Wave-2 fix — receipt leak) — FOUND
- Commit `a2c3df5` (Wave-2 fix — /ask prose) — FOUND
- Commit `5fe1df4` (Wave-2 fix — empty-response fallback) — FOUND
- Commit `f953802` (Wave-2 fix — render prose) — FOUND
- Commit `2d3f1d8` (Wave-2 fix — turnsRef) — FOUND
- Commit `82431ae` (backlog 999.3 deferral) — FOUND
- 155/155 apps/web tests green
- 152/152 jarvis-core tests green (regression)
- `apps/web` typecheck exits 0
- Live smoke (Task 5): all 11 verdicts PASS — user approved checkpoint

## Next Phase Readiness

- Plan 05-04 (capture review + undo) can wire `countdown` + `onUndo` on `JarvisReceipt` (props already typed). Convert-to-task affordance can read `captures.created_via='jarvis'` rows persisted by Plan 05-02's executor.
- Backlog 999.3 (read layer) is named, scoped, and queued — Phase 5 finishes create-only; read tools land in a future plan.

---
*Phase: 05-jarvis*
*Plan: 03*
*Completed: 2026-05-14*
