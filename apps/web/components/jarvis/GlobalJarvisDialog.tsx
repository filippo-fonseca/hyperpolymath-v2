"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiteJarvisComposer } from "@/components/jarvis/LiteJarvisComposer";

/**
 * GlobalJarvisDialog — Cmd/Ctrl+K opens a lite JARVIS composer dialog from any
 * (app) route EXCEPT /today, where JarvisConsole's focus path already owns
 * Cmd+K via the existing GlobalHotkeys focusJarvis() flow.
 *
 * On submit, we dispatch a `jarvis-voice-transcript` CustomEvent — the same
 * event JarvisListener fires for voice. On /today, JarvisConsole picks it up
 * and runs the full scrollback flow. Everywhere else (where this dialog
 * actually opens) GlobalJarvisHandler catches it and runs streamJarvis with
 * toast receipts — identical to how voice-on-any-page works today. No nav,
 * no sessionStorage hop, no duplicated pipeline. Stay-on-page UX.
 *
 * Coexistence with GlobalHotkeys (Quick 260607-g56):
 *   - On /today the dialog handler returns early so GlobalHotkeys → focusJarvis()
 *     wins.
 *   - Off /today we listen in capture phase + preventDefault + stopPropagation
 *     so GlobalHotkeys' no-op focusJarvis() does not also fire.
 *   - Cmd+Shift+K (CommandMenu) is untouched — different chord.
 */
export function GlobalJarvisDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return; // Cmd+Shift+K is reserved for CommandMenu.
      if (e.key !== "k" && e.key !== "K") return;
      // Suppress on /today — JARVIS Console focus owns Cmd+K there.
      if (pathname?.startsWith("/today")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [pathname]);

  function handleSubmit(text: string) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("jarvis-voice-transcript", {
        detail: { transcript: text },
      }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[640px] border-[var(--edge-hud)] bg-[var(--surface-raised)] p-0">
        <DialogTitle className="sr-only">JARVIS</DialogTitle>
        {prefersReducedMotion ? (
          <div className="p-4">
            <LiteJarvisComposer
              autoFocus
              placeholder="JARVIS — type and ⌘⏎ to send"
              onSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
              className="border-transparent bg-transparent shadow-none"
            />
          </div>
        ) : (
          <motion.div
            className="p-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          >
            <LiteJarvisComposer
              autoFocus
              placeholder="JARVIS — type and ⌘⏎ to send"
              onSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
              className="border-transparent bg-transparent shadow-none"
            />
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GlobalJarvisDialog;
