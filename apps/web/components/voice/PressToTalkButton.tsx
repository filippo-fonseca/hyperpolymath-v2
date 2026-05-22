"use client";

import { useEffect, useState } from "react";
import { Radio, Square } from "lucide-react";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import { unlockAudioContext } from "@/lib/voice/audio-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MicState } from "@/lib/voice/types";
import { cn } from "@/lib/utils";

/**
 * Press-to-talk button — fallback for Cmd+Shift+J that ALSO doubles as the
 * global stop button. When the mic FSM is in any active state (recording,
 * thinking, speaking), the button shows a Stop glyph and a click fires
 * `jarvis-cancel` — aborts in-flight STT, kills /api/jarvis, stops TTS,
 * and resets the FSM to listening. Without this the user had no way to
 * abort a misheard wake-word activation or an unwanted command.
 *
 * The button also lights up automatically when the wake word fires
 * (mic-state-bus subscription) so it visibly reflects whatever activation
 * channel triggered JARVIS — manual click and "Hey Jarvis" feel the same.
 */
export function PressToTalkButton() {
  const { settings, mounted } = useVoiceSettings();
  const [state, setState] = useState<MicState>("idle");

  useEffect(() => subscribeToMicState(setState), []);

  if (!mounted || !settings.voiceEnabled) return null;

  const recording = state === "recording";
  const thinking = state === "thinking";
  const speaking = state === "speaking";
  const busy = recording || thinking || speaking;

  async function trigger() {
    if (busy) {
      // Active path: stop everything and return to listening.
      window.dispatchEvent(new CustomEvent("jarvis-cancel"));
      return;
    }
    // Idle path: this click IS a user gesture — unlock the shared
    // AudioContext so TTS playback can produce audio later. Safari (and
    // Chrome strict autoplay) require resume() inside a gesture.
    try {
      await unlockAudioContext();
    } catch (err) {
      console.warn("[press-to-talk] audio unlock failed", err);
    }
    window.dispatchEvent(new CustomEvent("jarvis-press-to-talk"));
  }

  const Icon = busy ? Square : Radio;
  const label = recording
    ? "Stop recording"
    : thinking
      ? "Stop JARVIS (thinking)"
      : speaking
        ? "Stop JARVIS (speaking)"
        : "Tap to talk (or Cmd+Shift+J)";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={trigger}
          aria-pressed={busy}
          aria-label={label}
          className={cn(
            "h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors duration-150 ease-out cursor-pointer-always",
            busy
              ? "border-[var(--hud-cyan)] text-[var(--hud-cyan)] bg-[var(--surface-raised)]"
              : "border-transparent hover:border-[var(--edge)]",
          )}
        >
          <Icon
            size={16}
            strokeWidth={1.5}
            className={busy && !speaking ? "jarvis-pulse" : ""}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
