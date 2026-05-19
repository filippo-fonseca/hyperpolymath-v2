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
 */
export function CommandMenu({ hashtags, projects }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Phase 6 Plan 06-03: Cmd+Shift+K opens the capture composer.
      // Plain Cmd+K is owned by GlobalHotkeys (JARVIS focus).
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
      <div className="font-serif italic text-base px-4 py-3 border-b border-border text-foreground">
        Capture a thought <span className="font-mono text-xs text-muted-foreground opacity-60">⌘⇧K</span>
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
