# Phase 31: In-document @JARVIS engine integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 31-in-document-jarvis-engine-integration
**Areas discussed:** Scope-resolver default granularity, Page-content serialization scope, Turn surfacing in conversation tab

---

## Scope-resolver default granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Block-default only | Default to the current block, literal requirement, predictable + cheapest | |
| Block-default + smart inference | Current block default, plus inference (empty trailing block → section, "this list" → children); scope stays explicitly overrideable | ✓ |

**User's choice:** "smart references is okay" → block-default plus smart inference.
**Notes:** Inference is a default-picker, never a hard override. Scope remains an explicit overrideable target so the ruleset can be tuned later without re-architecting.

---

## Page-content serialization scope

| Option | Description | Selected |
|--------|-------------|----------|
| Target block only | Cheapest tokens, can't resolve cross-section references | |
| Block + section | Middle ground (research recommendation) | |
| Whole page | Best reference resolution, most expensive (per-turn content is NOT prompt-cached) | ✓ |

**User's choice:** "whole page" — override of the research's block+section recommendation.
**Notes:** Reference quality over token cost, consistent with a personal single-user app. Serialize from the live `editor.document`, not the lossy `pages.content` mirror. Keep a `MAX_TEXT_CHARS`-equivalent ceiling as a safety guard.

---

## Turn surfacing in conversation tab

| Option | Description | Selected |
|--------|-------------|----------|
| Live in tab | Streams into the console's client scrollback as it runs — added coupling | |
| History-only with inline receipt | Persist server-side, tab picks it up via existing `jarvis_turns` realtime; live feedback is the inline receipt pill | ✓ |

**User's choice:** "after receipt" → history-only; the turn appears in the tab after the inline receipt resolves.
**Notes:** No new live-push channel. The inline pill (Phase 32) is the live surface; the tab is the durable record. Normalize in-doc `actions` jsonb to the full `ScrollbackAction` shape so receipts + undo render identically.

## Claude's Discretion

- New-file layout (route + scope resolver + serializer).
- Exact serialized-context character cap value (match the established `MAX_TEXT_CHARS` constant).
- SSE stream wiring details (follow the voice/text route pattern).

## Deferred Ideas

- Inline invocation UX (`@`-autocomplete pill, slash entry, hide-receipts toggle, export exclusion) — Phase 32 (JDOC-UX-*), by design.
- Expanding the smart-inference ruleset beyond initial heuristics — can iterate post-Phase-31 since scope is explicitly overrideable.
