"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
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
 * Fallback for Cmd+Shift+J — fires the same PRESS_TO_TALK action via a
 * custom event so users on Safari (or any focus context that swallows the
 * keystroke) can trigger recording with a click.
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
    // This click IS a user gesture — perfect time to unlock the shared
    // AudioContext so TTS playback can produce audio later. Safari (and
    // Chrome strict autoplay) require resume() inside a gesture.
    try {
      await unlockAudioContext();
    } catch (err) {
      console.warn("[press-to-talk] audio unlock failed", err);
    }
    window.dispatchEvent(new CustomEvent("jarvis-press-to-talk"));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={trigger}
          aria-pressed={recording}
          aria-label="Talk to JARVIS"
          className={cn(
            "h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors duration-150 ease-out cursor-pointer-always",
            recording
              ? "border-[var(--hud-cyan)] text-[var(--hud-cyan)] bg-[var(--surface-raised)]"
              : "border-transparent hover:border-[var(--edge)]",
            busy && !recording && "opacity-60",
          )}
        >
          <Radio size={16} strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {recording
          ? "Recording…"
          : thinking
            ? "Thinking…"
            : speaking
              ? "Speaking…"
              : "Tap to talk (or Cmd+Shift+J)"}
      </TooltipContent>
    </Tooltip>
  );
}
