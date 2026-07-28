"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const GlobalJarvisDialogBody = dynamic(
  () => import("./GlobalJarvisDialogBody").then((m) => m.GlobalJarvisDialogBody),
  { ssr: false },
);

/**
 * GlobalJarvisDialog — Cmd/Ctrl+K opens a lite JARVIS composer dialog from any
 * (app) route EXCEPT /today.
 *
 * This module is mounted on every (app) route, so it holds nothing but the key
 * binding and the open flag. The dialog body — the lite composer, the search
 * dropdown, the quick-create action list and the motion wrapper — loads on
 * first open, because none of it can be reached before then.
 */
export function GlobalJarvisDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Latches on first open so the dialog stays mounted afterwards, preserving
  // its close transition and its focus handoff back to the page.
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return; // Cmd+Shift+K is reserved for CommandMenu.
      if (e.key !== "k" && e.key !== "K") return;
      if (pathname?.startsWith("/today")) return;
      e.preventDefault();
      e.stopPropagation();
      setEverOpened(true);
      setOpen(true);
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [pathname]);

  if (!everOpened) return null;

  return <GlobalJarvisDialogBody open={open} onOpenChange={setOpen} />;
}

export default GlobalJarvisDialog;
