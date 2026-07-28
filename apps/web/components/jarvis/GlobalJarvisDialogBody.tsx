"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  LiteJarvisComposer,
  type ComposerKeyEvent,
} from "@/components/jarvis/LiteJarvisComposer";
import { capResults, SearchDropdown } from "@/components/search/SearchDropdown";
import { flattenResults } from "@/components/search/SearchResults";
import { useSearch } from "@/components/search/SearchProvider";
import {
  useQuickCreateActions,
  type QuickCreateAction,
} from "@/components/shell/useQuickCreateActions";
import { registerJarvisDialogClose } from "@/lib/jarvis/focus";
import { cn } from "@/lib/utils";
import type { SearchEntry } from "@/lib/search";

/**
 * The dialog itself, split out of GlobalJarvisDialog so it loads on first open
 * rather than on every (app) route. It carries the lite composer, the search
 * dropdown and the quick-create action list, none of which is reachable before
 * the user presses Cmd/Ctrl+K.
 *
 * Cmd/Ctrl+K opens a lite JARVIS composer dialog from any
 * (app) route EXCEPT /today. It is three things at once, all under one focus
 * model: send to JARVIS (⌘⏎), run a quick-create ACTION (new page/task/capture/
 * event), or open a live search RESULT. Actions render first, results below;
 * Arrow keys walk the combined list and Enter runs whichever is focused. The
 * JARVIS send path (⌘⏎) is untouched — actions + search are purely additive.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalJarvisDialogBody({ open, onOpenChange }: Props) {

  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const { setQuery, results, term, clear } = useSearch();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef(new Map<number, HTMLButtonElement | null>());

  const capped = useMemo(() => capResults(results), [results]);
  const flat = useMemo(() => flattenResults(capped, "all"), [capped]);

  // No composer mode here, so the core "New capture" action navigates to
  // /captures (the shared hook handles that when onCompose is omitted).
  const { actions, captureText } = useQuickCreateActions();

  // Which actions to surface: every core action when the field is empty (Cmd+K
  // is then a full command palette), or keyword-filtered ones plus a contextual
  // "Capture '<text>'" action once the user types.
  const visibleActions = useMemo<QuickCreateAction[]>(() => {
    const trimmed = term.trim();
    if (!trimmed) return actions;
    const needle = trimmed.toLowerCase();
    const matched = actions.filter((a) => {
      const haystack = `${a.label} ${a.keywords.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
    const ct = captureText(trimmed);
    return ct ? [...matched, ct] : matched;
  }, [term, actions, captureText]);

  const combinedLength = visibleActions.length + flat.length;

  // Reset transient state when the dialog closes.
  useEffect(() => {
    if (!open) {
      clear();
      setFocusedIndex(-1);
    }
  }, [open, clear]);

  // Expose a closer to GlobalHotkeys while open so its quick-create shortcuts
  // dismiss this dialog (matching the Arrow+Enter path). Only registered when
  // open, so closed-dialog shortcuts stay unaffected.
  useEffect(() => {
    if (!open) return;
    registerJarvisDialogClose(() => onOpenChange(false));
    return () => registerJarvisDialogClose(null);
  }, [open]);

  // Focus moves invalidate when the typed term changes.
  useEffect(() => {
    setFocusedIndex(-1);
  }, [term]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      onOpenChange(false);
      router.push(entry.href);
    },
    [router]
  );

  const runAction = useCallback((action: QuickCreateAction) => {
    onOpenChange(false);
    void action.run();
  }, []);

  const registerItemRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    itemRefs.current.set(index, el);
  }, []);

  function handleSubmit(text: string) {
    onOpenChange(false);
    try {
      sessionStorage.setItem("jarvis-prefill", text);
    } catch {
      // sessionStorage unavailable (private browsing)
    }
    router.push("/today");
  }

  // Pre-handler the composer consults before its own key logic. Returns true
  // when we've claimed the event for the actions/results list.
  const interceptor = useCallback(
    (e: ComposerKeyEvent): boolean => {
      const hasItems = combinedLength > 0;
      if (e.key === "ArrowDown" && hasItems) {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, combinedLength - 1));
        return true;
      }
      if (e.key === "ArrowUp" && hasItems) {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, -1));
        return true;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        if (focusedIndex >= 0) {
          // Indices 0..visibleActions.length-1 are actions; the rest map into flat.
          if (focusedIndex < visibleActions.length) {
            const action = visibleActions[focusedIndex];
            if (action) {
              e.preventDefault();
              runAction(action);
              return true;
            }
          } else {
            const entry = flat[focusedIndex - visibleActions.length];
            if (entry) {
              e.preventDefault();
              navigate(entry);
              return true;
            }
          }
        }
        // No item focused → fall through (newline / no-op), JARVIS send is ⌘⏎.
        return false;
      }
      if (e.key === "Escape") {
        // First Escape clears the typed term / focus; second closes the overlay.
        // The core actions show even with an empty term, so don't claim Escape
        // just because they're visible: only claim when there's something to
        // clear (a typed term or a focused row), else fall through to close.
        if (term.trim().length > 0 || focusedIndex >= 0) {
          e.preventDefault();
          clear();
          setFocusedIndex(-1);
          return true;
        }
        return false;
      }
      return false;
    },
    [combinedLength, focusedIndex, visibleActions, flat, navigate, runAction, clear, term]
  );

  const composer = (
    <LiteJarvisComposer
      autoFocus
      placeholder="Type a message, search, or run a command…"
      onSubmit={handleSubmit}
      onCancel={() => onOpenChange(false)}
      onValueChange={setQuery}
      keyboardInterceptor={interceptor}
      className="border-transparent bg-transparent shadow-none"
    />
  );

  const panel = (
    <>
      {composer}
      {(visibleActions.length > 0 || capped.total > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 flex flex-col gap-2">
          {visibleActions.length > 0 && (
            <ActionList
              actions={visibleActions}
              focusedIndex={focusedIndex}
              onRun={runAction}
              registerItemRef={registerItemRef}
            />
          )}
          <SearchDropdown
            results={capped}
            query={term}
            focusedIndex={focusedIndex}
            onSelect={navigate}
            registerItemRef={registerItemRef}
            indexOffset={visibleActions.length}
            inline
          />
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: "var(--sd-box)" }}
        className="sm:max-w-[640px] overflow-visible border-[var(--sd-line)] p-0"
      >
        <DialogTitle className="sr-only">JARVIS</DialogTitle>
        {prefersReducedMotion ? (
          <div className="relative p-4">{panel}</div>
        ) : (
          <motion.div
            className="relative p-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          >
            {panel}
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ActionListProps {
  actions: QuickCreateAction[];
  focusedIndex: number;
  onRun: (action: QuickCreateAction) => void;
  registerItemRef: (index: number, el: HTMLButtonElement | null) => void;
}

/**
 * Compact list of quick-create action rows shown above the search results.
 * Matches the dropdown's visual register (surface-raised card, focused row gets
 * the surface fill + ⏎ hint), and shares the parent's focusedIndex so Arrow nav
 * flows straight from actions into results.
 */
function ActionList({ actions, focusedIndex, onRun, registerItemRef }: ActionListProps) {
  return (
    <div className="sd-menu-surface overflow-hidden rounded-[12px] shadow-lg">
      <div className="flex items-center gap-2 border-b border-[var(--sd-line)] px-3 pb-1.5 pt-2.5">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
          Actions
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-2" role="listbox" aria-label="Quick actions">
        {actions.map((action, i) => {
          const focused = i === focusedIndex;
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              ref={(el) => registerItemRef(i, el)}
              type="button"
              role="option"
              aria-selected={focused}
              onClick={() => onRun(action)}
              style={focused ? { background: "var(--sd-selected)" } : undefined}
              className={cn(
                "group/action flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left transition-colors duration-[140ms]",
                !focused && "hover:bg-[var(--sd-hover)]",
              )}
            >
              <Icon size={15} strokeWidth={1.5} className="shrink-0 text-[var(--sd-ink-dull)]" />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--sd-ink)]">
                {action.label}
              </span>
              {focused ? (
                <CornerDownLeft
                  size={12}
                  strokeWidth={1.5}
                  className="shrink-0 text-[var(--sd-accent)]"
                />
              ) : (
                action.shortcut && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                    {action.shortcut}
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

