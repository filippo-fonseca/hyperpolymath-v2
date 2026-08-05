"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AUDITION_VOICES, AUDITION_LINE } from "@/lib/voice/audition-voices";

/**
 * Phase 7 Plan 07-02 — Voice ID picker for Settings → Voice.
 *
 * Radio group of British voices with a "Play" button per option.
 * Audition samples are fetched from /api/jarvis/tts (HTTP, NOT WebSocket —
 * one-shot samples don't need streaming) and played through a transient
 * AudioContext per-sample.
 *
 * Disabled when voice is not enabled (voiceEnabled=false in settings).
 */

interface Props {
  /** Currently selected ElevenLabs voice ID. */
  value: string;
  /** Called when the user selects a different voice. */
  onChange: (voiceId: string) => void;
  /** Disable entire picker when voice is not enabled. */
  disabled?: boolean;
}

export function VoiceIdPicker({ value, onChange, disabled }: Props) {
  const [auditioning, setAuditioning] = useState<string | null>(null);

  async function handlePlay(voiceId: string) {
    if (auditioning || disabled) return;
    setAuditioning(voiceId);
    try {
      const res = await fetch("/api/jarvis/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: AUDITION_LINE, voiceId }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const buf = await res.arrayBuffer();
      // Transient AudioContext — safe to create here because the user clicked
      // a button (user-gesture context, no autoplay restriction).
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => {
        ctx.close();
        setAuditioning(null);
      };
    } catch (err) {
      console.error("[voice] VoiceIdPicker audition failed", err);
      setAuditioning(null);
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="sr-only">Voice</legend>
      {AUDITION_VOICES.map((v) => {
        const isSelected = value === v.id;
        const isPlaying = auditioning === v.id;
        return (
          <div
            key={v.id}
            className={cn(
 "flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors duration-150 ease-out",
              isSelected
                ? "border-[var(--sd-accent)] bg-[var(--sd-hover)]"
                : "border-[var(--sd-line)] bg-[var(--sd-box)] hover:border-[var(--sd-accent)]",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
              <input
                type="radio"
                name="voice-id"
                value={v.id}
                checked={isSelected}
                onChange={() => onChange(v.id)}
                disabled={disabled}
                className="sr-only"
              />
              <span
                className={cn(
 "h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors duration-150",
                  isSelected
                    ? "border-[var(--sd-accent)] bg-[var(--sd-accent)]"
                    : "border-[var(--sd-accent)] bg-transparent",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="font-semibold text-meta text-[var(--sd-ink)]">
                  {v.name}
                </span>
                <span className="text-meta text-[var(--sd-ink-dull)] ml-2">
                  {v.desc}
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handlePlay(v.id)}
              disabled={disabled || auditioning !== null}
              className={cn(
 "craft-chip shrink-0 cursor-pointer-always",
 "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {isPlaying ? "Playing…" : "Play"}
            </button>
          </div>
        );
      })}
    </fieldset>
  );
}
