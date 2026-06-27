"use client";

import { CaptureComposer } from "@/components/captures/CaptureComposer";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import { useEffect, useState } from "react";
import { CommandMenuContent } from "./CommandMenuContent";

interface Props {
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
}

/**
 * Global Cmd+Shift+K command palette (issue #161).
 *
 * Browse mode: a cmdk-filtered command list (CommandMenuContent) — type to
 * smart-search create actions (page/task/qc/event) or capture free text inline.
 * Compose mode: the full /captures CaptureComposer (hashtag + project + @person
 * support), entered via the "New quick capture" command.
 *
 * Binding preserved per UI-SPEC §14: Cmd+Shift+K (plain Cmd+K focuses JARVIS).
 */
export function CommandMenu({ hashtags, projects }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset to a clean browse state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setCompose(false);
    }
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {compose ? (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-serif italic text-base text-[var(--ink)]">Capture a thought</span>
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
              onSubmitSuccess={() => setOpen(false)}
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
            onRun={() => setOpen(false)}
            onCompose={() => setCompose(true)}
          />
        </>
      )}
    </CommandDialog>
  );
}
