"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { ScrollbackAssistantTurn, ScrollbackTurn, ScrollbackAction } from "./jarvis-types";
import { JarvisReceipt } from "./JarvisReceipt";
import { JarvisClarification } from "./JarvisClarification";
import { HudThinkingRing } from "@/components/shared/HudThinkingRing";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
import { renderInlineMarkdown } from "@/lib/jarvis/inline-markdown";

/**
 * Terminal-style single-column scrollback (D-05).
 *
 * Phase 6.1 Plan 02 (UI-SPEC §6b states 5-8): renders states 5-8 of the
 * JARVIS Console interaction machine:
 *
 *   State 5 (thinking): assistant turn streaming + no textDelta yet →
 *     mount HudThinkingRing + "THINKING" caption. Replaced by streaming
 *     prose once the first textDelta arrives.
 *
 *   State 6 (streaming): textDelta arriving + status === "streaming" →
 *     JARVIS prose renders in JetBrains Mono 500 italic 16px (UI-SPEC §4a).
 *     A 2px --hud-cyan-bright caret with --hud-cyan-glow halo trails the
 *     last rendered character via .hud-streaming-caret class. A 32px wide
 *     --hud-cyan-glow-soft light-trail follows behind the caret as an
 *     absolute sibling span.
 *
 *   State 7 (done): status transitions streaming → done → caret fades and
 *     ScanRevealOverlay mounts a top-to-bottom .hud-scan-line wipe over
 *     420ms with --hud-cyan-bright 70%-stop gradient.
 *
 *   State 8 (error): status === "error" → assistant turn region gets
 *     .hud-error-glitch (80ms translateX(2px) jitter). Error receipts
 *     get a 3px --ink-coral left edge (handled in JarvisReceipt).
 *
 * Reduced motion: caret renders static (no .hud-streaming-caret class),
 * light-trail not mounted, scan reveal not mounted, glitch class not added.
 *
 * Plan 05-04: forwards an `onUndoAction(turnId, action)` callback down to
 * every receipt so JarvisConsole owns the optimistic scrollback update + the
 * server round-trip.
 */

interface Props {
  turns: ScrollbackTurn[];
  /**
   * Plan 05-04 — fired when a user clicks Undo within the 5s window on a
   * receipt. JarvisConsole owns scrollback state, so the optimistic flip
   * happens there.
   */
  onUndoAction?: (turnId: string, action: ScrollbackAction) => void;
  /**
   * Phase 5.1 D-A2 / JARVIS-19 — fired when user submits a clarification reply
   * (chip click or free-text enter). JarvisConsole prepends [CLARIFICATION REPLY]
   * and submits the next user turn.
   */
  onClarificationReply?: (turnId: string, text: string) => void;
  /**
   * Pagination — true if there are persisted turns older than the ones
   * currently in `turns`. Shows the "Older messages" load-more button.
   */
  hasMore?: boolean;
  /**
   * True while the older-page fetch is in flight. The button shows a
   * spinner/disabled state.
   */
  loadingOlder?: boolean;
  /**
   * Click handler for the "Older messages" button. Should fetch the next
   * page from the server, prepend it to `turns`, and update hasMore.
   */
  onLoadOlder?: () => void | Promise<void>;
}

/**
 * Per-turn timestamp — small mono caption shown next to each turn.
 * Muted by default; lifts on hover so the eye isn't constantly distracted
 * by row metadata. Hover-title shows the full localised date+time.
 */
function TurnTimestamp({ createdAt }: { createdAt: Date }) {
  return (
    <span
      className="font-mono text-[11px] text-[var(--ink-muted)] opacity-40 group-hover:opacity-90 transition-opacity select-none whitespace-nowrap"
      title={createdAt.toLocaleString()}
    >
      {createdAt.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>
  );
}

/**
 * Group adjacent turns into per-day buckets so we can render date headers
 * between groups. "Today" / "Yesterday" / weekday for the last week /
 * full date otherwise.
 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dKey = dayKey(d);
  if (dKey === dayKey(today)) return "Today";
  if (dKey === dayKey(yesterday)) return "Yesterday";
  // Within the last 6 days → weekday name
  const diffDays = Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays >= 0 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  // Otherwise → "Mon, Dec 18" (this year) or "Dec 18, 2024" (older)
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function JarvisScrollback({
  turns,
  onUndoAction,
  onClarificationReply,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const prevTurnsCountRef = useRef(turns.length);
  // When the user clicks "Older messages", we record scrollHeight + scrollTop
  // BEFORE the fetch resolves so the post-prepend effect can restore the
  // visible message to the same pixel position (no jump).
  const preserveScrollRef = useRef<{
    prevHeight: number;
    prevTop: number;
  } | null>(null);
  // Locks auto-scroll OFF when the user has intentionally scrolled up to read
  // history mid-stream. Re-arms when they scroll back near the bottom.
  const userScrolledUpRef = useRef(false);

  // A signal that changes every time the LAST assistant turn grows — by token
  // (textDelta length), by receipt landing (actions.length), or by status
  // transition (streaming → done). Without this, the existing length-only
  // effect would never re-fire during a stream because `turns.length` stays
  // constant while the same turn's content fills in.
  const lastTurn = turns[turns.length - 1];
  const tailContentSignal =
    lastTurn?.kind === "assistant"
      ? `${lastTurn.id}|${lastTurn.textDelta?.length ?? 0}|${lastTurn.actions.length}|${lastTurn.status}`
      : `user|${turns.length}`;

  // Track whether the user is reading history mid-stream. If they are, we
  // don't yank them down — they're explicitly elsewhere. Threshold is
  // generous (160px) so a partial scroll-up isn't read as "I want to stay".
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const STICK_THRESHOLD = 160;
    function onScroll() {
      if (!el) return;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > STICK_THRESHOLD;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll-to-bottom on:
  //   1. tail append (new turn added) — always scroll (unless prepend).
  //   2. tail content grow (same turn streaming more tokens / new receipts /
  //      status flip) — scroll ONLY if the user hasn't scrolled up.
  // Prepend events (loading older history) restore the previous pixel
  // position so the visible message doesn't jump.
  useEffect(() => {
    const grewAtTail = turns.length > prevTurnsCountRef.current;
    const isPrependEvent = preserveScrollRef.current !== null;

    if (isPrependEvent && containerRef.current) {
      const el = containerRef.current;
      const { prevHeight, prevTop } = preserveScrollRef.current!;
      const heightDelta = el.scrollHeight - prevHeight;
      el.scrollTop = prevTop + heightDelta;
      preserveScrollRef.current = null;
    } else if (grewAtTail) {
      // New turn — always scroll. Reset the "user scrolled up" lock since
      // this is almost always the result of the user submitting.
      userScrolledUpRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } else if (!userScrolledUpRef.current) {
      // Same turn, more content — keep the bottom in view. Use "auto"
      // (instant) here instead of "smooth" so we don't queue dozens of
      // overlapping smooth-scrolls during a fast token stream.
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }

    prevTurnsCountRef.current = turns.length;
  }, [turns.length, tailContentSignal]);

  function handleLoadOlderClick() {
    if (!containerRef.current || loadingOlder) return;
    // Snapshot scroll state BEFORE the parent fires its async fetch.
    preserveScrollRef.current = {
      prevHeight: containerRef.current.scrollHeight,
      prevTop: containerRef.current.scrollTop,
    };
    void onLoadOlder?.();
  }

  // Group turns by day for date headers.
  const grouped: Array<{ day: string; turns: ScrollbackTurn[] }> = [];
  for (const turn of turns) {
    const key = dayKey(turn.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === key) {
      last.turns.push(turn);
    } else {
      grouped.push({ day: key, turns: [turn] });
    }
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain px-6 py-4 font-mono hud-scrollbar"
    >
      {/* "Older messages" pagination button — only when there's another
          page behind the oldest currently-loaded turn. Sits at the top so
          the user reaches it by scrolling up. */}
      {hasMore && turns.length > 0 ? (
        <div className="flex justify-center mb-4">
          <button
            type="button"
            onClick={handleLoadOlderClick}
            disabled={loadingOlder}
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] px-3 py-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--hud-cyan-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Load older messages"
          >
            {loadingOlder ? "Loading…" : "↑ Older messages"}
          </button>
        </div>
      ) : null}

      {turns.length === 0 ? (
        <div className="flex h-full items-end justify-center pb-24">
          <div className="flex flex-col items-center text-center max-w-[520px] gap-3 select-none">
            {/* Mono uppercase eyebrow — same brand grammar as the landing's
                section eyebrows. Cyan-tinted to signal agent-mode surface. */}
            <p
              className="font-mono text-[14px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--hud-cyan-light)" }}
            >
              § JARVIS · READY
            </p>
            <p className="font-serif text-[28px] font-semibold leading-[1.2] text-[var(--ink)]">
              Good evening, sir.
            </p>
            <p className="font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
              Type at the prompt below, or hold ⌘+J and speak. I&rsquo;ll
              route it.
            </p>
            {/* Three example chips — non-interactive inspirations matching the
                landing's hero examples. Mono caption so it reads as system text. */}
            <ul className="mt-4 flex flex-col gap-2 items-center font-mono font-mono-stats text-[14px] text-[var(--ink-muted)]">
              <li>
                <span style={{ color: "var(--hud-cyan)" }}>$ </span>
                dinner with anna 8pm saturday
              </li>
              <li>
                <span style={{ color: "var(--hud-cyan)" }}>$ </span>
                #idea polymathy as competitive edge
              </li>
              <li>
                <span style={{ color: "var(--hud-cyan)" }}>$ </span>
                anth pset by fri 3pm $ANTH 2480
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {grouped.map((group) => (
        <div key={group.day}>
          {/* Date divider — Today / Yesterday / weekday / "Mon DD" / "Mon DD, YYYY" */}
          <div className="flex items-center gap-3 my-4 select-none">
            <div className="flex-1 h-px bg-[var(--edge)]" />
            <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] opacity-70">
              {formatDayHeader(group.turns[0].createdAt)}
            </span>
            <div className="flex-1 h-px bg-[var(--edge)]" />
          </div>
          {group.turns.map((turn) => (
            <div key={turn.id} className="mb-3 group">
          {turn.kind === "user" ? (
            <div className="text-sm flex items-baseline gap-2">
              <span className="select-none mr-1.5 opacity-60 text-muted-foreground">
                {">"}
              </span>
              <span className="font-mono text-foreground/80 flex-1">
                {stripSystemTags(turn.text)}
              </span>
              <TurnTimestamp createdAt={turn.createdAt} />
            </div>
          ) : (
            // Phase 6.1 Plan 02 (UI-SPEC §6b state 8): error glitch class on
            // the assistant turn region — 80ms translateX(2px) jitter via the
            // .hud-error-glitch keyframe. relative + overflow-hidden anchor
            // the absolutely-positioned scan-reveal line during the
            // streaming→done transition.
            <div
              className={`ml-3 relative overflow-hidden ${
                turn.status === "error" && !shouldReduce ? "hud-error-glitch" : ""
              }`}
            >
              <div className="absolute top-0 right-0">
                <TurnTimestamp createdAt={turn.createdAt} />
              </div>
              {/* Phase 6.1 Plan 02 (UI-SPEC §6b state 5): thinking ring while
                  status='streaming' and no textDelta has arrived. Replaces the
                  Phase 5 <ThinkingWord /> indicator. Once the first token
                  lands, the ring unmounts and the streaming prose renders. */}
              {turn.status === "streaming" &&
              !turn.textDelta &&
              turn.actions.length === 0 ? (
                <div className="flex items-center gap-3 mb-2">
                  <HudThinkingRing size={32} />
                  <span className="font-mono text-xs text-[var(--ink-muted)] uppercase tracking-[0.08em]">
                    THINKING
                  </span>
                </div>
              ) : null}

              {/* Phase 6.1 Plan 02 (UI-SPEC §4a + §6b state 6): JARVIS prose
                  in JetBrains Mono 500 italic 16px — the agent register.
                  Phase 6 used font-serif text-base; Phase 6.1 swaps to
                  font-mono italic font-medium per spec.

                  Streaming caret: 2px --hud-cyan-bright bar trails the last
                  rendered character; .hud-streaming-caret class drives the
                  1.1s opacity + glow pulse (Plan 01 keyframe). A 32px wide
                  --hud-cyan-glow-soft light-trail mounts as an absolute
                  sibling span when not under reduced-motion. */}
              {turn.textDelta ? (
                <div
                  className="font-mono text-base italic font-medium mb-2 leading-relaxed"
                  style={{ color: "var(--ink)" }}
                >
                  {renderInlineMarkdown(stripSystemTags(turn.textDelta))}
                  {turn.status === "streaming" ? (
                    <span className="relative inline-block ml-0.5">
                      {/* Light-trail: 32px gradient behind caret (Linear
                          physical-light precedent). Absolutely positioned
                          so it doesn't shift the text baseline. */}
                      {!shouldReduce ? (
                        <span
                          className="absolute right-2 top-0 h-full pointer-events-none"
                          style={{
                            width: "32px",
                            transform: "translateX(-100%)",
                            background:
                              "linear-gradient(90deg, transparent 0%, var(--hud-cyan-glow-soft) 50%, transparent 100%)",
                          }}
                          aria-hidden="true"
                        />
                      ) : null}
                      {/* Caret bar — pulses via .hud-streaming-caret when
                          motion is allowed; static 2px bar otherwise. */}
                      <span
                        className={shouldReduce ? "" : "hud-streaming-caret"}
                        style={{
                          display: "inline-block",
                          width: "2px",
                          height: "1em",
                          backgroundColor: "var(--hud-cyan-bright)",
                          verticalAlign: "middle",
                          boxShadow: shouldReduce
                            ? "none"
                            : "0 0 8px var(--hud-cyan-glow)",
                        }}
                        aria-hidden="true"
                      />
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Phase 6.1 Plan 02 (UI-SPEC §6b state 7): one-shot scan reveal
                  on the streaming→done transition. Uses .hud-scan-line driven
                  by the --hud-cyan-bright 70%-stop gradient over 420ms (Phase
                  6's predecessor class fully retired). */}
              <ScanRevealOverlay status={turn.status} />

              {/* Phase 5.1 D-A2 / JARVIS-19: clarification receipt renders
                  AFTER prose text and BEFORE action receipts per plan spec. */}
              {turn.clarification ? (
                <JarvisClarification
                  clarification={turn.clarification}
                  onReply={
                    onClarificationReply
                      ? (text) => onClarificationReply(turn.id, text)
                      : undefined
                  }
                />
              ) : null}
              {turn.actions.map((a, i) => (
                <JarvisReceipt
                  key={a.toolUseId || `${turn.id}-action-${i}`}
                  action={a}
                  variant={turn.textDelta ? "compact" : "default"}
                  onUndo={
                    onUndoAction
                      ? () => onUndoAction(turn.id, a)
                      : undefined
                  }
                />
              ))}
              {turn.status === "error" ? (
                <div
                  className="text-xs font-mono mt-1"
                  style={{ color: "var(--ink-coral)" }}
                >
                  {turn.errorMessage}
                </div>
              ) : null}
            </div>
          )}
        </div>
          ))}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Phase 6.1 Plan 02 (UI-SPEC §6b state 7): one-shot scan-reveal wipe.
 *
 * Mounts a --hud-cyan-bright 70%-stop gradient overlay when the assistant
 * turn transitions from "streaming" to "done", then unmounts 420ms later
 * (matches the .hud-scan-line keyframe duration). Skipped entirely under
 * prefers-reduced-motion — the element is never rendered.
 *
 * The parent container provides position:relative + overflow:hidden so the
 * absolutely-positioned line stays within the turn body.
 */
function ScanRevealOverlay({ status }: { status: ScrollbackAssistantTurn["status"] }) {
  const [show, setShow] = useState(false);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (status !== "done" || shouldReduce) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 420);
    return () => window.clearTimeout(t);
  }, [status, shouldReduce]);

  if (!show) return null;
  return (
    <div className="absolute inset-0 hud-scan-line pointer-events-none" aria-hidden="true">
      {/* --hud-cyan-bright 70%-stop gradient backdrop per UI-SPEC §6b state 7 */}
      <div
        className="absolute inset-x-0 top-0 h-8"
        style={{
          background:
            "linear-gradient(to bottom, var(--hud-cyan-bright) 70%, transparent 100%)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}
