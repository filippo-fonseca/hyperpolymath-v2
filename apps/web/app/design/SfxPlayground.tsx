"use client";

/**
 * /design SFX specimen — live buttons for the space-console core pack.
 *
 * Imports the shipped `sfx` facade directly (`lib/ui/sfx`), so the cue list and
 * every cue's sound stay bound to the implementation. Cues are silent until the
 * shared AudioContext is unlocked by a gesture; the button click IS that
 * gesture, so a first tap may warm the context and the second plays.
 */

import { useState } from "react";
import { sfx, cueDurationMs, type CueName } from "@/lib/ui/sfx";

const CUE_CAPTIONS: Record<CueName, string> = {
  sidebarCollapse: "descending fifth",
  sidebarExpand: "ascending fifth",
  viewToggle: "octave blip",
  taskComplete: "third → fifth reward",
  captureSent: "step up a fourth",
  habitCheck: "two ticks",
  dialogOpen: "whole-tone rise",
  error: "low detuned second",
};

export function SfxPlayground() {
  const [enabled, setEnabled] = useState(() => sfx.enabled);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2.5">
        {sfx.cues.map((cue) => (
          <button
            key={cue}
            type="button"
            onClick={() => sfx.play(cue)}
            className="flex flex-col items-start gap-1 rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--sd-hover)]"
          >
            <span className="text-[13px] font-medium text-[var(--sd-ink)]">{cue}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
              {cueDurationMs(cue)}ms · {CUE_CAPTIONS[cue]}
            </span>
          </button>
        ))}
      </div>
      <label className="flex w-fit items-center gap-2 text-[12px] text-[var(--sd-ink-dull)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            sfx.setEnabled(e.target.checked);
            setEnabled(e.target.checked);
          }}
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
          ui:sfx core pack {enabled ? "on" : "off"}
        </span>
      </label>
    </div>
  );
}
