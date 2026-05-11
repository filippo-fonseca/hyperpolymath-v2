"use client";

import { useState, useEffect } from "react";
import { CommandDialog } from "@/components/ui/command";
import { CaptureComposerStub } from "./CaptureComposerStub";

export function CommandMenu() {
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
      {/* Cmd+K modal — stub composer in Phase 2; Phase 5 Kiwi replaces content */}
      <div className="font-serif italic text-base px-4 py-3 border-b border-border text-foreground">
        Capture a thought
      </div>
      <CaptureComposerStub onSubmit={() => setOpen(false)} />
    </CommandDialog>
  );
}
