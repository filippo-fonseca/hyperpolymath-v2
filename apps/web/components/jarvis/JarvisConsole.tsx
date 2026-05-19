"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  streamJarvis,
  type JarvisRequest,
} from "./jarvis-stream-client";
import { JarvisScrollback } from "./JarvisScrollback";
import { JarvisInput, type JarvisInputHandle, type JarvisInputPayload } from "./JarvisInput";
import type { ScrollbackAction, ScrollbackClarification, ScrollbackTurn } from "./jarvis-types";
import {
  undoJarvisAction,
  type UndoTarget,
} from "@/app/actions/jarvis";
// Phase 6.1 Plan 02 — JARVIS Console chrome (UI-SPEC §5a, §6d, §6e, §9f).
// HudCornerCrops + HudEdgeInstrumentation come from Plan 01 (shared primitives
// to break the Wave 2 race). HudStatusPill + HudThinkingRing are this plan's
// JARVIS-specific primitives.
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
import { HudStatusPill, type HudStatusState } from "@/components/shared/HudStatusPill";
import { HudEdgeInstrumentation } from "@/components/shared/HudEdgeInstrumentation";
import { HudCoreBubble, type HudCoreBubbleState } from "@/components/shared/HudCoreBubble";

/**
 * JARVIS Console (D-01) — top-level orchestrator.
 *
 * Owns:
 *   - Scrollback state (D-05) — single source of truth for visible turns
 *   - Session memory (D-06) — last 10 turns mapped to model history
 *   - AbortController plumbing (foundation for Plan 05-04 cancel UX)
 *   - SSE stream consumption via streamJarvis
 *
 * IDs use native `crypto.randomUUID()` directly (B4 fix — no @/lib/uuid).
 */

interface ProjectSource {
  id: string;
  name: string;
  icon?: string | null;
}
interface HashtagSource {
  id: string;
  name: string;
  displayName: string;
}

interface Props {
  userTimezone: string;
  initialProjects: ProjectSource[];
  initialHashtags: HashtagSource[];
}

const HISTORY_TURN_LIMIT = 10;

export function JarvisConsole({
  userTimezone,
  initialProjects,
  initialHashtags,
}: Props) {
  const [turns, setTurns] = useState<ScrollbackTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Phase 6 Plan 06-03 (AES-05, D-02): imperative handle to the JARVIS input.
  // The module-level singleton (registerJarvisFocus) is the canonical Cmd+K
  // dispatch path; this ref documents the contract and enables future
  // imperative actions (e.g., focus-on-clarification-reply).
  const jarvisInputRef = useRef<JarvisInputHandle>(null);

  // Always points at the latest turns state. The previous snapshot-via-
  // updater-callback pattern leaked an empty array on the first follow-up
  // turn because React 18+ doesn't guarantee the functional updater fires
  // synchronously before the next line runs.
  const turnsRef = useRef<ScrollbackTurn[]>(turns);
  turnsRef.current = turns;

  // Session memory (D-06) — derive from visible scrollback at submit time.
  //
  // Assistant turns must include a textual summary of the actions that
  // landed on that turn (filed task/capture/event). Without this, the model
  // sees an empty assistant turn and re-attempts the same tool calls on the
  // next turn because nothing in history signals completion.
  const buildHistory = useCallback(
    (current: ScrollbackTurn[]): Array<{ role: "user" | "assistant"; content: string }> => {
      return current
        .slice(-HISTORY_TURN_LIMIT)
        .map((t) => {
          if (t.kind === "user") {
            return { role: "user" as const, content: t.text };
          }
          const parts: string[] = [];
          if (t.textDelta) parts.push(t.textDelta);
          for (const a of t.actions) {
            if (!a.result || !a.result.ok) continue;
            const r = (a.result as { receipt?: Record<string, unknown> })
              .receipt ?? {};
            if (a.name === "create_task") {
              const title = String(r.title ?? "");
              const pri = String(r.priority ?? "P3");
              const due = r.due ? ` due ${r.due}` : "";
              parts.push(`Filed TASK "${title}" (${pri}${due}).`);
            } else if (a.name === "create_capture") {
              const content = String(r.content ?? "").slice(0, 80);
              parts.push(`Filed CAPTURE "${content}".`);
            } else if (a.name === "create_event") {
              const title = String(r.title ?? "");
              const start = r.start ? ` ${r.start}` : "";
              parts.push(`Filed EVENT "${title}"${start}.`);
            }
          }
          return { role: "assistant" as const, content: parts.join(" ") };
        })
        .filter((m) => m.content.length > 0);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (payload: JarvisInputPayload) => {
      const userTurn: ScrollbackTurn = {
        kind: "user",
        id: crypto.randomUUID(),
        text: payload.input,
        createdAt: new Date(),
      };
      const assistantId = crypto.randomUUID();
      // Phase 5.1 (D-A2 / JARVIS-19): When the user submits any new message,
      // mark all prior clarifications as answered (last-question-wins; historical
      // record remains in scrollback but reply input is disabled).
      setTurns((prev) =>
        prev.map((t) =>
          t.kind === "assistant" && t.clarification && !t.clarification.answered
            ? {
                ...t,
                clarification: { ...t.clarification, answered: true },
              }
            : t,
        ),
      );
      const assistantTurn: ScrollbackTurn = {
        kind: "assistant",
        id: assistantId,
        textDelta: "",
        actions: [],
        createdAt: new Date(),
        status: "streaming",
      };

      // Read prior turns from the ref BEFORE adding new ones so history
      // reflects what's already on screen (and on the model's side).
      const history = buildHistory(turnsRef.current);
      setTurns((prev) => [...prev, userTurn, assistantTurn]);

      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;

      const request: JarvisRequest = {
        input: payload.input,
        history,
        parsedDates: payload.parsedDates,
        parsedPriority: payload.parsedPriority ?? undefined,
        slashCommand: payload.slashCommand,
        linkedProjectIds: payload.projectIds, // M5
        linkedHashtags: payload.hashtags, // M6
      };

      await streamJarvis(
        request,
        {
          onText: (delta) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, textDelta: t.textDelta + delta }
                  : t,
              ),
            );
          },
          // Phase 5.1 D-P3: pre-push a queued placeholder when the route
          // acknowledges a tool_use block (before executor resolves). The
          // onAction handler below upgrades the same toolUseId to done.
          onQueued: (data) => {
            const placeholder: ScrollbackAction = {
              toolUseId: data.toolUseId,
              name: data.name as ScrollbackAction["name"],
              status: "queued",
            };
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, actions: [...t.actions, placeholder] }
                  : t,
              ),
            );
          },
          // Phase 5.1 (D-A2 / JARVIS-19): clarification SSE event — store on current turn.
          // Last-question-wins: if multiple ask_clarification blocks fire (shouldn't happen
          // per the co-emit rule, but this guards against it), the last one wins.
          onClarification: (data) => {
            const clar: ScrollbackClarification = {
              toolUseId: data.toolUseId,
              question: data.question,
              options: data.options ?? [],
              suggestedAction: data.suggestedAction ?? null,
              answered: false,
            };
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, clarification: clar }
                  : t,
              ),
            );
          },
          onAction: (data) => {
            // Upgrade existing queued placeholder with the real result,
            // or append a new action if no placeholder exists (fallback for
            // clients that don't get the queued event).
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? {
                      ...t,
                      actions: t.actions.some((a) => a.toolUseId === data.toolUseId)
                        ? t.actions.map((a) =>
                            a.toolUseId === data.toolUseId
                              ? {
                                  ...a,
                                  status: "done" as const,
                                  result: data.result as ScrollbackAction["result"],
                                }
                              : a,
                          )
                        : [
                            ...t.actions,
                            {
                              toolUseId: data.toolUseId,
                              name: data.name as ScrollbackAction["name"],
                              status: "done" as const,
                              result: data.result as ScrollbackAction["result"],
                            },
                          ],
                    }
                  : t,
              ),
            );
          },
          onDone: () => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "done" }
                  : t,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
          onError: (message) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "error", errorMessage: message }
                  : t,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
        },
        ac.signal,
      );
    },
    [buildHistory],
  );

  // Plan 05-04 — Undo handler (D-03 / D-04).
  //
  // Owns:
  //   1. Optimistic scrollback flip: action.undone = true immediately so the
  //      receipt's local "expired/clicked" state is the only thing holding
  //      the Undo button visible.
  //   2. Server round-trip via undoJarvisAction. On failure, revert + toast.
  //   3. Resolves the UndoTarget shape from the action's intent + result id.
  //
  // The receipt has already cancelled its countdown before this fires (it
  // calls onUndo synchronously after cancel()), so no race on the 5s window.
  const handleUndoAction = useCallback(
    async (turnId: string, action: ScrollbackAction) => {
      // Guard against queued placeholders (result not yet populated)
      if (!action.result || !action.result.ok) return;
      const id = (action.result as { id: string }).id;

      // Build the UndoTarget per action.name. For events we also need the
      // calendarId, which the receipt payload carries on its receipt object
      // (createEventForJarvis returns { calendarId } per Plan 05-02's GcalEventDTO).
      let target: UndoTarget;
      if (action.name === "create_task") {
        target = { kind: "task", id };
      } else if (action.name === "create_capture") {
        target = { kind: "capture", id };
      } else if (action.name === "create_event") {
        const receipt = (action.result as { receipt?: Record<string, unknown> })
          .receipt ?? {};
        const calendarId = typeof receipt.calendar_id === "string"
          ? receipt.calendar_id
          : typeof receipt.calendarId === "string"
            ? receipt.calendarId
            : "primary";
        target = { kind: "event", id, calendarId };
      } else {
        return;
      }

      // Optimistic — flip undone immediately so the receipt UI snaps.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId && t.kind === "assistant"
            ? {
                ...t,
                actions: t.actions.map((a) =>
                  a.toolUseId === action.toolUseId ? { ...a, undone: true } : a,
                ),
              }
            : t,
        ),
      );

      const result = await undoJarvisAction(target);
      if (!result.ok) {
        toast.error(`Couldn't undo: ${result.error}`);
        // Revert the optimistic flag.
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId && t.kind === "assistant"
              ? {
                  ...t,
                  actions: t.actions.map((a) =>
                    a.toolUseId === action.toolUseId
                      ? { ...a, undone: false }
                      : a,
                  ),
                }
              : t,
          ),
        );
      } else {
        toast.success("Undone");
      }
    },
    [],
  );

  // Phase 5.1 (D-A2 / JARVIS-19) — handle clarification reply from JarvisClarification.
  //
  // The user clicked a chip or typed in the free-text reply within a clarification
  // receipt. We:
  //   1. Mark that turn's clarification as answered (disables further input).
  //   2. Submit the reply as the next user turn, prefixed with [CLARIFICATION REPLY].
  //      The route detects this prefix and adds a depth-cap system note (Pitfall 2).
  const handleClarificationReply = useCallback(
    (turnId: string, text: string) => {
      // Mark answered immediately so the receipt UI snaps to disabled state.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId && t.kind === "assistant" && t.clarification
            ? { ...t, clarification: { ...t.clarification, answered: true } }
            : t,
        ),
      );
      // Submit as next user turn with the [CLARIFICATION REPLY] prefix.
      void handleSubmit({
        input: `[CLARIFICATION REPLY] ${text}`,
        parsedDates: [],
        parsedPriority: null,
        slashCommand: null,
        projectIds: [],
        hashtags: [],
      });
    },
    [handleSubmit],
  );

  // Phase 6.1 Plan 02 — derive the HudStatusPill state from scrollback turn
  // lifecycle. The ScrollbackAssistantTurn.status is "streaming" | "done" | "error";
  // we split "streaming" into thinking (pre-first-token) vs streaming (textDelta
  // arriving) using textDelta presence as the threshold.
  //
  // The status pill cycles READY → SENDING → THINKING → STREAMING → READY on the
  // happy path. SENDING is the brief window between submit (streaming=true) and
  // the assistant turn entering scrollback (which it does immediately, so SENDING
  // is fleeting — acceptable per UI-SPEC §6b state 4).
  const status: HudStatusState = useMemo(() => {
    // Walk from the end — most recent assistant turn governs the pill
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.kind !== "assistant") continue;
      if (t.status === "error") return "error";
      if (t.status === "streaming") {
        // No textDelta yet → still waiting for first token (THINKING)
        // textDelta arriving → STREAMING
        return t.textDelta.length > 0 ? "streaming" : "thinking";
      }
      // status === "done": no longer governs the pill
      break;
    }
    // No active turn — if a submit just fired and the assistant turn hasn't
    // been pushed yet, `streaming=true` flags the SENDING window.
    if (streaming) return "sending";
    return "ready";
  }, [turns, streaming]);

  // Phase 6.1 Plan 02 — TODO(phase 6.1.x): wire real telemetry from
  // jarvis_events when /insights aggregation lands. For now, null values
  // render as "—ms / —% / —" placeholders so the rail doesn't feel broken.
  const latencyMs: number | null = null;
  const cacheHitPercent: number | null = null;
  const lastTurnRelative: string | null = null;

  // Phase 6.1 — HudCoreBubble visual anchor (arc-reactor centerpiece per
  // Stark HUD reference). Reactive: idle ambient when no conversation,
  // thinking/streaming when JARVIS is active, error on stream failure.
  // Dims to ambient background opacity once scrollback has any turns.
  const coreState: HudCoreBubbleState =
    status === "thinking" || status === "streaming" || status === "sending"
      ? "thinking"
      : status === "error"
        ? "error"
        : "idle";
  const coreDimmed = turns.length > 0;

  return (
    // Phase 6 Plan 06-05 (UI-SPEC §11a): .agent-mode-scope activates the
    // JARVIS-blue focus-visible ring on all interactive descendants. The
    // globals.css default rule paints amber rings on Journal-mode routes;
    // this opt-in wrapper swaps the ring to JARVIS-blue inside the Console.
    //
    // Phase 6.1 Plan 02 (UI-SPEC §5a, §6d, §6e):
    //   - HudCornerCrops: 4 viewport-corner L-bracket crops, 12px legs, breathing 6s loop
    //   - HudStatusPill: top-right state indicator (READY/SENDING/THINKING/STREAMING/ERROR)
    //   - HudEdgeInstrumentation: bottom-edge LATENCY/CACHE/LAST telemetry rail
    // `relative` is required so the absolutely-positioned chrome anchors to the
    // console viewport, not the page.
    <div className="agent-mode-scope relative flex h-[calc(100vh-3rem)] flex-col">
      {/* Phase 6.1 Plan 02: 4 corner L-brackets at viewport corners (12px legs,
          breathing 6s). aria-hidden + pointer-events-none — pure chrome. */}
      <HudCornerCrops size={12} />

      {/* Phase 6.1 Plan 02: top-right status pill. Positioned absolute so it
          doesn't displace the scrollback layout. */}
      <HudStatusPill state={status} className="absolute top-4 right-4 z-10" />

      {/* Phase 6.1 — Arc-reactor centerpiece. Sits behind scrollback at z-0;
          dominant in empty state, ambient when conversation begins.
          aria-hidden + pointer-events-none — pure visual anchor. */}
      <HudCoreBubble
        state={coreState}
        dimmed={coreDimmed}
        className="absolute inset-0 flex items-center justify-center z-0"
      />

      <div className="relative z-10 flex-1 min-h-0">
        <JarvisScrollback
          turns={turns}
          onUndoAction={handleUndoAction}
          onClarificationReply={handleClarificationReply}
        />
      </div>
      <div className="relative z-10 border-t bg-card px-6 py-3">
        <JarvisInput
          ref={jarvisInputRef}
          userTimezone={userTimezone}
          getProjects={() => initialProjects}
          getHashtags={() => initialHashtags}
          onSubmit={handleSubmit}
          disabled={streaming}
        />
        {/* Phase 6.1 Plan 02: bottom-edge instrumentation rail. hidden md:flex
            per UI-SPEC §10c — drops below 768px to preserve mobile vertical space. */}
        <div className="flex justify-center mt-2">
          <HudEdgeInstrumentation
            latencyMs={latencyMs}
            cacheHitPercent={cacheHitPercent}
            lastTurnRelative={lastTurnRelative}
          />
        </div>
      </div>
    </div>
  );
}
