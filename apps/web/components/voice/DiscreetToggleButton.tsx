"use client";

import { MicOff, Mic } from "lucide-react";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Phase 7 Plan 07-03 — Discreet mode toggle button in the header.
 *
 * Lives OUTSIDE .agent-mode-scope per D-01 (diplomatic chrome, not agent surface).
 * Only renders when voice is enabled — no icon leaks when voice is off.
 *
 * Discreet mode (VOICE-07):
 *   - Silences TTS (no spoken receipts)
 *   - Disables wake-word (Porcupine suspended)
 *   - Text Console remains fully functional
 *   - Cmd+Shift+J press-to-talk still works (VOICE-09 / CRITICAL_PHASE7_CONCERNS #10)
 *
 * The Tooltip provider is inherited from PersistentNav's TooltipProvider wrapper.
 */
export function DiscreetToggleButton() {
  const { settings, mounted, update } = useVoiceSettings();

  // Render nothing before mount (SSR safety) or when voice is disabled.
  if (!mounted || !settings.voiceEnabled) return null;

  const discreet = settings.discreetMode;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            // eslint-disable-next-line no-console
            console.log(
              "[discreet-toggle] click — current:",
              discreet,
              "→ next:",
              !discreet,
            );
            update({ discreetMode: !discreet });
          }}
          aria-pressed={discreet}
          aria-label={discreet ? "Exit Discreet mode" : "Enter Discreet mode"}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-transparent hover:border-[var(--edge)] transition-colors duration-150 ease-out cursor-pointer-always"
        >
          {discreet ? (
            <MicOff size={16} strokeWidth={1.5} />
          ) : (
            <Mic size={16} strokeWidth={1.5} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {discreet
          ? "Discreet mode on — voice silenced"
          : "Active — tap to silence voice"}
      </TooltipContent>
    </Tooltip>
  );
}
