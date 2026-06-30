"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LiteJarvisComposer } from "@/components/jarvis/LiteJarvisComposer";
import { capResults, SearchDropdown } from "@/components/search/SearchDropdown";
import { flattenResults } from "@/components/search/SearchResults";
import { useSearch } from "@/components/search/SearchProvider";
import type { SearchEntry } from "@/lib/search";

/**
 * GlobalJarvisDialog — Cmd/Ctrl+K opens a lite JARVIS composer dialog from any
 * (app) route EXCEPT /today. Beyond sending to JARVIS (⌘⏎), typing now also
 * surfaces a non-blocking live search dropdown: pick a result to navigate, or
 * ignore it and send to JARVIS exactly as before. The Jarvis send path is
 * untouched — search is purely additive (see LiteJarvisComposer interceptor).
 */
export function GlobalJarvisDialog() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const { setQuery, results, term, clear } = useSearch();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef(new Map<number, HTMLButtonElement | null>());

  const capped = useMemo(() => capResults(results), [results]);
  const flat = useMemo(() => flattenResults(capped, "all"), [capped]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return; // Cmd+Shift+K is reserved for CommandMenu.
      if (e.key !== "k" && e.key !== "K") return;
      if (pathname?.startsWith("/today")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [pathname]);

  // Reset transient state when the dialog closes.
  useEffect(() => {
    if (!open) {
      clear();
      setFocusedIndex(-1);
    }
  }, [open, clear]);

  // Focus moves invalidate when the result set changes.
  useEffect(() => {
    setFocusedIndex(-1);
  }, [term]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      setOpen(false);
      router.push(entry.href);
    },
    [router]
  );

  const registerItemRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    itemRefs.current.set(index, el);
  }, []);

  function handleSubmit(text: string) {
    setOpen(false);
    try {
      sessionStorage.setItem("jarvis-prefill", text);
    } catch {
      // sessionStorage unavailable (private browsing)
    }
    router.push("/today");
  }

  // Pre-handler the composer consults before its own key logic. Returns true
  // when we've claimed the event for the dropdown.
  const interceptor = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const hasResults = flat.length > 0;
      if (e.key === "ArrowDown" && hasResults) {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, flat.length - 1));
        return true;
      }
      if (e.key === "ArrowUp" && hasResults) {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, -1));
        return true;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        if (focusedIndex >= 0 && flat[focusedIndex]) {
          e.preventDefault();
          navigate(flat[focusedIndex]);
          return true;
        }
        // No item focused → fall through (newline / no-op), JARVIS send is ⌘⏎.
        return false;
      }
      if (e.key === "Escape") {
        // First Escape closes the dropdown; second closes the overlay.
        if (hasResults || focusedIndex >= 0) {
          e.preventDefault();
          clear();
          setFocusedIndex(-1);
          return true;
        }
        return false;
      }
      return false;
    },
    [flat, focusedIndex, navigate, clear]
  );

  const composer = (
    <LiteJarvisComposer
      autoFocus
      placeholder="Type a message or search…"
      onSubmit={handleSubmit}
      onCancel={() => setOpen(false)}
      onValueChange={setQuery}
      keyboardInterceptor={interceptor}
      className="border-transparent bg-transparent shadow-none"
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[640px] overflow-visible border-[var(--edge-hud)] bg-[var(--surface-raised)] p-0">
        <DialogTitle className="sr-only">JARVIS</DialogTitle>
        {prefersReducedMotion ? (
          <div className="relative p-4">
            {composer}
            <SearchDropdown
              results={capped}
              query={term}
              focusedIndex={focusedIndex}
              onSelect={navigate}
              registerItemRef={registerItemRef}
            />
          </div>
        ) : (
          <motion.div
            className="relative p-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          >
            {composer}
            <SearchDropdown
              results={capped}
              query={term}
              focusedIndex={focusedIndex}
              onSelect={navigate}
              registerItemRef={registerItemRef}
            />
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GlobalJarvisDialog;
