"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  streamJarvis,
  type JarvisRequest,
} from "./jarvis-stream-client";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
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
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
// Phase 10 Plan 10-04 (LAT-02) — client-side sentence boundary splitter.
// splitDeltas accumulates streaming text deltas into a rolling buffer; each
// completed sentence is dispatched immediately via 'jarvis-voice-speak-sentence'
// so its TTS fetch can fire while later sentences are still being generated.
import { splitDeltas } from "@/lib/voice/sentence-splitter";
import {
  saveJarvisTurn,
  loadJarvisHistoryPage,
} from "@/app/actions/jarvis-turns";
// Phase 9 / TEL-01 — voice-stage collector binding. setActiveTurnId binds the
// turnId returned by the server (SSE turn-start event); collectStage(vad_end_at)
// then lands the LOCALLY-captured timestamp piped through the transcript event.
import {
  collectStage,
  setActiveTurnId,
} from "@/lib/voice/voice-stage-collector";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";

/**
 * Fire-and-forget save. Errors are logged but never bubble — scrollback
 * persistence is best-effort: a failed save shouldn't disrupt the user's
 * conversation in-memory.
 */
function persistTurn(turn: ScrollbackTurn): void {
  void saveJarvisTurn({
    id: turn.id,
    kind: turn.kind,
    text: turn.kind === "user" ? turn.text : null,
    textDelta: turn.kind === "assistant" ? turn.textDelta : null,
    actions: turn.kind === "assistant" ? turn.actions : [],
    clarification:
      turn.kind === "assistant" ? turn.clarification ?? null : null,
    status: turn.kind === "assistant" ? turn.status : null,
    errorMessage:
      turn.kind === "assistant" ? turn.errorMessage ?? null : null,
    createdAt: turn.createdAt.toISOString(),
  }).catch((err) => {
    console.warn("[jarvis] persistTurn failed (non-fatal)", err);
  });
}

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
  /**
   * SSR-hydrated scrollback history (Phase 7 polish). Persisted via
   * jarvis_turns table so the conversation survives page reloads.
   * Only the LATEST 10 turns are SSR-loaded; older pages are fetched on
   * demand via the "Older messages" button in JarvisScrollback. The LLM
   * context window still uses an in-memory sliding window of the last
   * HISTORY_TURN_LIMIT turns — we persist for DISPLAY, not prompt input.
   */
  initialTurns?: ScrollbackTurn[];
  /**
   * True if there are turns older than the SSR-loaded page. When true,
   * JarvisScrollback shows the "Older messages" load-more button.
   */
  initialHasMore?: boolean;
  /**
   * ISO timestamp of the oldest turn currently in memory. Used as the
   * `before` cursor for the next pagination request.
   */
  initialOldestAt?: string | null;
}

const HISTORY_TURN_LIMIT = 10;
const HISTORY_PAGE_SIZE = 10;

export function JarvisConsole({
  userTimezone,
  initialProjects,
  initialHashtags,
  initialTurns = [],
  initialHasMore = false,
  initialOldestAt = null,
}: Props) {
  const [turns, setTurns] = useState<ScrollbackTurn[]>(initialTurns);
  // Pagination cursor state — the oldest turn currently loaded and whether
  // there's another page behind it.
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [oldestAt, setOldestAt] = useState<string | null>(initialOldestAt);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Phase 6 Plan 06-03 (AES-05, D-02): imperative handle to the JARVIS input.
  // The module-level singleton (registerJarvisFocus) is the canonical Cmd+K
  // dispatch path; this ref documents the contract and enables future
  // imperative actions (e.g., focus-on-clarification-reply).
  const jarvisInputRef = useRef<JarvisInputHandle>(null);

  // Phase 7 Plan 07-04: voice-active is a PER-MESSAGE concern, not a global
  // setting. Even with voice mode enabled, typed input doesn't need a spoken
  // receipt — and forcing voice_summary required on typed turns made the
  // model stall (Anthropic strict mode couldn't satisfy a "voice receipt for
  // text input" instruction). Resolved per-call inside handleSubmit via an
  // `isVoice` parameter; the derived flag below is now only a base capability
  // signal for components that need to know "is voice infra usable at all".
  const { settings: voiceSettings } = useVoiceSettings();
  const voiceCapable =
    voiceSettings.voiceEnabled && !voiceSettings.discreetMode;

  // Phase 14-03: hard browser mic guard. When the desktop daemon holds a
  // fresh voice-source claim, the browser mic is fully suppressed at the
  // JarvisListenerMount level (it returns null). Here we only read the
  // status to render the "Voice via desktop" indicator pill so the user
  // knows the browser mic is intentionally disabled, not broken.
  const { desktopClaimed } = useVoiceSourceStatus();

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
    async (
      payload: JarvisInputPayload,
      opts?: {
        isVoice?: boolean;
        sttDoneAt?: number | null;
        /** Phase 9 / TEL-01 — VAD end timestamp captured LOCALLY in
         *  JarvisListener.onSpeechEnd, piped via jarvis-voice-transcript
         *  CustomEvent detail, forwarded here, and collectStage-d inside the
         *  onTurnStart callback AFTER setActiveTurnId binds the row. */
        vadEndAt?: number;
      },
    ) => {
      // voiceActive header is now ALWAYS false — the model no longer needs to
      // emit a separate voice_summary field. The spoken response is the
      // leading text block (collected client-side from text deltas and fired
      // through TTS on onDone), so what's heard matches what's on screen.
      const voiceActive = false;
      // Track the input modality so the onDone dispatch can tell JarvisListener
      // whether to open the 5s follow-up window. Voice in → open window
      // (chain conversation by voice). Typed in → don't open window (user is
      // typing, not in active voice convo). Fix for the bug where typing
      // would keep the wake-word-free voice window open indefinitely.
      const turnIsVoice = opts?.isVoice === true;
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

      // Persist the user turn immediately — even if streaming fails or the
      // tab closes, the user's question stays in the scrollback on reload.
      persistTurn(userTurn);

      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;

      // Phase 10 Plan 10-04 (LAT-02) — per-turn sentence dispatch state.
      // Local to this handleSubmit closure so every turn starts with a fresh
      // buffer + seq counter. ttsBuffer is the rolling unfinished tail; ttsSeq
      // is the monotonic sentence index dispatched so far this turn.
      let ttsBuffer = "";
      let ttsSeq = 0;

      const request: JarvisRequest = {
        input: payload.input,
        history,
        parsedDates: payload.parsedDates,
        parsedPriority: payload.parsedPriority ?? undefined,
        slashCommand: payload.slashCommand,
        linkedProjectIds: payload.projectIds, // M5
        linkedHashtags: payload.hashtags, // M6
      };

      // Phase 9 / TEL-01 — capture for use inside onTurnStart (below). The
      // collectStage MUST run AFTER setActiveTurnId (binding asynchronously
      // resolves when the server emits its first SSE turn-start frame), so
      // eager collectStage here would no-op and silently drop vad_end_at.
      const vadEndAt = opts?.vadEndAt;

      await streamJarvis(
        request,
        {
          // Phase 9 / TEL-01 — first SSE frame; server-generated turnId. Bind
          // the collector to THIS turn FIRST, THEN collectStage(vad_end_at)
          // so the locally-captured timestamp lands against the now-bound row.
          // (stt_done_at is captured server-side via the X-Jarvis-Stt-Done-At
          // request header at stream start — Plan 09-01. Don't double-write.)
          onTurnStart: (data) => {
            setActiveTurnId(data.turnId);
            if (vadEndAt != null && Number.isFinite(vadEndAt)) {
              collectStage("vad_end_at", new Date(vadEndAt));
            }
          },
          onText: (delta) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, textDelta: t.textDelta + delta }
                  : t,
              ),
            );
            // Phase 10 Plan 10-04 (LAT-02) — per-sentence TTS dispatch as
            // text deltas arrive. The splitter accumulates the rolling
            // buffer; each complete sentence dispatches a separate event so
            // its TTS fetch fires before the SSE stream closes.
            const { sentences, remainder } = splitDeltas(ttsBuffer, delta);
            ttsBuffer = remainder;
            for (const s of sentences) {
              const cleaned = stripSystemTags(s).trim();
              if (!cleaned) continue;
              const seq = ttsSeq++;
              window.dispatchEvent(
                new CustomEvent("jarvis-voice-speak-sentence", {
                  detail: {
                    text: cleaned,
                    seq,
                    voiceId: voiceSettings.voiceId,
                    isVoice: turnIsVoice,
                  },
                }),
              );
            }
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

            // Phase 7 Plan 07-04 (revised): TTS no longer reads from
            // receipt.voice_summary. Spoken text is the assistant's leading
            // prose, fired once in onDone after the full text has streamed
            // in. See onDone for the dispatch logic.
          },
          onDone: () => {
            // Capture the post-update snapshot from inside the updater, then
            // persist AFTER setTurns returns. Calling persistTurn (a Server
            // Action) inside the updater triggers a router transition that
            // can fire during render and crash with "Cannot update Router
            // while rendering JarvisConsole".
            let completed: ScrollbackTurn | undefined;
            setTurns((prev) => {
              const next = prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "done" as const }
                  : t,
              );
              completed = next.find(
                (t) => t.id === assistantId && t.kind === "assistant",
              );
              return next;
            });
            if (completed) persistTurn(completed);

            // Phase 10 Plan 10-04 (LAT-02) — final flush: emit any
            // unfinished tail in the rolling buffer as the last sentence.
            if (ttsBuffer.trim()) {
              const cleaned = stripSystemTags(ttsBuffer).trim();
              if (cleaned) {
                const seq = ttsSeq++;
                window.dispatchEvent(
                  new CustomEvent("jarvis-voice-speak-sentence", {
                    detail: {
                      text: cleaned,
                      seq,
                      voiceId: voiceSettings.voiceId,
                      isVoice: turnIsVoice,
                    },
                  }),
                );
              }
              ttsBuffer = "";
            }

            // If NO sentences were emitted at all (text-only ack like a pure
            // tool-call turn), fire the butler-ack on the per-sentence
            // channel so the FSM still cycles thinking → speaking → listening.
            // Without this, the listener stays in "thinking" forever and
            // subsequent wake-word utterances get discarded.
            if (ttsSeq === 0) {
              window.dispatchEvent(
                new CustomEvent("jarvis-voice-speak-sentence", {
                  detail: {
                    text: "Done, sir.",
                    seq: 0,
                    voiceId: voiceSettings.voiceId,
                    isVoice: turnIsVoice,
                  },
                }),
              );
              ttsSeq = 1;
            }

            // Signal end-of-turn so the controller drains in-flight fetches
            // and fires onEnd once the AudioQueue empties.
            window.dispatchEvent(
              new CustomEvent("jarvis-voice-end-of-turn", {
                detail: { isVoice: turnIsVoice },
              }),
            );

            setStreaming(false);
            abortRef.current = null;
          },
          onError: (message) => {
            let errored: ScrollbackTurn | undefined;
            setTurns((prev) => {
              const next = prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "error" as const, errorMessage: message }
                  : t,
              );
              errored = next.find(
                (t) => t.id === assistantId && t.kind === "assistant",
              );
              return next;
            });
            if (errored) persistTurn(errored);
            setStreaming(false);
            abortRef.current = null;
          },
        },
        ac.signal,
        voiceActive,
        // Phase 9 / TEL-01: forward STT-done-at from the voice transcript
        // event when the input came from voice. Null for typed turns.
        opts?.sttDoneAt ?? null,
      );
    },
    [buildHistory, voiceCapable, voiceSettings.voiceId],
  );

  // Phase 7 Plan 07-04: listen for voice transcripts dispatched by JarvisListener
  // after STT completes. The transcript is treated identically to typed input —
  // voice is just another input channel. JarvisListener dispatches the custom
  // event with { detail: { transcript: string } }.
  useEffect(() => {
    function handleVoiceTranscript(e: Event) {
      // Phase 9 / TEL-01: voice transcript detail carries:
      //   - sttDoneAt — STT completion epoch ms (forwarded via X-Jarvis-Stt-Done-At
      //     so /api/jarvis stamps stages.sttDoneAt at INSERT time)
      //   - vadEndAt  — VAD end epoch ms captured LOCALLY in onSpeechEnd, piped
      //     through here for deferred collectStage in onTurnStart (cannot be
      //     collectStage-d earlier — activeTurnId is unbound until the server
      //     emits its first SSE turn-start frame)
      const detail = (
        e as CustomEvent<{
          transcript: string;
          sttDoneAt?: number | null;
          vadEndAt?: number;
        }>
      ).detail;
      if (!detail?.transcript?.trim()) return;
      void handleSubmit(
        {
          input: detail.transcript,
          parsedDates: [],
          parsedPriority: null,
          slashCommand: null,
          projectIds: [],
          hashtags: [],
        },
        {
          isVoice: true,
          sttDoneAt: detail.sttDoneAt ?? null,
          vadEndAt: detail.vadEndAt,
        },
      );
    }
    window.addEventListener("jarvis-voice-transcript", handleVoiceTranscript);
    return () => {
      window.removeEventListener(
        "jarvis-voice-transcript",
        handleVoiceTranscript,
      );
    };
  }, [handleSubmit]);

  // Phase 7 voice-everywhere: jarvis-cancel aborts the in-flight /api/jarvis
  // request so the user can stop the run before the model finishes.
  useEffect(() => {
    function handleCancel() {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
    }
    window.addEventListener("jarvis-cancel", handleCancel);
    return () => window.removeEventListener("jarvis-cancel", handleCancel);
  }, []);

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
      let updated: ScrollbackTurn | undefined;
      setTurns((prev) => {
        const next = prev.map((t) =>
          t.id === turnId && t.kind === "assistant"
            ? {
                ...t,
                actions: t.actions.map((a) =>
                  a.toolUseId === action.toolUseId ? { ...a, undone: true } : a,
                ),
              }
            : t,
        );
        updated = next.find((t) => t.id === turnId && t.kind === "assistant");
        return next;
      });
      // Persist the undone state so it survives reload. Calling outside the
      // updater avoids triggering a Server Action (router transition) during
      // a React render replay.
      if (updated) persistTurn(updated);

      const result = await undoJarvisAction(target);
      if (!result.ok) {
        toast.error(`Couldn't undo: ${result.error}`);
        // Revert the optimistic flag.
        let reverted: ScrollbackTurn | undefined;
        setTurns((prev) => {
          const next = prev.map((t) =>
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
          );
          reverted = next.find(
            (t) => t.id === turnId && t.kind === "assistant",
          );
          return next;
        });
        // Re-persist with the reverted state so reload doesn't show a stale
        // "undone" badge.
        if (reverted) persistTurn(reverted);
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

      {/* Phase 14-03: desktop mic active indicator. Shown when the desktop
          daemon holds the voice-source claim, so the user knows the browser
          mic is intentionally suppressed (not broken). Subtle pill matching
          the HUD aesthetic: muted cyan text, edge border, desktop icon prefix.
          Positioned top-left, aria-live="polite" for screen-reader announce. */}
      {desktopClaimed && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Voice input via desktop app"
          className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.08em]"
          style={{
            color: "var(--hud-cyan)",
            border: "1px solid var(--edge-hud)",
            backgroundColor: "transparent",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "var(--hud-cyan)" }}
            aria-hidden="true"
          />
          <span>Voice via desktop</span>
        </div>
      )}

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
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={async () => {
            if (loadingOlder || !hasMore || !oldestAt) return;
            setLoadingOlder(true);
            try {
              const res = await loadJarvisHistoryPage({
                limit: HISTORY_PAGE_SIZE,
                before: oldestAt,
              });
              if (!res.success) {
                toast.error("Couldn't load older messages.");
                return;
              }
              const older: ScrollbackTurn[] = res.data.turns.map(
                (r): ScrollbackTurn => {
                  if (r.kind === "user") {
                    return {
                      kind: "user",
                      id: r.id,
                      text: r.text ?? "",
                      createdAt: new Date(r.createdAt),
                    };
                  }
                  const rawStatus =
                    r.status === "streaming" ? "done" : r.status;
                  return {
                    kind: "assistant",
                    id: r.id,
                    textDelta: r.textDelta ?? "",
                    actions: (r.actions as ScrollbackAction[]) ?? [],
                    status:
                      (rawStatus as "done" | "error") ?? "done",
                    errorMessage: r.errorMessage ?? undefined,
                    clarification:
                      (r.clarification as ScrollbackClarification | null) ??
                      undefined,
                    createdAt: new Date(r.createdAt),
                  };
                },
              );
              setTurns((prev) => [...older, ...prev]);
              setHasMore(res.data.hasMore);
              setOldestAt(res.data.oldestAt ?? oldestAt);
            } finally {
              setLoadingOlder(false);
            }
          }}
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
