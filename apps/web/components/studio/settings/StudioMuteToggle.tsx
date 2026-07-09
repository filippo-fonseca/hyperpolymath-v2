"use client";

/**
 * StudioMuteToggle — the HUD affordance that mutes / unmutes the studio's
 * synthesized sound cues.
 *
 * A quiet 36px glass button in the top-right stack, directly below the
 * active-row toggle (same z-30 layer, below the focus overlay's z-40 scrim). It
 * is the SOLE writer of the `audio-settings` store; the audio hook subscribes
 * there and forwards the value to the engine, so this button never touches Web
 * Audio directly. Always rendered — there is always something to mute.
 *
 * Purely a DOM control: no render-loop work, so demand-frame cannot regress.
 */

import { Volume2, VolumeX } from "lucide-react";

import { toggleMuted, useMuted } from "@/lib/studio/state/audio-settings";

export function StudioMuteToggle(): React.ReactElement {
  const muted = useMuted();

  return (
    <div className="pointer-events-none absolute right-6 top-[7.25rem] z-30">
      <button
        type="button"
        data-studio-mute="toggle"
        aria-label="Toggle studio sound"
        aria-pressed={!muted}
        onClick={() => toggleMuted()}
        className="cursor-pointer-always pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 text-[#8FA8C7] shadow-[0_16px_48px_rgba(0,0,0,0.5)] transition-colors duration-100 hover:text-[#F2E9D8] aria-pressed:text-[#F2E9D8]"
      >
        {muted ? (
          <VolumeX size={17} strokeWidth={1.75} aria-hidden />
        ) : (
          <Volume2 size={17} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}

export default StudioMuteToggle;
