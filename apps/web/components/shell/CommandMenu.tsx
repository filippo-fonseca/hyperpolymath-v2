"use client";

import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandMenuDialog = dynamic(
  () => import("./CommandMenuDialog").then((m) => m.CommandMenuDialog),
  { ssr: false },
);

interface Props {
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
}

/**
 * Global Cmd+Shift+K command palette (issue #161).
 *
 * This module is mounted on every (app) route, so it deliberately holds
 * nothing but the key binding and the open flag. The palette body — the cmdk
 * dialog, the command list, and the full CaptureComposer with its hashtag,
 * project and @person pickers — is loaded on first open, because none of it
 * can be reached before then.
 *
 * Binding preserved per UI-SPEC §14: Cmd+Shift+K (plain Cmd+K focuses JARVIS).
 */
export function CommandMenu({ hashtags, projects }: Props) {
  const [open, setOpen] = useState(false);
  // Latches on first open so the palette stays mounted afterwards, keeping its
  // close transition and avoiding a remount on every invocation.
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setEverOpened(true);
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!everOpened) return null;

  return (
    <CommandMenuDialog
      open={open}
      onOpenChange={setOpen}
      hashtags={hashtags}
      projects={projects}
    />
  );
}
