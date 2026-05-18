"use client";

import { useEffect, useRef } from "react";
import type { ScrollbackTurn, ScrollbackAction } from "./jarvis-types";
import { JarvisReceipt } from "./JarvisReceipt";
import { JarvisClarification } from "./JarvisClarification";
import { ThinkingWord } from "./ThinkingWord";

/**
 * Terminal-style single-column scrollback (D-05).
 *
 *   - User echoes: mono + `>` prefix, journal-paper tint
 *   - Assistant preamble: EB Garamond italic, muted
 *   - Actions: intent-badged receipt blocks
 *   - Thinking-word indicator: only while streaming + no actions yet
 *
 * Auto-scroll on new turn (Claude's discretion to disable on user scroll-up
 * in a future polish pass — out of scope for Plan 05-03).
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
}

export function JarvisScrollback({ turns, onUndoAction, onClarificationReply }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 font-mono">
      {turns.length === 0 ? (
        <div className="flex h-full items-center justify-center font-serif italic text-muted-foreground text-lg">
          Good evening, sir. What shall we file?
        </div>
      ) : null}

      {turns.map((turn) => (
        <div key={turn.id} className="mb-3">
          {turn.kind === "user" ? (
            <div className="text-sm">
              <span className="select-none mr-1.5 opacity-60 text-muted-foreground">
                {">"}
              </span>
              <span className="font-mono text-foreground/80">{turn.text}</span>
            </div>
          ) : (
            <div className="ml-3">
              {/* Phase 5.1 (D-R1) — render textDelta on every assistant turn that has it,
                  including action turns. The Phase 5 suppression gate (actions.length === 0)
                  is removed; prose-first is the new contract per JARVIS-20. Meta-question
                  turns (/ask) still produce only prose with no actions — that path is
                  unchanged. Action turns now lead with prose ABOVE receipt cards. */}
              {turn.textDelta ? (
                <div className="font-serif text-base text-foreground/90 mb-2 leading-relaxed">
                  {turn.textDelta}
                </div>
              ) : null}
              {turn.status === "streaming" &&
              turn.actions.length === 0 &&
              !turn.textDelta ? (
                <ThinkingWord active />
              ) : null}
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
                <div className="text-xs text-red-600 font-mono">
                  {turn.errorMessage}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
