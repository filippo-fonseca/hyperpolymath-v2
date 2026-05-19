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
 * Phase 6.1 Plan 02 (UI-SPEC §5a): clarification bridges agent (HUD chrome —
 * corner crops, hud-cyan-glow-soft ambient halo, mono 'clarify' label) and
 * document (serif body for the question text, amber-tinted chip options
 * matching doc-side intent semantics).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
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
        "relative rounded-sm px-4 py-3 my-1 overflow-hidden",
        disabled && "opacity-60",
      )}
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--edge-hud)",
        boxShadow: "0 0 24px var(--hud-cyan-glow-soft)",
      }}
    >
      {/* Phase 6.1 Plan 02 (UI-SPEC §5a): static 10px corner L-brackets frame
          the clarification surface as a JARVIS-side artifact. */}
      <HudCornerCrops
        size={10}
        className="absolute inset-0 pointer-events-none"
        breathing={false}
      />

      {/* Phase 6.1 Plan 02: 'clarify' chrome label in mono 11px uppercase
          tracking-wide --ink-muted (replaces the lucide HelpCircle +
          violet QUESTION label from Phase 5.1). */}
      <div className="relative font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] mb-2">
        clarify
      </div>

      {/* Question body — serif (content the user reads, not chrome) */}
      <p
        className="relative font-serif text-base"
        style={{ color: "var(--ink)" }}
      >
        {clarification.question}
      </p>

      {/* Preset chip options — amber-tinted (doc-side intent register) */}
      {clarification.options.length > 0 && !disabled ? (
        <div className="relative flex flex-wrap gap-2 mt-3">
          {clarification.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => submit(opt)}
              className="px-2 py-0.5 rounded-sm font-mono text-xs cursor-pointer-always transition-colors duration-100 ease-out hover:opacity-80"
              style={{
                backgroundColor: "rgb(217 119 6 / 0.16)",
                color: "var(--ink)",
              }}
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
        <div className="relative text-xs font-mono italic text-[var(--ink-muted)] mt-2">
          answered
        </div>
      )}
    </div>
  );
}
