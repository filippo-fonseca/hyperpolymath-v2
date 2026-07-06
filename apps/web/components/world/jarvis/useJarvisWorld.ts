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
import type {
  JarvisClarificationEvent,
  JarvisRequest,
} from "@/components/jarvis/jarvis-stream-client";
import { buildJarvisInputPayload } from "@/components/jarvis/jarvis-input-payload";
import type { ScrollbackAction } from "@/components/jarvis/jarvis-types";

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

/** Mounted EXACTLY ONCE, by JarvisRing. Owns the machine, the stream, the bus. */
export function useJarvisWorld(): JarvisWorldHandle {
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
   * and (in the next commit) fire `streamJarvis`. Split out so `submit` and
   * `answerClarification` share one entry point.
   */
  const startTurn = useCallback((request: JarvisRequest, userText: string) => {
    // History: plain strings only (JarvisRequest.history accepts them by contract).
    historyRef.current = [
      ...historyRef.current,
      { role: "user" as const, content: userText },
    ].slice(-HISTORY_TURN_LIMIT);

    // Fresh per-turn buffers.
    replyBuffer.current = "";
    replyVersion.current++;
    turnIdRef.current = null;
    assistantRef.current = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()),
      textDelta: "",
      actions: [],
      createdAt: new Date(),
      status: "streaming",
    };

    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setErrorMessage(null);
    setState("thinking");

    // Stream wiring (streamJarvis + callbacks + persistence + invalidation) is
    // added in the next commit. `request` carries the console-grade payload.
    void request;
  }, []);

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
