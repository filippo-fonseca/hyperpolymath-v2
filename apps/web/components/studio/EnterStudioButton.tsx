"use client";

/**
 * EnterStudioButton.tsx — The Studio · mode-toggle
 *
 * The Cmd+\ escape hatch that flips between the 2D "Page" (the existing LifeOS
 * UI) and the 3D "/studio", with a brief fade through Nightwalnut.
 *
 * This unit lives strictly at the DOM/shell level — it is NOT part of the R3F
 * Canvas (no `three` imports), so mounting it in the (app) shell layout keeps
 * the 2D bundle free of 3D bytes. It renders a small, tasteful corner
 * affordance in BOTH modes plus a single global `Cmd+\` listener.
 *
 * Cooperation with the existing keyboard system:
 *   - `GlobalHotkeys.tsx` (bubble-phase window listener) owns Cmd+K, Ctrl+1/2/3,
 *     Cmd+[ / Cmd+], and Ctrl+Alt quick-create. None of those bind "\", so there
 *     is no key collision — this listener is additive.
 *
 * The typing guard mirrors GlobalHotkeys.tsx (skip INPUT/TEXTAREA/SELECT/
 * contenteditable) and the listener is torn down on unmount.
 */

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STUDIO_PATH = "/studio";
const DEFAULT_PAGE_PATH = "/lifeos";
/** Remembers the 2D route to return to, so Studio → Page lands where you left. */
const LAST_PAGE_KEY = "studio:lastPageRoute";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!(
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

export function EnterStudioButton() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const reduceMotion = useReducedMotion();

  const inStudio =
    pathname === STUDIO_PATH || pathname.startsWith(STUDIO_PATH + "/");
  // No chrome during onboarding (matches AppShell's own suppression).
  const suppressed = pathname.startsWith("/onboarding");

  // Transition overlay state. `pendingDest` holds the route we're gliding to
  // while the cover fades in; it's a ref so the fade-in completion callback and
  // the pathname watcher can coordinate without extra renders.
  const [covering, setCovering] = useState(false);
  const pendingDest = useRef<string | null>(null);

  const navigate = useCallback(() => {
    let dest: string;
    if (inStudio) {
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(LAST_PAGE_KEY);
      } catch {
        // sessionStorage unavailable — fall back to the home route.
      }
      dest =
        stored && !stored.startsWith(STUDIO_PATH) ? stored : DEFAULT_PAGE_PATH;
    } else {
      try {
        sessionStorage.setItem(LAST_PAGE_KEY, pathname || DEFAULT_PAGE_PATH);
      } catch {
        // ignore — persistence is best-effort.
      }
      dest = STUDIO_PATH;
    }
    if (dest === pathname) return;

    // Reduced motion → instant cut (the (app) template fade is also 0ms then).
    if (reduceMotion) {
      router.push(dest);
      return;
    }

    pendingDest.current = dest;
    setCovering(true);
  }, [inStudio, pathname, reduceMotion, router]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        !(e.metaKey || e.ctrlKey) ||
        e.shiftKey ||
        e.altKey ||
        e.key !== "\\"
      ) {
        return;
      }
      if (suppressed) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      navigate();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, suppressed]);

  // Once the destination route is live under the cover, fade the cover away.
  useEffect(() => {
    if (covering && pendingDest.current && pathname === pendingDest.current) {
      pendingDest.current = null;
      setCovering(false);
    }
  }, [pathname, covering]);

  if (suppressed) return null;

  return (
    <>
      <button
        type="button"
        onClick={navigate}
        aria-label={
          inStudio
            ? "Return to the Page (Command Backslash)"
            : "Enter the Studio (Command Backslash)"
        }
        title={inStudio ? "Return to the Page" : "Enter the Studio"}
        className={cn(
          "fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
          "flex items-center gap-2 rounded-full px-3.5 py-1.5",
          "font-serif text-[13px] leading-none tracking-tight",
          "backdrop-blur-sm transition-colors duration-200",
          "shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
          inStudio
            ? "border border-[#C9A227]/30 bg-[#0E1420]/70 text-[#F2E9D8]/85 hover:bg-[#0E1420]/90 hover:text-[#F2E9D8]"
            : "border border-[var(--edge)] bg-[var(--surface-raised)]/85 text-[var(--ink-muted)] hover:text-[var(--ink)]"
        )}
      >
        <span>{inStudio ? "Return to the Page" : "Enter the Studio"}</span>
        <kbd
          style={{ fontFamily: "var(--font-jetbrains-mono, monospace)" }}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] leading-none",
            inStudio
              ? "bg-[#C9A227]/15 text-[#E8C46B]"
              : "bg-[var(--surface)] text-[var(--ink-muted)]"
          )}
        >
          ⌘\
        </kbd>
      </button>

      <AnimatePresence>
        {covering && (
          <motion.div
            key="enter-studio-cover"
            aria-hidden
            className="fixed inset-0 z-[60] bg-[#120E0B]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            onAnimationComplete={() => {
              // Fires when the fade-in reaches full cover — swap routes behind it.
              if (pendingDest.current) router.push(pendingDest.current);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default EnterStudioButton;
