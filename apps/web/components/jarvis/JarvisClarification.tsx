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
 *
 * sd (Spacedrive) register: a solid --sd-darker-box plate with a hairline
 * border and the craft --shadow-card lift so it reads as its own raised card
 * inside the turn — NO backdrop-blur, NO glow. A cyan mono 'clarify' readout
 * marks it as JARVIS chrome; the question reads in Space Grotesk; chip options
 * and reply field speak the single cyan accent.
 */

import { useState } from "react";
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
      style={{ background: "var(--sd-darker-box)" }}
      className={cn(
        "relative rounded-xl border border-[var(--sd-line)] px-4 py-3 my-1 overflow-hidden shadow-[var(--shadow-card)] transition-colors duration-[140ms] ease-out",
        disabled && "opacity-60",
      )}
    >
      {/* 'clarify' chrome readout — cyan mono, marks the surface as a JARVIS
          artifact without any glow or bracket theatrics. */}
      <div className="relative font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-accent)] mb-2">
        clarify
      </div>

      {/* Question body — Space Grotesk (no serif outside Logotype). */}
      <p className="relative text-[15px] leading-[1.5] text-[var(--sd-ink)]">
        {clarification.question}
      </p>

      {/* Preset chip options — single cyan accent tint. */}
      {clarification.options.length > 0 && !disabled ? (
        <div className="relative flex flex-wrap gap-2 mt-3">
          {clarification.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => submit(opt)}
              style={{
                background: "color-mix(in oklch, var(--sd-accent) 14%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 30%, transparent)",
              }}
              className="px-2 py-0.5 rounded-[6px] font-mono text-xs text-[var(--sd-accent)] cursor-pointer-always transition-colors duration-[140ms] ease-out hover:bg-[color-mix(in_oklch,var(--sd-accent)_22%,transparent)]"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}

      {/* Free-text reply input or answered indicator */}
      {!disabled ? (
        <div className="relative flex gap-2 mt-3">
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
        <div className="relative text-xs font-mono italic text-[var(--sd-ink-faint)] mt-2">
          answered
        </div>
      )}
    </div>
  );
}
