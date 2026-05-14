"use client";

import { useEffect, useRef } from "react";
import type { ScrollbackTurn } from "./jarvis-types";
import { JarvisReceipt } from "./JarvisReceipt";
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
 */

interface Props {
  turns: ScrollbackTurn[];
}

export function JarvisScrollback({ turns }: Props) {
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
              {/* D-16: suppress assistant narrative text — render tool-use
                  receipts only. The model occasionally narrates ("Two items,
                  two tools — dispatching simultaneously") before tool blocks;
                  that voice is forbidden by personality but we enforce it
                  client-side as defense-in-depth. */}
              {turn.status === "streaming" && turn.actions.length === 0 ? (
                <ThinkingWord active />
              ) : null}
              {turn.actions.map((a, i) => (
                <JarvisReceipt
                  key={a.toolUseId || `${turn.id}-action-${i}`}
                  action={a}
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
