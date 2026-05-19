"use client";

import { useState, useEffect } from "react";
import { CommandDialog } from "@/components/ui/command";
import { CommandMenuContent } from "./CommandMenuContent";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";

interface Props {
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
}

/**
 * Global Cmd+Shift+K command menu — capture composer (D-09).
 *
 * The modal contents are intentionally extracted to `CommandMenuContent` so that
 * Phase 5 could replace just that file with the JARVIS agent UI without touching
 * the trigger / dialog wrapper (Warning 12 fix — Phase 5 seam preserved).
 *
 * Phase 6 Plan 06-03 (AES-05, D-02): trigger rebound from Cmd+K to Cmd+Shift+K
 * so that Cmd+K is free to focus the JARVIS Console input via GlobalHotkeys.
 * The hint copy in this dialog is updated accordingly.
 *
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5f + §9e + §12c + §14 carry-forward):
 *
 * Cmd+Shift+K binding is PRESERVED per UI-SPEC §14 carry-forward — only the
 * visual chrome restyles here. Dialog primitive (touched in Task 2 of this
 * plan) provides:
 *   - --surface-raised bg + 1px --edge border + 10px HudCornerCrops
 *   - plain backdrop-blur-md (8px) — NOT iOS Liquid Glass refraction
 *   - scale 0.95→1 + fade-in 200ms enter; 150ms exit
 *
 * Header is mono chrome (header copy + ⌘⇧K hint) per UI-SPEC §5f "mono
 * chrome, serif body". The "Capture a thought" line keeps serif italic
 * because it's a writing prompt to the user (document register), but the
 * surrounding chrome (border, hint chip) is mono.
 */
export function CommandMenu({ hashtags, projects }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Phase 6 Plan 06-03: Cmd+Shift+K opens the capture composer.
      // Plain Cmd+K is owned by GlobalHotkeys (JARVIS focus).
      // UI-SPEC §14 — this binding mechanism MUST NOT change.
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--edge)]">
        {/* Serif italic prompt — bridge to document register per UI-SPEC §5f
            (the prompt is asking the user to write, which is content). */}
        <span className="font-serif italic text-base text-[var(--ink)]">
          Capture a thought
        </span>
        {/* UI-SPEC §9e ⌘⇧K hint chip — mono 11px uppercase, --ink-muted.
            Non-interactive, purely visual. */}
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          ⌘⇧K
        </span>
      </div>
      <div className="p-4">
        <CommandMenuContent
          hashtags={hashtags}
          projects={projects}
          onSubmitSuccess={() => setOpen(false)}
        />
      </div>
    </CommandDialog>
  );
}
