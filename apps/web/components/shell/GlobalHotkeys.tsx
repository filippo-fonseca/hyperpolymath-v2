"use client";

import { createPage } from "@/app/actions/pages";
import { focusJarvis } from "@/lib/jarvis/focus";
import { readSplitScreen } from "@/lib/ui/useSplitScreen";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useNavHistory } from "./NavHistoryProvider";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const TAB_STORAGE_KEY = "top-tab-last-route";
const TODAY_ROUTE_KEY = "top-tab-today-route";

/**
 * Phase 6 Plan 06-03: global Cmd+K listener (AES-05, D-02, UI-SPEC §11c).
 *
 * Cmd/Ctrl+K → focus JARVIS (existing behavior).
 *
 * Ctrl+1 / Ctrl+2 → switch left/right tab (new). Ctrl-only on purpose so the
 * shortcut is consistent across macOS and the rest of OSes; on macOS Cmd+1/2
 * is reserved by browsers for tab switching, which we don't want to fight.
 * Both no-op while split-screen is on (both panes are already visible).
 */
export function GlobalHotkeys() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { goBack, goForward } = useNavHistory();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd/Ctrl+K → JARVIS focus.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        focusJarvis();
        return;
      }

      // Ctrl+Alt+<key> → quick-create shortcuts (issue #161). Ctrl+Alt is used
      // (not Cmd) because Cmd+letter combos are claimed by macOS browsers; the
      // Ctrl+Alt space is effectively free. e.code is read so it survives the
      // Option-modified character macOS produces. Skipped while typing.
      if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
        const create: Record<string, string | (() => void)> = {
          KeyC: "/captures",
          KeyT: "/tasks?create=now",
          KeyE: "/calendar?create=now",
          KeyP: () => {
            void (async () => {
              const r = await createPage({ id: crypto.randomUUID(), title: "", content: "" });
              if (r.success) router.push(`/wiki/${r.data.id}`);
            })();
          },
        };
        const action = create[e.code];
        if (action) {
          e.preventDefault();
          if (typeof action === "string") router.push(action);
          else action();
          return;
        }
      }

      // Cmd/Ctrl+[ → back · Cmd/Ctrl+] → forward (browser-style). Global on
      // every screen. goBack/goForward are no-ops at the history bounds, so
      // back from the first screen / forward with no branch does nothing.
      // Skip Alt/Shift so we don't fight native combos.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === "[" || e.key === "]")
      ) {
        e.preventDefault();
        if (e.key === "[") goBack();
        else goForward();
        return;
      }

      // Ctrl+1 / Ctrl+2 / Ctrl+3 → tab swap. Not Cmd — browsers claim Cmd+digit
      // on Mac. Skip Alt and Shift to avoid hijacking native browser combos.
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key !== "1" && e.key !== "2" && e.key !== "3") return;

      // Skip when typing — let inputs see the digit.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // No-op while split-screen is on (both routes are visible).
      if (readSplitScreen()) return;

      e.preventDefault();
      if (e.key === "3") {
        // Pinned Today tab — only acts when a daily page exists for today.
        try {
          const todayRoute = localStorage.getItem(TODAY_ROUTE_KEY);
          if (todayRoute && todayRoute !== pathname) router.push(todayRoute);
        } catch {
          // ignore
        }
      } else if (e.key === "2") {
        router.push(JARVIS_PATH);
      } else {
        let dest: string = FALLBACK_LEFT_PATH;
        try {
          const stored = localStorage.getItem(TAB_STORAGE_KEY);
          if (stored && stored !== JARVIS_PATH) dest = stored;
        } catch {
          // ignore
        }
        if (dest === pathname) return;
        router.push(dest);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pathname, router, goBack, goForward]);

  return null;
}
