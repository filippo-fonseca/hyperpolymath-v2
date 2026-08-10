// The JARVIS turn engine. Owns the transcript, the single SSE subscription,
// voice capture, TTS, undo, and reconciliation. Built against v1's measured
// lag sources:
//   - token deltas NEVER setState (stream-store buffers, one leaf renders)
//   - the turns array changes only at turn boundaries and tool-calls
//   - one silence-gated fetchTurn reconciliation, not a 2.5s poll loop
//   - transcript saves are debounced file writes after turn end
//   - SSE resubscribes only on auth change / >30s background, not every
//     foreground flip

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import { File } from "expo-file-system";

import {
  fetchTurn,
  getJarvisContext,
  postCancelTurn,
  postText,
  postTranscript,
  postUndo,
  refreshJarvisContext,
  type HistoryEntry,
  type UndoTarget,
  type TaskBefore,
  type CaptureBefore,
  type EventBefore,
  type TaskSnapshot,
  type CaptureSnapshot,
} from "@/api/jarvis";
import { subscribeJarvisEvents, type SseStatus } from "@/api/sse";
import { invalidateForToolCall } from "@/data/invalidate";
import { getSettings, onSettingsChange } from "@/lib/settings";

import { startLiveRecognition, type LiveSession } from "./audio/live-recognition";
import { useVoiceRecorder } from "./audio/recorder";
import { TtsQueue } from "./audio/tts-queue";
import { buildMobileJarvisPayload } from "./payload";
import { splitDeltas } from "./sentence-splitter";
import { streamStore } from "./stream-store";
import { loadTranscript, saveTranscript, clearTranscript } from "./transcript-store";
import { actionResult, type JarvisTurn, type ReceiptAction } from "./types";

const HISTORY_TURNS = 10;
const RECONCILE_SILENCE_MS = 3000;
const RECONCILE_RETRY_MS = 5000;
const RECONCILE_DEADLINE_MS = 90_000;
const RESUBSCRIBE_AFTER_BG_MS = 30_000;
const MIN_UTTERANCE_MS = 400;

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceState {
  phase: "idle" | "listening" | "uploading";
  interim: string;
}

function localId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Text-only history: assistant action outcomes are already narrated in the
 * assistant text, and text-only entries can never strand a tool_use block
 * without its tool_result. */
function buildHistory(turns: JarvisTurn[]): HistoryEntry[] {
  return turns
    .filter((t) => t.text.trim().length > 0 && t.status !== "error")
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.text }));
}

function buildUndoTarget(action: ReceiptAction): UndoTarget | null {
  const result = actionResult(action);
  if (!result.ok) return null;
  const id = result.id ?? "";
  const receipt = result.receipt ?? {};
  const calendarId =
    typeof receipt.calendar_id === "string"
      ? receipt.calendar_id
      : typeof receipt.calendarId === "string"
        ? receipt.calendarId
        : "primary";

  switch (action.name) {
    case "create_task":
      return id ? { kind: "task", id } : null;
    case "create_capture":
      return id ? { kind: "capture", id } : null;
    case "create_event":
      return id ? { kind: "event", id, calendarId } : null;
    case "update_task":
      return id && receipt.before
        ? { kind: "update_task", id, before: receipt.before as TaskBefore }
        : null;
    case "update_capture":
      return id && receipt.before
        ? { kind: "update_capture", id, before: receipt.before as CaptureBefore }
        : null;
    case "update_event":
      return id && receipt.before
        ? { kind: "update_event", id, calendarId, before: receipt.before as EventBefore }
        : null;
    case "delete_task":
      return receipt.snapshot
        ? { kind: "delete_task", snapshot: receipt.snapshot as TaskSnapshot }
        : null;
    case "delete_capture":
      return receipt.snapshot
        ? { kind: "delete_capture", snapshot: receipt.snapshot as CaptureSnapshot }
        : null;
    case "delete_event":
      return receipt.snapshot
        ? {
            kind: "delete_event",
            calendarId,
            snapshot: receipt.snapshot as Record<string, unknown>,
          }
        : null;
    default:
      return null;
  }
}

export function useJarvisEngine() {
  const [turns, setTurns] = useState<JarvisTurn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sseStatus, setSseStatus] = useState<SseStatus>("connecting");
  const [voice, setVoice] = useState<VoiceState>({ phase: "idle", interim: "" });
  const [awaitingTurn, setAwaitingTurn] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);

  const turnsRef = useRef<JarvisTurn[]>([]);
  turnsRef.current = turns;
  const activeTurnRef = useRef<string | null>(null);
  activeTurnRef.current = activeTurnId;

  const recorder = useVoiceRecorder();
  const liveSession = useRef<LiveSession | null>(null);
  const voiceStartedAt = useRef(0);
  const interimRef = useRef("");

  const ttsQueue = useRef<TtsQueue | null>(null);
  if (ttsQueue.current === null) ttsQueue.current = new TtsQueue();
  const ttsRemainder = useRef("");
  const ttsSeq = useRef(0);

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnStartedAt = useRef(0);

  // ── Turn bookkeeping ──────────────────────────────────────────────────────

  const persist = useCallback((next: JarvisTurn[]) => {
    saveTranscript(next);
  }, []);

  const appendTurn = useCallback((turn: JarvisTurn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  const patchTurn = useCallback(
    (id: string, patch: Partial<JarvisTurn> | ((t: JarvisTurn) => JarvisTurn)) => {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? (typeof patch === "function" ? patch(t) : { ...t, ...patch }) : t,
        ),
      );
    },
    [],
  );

  const finalizeTurn = useCallback(
    (turnId: string, text: string, error?: string | null) => {
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
      setTurns((prev) => {
        const next = prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                text: text || t.text,
                status: error ? ("error" as const) : ("done" as const),
                error: error ?? null,
              }
            : t,
        );
        saveTranscript(next);
        return next;
      });
      setActiveTurnId((current) => (current === turnId ? null : current));
      // Flush the trailing TTS sentence.
      if (ttsRemainder.current.trim() && !error) {
        ttsQueue.current?.enqueueSentence(ttsRemainder.current, ttsSeq.current++);
      }
      ttsRemainder.current = "";
    },
    [],
  );

  /** Make sure an assistant turn exists for a server turnId. */
  const ensureAssistantTurn = useCallback((turnId: string) => {
    setTurns((prev) =>
      prev.some((t) => t.id === turnId)
        ? prev
        : [
            ...prev,
            { id: turnId, role: "assistant" as const, text: "", at: Date.now(), status: "pending" as const },
          ],
    );
    setActiveTurnId(turnId);
    turnStartedAt.current = Date.now();
  }, []);

  // ── Reconciliation: one fetchTurn per silence window ─────────────────────

  const armSilenceCheck = useCallback(
    (turnId: string, delay: number) => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(async () => {
        silenceTimer.current = null;
        if (activeTurnRef.current !== turnId) return;
        const snapshot = await fetchTurn(turnId);
        if (activeTurnRef.current !== turnId) return;
        if (snapshot?.status === "done" || snapshot?.status === "error") {
          const streamed = streamStore.end(turnId);
          finalizeTurn(
            turnId,
            snapshot.text || streamed,
            snapshot.status === "error" ? (snapshot.errorMessage ?? "Something went wrong.") : null,
          );
          if (snapshot.actions?.length) {
            patchTurn(turnId, (t) => ({
              ...t,
              actions: snapshot.actions as ReceiptAction[],
            }));
          }
        } else if (Date.now() - turnStartedAt.current < RECONCILE_DEADLINE_MS) {
          armSilenceCheck(turnId, RECONCILE_RETRY_MS);
        } else {
          finalizeTurn(turnId, streamStore.end(turnId), "No response — try again.");
        }
      }, delay);
    },
    [finalizeTurn, patchTurn],
  );

  // ── SSE ───────────────────────────────────────────────────────────────────

  const sseEpochBump = useState(0);
  const sseEpoch = sseEpochBump[0];
  const bumpSse = sseEpochBump[1];
  const backgroundedAt = useRef(0);

  useEffect(() => {
    const close = subscribeJarvisEvents({
      onStatus: setSseStatus,
      onTranscript: ({ transcript }) => {
        // Canonical server transcript replaces the interim provisional bubble.
        setTurns((prev) => {
          const idx = [...prev].reverse().findIndex((t) => t.role === "user" && t.provisional);
          if (idx === -1) {
            return [
              ...prev,
              { id: localId(), role: "user" as const, text: transcript, at: Date.now() },
            ];
          }
          const real = prev.length - 1 - idx;
          return prev.map((t, i) =>
            i === real ? { ...t, text: transcript, provisional: false } : t,
          );
        });
      },
      onResponseStart: ({ turnId }) => {
        ensureAssistantTurn(turnId);
        streamStore.start(turnId);
        ttsQueue.current?.resetTurn();
        ttsRemainder.current = "";
        ttsSeq.current = 0;
        setAwaitingTurn(false);
        armSilenceCheck(turnId, RECONCILE_SILENCE_MS);
      },
      onResponseChunk: ({ turnId, delta }) => {
        if (activeTurnRef.current !== turnId) return;
        streamStore.append(turnId, delta);
        // Mark streaming exactly once (pending → streaming).
        setTurns((prev) => {
          const t = prev.find((x) => x.id === turnId);
          if (!t || t.status === "streaming") return prev;
          return prev.map((x) => (x.id === turnId ? { ...x, status: "streaming" as const } : x));
        });
        if (getSettings().ttsEnabled) {
          const { sentences, remainder } = splitDeltas(ttsRemainder.current, delta);
          ttsRemainder.current = remainder;
          for (const s of sentences) ttsQueue.current?.enqueueSentence(s, ttsSeq.current++);
        } else {
          ttsRemainder.current = "";
        }
        armSilenceCheck(turnId, RECONCILE_SILENCE_MS);
      },
      onToolCall: ({ turnId, toolUseId, name, result }) => {
        invalidateForToolCall(name);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        patchTurn(turnId, (t) => ({
          ...t,
          actions: [...(t.actions ?? []), { toolUseId, name, result }],
        }));
        armSilenceCheck(turnId, RECONCILE_SILENCE_MS);
      },
      onResponseEnd: ({ turnId }) => {
        const text = streamStore.end(turnId);
        finalizeTurn(turnId, text);
      },
    });
    return close;
  }, [sseEpoch, ensureAssistantTurn, armSilenceCheck, finalizeTurn, patchTurn]);

  // Resubscribe only after a long background stint — v1 tore the socket down
  // on every foreground flip.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && backgroundedAt.current) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = 0;
        if (away > RESUBSCRIBE_AFTER_BG_MS) bumpSse((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [bumpSse]);

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    void loadTranscript().then((loaded) => {
      if (!alive) return;
      setTurns(loaded);
      setHydrated(true);
    });
    void refreshJarvisContext();
    const settings = getSettings();
    ttsQueue.current?.setEnabled(settings.ttsEnabled);
    ttsQueue.current?.setVoiceId(settings.voiceId);
    const offSettings = onSettingsChange((s) => {
      ttsQueue.current?.setEnabled(s.ttsEnabled);
      ttsQueue.current?.setVoiceId(s.voiceId);
    });
    const offTts = ttsQueue.current!.onStateChange((s) => setTtsPlaying(s === "playing"));
    return () => {
      alive = false;
      offSettings();
      offTts();
    };
  }, []);

  // ── Send: text ────────────────────────────────────────────────────────────

  const sendText = useCallback(
    async (raw: string) => {
      const ctx = getJarvisContext();
      const payload = buildMobileJarvisPayload(raw, ctx.timezone, ctx.projects, null);
      if (!payload) return false;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (payload.isHelp) {
        appendTurn({ id: localId(), role: "user", text: "/help", at: Date.now() });
        appendTurn({
          id: localId(),
          role: "assistant",
          text: "Try things like:\n/task Ship the deck tomorrow p1\n/capture Idea: paper-texture widgets\n/event Standup at 9am\n…or just talk to me.",
          at: Date.now(),
          status: "done",
        });
        return true;
      }

      appendTurn({ id: localId(), role: "user", text: payload.displayText, at: Date.now() });
      setAwaitingTurn(true);

      const result = await postText(payload.input, {
        parsedDates: payload.parsedDates.map((d) => ({
          text: d.text,
          start: d.start,
          end: d.end ?? undefined,
          allDay: d.allDay,
        })),
        parsedPriority: payload.parsedPriority,
        slashCommand: payload.slashCommand,
        linkedProjectIds: payload.projectIds,
        linkedHashtags: payload.hashtags,
        history: buildHistory(turnsRef.current),
      });

      if (!result) {
        setAwaitingTurn(false);
        appendTurn({
          id: localId(),
          role: "assistant",
          text: "",
          at: Date.now(),
          status: "error",
          error: "Couldn't reach the server.",
        });
        return false;
      }
      ensureAssistantTurn(result.turnId);
      armSilenceCheck(result.turnId, RECONCILE_SILENCE_MS * 2);
      return true;
    },
    [appendTurn, ensureAssistantTurn, armSilenceCheck],
  );

  // ── Send: voice ───────────────────────────────────────────────────────────

  const startVoice = useCallback(async () => {
    if (voice.phase !== "idle") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ttsQueue.current?.stop();
    voiceStartedAt.current = Date.now();
    interimRef.current = "";
    setVoice({ phase: "listening", interim: "" });

    const session = await startLiveRecognition((partial) => {
      interimRef.current = partial;
      setVoice((v) => (v.phase === "listening" ? { ...v, interim: partial } : v));
    });
    if (session) {
      liveSession.current = session;
      return;
    }
    // Fallback: plain WAV recorder, no live transcript.
    const ok = await recorder.start();
    if (!ok) setVoice({ phase: "idle", interim: "" });
  }, [voice.phase, recorder]);

  const cancelVoice = useCallback(async () => {
    liveSession.current?.cancel();
    liveSession.current = null;
    await recorder.cancel();
    setVoice({ phase: "idle", interim: "" });
  }, [recorder]);

  const stopVoice = useCallback(async () => {
    const duration = Date.now() - voiceStartedAt.current;
    const interim = interimRef.current.trim();

    // #315 guard: a silent press never becomes a message. Too short always
    // disengages; with live STT available, an empty transcript disengages too.
    const live = liveSession.current;
    if (duration < MIN_UTTERANCE_MS || (live && !interim)) {
      await cancelVoice();
      return;
    }

    setVoice({ phase: "uploading", interim });

    let wav: Uint8Array<ArrayBuffer> | null = null;
    const vadEndAt = Date.now();
    if (live) {
      liveSession.current = null;
      const uri = await live.stop();
      if (uri) {
        try {
          wav = await new File(uri).bytes();
        } catch (err) {
          console.warn("[voice] read wav failed", err);
        }
      }
    } else {
      const result = await recorder.stop();
      if (result) wav = result.wav;
    }

    setVoice({ phase: "idle", interim: "" });
    if (!wav || !wav.byteLength) return;

    const userTurnId = localId();
    appendTurn({
      id: userTurnId,
      role: "user",
      text: interim || "…",
      at: Date.now(),
      provisional: true,
    });
    setAwaitingTurn(true);

    const result = await postTranscript({ wav, vadEndAt });
    if (!result) {
      setAwaitingTurn(false);
      patchTurn(userTurnId, { provisional: false });
      appendTurn({
        id: localId(),
        role: "assistant",
        text: "",
        at: Date.now(),
        status: "error",
        error: "Couldn't send that — check the connection.",
      });
      return;
    }
    patchTurn(userTurnId, { text: result.transcript || interim, provisional: false });
    if (result.turnId) {
      ensureAssistantTurn(result.turnId);
      armSilenceCheck(result.turnId, RECONCILE_SILENCE_MS * 2);
    }
  }, [appendTurn, patchTurn, cancelVoice, recorder, ensureAssistantTurn, armSilenceCheck]);

  // ── Stop / undo / clear ───────────────────────────────────────────────────

  const stopAll = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ttsQueue.current?.stop();
    const turnId = activeTurnRef.current;
    if (turnId) {
      finalizeTurn(turnId, streamStore.end(turnId));
    }
    setAwaitingTurn(false);
    await postCancelTurn({ all: true });
  }, [finalizeTurn]);

  const undoAction = useCallback(
    async (turnId: string, action: ReceiptAction) => {
      const target = buildUndoTarget(action);
      if (!target) return;
      const mark = (undone: boolean) =>
        patchTurn(turnId, (t) => ({
          ...t,
          actions: (t.actions ?? []).map((a) =>
            a.toolUseId === action.toolUseId ? { ...a, undone } : a,
          ),
        }));
      mark(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const ok = await postUndo(target);
      if (!ok) mark(false);
      else invalidateForToolCall(action.name);
    },
    [patchTurn],
  );

  const clearConversation = useCallback(async () => {
    setTurns([]);
    setActiveTurnId(null);
    setAwaitingTurn(false);
    await clearTranscript();
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const orbState: OrbState = useMemo(() => {
    if (voice.phase === "listening") return "listening";
    if (ttsPlaying) return "speaking";
    if (awaitingTurn || activeTurnId !== null) return "thinking";
    return "idle";
  }, [voice.phase, ttsPlaying, awaitingTurn, activeTurnId]);

  // Persist when actions attach outside finalize (tool calls mid-stream are
  // covered by finalize; this catches undo tombstones).
  useEffect(() => {
    if (hydrated && activeTurnId === null) persist(turnsRef.current);
  }, [turns, hydrated, activeTurnId, persist]);

  return {
    turns,
    hydrated,
    sseStatus,
    voice,
    orbState,
    awaitingTurn,
    activeTurnId,
    busy: awaitingTurn || activeTurnId !== null,
    sendText,
    startVoice,
    stopVoice,
    cancelVoice,
    stopAll,
    undoAction,
    canUndo: (action: ReceiptAction) => buildUndoTarget(action) !== null,
    clearConversation,
  };
}

export type JarvisEngine = ReturnType<typeof useJarvisEngine>;
