"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { getPeopleForCurrentUser } from "@/app/actions/people";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { EntityLabelsProvider } from "@/components/references/EntityLabelsProvider";
import { tableKey } from "@/lib/realtime/query-keys";
import type { ScrollbackAssistantTurn, ScrollbackTurn, ScrollbackAction } from "./jarvis-types";
import { sortTurns } from "./transcript-order";
import { JarvisReceipt } from "./JarvisReceipt";
import { JarvisClarification } from "./JarvisClarification";
import { HudThinkingRing } from "@/components/shared/HudThinkingRing";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
import { renderInlineMarkdown, renderUserText } from "@/lib/jarvis/inline-markdown";
import { isDailyPageProcessText } from "@/lib/jarvis/daily-page-process";
import { CalendarDays } from "lucide-react";

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
  /**
   * Deep-link target. When set (e.g. arriving from a wiki page's processing-
   * run history at /today?messageId=…), scroll that turn into view once it's
   * present in `turns` and flash a brief highlight so the receipts are easy to
   * spot. Takes priority over the bottom auto-scroll.
   */
  scrollToTurnId?: string | null;
  /**
   * Phase 33 Plan 02 — retry a failed assistant turn. Fires when the user
   * clicks the "↺ Retry" button on a turn whose status === "error". The
   * parent (JarvisConsole) finds the preceding user turn and re-submits it.
   */
  onRetry?: (turnId: string) => void;
}

/**
 * Capability-based undo eligibility check.
 *
 * Returns true only when the action carries inversion data:
 *   - create_*: result must carry an `id` string (the created entity id)
 *   - update_*: receipt must carry `before` (the pre-update snapshot)
 *   - delete_*: receipt must carry `snapshot` (the pre-delete full row)
 *   - find_*, remember_fact, ask_clarification: never undoable
 *
 * This replaces the old name-prefix `a.name.startsWith("create_")` guard
 * (Plan 16-06 Task 3 — capability-based gating per SMJ-14).
 */
function isUndoable(a: ScrollbackAction): boolean {
  if (!a.result || a.result.ok !== true) return false;
  const receipt = (a.result as { receipt?: Record<string, unknown> }).receipt ?? {};
  if (a.name.startsWith("create_")) {
    return typeof (a.result as { id?: string }).id === "string";
  }
  if (a.name.startsWith("update_")) {
    return receipt.before !== undefined && receipt.before !== null;
  }
  if (a.name.startsWith("delete_")) {
    return receipt.snapshot !== undefined && receipt.snapshot !== null;
  }
  return false; // find_*, remember_fact, ask_clarification
}

/**
 * Per-turn timestamp — small mono caption shown next to each turn.
 * Muted by default; lifts on hover so the eye isn't constantly distracted
 * by row metadata. Hover-title shows the full localised date+time.
 */
function TurnTimestamp({ createdAt }: { createdAt: Date }) {
  return (
    <span
      className="font-mono text-[11px] text-[var(--sd-ink-faint)] opacity-40 group-hover:opacity-90 transition-opacity select-none whitespace-nowrap"
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
  scrollToTurnId = null,
  onRetry,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  // The composer sends a person mention as a bare `@name` marker, so chipping
  // one back requires knowing the names — the same deliberate data dependency
  // as tokenize-content.ts. Without this list, a person the user picked from
  // the menu came back as literal text in their own transcript (a shipped bug).
  const userId = useCurrentUserId();
  const { data: people } = useQuery({
    queryKey: [...tableKey("people", userId ?? "anon")] as const,
    queryFn: () => getPeopleForCurrentUser(),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
  const personNames = useMemo(() => (people ?? []).map((p) => p.name), [people]);
  // Issue #283 — render turns in canonical logical order regardless of how they
  // reached this component. JarvisConsole's realtime merge already sorts, but
  // the SSR-hydrated, paginated, and deep-link paths set state straight from
  // DB rows whose equal-timestamp ties Postgres can return inverted. Sorting
  // here is the single render chokepoint that guarantees a user turn always
  // precedes its assistant reply. Cheap (scrollback is capped) and keyed by
  // stable turn.id so it never thrashes the DOM.
  const orderedTurns = useMemo(() => sortTurns(turns), [turns]);
  // Every reference across the whole transcript resolves in one batch rather
  // than one call per bubble.
  const turnText = useMemo(
    () =>
      orderedTurns.flatMap((t) =>
        t.kind === "user" ? [t.text] : [(t as ScrollbackAssistantTurn).textDelta],
      ),
    [orderedTurns],
  );
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
  // Tracks the last deep-link target we scrolled to, so the scroll-to-target
  // effect fires once per target (and not on every subsequent turns change).
  const scrolledToRef = useRef<string | null>(null);

  // A signal that changes every time the LAST assistant turn grows — by token
  // (textDelta length), by receipt landing (actions.length), or by status
  // transition (streaming → done). Without this, the existing length-only
  // effect would never re-fire during a stream because `turns.length` stays
  // constant while the same turn's content fills in.
  const lastTurn = orderedTurns[orderedTurns.length - 1];
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

  // Deep-link scroll-to-target. Declared AFTER the bottom auto-scroll effect so
  // it runs last in the commit and wins the final scroll position. Fires once
  // per target id (guarded by scrolledToRef); re-checks on each `turns` change
  // so it still lands after an async deep-link fetch populates the target.
  useEffect(() => {
    if (!scrollToTurnId) return;
    if (scrolledToRef.current === scrollToTurnId) return;
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-turn-id="${CSS.escape(scrollToTurnId)}"]`,
    );
    if (!el) return; // not loaded yet — a later turns update will retry.
    scrolledToRef.current = scrollToTurnId;
    // Suppress the bottom auto-scroll so it doesn't immediately yank us away.
    userScrolledUpRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Transient highlight so the target receipts are easy to spot. Inline
    // styles avoid depending on a Tailwind class that may be tree-shaken.
    el.style.transition = "box-shadow 300ms ease";
    el.style.borderRadius = "12px";
    el.style.boxShadow = "0 0 0 2px var(--sd-accent)";
    const t = window.setTimeout(() => {
      el.style.boxShadow = "none";
    }, 2400);
    return () => window.clearTimeout(t);
  }, [scrollToTurnId, turns]);

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
  for (const turn of orderedTurns) {
    const key = dayKey(turn.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === key) {
      last.turns.push(turn);
    } else {
      grouped.push({ day: key, turns: [turn] });
    }
  }

  return (
    <EntityLabelsProvider text={turnText}>
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain px-6 py-4 hud-scrollbar"
    >
      {turns.length === 0 ? (
        // Empty state: the HudCoreBubble centerpiece (rendered behind in
        // JarvisConsole) carries the visual weight. We add only a quiet
        // bottom-anchored hint above the input so the bubble stays uncovered
        // and the surface doesn't feel like a stack of competing greetings.
        // Full-width + pointer-events-none so it never captures clicks meant
        // for Studio widgets behind the console.
        <div className="flex h-full items-end justify-center pb-24 pointer-events-none">
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] opacity-70 select-none">
            Type below, or hold ⌘+J and speak.
          </p>
        </div>
      ) : null}

      {/* Issue #283 (sd register) — the message column is constrained to a
          fixed reading measure and centered. Chat bubbles used to sprawl the
          full page width (their max-w-[72/82%] are relative to the container),
          overrunning Studio widgets on widescreen. Capping at 820px keeps the
          conversation readable and leaves the side gutters clear so widgets
          stay visible and interactable. The scroll container itself stays
          full-width so the hud-scrollbar hugs the edge. */}
      <div className="mx-auto w-full max-w-[820px]">
      {/* "Older messages" pagination button — only when there's another
          page behind the oldest currently-loaded turn. Sits at the top so
          the user reaches it by scrolling up. */}
      {hasMore && turns.length > 0 ? (
        <div className="flex justify-center mb-4">
          <button
            type="button"
            onClick={handleLoadOlderClick}
            disabled={loadingOlder}
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] px-3 py-1.5 rounded text-[var(--sd-ink-dull)] hover:text-[var(--sd-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Load older messages"
          >
            {loadingOlder ? "Loading…" : "↑ Older messages"}
          </button>
        </div>
      ) : null}

      {grouped.map((group) => (
        <div key={group.day}>
          {/* Date divider — Today / Yesterday / weekday / "Mon DD" / "Mon DD, YYYY" */}
          <div className="flex items-center gap-3 my-4 select-none">
            <div className="flex-1 h-px bg-[var(--sd-line)]" />
            <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] opacity-70">
              {formatDayHeader(group.turns[0].createdAt)}
            </span>
            <div className="flex-1 h-px bg-[var(--sd-line)]" />
          </div>
          {group.turns.map((turn) => (
            <div key={turn.id} data-turn-id={turn.id} className="group">
              {turn.kind === "user" ? (
                // RIGHT-aligned user turn. A subtle solid --sd-input tint plate
                // with a hairline — no blur, no glow, no terminal prompt.
                // jul-29 craft restyle: the plate joins the depth ladder with
                // --shadow-card so turns read as raised paper, not flat boxes.
                <div className="flex justify-end mb-3">
                  <div className="flex flex-col items-end max-w-[72%]">
                    <motion.div
                      initial={shouldReduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
                      style={{ background: "var(--sd-input)" }}
                      className="relative rounded-xl border border-[var(--sd-line)] px-4 py-2.5 shadow-[var(--shadow-card)]"
                    >
                      {isDailyPageProcessText(turn.text) ? (
                        // Turns from the Daily Page "process this page" button carry
                        // a canned instruction as their text. Badge them instead of
                        // echoing the raw prompt so they read as a distinct action.
                        <span className="flex items-center gap-2">
                          <span
                            style={{
                              background: "color-mix(in oklch, var(--sd-accent) 14%, transparent)",
                              boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 30%, transparent)",
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--sd-accent)]"
                          >
                            <CalendarDays size={11} strokeWidth={1.75} />
                            Daily Page
                          </span>
                          <span className="text-[14px] text-[var(--sd-ink-dull)]">
                            Processed this page
                          </span>
                        </span>
                      ) : (
                        <p className="text-[15px] text-[var(--sd-ink)] whitespace-pre-wrap break-words">
                          {renderUserText(stripSystemTags(turn.text), {
                            personNames,
                          })}
                        </p>
                      )}
                    </motion.div>
                    <div className="mt-1 px-1">
                      <TurnTimestamp createdAt={turn.createdAt} />
                    </div>
                  </div>
                </div>
              ) : (
                // LEFT-aligned JARVIS turn. KiwiIcon mark + mono cyan "JARVIS"
                // label name the speaker; the body is a solid --sd-darker-box
                // plate with a hairline and the craft --shadow-card lift — no
                // glow halo, no blur.
                <div className="flex justify-start mb-3">
                  <div className="flex flex-col max-w-[82%]">
                    <span className="mb-1 ml-1 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-accent)]">
                      <KiwiIcon size={16} aria-hidden="true" />
                      JARVIS
                    </span>
                    <motion.div
                      initial={shouldReduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
                      className={`relative rounded-xl border border-[var(--sd-line)] px-4 py-3 overflow-hidden shadow-[var(--shadow-card)]${
                        turn.status === "error" && !shouldReduce
                          ? " hud-error-glitch"
                          : ""
                      }`}
                      style={{
                        background: "var(--sd-darker-box)",
                        borderLeft:
                          turn.status === "error"
                            ? "3px solid var(--ink-coral)"
                            : undefined,
                      }}
                    >
                      {/* Queued placeholder — this send is waiting its turn in
                          the FIFO queue behind the run currently streaming. A
                          quiet mono caption, no ring: the thinking ring is
                          reserved for the turn actually in flight. */}
                      {turn.status === "queued" ? (
                        <span className="font-mono text-xs text-[var(--sd-ink-faint)] uppercase tracking-[0.08em] select-none">
                          queued…
                        </span>
                      ) : null}

                      {/* Phase 6.1 Plan 02 (UI-SPEC §6b state 5): thinking ring
                          while status='streaming' and no textDelta has arrived. */}
                      {turn.status === "streaming" &&
                      !turn.textDelta &&
                      turn.actions.length === 0 ? (
                        <div className="flex items-center gap-3 mb-2">
                          <HudThinkingRing size={32} />
                          <span className="font-mono text-xs text-[var(--sd-ink-dull)] uppercase tracking-[0.08em]">
                            THINKING
                          </span>
                        </div>
                      ) : null}

                      {/* Phase 6.1 Plan 02 (UI-SPEC §4a + §6b state 6): JARVIS
                          prose in JetBrains Mono 500 italic 16px — the agent
                          register. Streaming caret + light-trail trail the last
                          rendered character while status === "streaming". */}
                      {turn.textDelta ? (
                        <div
                          className="font-mono text-base italic font-medium leading-relaxed"
                          style={{ color: "var(--sd-ink)" }}
                        >
                          {renderInlineMarkdown(stripSystemTags(turn.textDelta), {
                            personNames,
                          })}
                          {turn.status === "streaming" ? (
                            <span className="relative inline-block ml-0.5">
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
                              <span
                                className={
                                  shouldReduce ? "" : "hud-streaming-caret"
                                }
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

                      {/* Phase 6.1 Plan 02 (UI-SPEC §6b state 7): one-shot scan
                          reveal on the streaming→done transition. */}
                      <ScanRevealOverlay status={turn.status} />

                      {/* Phase 5.1 D-A2 / JARVIS-19: clarification receipt renders
                          AFTER prose text and BEFORE action receipts per spec. */}
                      {turn.clarification ? (
                        <div className={turn.textDelta ? "mt-2" : ""}>
                          <JarvisClarification
                            clarification={turn.clarification}
                            onReply={
                              onClarificationReply
                                ? (text) =>
                                    onClarificationReply(turn.id, text)
                                : undefined
                            }
                          />
                        </div>
                      ) : null}
                      {turn.actions.length > 0 ? (
                        <div
                          className={
                            turn.textDelta || turn.clarification ? "mt-2" : ""
                          }
                        >
                          {turn.actions.map((a, i) => (
                            <JarvisReceipt
                              key={a.toolUseId || `${turn.id}-action-${i}`}
                              action={a}
                              variant={turn.textDelta ? "compact" : "default"}
                              onUndo={
                                onUndoAction && isUndoable(a)
                                  ? () => onUndoAction(turn.id, a)
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                      {turn.status === "error" ? (
                        <div
                          className="text-xs font-mono mt-2"
                          style={{ color: "var(--ink-coral)" }}
                        >
                          {turn.errorMessage}
                        </div>
                      ) : null}
                      {turn.status === "error" && onRetry ? (
                        <button
                          type="button"
                          onClick={() => onRetry(turn.id)}
                          className="mt-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--sd-accent)] hover:opacity-80 transition-opacity"
                        >
                          ↺ Retry
                        </button>
                      ) : null}
                    </motion.div>
                    <div className="mt-1 ml-1">
                      <TurnTimestamp createdAt={turn.createdAt} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div ref={bottomRef} />
      </div>
    </div>
    </EntityLabelsProvider>
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
