"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  streamJarvis,
  type JarvisRequest,
} from "./jarvis-stream-client";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { JarvisScrollback } from "./JarvisScrollback";
import { JarvisInput, type JarvisInputHandle, type JarvisInputPayload } from "./JarvisInput";
import type { ScrollbackAction, ScrollbackClarification, ScrollbackTurn } from "./jarvis-types";
import { undoJarvisAction } from "@/app/actions/jarvis";
import { actionToUndoTarget } from "@/lib/jarvis/action-to-undo-target";
// Phase 6.1 Plan 02 — JARVIS Console chrome (UI-SPEC §5a, §6d, §6e, §9f).
// HudCornerCrops + HudEdgeInstrumentation come from Plan 01 (shared primitives
// to break the Wave 2 race). HudStatusPill + HudThinkingRing are this plan's
// JARVIS-specific primitives.
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
import { HudStatusPill, type HudStatusState } from "@/components/shared/HudStatusPill";
import { HudCoreBubble, type HudCoreBubbleState } from "@/components/shared/HudCoreBubble";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
import { invalidateAfterJarvisAction } from "@/lib/jarvis/invalidate-after-action";
// Phase 10 Plan 10-04 (LAT-02) — client-side sentence boundary splitter.
// splitDeltas accumulates streaming text deltas into a rolling buffer; each
// completed sentence is dispatched immediately via 'jarvis-voice-speak-sentence'
// so its TTS fetch can fire while later sentences are still being generated.
import { splitDeltas } from "@/lib/voice/sentence-splitter";
import {
  saveJarvisTurn,
  loadJarvisHistoryPage,
  loadJarvisHistorySince,
} from "@/app/actions/jarvis-turns";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
// Phase 9 / TEL-01 — voice-stage collector binding. setActiveTurnId binds the
// turnId returned by the server (SSE turn-start event); collectStage(vad_end_at)
// then lands the LOCALLY-captured timestamp piped through the transcript event.
import {
  collectStage,
  setActiveTurnId,
} from "@/lib/voice/voice-stage-collector";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";
import { registerJarvisConsoleMounted } from "@/lib/jarvis/focus";

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
 * Shape of a persisted turn row as returned by loadJarvisHistoryPage. Kept
 * local (the action's TurnRow type isn't exported) and matches its fields.
 */
type JarvisTurnRow = {
  id: string;
  kind: "user" | "assistant";
  text: string | null;
  textDelta: string | null;
  actions: unknown[];
  clarification: unknown | null;
  status: string | null;
  errorMessage: string | null;
  createdAt: Date | string;
};

/**
 * Canonical TurnRow → ScrollbackTurn mapper. Single source of truth for the
 * mapping previously inlined in onLoadOlder (and identically in
 * today/page.tsx's server-side hydration, which stays inline — it's an RSC,
 * out of scope for this client helper). Streaming rows are normalised to
 * "done" so a turn persisted mid-stream doesn't render an infinite spinner.
 */
function mapTurnRow(r: JarvisTurnRow): ScrollbackTurn {
  if (r.kind === "user") {
    return {
      kind: "user",
      id: r.id,
      text: r.text ?? "",
      createdAt: new Date(r.createdAt),
    };
  }
  const rawStatus = r.status === "streaming" ? "done" : r.status;
  return {
    kind: "assistant",
    id: r.id,
    textDelta: r.textDelta ?? "",
    actions: (r.actions as ScrollbackAction[]) ?? [],
    status: (rawStatus as "done" | "error") ?? "done",
    errorMessage: r.errorMessage ?? undefined,
    clarification:
      (r.clarification as ScrollbackClarification | null) ?? undefined,
    createdAt: new Date(r.createdAt),
  };
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
  /** Authed user id — scopes the externally-created-turns realtime channel. */
  userId: string;
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
  userId,
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

  // Register this console as mounted so GlobalJarvisHandler knows to yield
  // when a JarvisConsole is active (e.g. split-screen side panel). Without
  // this, both GlobalJarvisHandler AND JarvisConsole would submit the same
  // jarvis-voice-transcript event — double-executing the turn and racing on
  // DB persistence.
  useEffect(() => {
    registerJarvisConsoleMounted(true);
    return () => registerJarvisConsoleMounted(false);
  }, []);

  // Issue #17: JARVIS mutations refreshed the underlying lists only via the
  // flaky Supabase Realtime echo (and never at all for gcal events). We now
  // invalidate the affected TanStack Query keys DIRECTLY on every successful
  // action + undo so created/updated/deleted entities show immediately.
  const queryClient = useQueryClient();

  // Deep-link target (e.g. /today?messageId=<turnId> from a wiki page's
  // processing-run history). When set, we ensure the turn is loaded and scroll
  // it into view via JarvisScrollback.
  const searchParams = useSearchParams();
  const messageId = searchParams.get("messageId");

  // Always points at the latest turns state. The previous snapshot-via-
  // updater-callback pattern leaked an empty array on the first follow-up
  // turn because React 18+ doesn't guarantee the functional updater fires
  // synchronously before the next line runs.
  const turnsRef = useRef<ScrollbackTurn[]>(turns);
  turnsRef.current = turns;

  // Live-merge externally-created jarvis_turns (Cmd+K / non-/today voice turns
  // persisted by GlobalJarvisHandler) into the local scrollback.
  //
  // WHY fetch-and-merge instead of invalidate-only: this scrollback is LOCAL
  // `useState`, not TanStack-Query-backed, so useTableSubscription's
  // invalidate-only signal can't update it. On each jarvis_turns change we
  // fetch the latest page and merge by id into local state. Dedup-by-id is
  // mandatory: the console's OWN handleSubmit turns persist with the SAME id,
  // so the realtime echo must update-in-place (or skip if mid-stream) and
  // never append a duplicate.
  useEffect(() => {
    const supabase = createClient();

    // Append-if-absent, update-if-present-and-not-streaming. Never clobber a
    // turn that is actively streaming (its local state is ahead of the DB),
    // then re-sort chronologically.
    function mergeById(
      prev: ScrollbackTurn[],
      incoming: ScrollbackTurn[],
    ): ScrollbackTurn[] {
      const next = [...prev];
      const indexById = new Map(next.map((t, i) => [t.id, i] as const));
      for (const turn of incoming) {
        const existingIdx = indexById.get(turn.id);
        if (existingIdx === undefined) {
          next.push(turn);
          indexById.set(turn.id, next.length - 1);
          continue;
        }
        const existing = next[existingIdx];
        // Skip any locally-streaming assistant turn — its in-memory state is
        // authoritative until onDone/onError persists the final row.
        if (existing.kind === "assistant" && existing.status === "streaming") {
          continue;
        }
        next[existingIdx] = turn;
      }
      next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return next;
    }

    async function refreshAndMerge() {
      const res = await loadJarvisHistoryPage({ limit: 20 });
      if (!res.success) return;
      const mapped = res.data.turns.map(mapTurnRow);
      setTurns((prev) => mergeById(prev, mapped));
    }

    // Create the channel and attach the listener synchronously so the cleanup
    // below always has a real channel to remove. Deferring channel creation
    // behind an await (as before) meant React strict-mode's synchronous cleanup
    // ran while `channel` was still null — a no-op — leaving the first channel
    // subscribed. The second mount then re-used that subscribed instance and
    // threw "cannot add postgres_changes callbacks ... after subscribe()".
    const channel = supabase.channel(`jarvis-console-merge:${userId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "jarvis_turns",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void refreshAndMerge();
      },
    );

    // The module-private _initRealtimeAuth in useTableSubscription is NOT
    // exported, so this standalone channel must carry the user JWT itself.
    // Only .subscribe() is deferred behind the token fetch; .on() already ran.
    void supabase.auth.getSession().then(({ data }) => {
      void supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Deep-link hydration. If the requested turn isn't already in the SSR-loaded
  // page, fetch it plus everything after it and replace the visible scrollback
  // so JarvisScrollback can scroll to it. If it's already present, the
  // scroll-to-target effect in JarvisScrollback handles it with no fetch.
  useEffect(() => {
    if (!messageId) return;
    if (turnsRef.current.some((t) => t.id === messageId)) return;
    let cancelled = false;
    void (async () => {
      const res = await loadJarvisHistorySince({ turnId: messageId });
      if (cancelled || !res.success) return;
      const mapped = res.data.turns.map(mapTurnRow);
      setTurns(mapped);
      setHasMore(res.data.hasMore);
      setOldestAt(res.data.oldestAt);
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  // Session memory (D-06) — derive from visible scrollback at submit time.
  //
  // Phase 16: buildHistory now emits Anthropic content-block arrays for
  // assistant turns that carried tool calls. This lets the model resolve
  // entity IDs across turns (e.g. "the task I just created" → real UUID).
  //
  // Anthropic API contract (Pitfall 1): every assistant turn that contains
  // tool_use blocks MUST be immediately followed by a user turn that contains
  // matching tool_result blocks for every tool_use id in that turn.
  //
  // Backward compat: assistant turns with no tool calls emit a plain string
  // so pre-Phase-16 scrollback entries continue to work correctly.

  // ContentBlock type for building Anthropic-compatible history entries.
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  // Reconstruct a minimal but valid tool input from the persisted receipt.
  // The model primarily needs the id + key label fields for entity reference
  // resolution; perfect fidelity is not required.
  function reconstructToolInput(action: ScrollbackAction): Record<string, unknown> {
    const r = (action.result as { receipt?: Record<string, unknown> } | undefined)?.receipt ?? {};
    switch (action.name) {
      case "create_task":
      case "update_task":
        return { id: (action.result as { id?: string })?.id ?? r.id, title: r.title, status: r.status, priority: r.priority, due: r.due };
      case "delete_task":
        return { id: r.id ?? (action.result as { id?: string })?.id };
      case "create_capture":
      case "update_capture":
        return { id: (action.result as { id?: string })?.id ?? r.id, content: r.content };
      case "delete_capture":
        return { id: r.id ?? (action.result as { id?: string })?.id };
      case "create_event":
      case "update_event":
        return { id: (action.result as { id?: string })?.id ?? r.id, calendar_id: r.calendar_id, title: r.title, start: r.start, end: r.end };
      case "delete_event":
        return { id: r.id ?? (action.result as { id?: string })?.id, calendar_id: r.calendar_id };
      case "find_tasks":
      case "find_captures":
      case "find_events":
        return { query: r.query };
      case "ask_clarification":
        return { question: r.question };
      case "remember_fact":
        return { fact: r.fact, type: r.type };
      default:
        return {};
    }
  }

  const buildHistory = useCallback(
    (current: ScrollbackTurn[]): Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> => {
      const recent = current.slice(-HISTORY_TURN_LIMIT);
      const out: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> = [];
      for (const t of recent) {
        if (t.kind === "user") {
          out.push({ role: "user" as const, content: t.text });
          continue;
        }
        // Assistant turn — gather done actions
        const doneActions = (t.actions ?? []).filter((a) => a.status === "done");
        if (doneActions.length === 0) {
          // Plain prose assistant turn (no tool calls)
          if (t.textDelta) out.push({ role: "assistant" as const, content: t.textDelta });
          continue;
        }
        // Mixed: text preamble + tool_use blocks
        const assistantBlocks: ContentBlock[] = [];
        if (t.textDelta) assistantBlocks.push({ type: "text", text: t.textDelta });
        for (const a of doneActions) {
          assistantBlocks.push({ type: "tool_use", id: a.toolUseId, name: a.name, input: reconstructToolInput(a) });
        }
        out.push({ role: "assistant" as const, content: assistantBlocks });
        // Anthropic REQUIRES that the immediately following turn carry tool_result
        // blocks for every tool_use id in the assistant turn — Pitfall 1.
        // Special case: ask_clarification — synthesize a tool_result using the
        // user's clarification reply text as content (the next user turn IS the
        // implicit response, but the API still needs a matched tool_result block).
        const toolResultBlocks: ContentBlock[] = doneActions.map((a) => {
          let resultContent: string;
          if (a.name === "ask_clarification" && t.clarification?.answered) {
            // The user's reply is the semantic content of the clarification tool_result.
            resultContent = JSON.stringify({ answered: true, question: t.clarification.question });
          } else {
            resultContent = JSON.stringify(a.result ?? { ok: false, error: "no result persisted" });
          }
          return {
            type: "tool_result" as const,
            tool_use_id: a.toolUseId,
            content: resultContent,
          };
        });
        out.push({ role: "user" as const, content: toolResultBlocks });
      }
      return out;
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
      // Abort any request still in flight before starting a new one. The UI
      // gates submits behind `disabled={streaming}`, but programmatic paths
      // (voice transcript, clarification chips) can re-enter while a stream is
      // open. Without this, the previous fetch leaks and both SSE readers race
      // to mutate overlapping turn state. Mirrors GlobalJarvisHandler's
      // abort-before-start contract.
      abortRef.current?.abort();
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

            // Issue #17: refresh the lists this action touched. Fires once per
            // action, so every action in a multi-action batch invalidates its
            // own keys. Only invalidate on success — a failed write changed
            // nothing. find_*/clarification map to no keys (no-op).
            if (data.result?.ok) {
              invalidateAfterJarvisAction(queryClient, data.name, userId);
            }

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
            //
            // flushSync is REQUIRED: onDone fires from the SSE reader (not a
            // React event), so a bare setTurns is batched and the updater runs
            // later — `completed` stays undefined and the turn silently never
            // persists (receipts vanished on reload). flushSync forces the
            // updater to run before the persist check.
            let completed: ScrollbackTurn | undefined;
            flushSync(() => {
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
            // flushSync for the same reason as onDone — without it the captured
            // `errored` is undefined whenever updates are batched mid-stream.
            let errored: ScrollbackTurn | undefined;
            flushSync(() => {
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
    [buildHistory, voiceCapable, voiceSettings.voiceId, queryClient, userId],
  );

  // jarvis-voice-transcript handler — two distinct sources use this event:
  //
  // 1. Desktop voice (source: "desktop"): the desktop app already ran the
  //    JARVIS turn server-side. We only show a synthetic user bubble here;
  //    the assistant response arrives via jarvis-response-* SSE events
  //    (handled by the next effect). DO NOT call handleSubmit.
  //
  // 2. GlobalJarvisDialog text submission (no source / source !== "desktop"):
  //    the Cmd+K dialog on a non-/today route fires this event with the
  //    typed text. When JarvisConsole is mounted (split-screen side panel),
  //    GlobalJarvisHandler yields (checks isJarvisConsoleMounted()) so WE
  //    must run the full pipeline here via handleSubmit. This is what makes
  //    the thinking indicator and streaming show immediately in the panel
  //    instead of waiting for a page reload.
  useEffect(() => {
    function handleVoiceTranscript(e: Event) {
      const detail = (
        e as CustomEvent<{
          transcript: string;
          sttDoneAt?: number | null;
          vadEndAt?: number;
          turnId?: string;
          source?: string;
        }>
      ).detail;
      if (!detail?.transcript?.trim()) return;

      // Desktop-originated transcripts: the server already executed the turn.
      // Just show the user bubble; jarvis-response-* events stream the reply.
      if (detail.source === "desktop") {
        const userTurn: ScrollbackTurn = {
          kind: "user",
          id: crypto.randomUUID(),
          text: detail.transcript,
          createdAt: new Date(),
        };
        setTurns((prev) => {
          const next = [...prev, userTurn];
          turnsRef.current = next;
          return next;
        });
        return;
      }

      // Dialog / non-desktop transcript: run the full JARVIS pipeline so the
      // thinking indicator and receipt cards appear immediately.
      void handleSubmit({
        input: detail.transcript,
        parsedDates: [],
        parsedPriority: null,
        slashCommand: null,
        projectIds: [],
        hashtags: [],
      });
    }
    window.addEventListener("jarvis-voice-transcript", handleVoiceTranscript);
    return () => {
      window.removeEventListener(
        "jarvis-voice-transcript",
        handleVoiceTranscript,
      );
    };
  }, [handleSubmit]);

  // Phase 14-04: when desktopClaimed === true, subscribe to the server-side
  // JARVIS response events forwarded through the physicalBus SSE channel.
  // These arrive as jarvis-response-{start,chunk,tool-call,end} window events
  // dispatched by use-physical-extension.ts. We render them as a synthetic
  // assistant turn in the scrollback so the browser is a "view" of the server
  // turn rather than the executor of it.
  useEffect(() => {
    const activeTurnMap = new Map<string, string>();

    function handleResponseStart(e: Event) {
      const detail = (e as CustomEvent<{ turnId: string }>).detail;
      if (!detail?.turnId) return;
      const assistantId = crypto.randomUUID();
      activeTurnMap.set(detail.turnId, assistantId);
      const assistantTurn: ScrollbackTurn = {
        kind: "assistant",
        id: assistantId,
        textDelta: "",
        actions: [],
        createdAt: new Date(),
        status: "streaming",
      };
      setTurns((prev) => [...prev, assistantTurn]);
      setStreaming(true);
    }

    function handleResponseChunk(e: Event) {
      const detail = (e as CustomEvent<{ turnId: string; delta: string }>).detail;
      if (!detail?.turnId) return;
      const assistantId = activeTurnMap.get(detail.turnId);
      if (!assistantId) return;
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId && t.kind === "assistant"
            ? { ...t, textDelta: t.textDelta + detail.delta }
            : t,
        ),
      );
    }

    function handleToolCall(e: Event) {
      const detail = (e as CustomEvent<{
        turnId: string;
        toolUseId: string;
        name: string;
        result: unknown;
      }>).detail;
      if (!detail?.turnId) return;
      const assistantId = activeTurnMap.get(detail.turnId);
      if (!assistantId) return;
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId && t.kind === "assistant"
            ? {
                ...t,
                actions: [
                  ...t.actions,
                  {
                    toolUseId: detail.toolUseId,
                    name: detail.name as ScrollbackAction["name"],
                    status: "done" as const,
                    result: detail.result as ScrollbackAction["result"],
                  },
                ],
              }
            : t,
        ),
      );
      // Issue #17: desktop-run actions mutate the same tables; refresh the
      // affected lists so the browser view reflects them without a reload.
      if ((detail.result as { ok?: boolean } | undefined)?.ok) {
        invalidateAfterJarvisAction(queryClient, detail.name, userId);
      }
    }

    function handleResponseEnd(e: Event) {
      const detail = (e as CustomEvent<{ turnId: string }>).detail;
      if (!detail?.turnId) return;
      const assistantId = activeTurnMap.get(detail.turnId);
      if (!assistantId) return;
      activeTurnMap.delete(detail.turnId);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId && t.kind === "assistant"
            ? { ...t, status: "done" as const }
            : t,
        ),
      );
      setStreaming(false);
    }

    window.addEventListener("jarvis-response-start", handleResponseStart);
    window.addEventListener("jarvis-response-chunk", handleResponseChunk);
    window.addEventListener("jarvis-tool-call", handleToolCall);
    window.addEventListener("jarvis-response-end", handleResponseEnd);
    return () => {
      window.removeEventListener("jarvis-response-start", handleResponseStart);
      window.removeEventListener("jarvis-response-chunk", handleResponseChunk);
      window.removeEventListener("jarvis-tool-call", handleToolCall);
      window.removeEventListener("jarvis-response-end", handleResponseEnd);
    };
  }, [queryClient, userId]);

  // Quick 260607-g56: consume sessionStorage('jarvis-prefill') on mount. Set by
  // LifeOsQuickSend and GlobalJarvisDialog when they hand off a seed turn to
  // the full console flow. Defer one tick so the console is fully mounted +
  // scrollback hydrated before we fire handleSubmit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let prefill: string | null = null;
    try {
      prefill = sessionStorage.getItem("jarvis-prefill");
      if (prefill) sessionStorage.removeItem("jarvis-prefill");
    } catch {
      return;
    }
    if (!prefill?.trim()) return;
    const t = setTimeout(() => {
      void handleSubmit({
        input: prefill,
        parsedDates: [],
        parsedPriority: null,
        slashCommand: null,
        projectIds: [],
        hashtags: [],
      });
    }, 0);
    return () => clearTimeout(t);
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
      // Build the UndoTarget per action.name via the shared pure mapper
      // (lib/jarvis/action-to-undo-target.ts), reused by the in-document pill.
      // null means a queued placeholder, a failed action, or a non-undoable
      // tool (find_*, remember_fact, ask_clarification) — nothing to invert.
      const target = actionToUndoTarget(action);
      if (!target) return;

      // Optimistic — flip undone immediately so the receipt UI snaps.
      // flushSync guarantees the updater runs before the persist check (same
      // batching pitfall as onDone — see comment there).
      let updated: ScrollbackTurn | undefined;
      flushSync(() => {
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
      });
      // Persist the undone state so it survives reload. Calling outside the
      // updater avoids triggering a Server Action (router transition) during
      // a React render replay.
      if (updated) persistTurn(updated);

      const result = await undoJarvisAction(target);
      if (!result.ok) {
        toast.error(`Couldn't undo: ${result.error}`);
        // Revert the optimistic flag (flushSync — same batching pitfall).
        let reverted: ScrollbackTurn | undefined;
        flushSync(() => {
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
        });
        // Re-persist with the reverted state so reload doesn't show a stale
        // "undone" badge.
        if (reverted) persistTurn(reverted);
      } else {
        // Issue #17: the undo mutated the same tables the action did, so
        // refresh the affected lists immediately rather than waiting on the
        // Realtime echo (and so reverted gcal events reappear).
        invalidateAfterJarvisAction(queryClient, action.name, userId);
        toast.success("Undone");
      }
    },
    [queryClient, userId],
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

      {/* Phase 14-03 / nav-move: "Voice via desktop" pill moved to the
          PersistentNav voice-status row so it no longer overlays JARVIS
          conversation elements. desktopClaimed is still consumed here for
          the realtime subscription side-effect. */}

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
          scrollToTurnId={messageId}
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
              const older: ScrollbackTurn[] = res.data.turns.map(mapTurnRow);
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
      </div>
    </div>
  );
}
