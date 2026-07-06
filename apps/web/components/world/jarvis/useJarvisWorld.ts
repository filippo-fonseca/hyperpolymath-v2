"use client";

/**
 * useJarvisWorld.ts — U-13 · The Studiolo · jarvis-ring
 *
 * The state machine, session history, and module bus for the world's Kiwi/JARVIS
 * familiar. Mounted EXACTLY ONCE (by `JarvisRing`). The world ring is a NEW
 * presentation of the SAME agent — the streamJarvis wiring lands in the second
 * commit; this file owns the machine, the refs, and the `jarvisWorldBus` seam
 * that `camera/useWorldKeys.ts` reaches for Cmd+K (worldEvents is frozen at five
 * names and may not grow one).
 *
 * React-state discipline (PLAN §7.4 applied to SSE): `state`/`clarification`/
 * `errorMessage` change at machine cadence (≤ ~6 times per turn). Per-delta text
 * lives in REFS (`replyBuffer`/`replyVersion`) read imperatively by the ribbon's
 * throttled troika flush — never a React render per delta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  streamJarvis,
  type JarvisCallbacks,
  type JarvisClarificationEvent,
  type JarvisRequest,
} from "@/components/jarvis/jarvis-stream-client";
import { buildJarvisInputPayload } from "@/components/jarvis/jarvis-input-payload";
import { invalidateAfterJarvisAction } from "@/lib/jarvis/invalidate-after-action";
import { saveJarvisTurn } from "@/app/actions/jarvis-turns";
import type {
  ScrollbackAction,
  ScrollbackTurn,
} from "@/components/jarvis/jarvis-types";
import { worldEvents } from "../data/diffing";
import { useWorldData } from "../data/useWorldData";

// Session-history cap — mirrors JarvisConsole's HISTORY_TURN_LIMIT (JarvisConsole.tsx:167).
const HISTORY_TURN_LIMIT = 10;
// Error auto-return window (§2 / §6.2).
const ERROR_LINGER_MS = 2500;

export type JarvisWorldState =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "error";

export interface JarvisWorldHandle {
  state: JarvisWorldState; // React state — machine cadence only
  clarification: JarvisClarificationEvent | null; // React state — rare
  errorMessage: string | null; // React state — rare
  replyBuffer: React.RefObject<string>; // full streamed reply this turn (read in useFrame)
  replyVersion: React.RefObject<number>; // bumped per delta + once at done
  summon(): void; // idempotent; refocuses input if already open
  dismiss(): void; // aborts in-flight stream; blurs; returns to idle
  submit(input: string): void; // buildJarvisInputPayload → streamJarvis (§6)
  answerClarification(option: string): void; // submits "[CLARIFICATION REPLY] …"
}

/**
 * Module singleton for `camera/useWorldKeys.ts` (Cmd+K). Wired by the mounted
 * hook; no-ops when the world island is unmounted. NOT part of `worldEvents`
 * (frozen at five names). Same publish-on-mount / null-on-unmount pattern as
 * `controlsInstance` in `CameraRig.tsx:94-96,219-220`.
 */
export const jarvisWorldBus: { summon(): void; dismiss(): void } = {
  summon() {},
  dismiss() {},
};

/**
 * Intra-unit bridge so the FROZEN handle need not carry the DOM input node:
 * `JarvisRibbon` registers its input focuser here; `summon()` calls it to
 * refocus when the ribbon is already open (idempotent summon). Not a world
 * contract — a private seam between the two U-13 files.
 */
let requestInputFocus: () => void = () => {};
export function setJarvisWorldInputFocuser(fn: (() => void) | null): void {
  requestInputFocus = fn ?? (() => {});
}

/** The accumulating assistant turn, built up across SSE events for persistence. */
interface AssistantAccumulator {
  id: string;
  textDelta: string;
  actions: ScrollbackAction[];
  createdAt: Date;
  status: "streaming" | "done" | "error";
  errorMessage?: string;
}

/**
 * Fire-and-forget scrollback save. Mirrors GlobalJarvisHandler.persistTurn
 * (GlobalJarvisHandler.tsx:59-75) byte-for-byte — a failed save is logged but
 * never bubbles, so the world turn joins the ONE `/today` conversation record
 * (JarvisConsole live-merges it via its jarvis_turns Realtime channel) without
 * ever disrupting the ribbon.
 */
function persistTurn(turn: ScrollbackTurn): void {
  void saveJarvisTurn({
    id: turn.id,
    kind: turn.kind,
    text: turn.kind === "user" ? turn.text : null,
    textDelta: turn.kind === "assistant" ? turn.textDelta : null,
    actions: turn.kind === "assistant" ? turn.actions : [],
    clarification: null,
    status: turn.kind === "assistant" ? turn.status : null,
    errorMessage:
      turn.kind === "assistant" ? turn.errorMessage ?? null : null,
    createdAt: turn.createdAt.toISOString(),
  }).catch((err) => {
    console.warn("[jarvis] world persistTurn failed (non-fatal)", err);
  });
}

/** Mounted EXACTLY ONCE, by JarvisRing. Owns the machine, the stream, the bus. */
export function useJarvisWorld(): JarvisWorldHandle {
  const { userId } = useWorldData();
  const queryClient = useQueryClient();

  const [state, setState] = useState<JarvisWorldState>("idle");
  const [clarification, setClarification] =
    useState<JarvisClarificationEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Machine mirror for imperative reads inside stable callbacks / stream events.
  const stateRef = useRef<JarvisWorldState>("idle");
  stateRef.current = state;

  // Per-delta text (refs — the ribbon reads these in useFrame, never re-renders).
  const replyBuffer = useRef<string>("");
  const replyVersion = useRef<number>(0);

  // Session history (the lite tier — plain strings, capped, §6.3).
  const historyRef = useRef<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  // Stream lifecycle.
  const abortRef = useRef<AbortController | null>(null);
  const turnIdRef = useRef<string | null>(null);
  const assistantRef = useRef<AssistantAccumulator | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Begin a turn: reset buffers, push the user history entry, move to `thinking`,
   * persist the user turn, then fire `streamJarvis` with the full callback table
   * (§6.2). Split out so `submit` and `answerClarification` share one entry point.
   */
  const startTurn = useCallback(
    (request: JarvisRequest, userText: string) => {
      // History: plain strings only (JarvisRequest.history accepts them by contract).
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: userText },
      ].slice(-HISTORY_TURN_LIMIT);

      // Fresh per-turn buffers.
      replyBuffer.current = "";
      replyVersion.current++;
      turnIdRef.current = null;
      const assistant: AssistantAccumulator = {
        id: crypto.randomUUID(),
        textDelta: "",
        actions: [],
        createdAt: new Date(),
        status: "streaming",
      };
      assistantRef.current = assistant;

      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      setErrorMessage(null);
      setState("thinking");

      // Persist the user turn immediately (crypto UUID id) so the world turn
      // joins the /today conversation record (§6.5).
      persistTurn({
        kind: "user",
        id: crypto.randomUUID(),
        text: userText,
        createdAt: new Date(),
      });

      const callbacks: JarvisCallbacks = {
        onTurnStart: ({ turnId }) => {
          turnIdRef.current = turnId; // persistence correlation only
        },
        onText: (delta) => {
          replyBuffer.current += delta;
          replyVersion.current++;
          assistant.textDelta += delta;
          if (stateRef.current === "thinking") setState("streaming");
        },
        onQueued: (ev) => {
          // Tool acknowledged pre-executor — record for the persisted receipt.
          assistant.actions.push({
            toolUseId: ev.toolUseId,
            name: ev.name as ScrollbackAction["name"],
            status: "queued",
          });
        },
        onClarification: (ev) => {
          setClarification(ev);
          // Render the question as ribbon ink, in the familiar's own hand (§6.4).
          replyBuffer.current +=
            (replyBuffer.current ? "\n" : "") + ev.question;
          replyVersion.current++;
        },
        onAction: (ev) => {
          // Upgrade an existing queued placeholder, else append (JarvisConsole shape).
          const existing = assistant.actions.find(
            (a) => a.toolUseId === ev.toolUseId,
          );
          if (existing) {
            existing.status = "done";
            existing.result = ev.result as ScrollbackAction["result"];
          } else {
            assistant.actions.push({
              toolUseId: ev.toolUseId,
              name: ev.name as ScrollbackAction["name"],
              status: "done",
              result: ev.result as ScrollbackAction["result"],
            });
          }
          if (ev.result?.ok) {
            // Invalidate FIRST (the refetch that kindles the ember), THEN emit —
            // the frozen handshake U-16 subscribes to (§6.2 / §7.1). Same call,
            // same gate as JarvisConsole.tsx:679-681.
            invalidateAfterJarvisAction(queryClient, ev.name, userId);
            worldEvents.emit("jarvis-action", ev);
          } else {
            // Failed action: transient error + edge flash; do NOT emit (a
            // light-thread to nowhere would lie — diffing.ts:42-45).
            setErrorMessage(ev.result?.error ?? "That action didn't land.");
          }
        },
        onDone: () => {
          replyVersion.current++; // final bump so the tail always flushes
          historyRef.current = [
            ...historyRef.current,
            { role: "assistant" as const, content: replyBuffer.current },
          ].slice(-HISTORY_TURN_LIMIT);
          assistant.status = "done";
          persistTurn({
            kind: "assistant",
            id: assistant.id,
            textDelta: assistant.textDelta,
            actions: assistant.actions,
            createdAt: assistant.createdAt,
            status: "done",
          });
          abortRef.current = null;
          setState("listening"); // ribbon clears + refocuses the input
        },
        onError: (message) => {
          if (message === "aborted") return; // dismissal path — silent
          assistant.status = "error";
          assistant.errorMessage = message;
          persistTurn({
            kind: "assistant",
            id: assistant.id,
            textDelta: assistant.textDelta,
            actions: assistant.actions,
            createdAt: assistant.createdAt,
            status: "error",
            errorMessage: message,
          });
          setErrorMessage(message); // 402 BYOK arrives here pre-formatted
          setState("error");
          abortRef.current = null;
          // Auto-return to listening after the linger window (§2).
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => {
            if (stateRef.current === "error") setState("listening");
          }, ERROR_LINGER_MS);
        },
      };

      // Abort-before-start — the console contract (JarvisConsole.tsx:536-538).
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      void streamJarvis(request, callbacks, abortRef.current.signal);
    },
    [queryClient, userId],
  );

  const summon = useCallback(() => {
    if (stateRef.current !== "idle") {
      requestInputFocus(); // idempotent — refocus the open ribbon's input
      return;
    }
    setState("listening"); // JarvisRibbon focuses the input when it mounts
  }, []);

  const dismiss = useCallback(() => {
    abortRef.current?.abort(); // streamJarvis surfaces onError("aborted") — swallowed
    abortRef.current = null;
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setClarification(null);
    setErrorMessage(null);
    setState("idle");
    // Blur so the NEXT keystroke's e.target is <body> and useWorldKeys' typing
    // guard (useWorldKeys.ts:41-50) lets world keys through again.
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const p = buildJarvisInputPayload(
        raw,
        null, // no TipTap doc in the world
        Intl.DateTimeFormat().resolvedOptions().timeZone, // browser tz
        null,
      );
      if (p === null) return; // empty input — no-op
      const request: JarvisRequest = {
        input: p.input,
        history: historyRef.current,
        parsedDates: p.parsedDates,
        parsedPriority: p.parsedPriority ?? undefined,
        slashCommand: p.slashCommand,
        linkedProjectIds: p.projectIds,
        linkedHashtags: p.hashtags,
        linkedPeople: p.people,
      };
      startTurn(request, p.input);
    },
    [startTurn],
  );

  const answerClarification = useCallback(
    (option: string) => {
      // The route detects this exact prefix (JarvisConsole.tsx:1104-1113).
      const text = `[CLARIFICATION REPLY] ${option}`;
      setClarification(null);
      const request: JarvisRequest = {
        input: text,
        history: historyRef.current,
        parsedDates: [],
        parsedPriority: undefined,
        slashCommand: null,
        linkedProjectIds: [],
        linkedHashtags: [],
      };
      startTurn(request, text);
    },
    [startTurn],
  );

  // Publish the imperative bus on mount; null it on unmount (CameraRig pattern).
  useEffect(() => {
    jarvisWorldBus.summon = summon;
    jarvisWorldBus.dismiss = dismiss;
    return () => {
      jarvisWorldBus.summon = () => {};
      jarvisWorldBus.dismiss = () => {};
      abortRef.current?.abort();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [summon, dismiss]);

  return {
    state,
    clarification,
    errorMessage,
    replyBuffer,
    replyVersion,
    summon,
    dismiss,
    submit,
    answerClarification,
  };
}
