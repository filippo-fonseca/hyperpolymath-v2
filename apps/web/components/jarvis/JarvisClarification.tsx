"use client";

/**
 * Phase 5.1 (D-A2 / JARVIS-19) — Inline clarification receipt.
 *
 * Renders when the model emits ask_clarification: question text, optional
 * preset chip options, and a free-text reply input. Reply submits as the next
 * user turn prefixed `[CLARIFICATION REPLY]` — the Console wires this.
 *
 * Design decisions (per CONTEXT D-A2 + RESEARCH §I):
 * - Last-question-wins: Console stores clarification on the current assistant turn.
 * - answered=true disables all inputs and shows "answered" indicator.
 * - answered=false: chip click or Enter in free-text calls onReply(text); the
 *   Console prepends [CLARIFICATION REPLY] and submits normally.
 * - If user ignores and types a new message, the Console marks answered=true
 *   on all prior clarifications (historical record, no further interaction).
 */

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ScrollbackClarification } from "./jarvis-types";

interface Props {
  clarification: ScrollbackClarification;
  /** Fires with the user's reply text (WITHOUT the [CLARIFICATION REPLY] prefix).
   *  Console wires prepending the prefix and calling handleSubmit. */
  onReply?: (text: string) => void;
}

export function JarvisClarification({ clarification, onReply }: Props) {
  const [reply, setReply] = useState("");
  const disabled = clarification.answered || !onReply;

  function submit(text: string) {
    if (!text.trim() || disabled) return;
    onReply?.(text.trim());
    setReply("");
  }

  return (
    <div
      className={cn(
        "rounded border-l-2 border-l-violet-500/50 bg-violet-500/5 px-3 py-2 my-1",
        disabled && "opacity-60",
      )}
    >
      {/* Header badge */}
      <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <HelpCircle className="h-3.5 w-3.5" />
        QUESTION
      </div>

      {/* Question text */}
      <div className="font-serif text-sm mt-1.5 mb-2">{clarification.question}</div>

      {/* Preset chip options */}
      {clarification.options.length > 0 && !disabled ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {clarification.options.map((opt) => (
            <Button
              key={opt}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => submit(opt)}
            >
              {opt}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Free-text reply input or answered indicator */}
      {!disabled ? (
        <div className="flex gap-2">
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(reply);
              }
            }}
            placeholder="…or type a reply"
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            onClick={() => submit(reply)}
            disabled={!reply.trim()}
          >
            Send
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground font-mono italic">
          answered
        </div>
      )}
    </div>
  );
}
