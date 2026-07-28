"use client";

import { CaptureComposer } from "@/components/captures/CaptureComposer";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import { useEffect, useState } from "react";
import { CommandMenuContent } from "./CommandMenuContent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
}

/**
 * The palette itself, split out of CommandMenu so it can be loaded on first
 * open rather than on every page. It carries the cmdk dialog, the command list
 * and the full CaptureComposer (hashtag + project + @person pickers), none of
 * which is reachable until the user presses Cmd+Shift+K.
 *
 * Browse mode: a cmdk-filtered command list (CommandMenuContent) — type to
 * smart-search create actions (page/task/qc/event) or capture free text inline.
 * Compose mode: the full /captures CaptureComposer, entered via the
 * "New quick capture" command.
 */
export function CommandMenuDialog({ open, onOpenChange, hashtags, projects }: Props) {
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState(false);

  // Reset to a clean browse state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setCompose(false);
    }
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {compose ? (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-base text-[var(--ink)]">Capture a thought</span>
            <button
              type="button"
              onClick={() => setCompose(false)}
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always"
            >
              ← Commands
            </button>
          </div>
          <div className="rounded-sm border border-transparent focus-within:border-[var(--hud-cyan)] transition-colors duration-150 ease-out p-2">
            <CaptureComposer
              hashtags={hashtags}
              projects={projects}
              onSubmitSuccess={() => onOpenChange(false)}
              autoFocus
            />
          </div>
        </div>
      ) : (
        <>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command, or write a capture…"
          />
          <CommandMenuContent
            search={search}
            onRun={() => onOpenChange(false)}
            onCompose={() => setCompose(true)}
          />
        </>
      )}
    </CommandDialog>
  );
}
