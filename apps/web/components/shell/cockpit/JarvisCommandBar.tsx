"use client";

import {
  type JarvisActionEvent,
  type JarvisClarificationEvent,
  type JarvisRequest,
  streamJarvis,
} from "@/components/jarvis/jarvis-stream-client";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { cn } from "@/lib/utils";
import { Maximize2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The JARVIS command bar — Kiwi as furniture, not a dialog you summon.
 *
 * This is the single most important piece of the cockpit (D3). The product's
 * core value is "type one sentence into Kiwi and the right action lands in the
 * right place", so the input is pinned to the bottom of the stage, always one
 * keystroke away, and never behind a modal.
 *
 * It is a flex sibling of the stage's scroll container, not an overlay. That is
 * what makes it safe next to editors: BlockNote surfaces, sticky toolbars and
 * slash menus all live inside the scroll box above it and simply have ~48px
 * less viewport. It cannot cover them and they cannot cover it.
 *
 * What it deliberately does NOT do:
 *  - It does not autofocus, ever, on mount or on navigation. Stealing focus
 *    from an editor is the fastest way to make furniture feel hostile.
 *  - It does not build a second SSE client or a second route. It consumes the
 *    existing `POST /api/jarvis` contract through `streamJarvis`.
 *  - It does not duplicate GlobalJarvisDialog: no quick-create list, no search
 *    dropdown, no Cmd+K binding. The dialog stays the palette; the bar is for
 *    sending one sentence. If both ever want a keystroke, the dialog wins.
 *  - It does not render the full receipt UX (`JarvisReceipt`,
 *    `JarvisScrollback`). Those belong to the console surfaces.
 */

/** Routes that ARE the console. Two live inputs to one brain is the confusion D3 removes. */
const CONSOLE_PATH = "/today";
const JARVIS_SETTINGS_PATH = "/jarvis";

const MAX_HISTORY_TURNS = 20;

/**
 * Rolling history, module-local so it survives the bar unmounting on a
 * suppressed route and coming back. Trimmed hard: the bar is for one-sentence
 * turns, and the console owns the long conversation.
 */
let history: JarvisRequest["history"] = [];

function rememberTurn(role: "user" | "assistant", content: string) {
  if (!content) return;
  history = [...history, { role, content }].slice(-MAX_HISTORY_TURNS);
}

function actionLine(action: JarvisActionEvent): string {
  const phrase = action.name.replace(/_/g, " ");
  if (!action.result.ok) {
    return action.result.error ? `${phrase} failed: ${action.result.error}` : `${phrase} failed`;
  }
  const receipt = action.result.receipt ?? {};
  for (const field of ["title", "summary", "text", "name"]) {
    const value = receipt[field];
    if (typeof value === "string" && value.trim()) return `${phrase}: ${value.trim()}`;
  }
  return phrase;
}

export function JarvisCommandBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [clarification, setClarification] = useState<JarvisClarificationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suppressed =
    pathname === CONSOLE_PATH ||
    pathname.startsWith(`${CONSOLE_PATH}/`) ||
    pathname === JARVIS_SETTINGS_PATH ||
    pathname.startsWith(`${JARVIS_SETTINGS_PATH}/`) ||
    pathname.startsWith("/onboarding");

  const hasStrip = Boolean(answer || actions.length > 0 || clarification || error);

  const collapseStrip = useCallback(() => {
    setAnswer("");
    setActions([]);
    setClarification(null);
    setError(null);
  }, []);

  const send = useCallback((text: string) => {
    const input = text.trim();
    if (!input) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setAnswer("");
    setActions([]);
    setClarification(null);
    setError(null);
    rememberTurn("user", input);

    let reply = "";
    void streamJarvis(
      { input, history: history.slice(0, -1) },
      {
        onText: (delta) => {
          reply += delta;
          setAnswer(reply);
        },
        onAction: (action) => {
          setActions((lines) => [...lines, actionLine(action)]);
        },
        onClarification: (event) => setClarification(event),
        onDone: () => {
          rememberTurn("assistant", reply);
          setBusy(false);
          abortRef.current = null;
        },
        onError: (message) => {
          setError(message);
          setBusy(false);
          abortRef.current = null;
        },
      },
      controller.signal
    );
  }, []);

  function submit() {
    if (busy) return;
    const text = draft;
    setDraft("");
    send(text);
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  /** Hand the unsent draft to the console the way every other surface does. */
  const expand = useCallback(() => {
    try {
      if (draft.trim()) sessionStorage.setItem("jarvis-prefill", draft);
    } catch {
      // sessionStorage unavailable (private browsing); navigate anyway.
    }
    router.push(CONSOLE_PATH);
  }, [draft, router]);

  // Cmd/Ctrl+J focuses the bar from anywhere; Cmd/Ctrl+Shift+J expands to the
  // console. Cmd+K is untouched: it belongs to GlobalJarvisDialog and
  // GlobalHotkeys, and if the two ever collide the dialog wins.
  useEffect(() => {
    if (suppressed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "j" && event.key !== "J") return;
      event.preventDefault();
      if (event.shiftKey) {
        expand();
        return;
      }
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suppressed, expand]);

  // Abort any in-flight turn if the bar goes away mid-stream.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (suppressed) return null;

  return (
    // jul-29 craft restyle: Kiwi is a floating glass pill resting inside the
    // stage sheet, not a full-width bordered strip. Still a flex sibling of
    // the scroll box — the floating look is padding + chrome, not an overlay.
    <div className="shrink-0 px-3 pt-1.5 pb-3">
      <div className="craft-glass overflow-hidden rounded-2xl">
      {hasStrip ? (
        <div className="sd-scroll-hover max-h-[40vh] overflow-y-auto border-b border-[var(--edge)] px-4 py-3">
          {answer ? (
            <p className="max-w-[68ch] whitespace-pre-wrap text-body text-[var(--ink)]">{answer}</p>
          ) : null}

          {actions.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {actions.map((line) => (
                <li key={line} className="text-meta text-[var(--ink-muted)]">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}

          {clarification ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="max-w-[68ch] text-body text-[var(--ink)]">{clarification.question}</p>
              {clarification.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {clarification.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => send(option)}
                      className="h-8 rounded-lg bg-[var(--hover)] px-3 text-meta text-[var(--ink)] transition-colors duration-[160ms] ease-out hover:bg-[var(--selected)]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-meta text-[var(--ink-coral)]">{error}</p> : null}
        </div>
      ) : null}

      <div className="flex h-12 items-center gap-2 px-2.5">
        <KiwiIcon size={18} aria-hidden="true" className="ml-1 shrink-0" />

        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          placeholder="ask kiwi…"
          aria-label="Ask Kiwi"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-body text-[var(--ink)] outline-none",
            "placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          )}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              // Escape collapses the answer strip first, then gives focus back
              // to whatever the user was actually doing.
              if (hasStrip) collapseStrip();
              else event.currentTarget.blur();
            }
          }}
        />

        {busy ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded bg-[var(--hover)] px-1.5 py-0.5 font-mono text-micro text-[var(--ink-faint)] md:inline-block">
            ⌘J
          </kbd>
        )}

        <button
          type="button"
          onClick={expand}
          aria-label="Open the full console"
          title="Open the full console (⌘⇧J)"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          <Maximize2 size={14} strokeWidth={1.75} />
        </button>
      </div>
      </div>
    </div>
  );
}
