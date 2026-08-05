"use client";

import { undoJarvisAction } from "@/app/actions/jarvis";
import { saveJarvisTurn } from "@/app/actions/jarvis-turns";
import {
  type JarvisRequest,
  streamJarvis,
} from "@/components/jarvis/jarvis-stream-client";
import type {
  ScrollbackAction,
  ScrollbackClarification,
  ScrollbackTurn,
} from "@/components/jarvis/jarvis-types";
import { JarvisClarification } from "@/components/jarvis/JarvisClarification";
import { JarvisReceipt } from "@/components/jarvis/JarvisReceipt";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { HudThinkingRing } from "@/components/shared/HudThinkingRing";
import { actionToUndoTarget, isActionUndoable } from "@/lib/jarvis/action-to-undo-target";
import { renderInlineMarkdown } from "@/lib/jarvis/inline-markdown";
import { invalidateAfterJarvisAction } from "@/lib/jarvis/invalidate-after-action";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
import { bumpUnread } from "@/lib/jarvis/unread-bus";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Maximize2, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

/**
 * The JARVIS command bar — Kiwi as furniture, not a dialog you summon.
 *
 * This is the single most important piece of the cockpit (D3). The product's
 * core value is "type one sentence into Kiwi and the right action lands in the
 * right place", so the input is pinned to the bottom of the stage, always one
 * keystroke away, and never behind a modal.
 *
 * It is a flex sibling of the stage's scroll container, not an overlay. That is
 * what makes it safe next to editors: BlockNote surfaces, sticky toolbars and
 * slash menus all live inside the scroll box above it and simply have ~48px
 * less viewport. It cannot cover them and they cannot cover it.
 *
 * Turns typed here persist to `jarvis_turns` the same way GlobalJarvisHandler
 * does, so the /today console (and split panel) live-merge them over Realtime.
 *
 * The response strip renders the console's REAL receipt UX, scaled down: each
 * bar-session turn keeps its own `ScrollbackAction[]` and renders through
 * `JarvisReceipt` (queued shimmer, intent chips, undo, click-to-navigate),
 * `JarvisClarification`, and the same `renderInlineMarkdown(stripSystemTags())`
 * prose pipeline `JarvisScrollback` uses. Earlier turns from this bar session
 * stay stacked above the latest one, faded, inside the scrollable strip.
 *
 * Sends QUEUE — nothing aborts, nothing is swallowed. The input is never
 * disabled: submitting while a run is in flight enqueues FIFO (user turn
 * persisted at enqueue time, a quiet "queued" row in the strip) and a single
 * sequential runner streams jobs in order. Clarification-chip replies go
 * through the same queue, so they can't race the open stream. Unmounting the
 * bar — including expand() → /today — does NOT abort the in-flight run: the
 * closures finish, persistTurn lands the assistant row, and the console's
 * realtime merge picks it up mid-stream. Only the explicit Stop button
 * aborts (and it also clears the queue).
 *
 * What it deliberately does NOT do:
 *  - It does not autofocus, ever, on mount or on navigation. Stealing focus
 *    from an editor is the fastest way to make furniture feel hostile.
 *  - It does not build a second SSE client or a second route. It consumes the
 *    existing `POST /api/jarvis` contract through `streamJarvis`.
 *  - It does not duplicate GlobalJarvisDialog: no quick-create list, no search
 *    dropdown, no Cmd+K binding. The dialog stays the palette; the bar is for
 *    sending one sentence. If both ever want a keystroke, the dialog wins.
 *  - It does not mount `JarvisScrollback` itself: the persisted conversation
 *    (history, pagination, day headers) belongs to the console surfaces. The
 *    strip only shows this bar session's turns.
 */

/** Routes that ARE the console. Two live inputs to one brain is the confusion D3 removes. */
const CONSOLE_PATH = "/today";
const JARVIS_SETTINGS_PATH = "/jarvis";

const MAX_HISTORY_TURNS = 20;

/**
 * Rolling history, module-local so it survives the bar unmounting on a
 * suppressed route and coming back. Trimmed hard: the bar is for one-sentence
 * turns, and the console owns the long conversation — but every turn is also
 * written to `jarvis_turns` so the console sees it live.
 */
let history: JarvisRequest["history"] = [];

function rememberTurn(role: "user" | "assistant", content: string) {
  if (!content) return;
  history = [...history, { role, content }].slice(-MAX_HISTORY_TURNS);
}

/** Fire-and-forget — mirrors GlobalJarvisHandler / JarvisConsole.persistTurn. */
function persistTurn(turn: ScrollbackTurn): void {
  void saveJarvisTurn({
    id: turn.id,
    kind: turn.kind,
    text: turn.kind === "user" ? turn.text : null,
    textDelta: turn.kind === "assistant" ? turn.textDelta : null,
    actions: turn.kind === "assistant" ? turn.actions : [],
    clarification: turn.kind === "assistant" ? (turn.clarification ?? null) : null,
    status: turn.kind === "assistant" ? turn.status : null,
    errorMessage: turn.kind === "assistant" ? (turn.errorMessage ?? null) : null,
    createdAt: turn.createdAt.toISOString(),
  }).catch((err) => {
    console.warn("[jarvis] command-bar persistTurn failed (non-fatal)", err);
  });
}

/**
 * One bar-session turn: the prompt the user sent plus the assistant response
 * accumulated for it. `id` is the assistant turn id — the SAME id the row is
 * persisted under, so the console's realtime merge dedupes cleanly.
 */
interface BarTurn {
  id: string;
  prompt: string;
  status: "queued" | "streaming" | "done" | "error";
  textDelta: string;
  actions: ScrollbackAction[];
  clarification: ScrollbackClarification | null;
  errorMessage: string | null;
  createdAt: Date;
}

/** Rebuild the persistable assistant turn from a bar turn. */
function toAssistantTurn(t: BarTurn): ScrollbackTurn {
  return {
    kind: "assistant",
    id: t.id,
    textDelta: t.textDelta,
    actions: t.actions,
    clarification: t.clarification ?? undefined,
    createdAt: t.createdAt,
    status: t.status === "error" ? "error" : "done",
    errorMessage: t.errorMessage ?? undefined,
  };
}

export function JarvisCommandBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // FIFO send queue — the queued BarTurn accumulators themselves, in order.
  const queueRef = useRef<BarTurn[]>([]);
  const runningRef = useRef(false);
  // In-flight runs SURVIVE unmount (expand() → /today must not kill the
  // turn), so every setState from stream callbacks checks this first.
  const mountedRef = useRef(true);

  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<BarTurn[]>([]);
  const [focused, setFocused] = useState(false);

  const suppressed =
    pathname === CONSOLE_PATH ||
    pathname.startsWith(`${CONSOLE_PATH}/`) ||
    pathname === JARVIS_SETTINGS_PATH ||
    pathname.startsWith(`${JARVIS_SETTINGS_PATH}/`) ||
    pathname.startsWith("/onboarding");

  const busy = turns.some((t) => t.status === "streaming" || t.status === "queued");
  const hasStrip = turns.length > 0;
  // aug-04 craft-ui-v2: the bar rests as Craft's centered floating pill and
  // expands to the wide panel on engagement — focus, a draft in hand, or any
  // response activity (hasStrip covers streaming and busy). The change is a
  // class swap that snaps via layout: no width animation beyond the sanctioned
  // grid transition, per the register's motion rules.
  const engaged = focused || draft.length > 0 || hasStrip;

  const collapseStrip = useCallback(() => {
    setTurns([]);
  }, []);

  // Keep the newest activity in view as replies stream into the strip.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  /** Patch one bar turn immutably by assistant-turn id. No-ops once the bar
   *  has unmounted — the run itself keeps going, only the UI mirror stops. */
  const patchTurn = useCallback((id: string, patch: Partial<BarTurn>) => {
    if (!mountedRef.current) return;
    setTurns((prev) => (prev.some((t) => t.id === id) ? prev.map((t) => (t.id === id ? { ...t, ...patch } : t)) : prev));
  }, []);

  /**
   * Stream one queued turn. Called ONLY by the sequential runner, so at most
   * one stream is open and the module-level `history` stays in true
   * user/assistant order.
   */
  const runTurn = useCallback(
    async (assistant: BarTurn) => {
      const controller = new AbortController();
      abortRef.current = controller;

      // Snapshot the request history BEFORE remembering the new user turn —
      // explicit, instead of the old positional history.slice(0, -1).
      const priorHistory = history;
      rememberTurn("user", assistant.prompt);

      // `assistant` is the accumulator, mirrored into the strip's state on
      // every SSE event. It stays the persistence source of truth so
      // persistTurn never races a batched React update.
      assistant.status = "streaming";
      const sync = () => {
        patchTurn(assistant.id, {
          status: assistant.status,
          textDelta: assistant.textDelta,
          actions: assistant.actions.map((a) => ({ ...a })),
          clarification: assistant.clarification ? { ...assistant.clarification } : null,
          errorMessage: assistant.errorMessage,
        });
      };
      sync();

      await streamJarvis(
        { input: assistant.prompt, history: priorHistory },
        {
          onText: (delta) => {
            assistant.textDelta += delta;
            sync();
          },
          onQueued: (data) => {
            assistant.actions.push({
              toolUseId: data.toolUseId,
              name: data.name as ScrollbackAction["name"],
              status: "queued",
            });
            sync();
          },
          onAction: (action) => {
            const existing = assistant.actions.find((a) => a.toolUseId === action.toolUseId);
            if (existing) {
              existing.status = "done";
              existing.result = action.result as ScrollbackAction["result"];
            } else {
              assistant.actions.push({
                toolUseId: action.toolUseId,
                name: action.name as ScrollbackAction["name"],
                status: "done",
                result: action.result as ScrollbackAction["result"],
              });
            }
            sync();
            if (action.result.ok && userId) {
              invalidateAfterJarvisAction(queryClient, action.name, userId);
            }
          },
          onClarification: (event) => {
            assistant.clarification = {
              toolUseId: event.toolUseId,
              question: event.question,
              options: event.options ?? [],
              suggestedAction: event.suggestedAction ?? null,
              answered: false,
            };
            sync();
          },
          onDone: () => {
            rememberTurn("assistant", assistant.textDelta);
            assistant.status = "done";
            persistTurn(toAssistantTurn(assistant));
            sync();
            // Console isn't mounted on these routes, so a completed reply here
            // is unread until the user opens /today (or the split panel).
            bumpUnread();
          },
          onError: (message) => {
            assistant.status = "error";
            assistant.errorMessage = message;
            persistTurn(toAssistantTurn(assistant));
            sync();
          },
        },
        controller.signal
      );
      abortRef.current = null;
    },
    [patchTurn, queryClient, userId]
  );

  /** Sequential runner — drains the FIFO queue one stream at a time. Keeps
   *  running after unmount so in-flight and queued turns still land. */
  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift();
        if (!job) break;
        await runTurn(job);
      }
    } finally {
      runningRef.current = false;
    }
  }, [runTurn]);

  /** Enqueue a send. The user turn persists immediately; the strip shows the
   *  prompt in a quiet "queued" state until the runner reaches it. */
  const enqueueSend = useCallback(
    (text: string) => {
      const input = text.trim();
      if (!input) return;

      // Persist into the shared jarvis_turns stream so /today (and the split
      // console) merge this turn over Realtime — same contract as voice/Cmd+K.
      persistTurn({
        kind: "user",
        id: crypto.randomUUID(),
        text: input,
        createdAt: new Date(),
      });

      const assistant: BarTurn = {
        id: crypto.randomUUID(),
        prompt: input,
        status: "queued",
        textDelta: "",
        actions: [],
        clarification: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      // A new send answers any clarification still open in the strip — same
      // last-question-wins rule as JarvisConsole.handleSubmit.
      setTurns((prev) => [
        ...prev.map((t) =>
          t.clarification && !t.clarification.answered
            ? { ...t, clarification: { ...t.clarification, answered: true } }
            : t
        ),
        { ...assistant },
      ]);

      queueRef.current.push(assistant);
      void runQueue();
    },
    [runQueue]
  );

  function submit() {
    const text = draft;
    setDraft("");
    enqueueSend(text);
  }

  function stop() {
    // The explicit Stop is the ONE real abort: kill the current run and drop
    // everything queued behind it. Queued user turns were persisted at
    // enqueue, so the DB thread stays faithful; only their runs are dropped.
    queueRef.current = [];
    setTurns((prev) => prev.filter((t) => t.status !== "queued"));
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /**
   * Undo an executed action from a strip receipt. Mirrors
   * JarvisConsole.handleUndoAction: optimistic `undone` flip (flushSync so the
   * captured snapshot is real), persist, server round-trip, revert on failure.
   */
  const handleUndo = useCallback(
    async (turnId: string, action: ScrollbackAction) => {
      const target = actionToUndoTarget(action);
      if (!target) return;

      const flipUndone = (undone: boolean): BarTurn | undefined => {
        let updated: BarTurn | undefined;
        flushSync(() => {
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId) return t;
              updated = {
                ...t,
                actions: t.actions.map((a) =>
                  a.toolUseId === action.toolUseId ? { ...a, undone } : a
                ),
              };
              return updated;
            })
          );
        });
        return updated;
      };

      const updated = flipUndone(true);
      if (updated) persistTurn(toAssistantTurn(updated));

      const result = await undoJarvisAction(target);
      if (!result.ok) {
        toast.error(`Couldn't undo: ${result.error}`);
        const reverted = flipUndone(false);
        if (reverted) persistTurn(toAssistantTurn(reverted));
      } else {
        if (userId) invalidateAfterJarvisAction(queryClient, action.name, userId);
        toast.success("Undone");
      }
    },
    [queryClient, userId]
  );

  /** Hand the unsent draft to the console the way every other surface does. */
  const expand = useCallback(() => {
    try {
      if (draft.trim()) sessionStorage.setItem("jarvis-prefill", draft);
    } catch {
      // sessionStorage unavailable (private browsing); navigate anyway.
    }
    router.push(CONSOLE_PATH);
  }, [draft, router]);

  // Cmd/Ctrl+J focuses the bar from anywhere; Cmd/Ctrl+Shift+J expands to the
  // console. Cmd+K is untouched: it belongs to GlobalJarvisDialog and
  // GlobalHotkeys, and if the two ever collide the dialog wins.
  useEffect(() => {
    if (suppressed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "j" && event.key !== "J") return;
      event.preventDefault();
      if (event.shiftKey) {
        expand();
        return;
      }
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suppressed, expand]);

  // Deliberately NO abort-on-unmount: navigating away (including expand() →
  // /today) must not kill an in-flight turn. The runner's closures finish,
  // persistTurn lands the assistant row, and the console's realtime merge
  // shows it — expand-mid-stream is seamless. The mounted ref only gates the
  // UI mirror (patchTurn) so nothing setStates on an unmounted component.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (suppressed) return null;

  return (
    // aug-04 craft-ui-v2: Kiwi is Craft's floating Assistant pill, promoted to
    // the core input. Idle it is a centered glass pill with transparent
    // gutters around it; engaged it widens to the full glass panel with the
    // response strip. Still a flex sibling of the scroll box — the floating
    // look is padding + chrome, not an overlay — and it never autofocuses.
    <div className="shrink-0 px-3 pt-1.5 pb-3">
      <div
        className={cn(
          "craft-glass overflow-hidden",
          engaged ? "rounded-2xl" : "mx-auto w-full max-w-[640px] rounded-full"
        )}
      >
        {hasStrip ? (
          <div
            ref={stripRef}
            className="sd-scroll-hover flex max-h-[40vh] flex-col gap-3 overflow-y-auto border-b border-[var(--edge)] px-4 py-3"
          >
            {turns.map((t, i) => {
              const latest = i === turns.length - 1;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex flex-col gap-1.5 transition-opacity duration-[160ms] ease-out",
                    !latest && "opacity-55"
                  )}
                >
                  {/* Prompt echo — keeps stacked turns legible and gives a
                      queued send somewhere calm to wait. */}
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span
                      className="shrink-0 font-mono text-micro text-[var(--ink-faint)]"
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="truncate text-meta text-[var(--ink-muted)]">{t.prompt}</span>
                    {t.status === "queued" ? (
                      <span className="shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-[var(--ink-faint)]">
                        queued
                      </span>
                    ) : null}
                  </div>

                  {t.status === "streaming" &&
                  !t.textDelta &&
                  t.actions.length === 0 &&
                  !t.clarification ? (
                    <div className="flex items-center gap-3" role="status" aria-live="polite">
                      <HudThinkingRing size={22} />
                      <span className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
                        Thinking
                      </span>
                    </div>
                  ) : null}

                  {t.textDelta ? (
                    <div className="max-w-[68ch] whitespace-pre-wrap text-body text-[var(--ink)]">
                      {renderInlineMarkdown(stripSystemTags(t.textDelta))}
                      {t.status === "streaming" ? (
                        <span
                          className={cn(
                            "ml-0.5 inline-block h-[1em] w-0.5 align-[-0.1em] bg-[var(--hud-cyan-bright)]",
                            !reduceMotion && "hud-streaming-caret"
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {t.clarification ? (
                    <JarvisClarification
                      clarification={t.clarification}
                      onReply={(reply) => enqueueSend(`[CLARIFICATION REPLY] ${reply}`)}
                    />
                  ) : null}

                  {t.actions.length > 0 ? (
                    <div className="flex flex-col">
                      {t.actions.map((a, idx) => (
                        <JarvisReceipt
                          key={a.toolUseId || `${t.id}-action-${idx}`}
                          action={a}
                          variant="compact"
                          onUndo={
                            isActionUndoable(a) ? () => void handleUndo(t.id, a) : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : null}

                  {t.status === "error" && t.errorMessage ? (
                    <p className="text-meta text-[var(--ink-coral)]">{t.errorMessage}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex h-12 items-center gap-2 px-2.5">
          <KiwiIcon
            size={18}
            aria-hidden="true"
            className={cn("ml-1 shrink-0", busy && !reduceMotion && "animate-pulse")}
          />

          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // NEVER disabled — a send while a run is in flight enqueues.
            placeholder={busy ? "queue another…" : "hi jarv"}
            aria-label="Ask Jarvis"
            aria-busy={busy}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-body text-[var(--ink)] outline-none",
              "placeholder:text-[var(--ink-faint)] disabled:opacity-60"
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                // Escape collapses the answer strip first, then gives focus back
                // to whatever the user was actually doing. Don't dismiss while
                // a turn is in flight — Stop owns that.
                if (busy) return;
                if (hasStrip) collapseStrip();
                else event.currentTarget.blur();
              }
            }}
          />

          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              <X size={15} strokeWidth={1.75} />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded bg-[var(--hover)] px-1.5 py-0.5 font-mono text-micro text-[var(--ink-faint)] md:inline-block">
              ⌘J
            </kbd>
          )}

          <button
            type="button"
            onClick={expand}
            aria-label="Open the full console"
            title="Open the full console (⌘⇧J)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <Maximize2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
