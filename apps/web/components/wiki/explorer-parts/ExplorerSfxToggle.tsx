"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

export function ExplorerSfxToggle() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem("ui:sfx") !== "off");
    } catch {
      setEnabled(true);
    }
  }, []);

  function toggle() {
    setEnabled((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("ui:sfx", next ? "on" : "off");
      } catch {
        // Storage may be unavailable; the in-session toggle still communicates state.
      }
      return next;
    });
  }

  const label = enabled ? "Mute drag sounds" : "Enable drag sounds";
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={!enabled}
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-lg bg-[var(--sd-box)] text-[var(--sd-ink-dull)] transition-colors duration-[160ms] ease-out hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]"
          >
            {enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
