"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * NavHistoryProvider — an in-memory browser-style history stack for the app
 * shell, powering the Back (⌘[) / Forward (⌘]) chrome controls.
 *
 * Why a custom stack? Next's App Router `router.back()` / `router.forward()`
 * drive the *browser* history (soft navigation — client component + realtime +
 * TanStack Query state all survive, no full reload). But the browser never
 * exposes whether forward history exists, so we can't grey-out the Forward
 * control from it alone. We mirror the in-app navigation order here so we can
 * reason about `canGoBack` / `canGoForward`.
 *
 * Model: a `stack` of pathnames plus an `index` pointing at the current entry.
 *   - Navigating to a NEW route (user clicked a link / pushed a route) appends
 *     after the current index and truncates any forward entries — exactly like
 *     a browser opening a new branch clears the forward history.
 *   - `goBack()` / `goForward()` move the index and call the matching
 *     `router.back()` / `router.forward()` so the browser history pointer stays
 *     aligned with ours (keeping native gestures / mouse buttons consistent).
 *
 * We distinguish "moved via our own back/forward" from "navigated somewhere
 * new" by comparing the incoming pathname against the neighbours of the current
 * index. If it matches the previous entry we treat it as a back step; the next
 * entry, a forward step; otherwise it's a new branch.
 */

interface NavHistoryValue {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

const NavHistoryContext = createContext<NavHistoryValue | null>(null);

export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  // The history stack of pathnames and the index of the current entry.
  // Seeded lazily on first pathname observation (see effect below).
  const [stack, setStack] = useState<string[]>(() =>
    pathname ? [pathname] : []
  );
  const [index, setIndex] = useState(0);

  // Mutable mirrors so the keydown handler / callbacks read fresh values
  // without re-subscribing the window listener on every navigation.
  const stackRef = useRef(stack);
  const indexRef = useRef(index);
  stackRef.current = stack;
  indexRef.current = index;

  // When WE drive navigation via goBack/goForward we still get a pathname
  // change from usePathname(). This flag tells the observer effect to only
  // move the index (not branch), since the router call already handled the
  // browser-history side.
  const pendingMove = useRef<null | "back" | "forward">(null);

  useEffect(() => {
    if (!pathname) return;

    const curStack = stackRef.current;
    const curIndex = indexRef.current;

    // First real observation — seed the stack.
    if (curStack.length === 0) {
      setStack([pathname]);
      setIndex(0);
      return;
    }

    // No-op if the pathname didn't actually change (re-render with same route).
    if (curStack[curIndex] === pathname) return;

    // A move we initiated through goBack/goForward: just realign the index.
    if (pendingMove.current === "back") {
      pendingMove.current = null;
      if (curIndex > 0 && curStack[curIndex - 1] === pathname) {
        setIndex(curIndex - 1);
        return;
      }
    } else if (pendingMove.current === "forward") {
      pendingMove.current = null;
      if (
        curIndex < curStack.length - 1 &&
        curStack[curIndex + 1] === pathname
      ) {
        setIndex(curIndex + 1);
        return;
      }
    }

    // A native back/forward (browser button, swipe, mouse side-button) lands
    // on an adjacent entry — follow it without mutating the stack.
    if (curIndex > 0 && curStack[curIndex - 1] === pathname) {
      setIndex(curIndex - 1);
      return;
    }
    if (
      curIndex < curStack.length - 1 &&
      curStack[curIndex + 1] === pathname
    ) {
      setIndex(curIndex + 1);
      return;
    }

    // Otherwise it's a NEW branch: truncate forward entries and append.
    const nextStack = curStack.slice(0, curIndex + 1);
    nextStack.push(pathname);
    setStack(nextStack);
    setIndex(nextStack.length - 1);
  }, [pathname]);

  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return;
    pendingMove.current = "back";
    router.back();
  }, [router]);

  const goForward = useCallback(() => {
    if (indexRef.current >= stackRef.current.length - 1) return;
    pendingMove.current = "forward";
    router.forward();
  }, [router]);

  const value = useMemo<NavHistoryValue>(
    () => ({
      canGoBack: index > 0,
      canGoForward: index < stack.length - 1,
      goBack,
      goForward,
    }),
    [index, stack.length, goBack, goForward]
  );

  return (
    <NavHistoryContext.Provider value={value}>
      {children}
    </NavHistoryContext.Provider>
  );
}

/**
 * useNavHistory — read the nav stack state + controls. Must be used under a
 * NavHistoryProvider; throws otherwise so misuse surfaces immediately.
 */
export function useNavHistory(): NavHistoryValue {
  const ctx = useContext(NavHistoryContext);
  if (!ctx) {
    throw new Error("useNavHistory must be used within a NavHistoryProvider");
  }
  return ctx;
}
