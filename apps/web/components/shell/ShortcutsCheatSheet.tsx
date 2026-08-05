"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SHORTCUTS,
  groupShortcuts,
  isTypingTarget,
  type ShortcutSection,
} from "@/lib/keyboard/shortcuts";

const SECTION_ORDER: ShortcutSection[] = ["Global", "Editing", "Tasks"];

export function ShortcutsCheatSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `?` opens the cheat sheet — but only if the user isn't typing.
      // Shift+/ produces "?" on US layouts; we check e.key directly so
      // alternate layouts still work where "?" is unshifted.
      if (e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = groupShortcuts(SHORTCUTS);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-[var(--edge)]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg text-[var(--ink)]">
              Keyboard shortcuts
            </DialogTitle>
            {/* The sheet's own shortcut key, so it renders as a literal kbd
                hint (the sanctioned slot) rather than a styled span. */}
 <kbd className="font-mono text-micro text-[var(--ink-muted)]">?</kbd>
          </div>
          <DialogDescription className="sr-only">
            All available keyboard shortcuts, grouped by context.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
          {SECTION_ORDER.map((section) => {
            const rows = grouped[section];
            if (rows.length === 0) return null;
            return (
              <section key={section}>
                <h3 className="text-micro font-medium text-[var(--ink-muted)] mb-2">
                  {section}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {rows.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <span className="text-sm text-[var(--ink)]">
                        {s.description}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, i) => (
                          <kbd
                            key={`${s.id}-${i}`}
 className="font-mono text-micro px-1.5 py-0.5 rounded border border-[var(--edge)] bg-[var(--surface)] text-[var(--ink)] min-w-[20px] text-center"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
