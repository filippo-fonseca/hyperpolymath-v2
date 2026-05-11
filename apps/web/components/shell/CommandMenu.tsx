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
 * Global Cmd+K command menu (D-09).
 *
 * The modal contents are intentionally extracted to `CommandMenuContent` so that
 * Phase 5 can replace just that file with the Kiwi agent UI without touching the
 * trigger / dialog wrapper (Warning 12 fix — Phase 5 seam preserved).
 */
export function CommandMenu({ hashtags, projects }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
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
        Capture a thought
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
