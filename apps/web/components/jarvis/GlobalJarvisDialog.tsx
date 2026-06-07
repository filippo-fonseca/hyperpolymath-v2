"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
 * On submit, the text is stashed in sessionStorage('jarvis-prefill') and we
 * navigate to /today; JarvisConsole's mount-time effect consumes the prefill
 * and fires it through the normal /api/jarvis pipeline. No new endpoint, no
 * duplicated streaming logic.
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
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
    try {
      sessionStorage.setItem("jarvis-prefill", text);
    } catch {
      // sessionStorage unavailable — fall through and navigate.
    }
    setOpen(false);
    router.push("/today");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[640px] border-[var(--edge-hud)] bg-[var(--surface-raised)] p-0">
        <DialogTitle className="sr-only">JARVIS</DialogTitle>
        <div className="p-4">
          <LiteJarvisComposer
            autoFocus
            placeholder="JARVIS — type and ⌘⏎ to send"
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
            className="border-transparent bg-transparent shadow-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GlobalJarvisDialog;
