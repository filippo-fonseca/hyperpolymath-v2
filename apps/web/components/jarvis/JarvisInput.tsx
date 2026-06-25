"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createHashtagSuggestion } from "@/components/captures/tiptap-suggestions";
import { createProjectSuggestion } from "./project-suggestions";
import {
  SlashCommandPopover,
  SLASH_COMMANDS,
  type SlashCommandKey,
} from "./SlashCommandPopover";
import {
  buildJarvisInputPayload,
  type JarvisInputPayload,
} from "./jarvis-input-payload";
import { registerJarvisFocus } from "@/lib/jarvis/focus";
import { playSend } from "@/lib/ui/play-send";

/**
 * JARVIS Console composer (Plan 05-03 Task 3).
 *
 * Mounts TWO Mention extension instances in the same TipTap editor:
 *   - `#hashtag`  → default Mention (node name "mention", reused from Phase 2)
 *   - `$project`  → Mention.extend({ name: "projectMention" })
 * Different node names let both popovers coexist without trigger collision.
 *
 * Slash commands shape the request sent to Claude (forcing tool_choice).
 *   - /task | /capture | /event → server pins tool_choice to that tool
 *   - /ask                       → server forbids tools (prose-only reply)
 *   - /help                      → local-only (renders the command list)
 *
 * Slash UX (bug-fix May 14 2026):
 *   - Typing `/` opens the popover. Arrow keys + click + Enter + Tab select.
 *   - Selecting a non-/help/ command PINS it: the slash prefix is stripped
 *     from the editor, a small "command chip" is shown above the input,
 *     and the user keeps typing the body. Pressing Enter then submits the
 *     body with the pinned slashCommand.
 *   - Typing space after `/task` closes the popover but does NOT pin the
 *     command — the auto-detector in `parseSlashCommand` picks up the
 *     `/task X` prefix on Enter. (Pinning via space-on-empty-body is
 *     reserved for the explicit selection path.)
 *
 * Payload building moved to `./jarvis-input-payload.ts` as a pure function
 * so tests can exercise the full parse chain without TipTap (which is
 * fragile in jsdom). The component just supplies (text, json, tz, override)
 * and calls the pure builder.
 */

interface ProjectSource {
  id: string;
  name: string;
  icon?: string | null;
}
interface HashtagSource {
  id: string;
  name: string;
  displayName: string;
}

// Re-export so JarvisConsole can keep importing from "./JarvisInput".
export type { JarvisInputPayload };

/**
 * Phase 6 Plan 06-03 (AES-05, D-02): imperative focus handle.
 *
 * Allows parent components to focus the editor without prop-drilling
 * editor state. Used by JarvisConsole for the ref-as-prop pattern.
 *
 * The module-level singleton in lib/jarvis/focus.ts is the canonical
 * Cmd+K dispatch path (cross-tree, no ref required) — but exposing the
 * handle documents the contract + enables future imperative actions
 * (e.g., focus-on-clarification-reply).
 */
export interface JarvisInputHandle {
  focus(): void;
}

interface Props {
  userTimezone: string;
  getProjects: () => ProjectSource[];
  getHashtags: () => HashtagSource[];
  onSubmit: (payload: JarvisInputPayload) => void;
  disabled?: boolean;
  /**
   * Focus the editor as soon as it mounts. The Console passes this so landing
   * on the JARVIS tab drops the caret straight into the composer.
   */
  autoFocus?: boolean;
  /**
   * Phase 6 Plan 06-03: React 19 ref-as-prop pattern (no forwardRef wrapper).
   * Optional — parent passes a ref<JarvisInputHandle> to focus the editor
   * imperatively. Cmd+K already works via the module-level singleton; this
   * is the contract-documenting alternative.
   */
  ref?: React.Ref<JarvisInputHandle>;
}

export function JarvisInput({
  userTimezone,
  getProjects,
  getHashtags,
  onSubmit,
  disabled,
  autoFocus,
  ref,
}: Props) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelected, setSlashSelected] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  // Pinned slash command: when the user clicks/Enter-selects a non-/help
  // command from the popover, we strip the `/cmd` prefix from the editor and
  // remember the selection here. The next Enter submits the body with this
  // command as a slashCommandOverride. State (for UI chip) + Ref (for the
  // editor keyDown handler's closure, which freezes after editor mount).
  const [pinnedSlashCommand, setPinnedSlashCommand] =
    useState<SlashCommandKey | null>(null);
  const pinnedSlashCommandRef = useRef<SlashCommandKey | null>(null);

  // Phase 6.1 Plan 02 — 7-state JARVIS Console interaction machine.
  // This component owns states 1-4 (idle, focused-idle, typing, submitting-ignite);
  // states 5-8 (thinking, streaming, done, error) live in JarvisScrollback.
  const [isFocused, setIsFocused] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [igniting, setIgniting] = useState(false); // 320ms post-submit ignite window
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [typingDotVisible, setTypingDotVisible] = useState(false);
  const shouldReduce = useReducedMotion();
  // Latest userTimezone/onSubmit accessible to the editor keyDown handler
  // without depending on the captured closure (TipTap freezes editorProps at
  // editor-creation time).
  const userTimezoneRef = useRef(userTimezone);
  userTimezoneRef.current = userTimezone;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Memoize the extended Mention class so we don't recreate it on every render.
  const ProjectMention = useMemo(
    () => Mention.extend({ name: "projectMention" }),
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Mention.configure({
        HTMLAttributes: { class: "hashtag-chip-inline" },
        renderHTML({ options, node }) {
          return [
            "span",
            { ...options.HTMLAttributes, "data-hashtag": node.attrs.label },
            `#${node.attrs.label}`,
          ];
        },
        suggestion: createHashtagSuggestion(getHashtags),
      }),
      ProjectMention.configure({
        HTMLAttributes: { class: "project-chip-inline" },
        renderHTML({ options, node }) {
          return [
            "span",
            { ...options.HTMLAttributes, "data-project": node.attrs.id },
            `$${node.attrs.label}`,
          ];
        },
        suggestion: createProjectSuggestion(getProjects),
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "jarvis-input-content focus:outline-none min-h-[44px] max-h-[200px] overflow-y-auto px-4 py-3 font-sans text-[15px] leading-relaxed text-[var(--ink)]",
        // Placeholder reads as JARVIS's prompt — soft serif italic per CSS.
        "data-placeholder": "Tell JARVIS what's on your mind…",
      },
      handleKeyDown: (_view, event) => {
        // N4: read text from the live ProseMirror view, NOT the closure
        // `editor` (used-before-definition inside useEditor's editorProps).
        // This is also the LIVE source of truth for the submit payload —
        // any closure-captured `editor.getText()` could be stale.
        const text = _view.state.doc.textContent;
        const trimmed = text.trimStart();
        const slashIsOpen =
          trimmed.startsWith("/") &&
          !/\s/.test(trimmed.slice(1).split(/\s/)[0] ?? "");

        // M3 + Bug 2 fix: explicit slash-popover keyboard branch
        if (slashIsOpen && slashOpen) {
          // Compute the filtered list from current slashQuery so Arrow nav
          // stays in bounds.
          const query = trimmed.slice(1).split(/\s/)[0] ?? "";
          const filtered = SLASH_COMMANDS.filter((c) =>
            c.key.startsWith(query.toLowerCase()),
          );

          if (event.key === "ArrowUp") {
            setSlashSelected((p) =>
              filtered.length === 0
                ? 0
                : (p - 1 + filtered.length) % filtered.length,
            );
            return true;
          }
          if (event.key === "ArrowDown") {
            setSlashSelected((p) =>
              filtered.length === 0 ? 0 : (p + 1) % filtered.length,
            );
            return true;
          }
          // Enter / Tab: PIN the chosen command + strip the slash prefix from
          // the editor. Do NOT submit — the user can now type the body and
          // press Enter again to submit. (Pre-fix behaviour was: Enter on
          // slash popover submitted immediately with empty body, blocking
          // the user from typing the body at all.)
          if (
            (event.key === "Enter" && !event.shiftKey) ||
            event.key === "Tab"
          ) {
            const picked =
              filtered[Math.min(slashSelected, filtered.length - 1)];
            if (picked) {
              if (picked.key === "help") {
                setShowHelp(true);
                setSlashOpen(false);
                return true;
              }
              pinSlashCommand(picked.key, _view);
              return true;
            }
            return false;
          }
          if (event.key === "Escape") {
            setSlashOpen(false);
            return true;
          }
        }

        // Default Enter submit (no slash popover open)
        if (event.key === "Enter" && !event.shiftKey) {
          // A TipTap mention popover ($project / #hashtag) renders to document.body
          // and tags its root with `data-mention-suggestion-active`. When it's open,
          // ProseMirror's suggestion plugin owns Enter — it inserts the highlighted
          // pill via `command(item)`. Bailing out here lets that handler win.
          if (document.querySelector("[data-mention-suggestion-active]")) {
            return false;
          }
          // Read live text + JSON from the view (not the closure editor —
          // it can be stale on the very first submit after mount).
          const liveJson = _view.state.doc.toJSON();
          submitFromView(text, liveJson);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText().trimStart();
      if (text.startsWith("/")) {
        const firstWord = text.slice(1).split(/\s/)[0] ?? "";
        // Only open while the slash word is still being typed (no whitespace yet)
        const stillTyping = !text.slice(1).includes(" ") || firstWord.length === 0;
        if (stillTyping) {
          setSlashOpen(true);
          setSlashQuery(firstWord);
          return;
        }
      }
      setSlashOpen(false);
    },
  });

  // Phase 6 Plan 06-03 (AES-05, D-02): expose imperative focus handle.
  // React 19 ref-as-prop pattern — no forwardRef wrapper required.
  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editor?.commands.focus("end");
      },
    }),
    [editor],
  );

  // Phase 6 Plan 06-03 (AES-05, D-02): register a focus function at the
  // module level so the global Cmd+K listener (in GlobalHotkeys) can reach
  // it without ref drilling. Re-register on every editor change to handle
  // the initial null-then-instance transition. Cleanup on unmount.
  useEffect(() => {
    if (!editor) return;
    registerJarvisFocus(() => editor.commands.focus("end"));
    return () => registerJarvisFocus(null);
  }, [editor]);

  // Phase 6.1 Plan 02 — State 2 (focused-idle) + State 3 (typing).
  // Track focus via TipTap editor focus/blur events. Track unsubmitted content
  // + keystroke counter via TipTap update event. The breathing focus ring
  // applies only when focusedIdle (focused && !hasContent).
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => {
      setIsFocused(true);
      // Phase 11 / CACHE-04 — dispatch warm signal so JarvisWarmer can fire
      // a predictive Anthropic cache-prime call. Cheap CustomEvent broadcast;
      // listener lives in app/(app)/layout.tsx via <JarvisWarmer />.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jarvis-input-focus"));
      }
    };
    const onBlur = () => setIsFocused(false);
    const onUpdate = () => {
      const has = !editor.isEmpty;
      setHasContent(has);
      setKeystrokeCount((n) => n + 1);
    };
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    editor.on("update", onUpdate);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
      editor.off("update", onUpdate);
    };
  }, [editor]);

  // Phase 6.1 Plan 02 — State 3 (typing): every 8 keystrokes, a 4px cyan dot
  // flashes top-right of the input for 240ms (acknowledgment of input, not
  // an agent indicator). AnimatePresence in the JSX handles the fade.
  useEffect(() => {
    if (!hasContent || keystrokeCount === 0) return;
    if (keystrokeCount % 8 !== 0) return;
    setTypingDotVisible(true);
    const t = setTimeout(() => setTypingDotVisible(false), 240);
    return () => clearTimeout(t);
  }, [keystrokeCount, hasContent]);

  /**
   * Drive submission from the live ProseMirror view's text + JSON. This is
   * the canonical submit path — both Enter-in-editor and click-submit
   * funnel through here so the parser inputs match what the user sees on
   * screen (no closure-staleness on the captured `editor` reference).
   *
   * The pinned slash command (if any) wins over auto-detection so the
   * payload's `slashCommand` matches the popover selection — including
   * `ask`, which the server uses to forbid tool calls.
   */
  function submitFromView(text: string, json: unknown) {
    const override = pinnedSlashCommandRef.current;
    const payload = buildJarvisInputPayload(
      text,
      json,
      userTimezoneRef.current,
      override,
    );
    if (!payload) return;
    playSend();
    // Phase 6.1 Plan 02 — State 4 (submitting-ignite): trigger the 320ms
    // ignite window. The wrapper className flips to .hud-submit-ignite-border
    // (border flashes cyan-bright with --ease-out-back overshoot) and the
    // scan-drop child mounts via AnimatePresence (1px line drops 80px over
    // 320ms). Reset hasContent/keystroke counter so the next session starts
    // fresh.
    setIgniting(true);
    setKeystrokeCount(0);
    setHasContent(false);
    setTimeout(() => setIgniting(false), 320);
    onSubmitRef.current(payload);
    editor?.commands.clearContent();
    setSlashOpen(false);
    setShowHelp(false);
    pinnedSlashCommandRef.current = null;
    setPinnedSlashCommand(null);
  }

  /**
   * Bug 2 fix — pinning the slash command:
   *   1. Remember the command in a ref (read by the live keyDown handler)
   *      AND state (drives the visible chip).
   *   2. Strip the `/<cmd>` prefix word from the editor so the user types
   *      the body cleanly. The chip above the input communicates the mode.
   *   3. Close the popover. Do NOT submit — the user types the body and
   *      hits Enter (or clicks the send button when we add one).
   */
  function pinSlashCommand(
    key: SlashCommandKey,
    view?: { state: { doc: { textContent: string } } } | null,
  ) {
    pinnedSlashCommandRef.current = key;
    setPinnedSlashCommand(key);
    setSlashOpen(false);
    setShowHelp(false);

    if (!editor) return;
    // Strip the `/<cmd>` prefix word from the current doc. Reading via the
    // view (when available) avoids `editor.getText()` staleness.
    const current =
      view?.state.doc.textContent ?? editor.getText();
    const stripped = current.replace(/^\s*\/\S*\s*/, "");
    editor.commands.setContent(stripped);
    // Move caret to end so the user can keep typing the body.
    editor.commands.focus("end");
  }

  // Phase 6.1 Plan 02 — derived flags for the 4 input-side states.
  // State 1 (idle): not focused, no content → 1px --edge-hud border
  // State 2 (focused-idle): focused, no content → 2px --hud-cyan + .hud-focus-breathe ring
  // State 3 (typing): focused, has content → 2px --hud-cyan (no breathe; typing dot fires every 8 keys)
  // State 4 (submitting-ignite): igniting=true → .hud-submit-ignite-border + scan-drop child
  const focusedIdle = isFocused && !hasContent;
  const focusedActive = isFocused && hasContent;

  return (
    <div className="relative">
      <div
        // Phase 6.1 Plan 02 (UI-SPEC §6b states 1-4): state-driven input wrapper.
        // - Border: 1px --edge-hud (idle) → 2px --hud-cyan (focused, any content)
        // - .hud-focus-breathe class (Plan 01 keyframe): only when focused-idle,
        //   ring breathes 8px → 14px → 8px on a 2400ms loop via --ease-in-out-circ
        // - .hud-submit-ignite-border class: 320ms cyan→cyan-bright→cyan flash
        //   via --ease-out-back overshoot, applied while igniting=true
        // - shouldReduce gates the breathing class (focus ring becomes static
        //   2px --hud-cyan) and the ignite animation
        className={[
          "relative rounded-2xl transition-[box-shadow,border-color] duration-200 ease-out",
          disabled ? "opacity-60 pointer-events-none" : "",
          igniting && !shouldReduce ? "hud-submit-ignite-border" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          backgroundColor: "var(--surface-raised)",
          border:
            focusedIdle || focusedActive
              ? "1px solid color-mix(in oklch, var(--hud-cyan) 70%, transparent)"
              : "1px solid color-mix(in oklch, var(--edge-hud) 70%, transparent)",
          boxShadow:
            focusedIdle || focusedActive
              ? "0 0 0 4px color-mix(in oklch, var(--hud-cyan) 10%, transparent), 0 1px 2px rgba(0,0,0,0.06)"
              : "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        {pinnedSlashCommand ? (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 border-b border-border/50 font-mono text-[12px]">
            <span
              className="inline-flex items-center gap-1.5 rounded bg-secondary px-2 py-0.5 text-foreground"
              aria-label={`Pinned command: /${pinnedSlashCommand}`}
            >
              <span className="opacity-60">/</span>
              {pinnedSlashCommand}
              <button
                type="button"
                onClick={() => {
                  pinnedSlashCommandRef.current = null;
                  setPinnedSlashCommand(null);
                  editor?.commands.focus("end");
                }}
                className="opacity-60 hover:opacity-100"
                aria-label="Remove pinned command"
              >
                ×
              </button>
            </span>
            <span className="text-muted-foreground">
              {pinnedSlashCommand === "ask"
                ? "JARVIS will answer in text, no action filed."
                : `JARVIS will force ${pinnedSlashCommand} on submit.`}
            </span>
          </div>
        ) : null}

        <EditorContent editor={editor} />

        {/* Phase 6.1 Plan 02 — State 3 (typing): 4px cyan dot flashes top-right
            every 8 keystrokes for 240ms via Motion 12 AnimatePresence. The
            keystrokeCount-based trigger ensures the dot is acknowledgment of
            input (not an agent indicator — that's the status pill). */}
        <AnimatePresence>
          {typingDotVisible ? (
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              className="absolute top-1 right-12 w-1 h-1 rounded-full pointer-events-none"
              style={{ backgroundColor: "var(--hud-cyan)" }}
              aria-hidden="true"
            />
          ) : null}
        </AnimatePresence>

        {/* Phase 6.1 Plan 02 — State 4 (submitting-ignite): a 1px horizontal
            cyan scan line drops from input bottom over 320ms via Motion 12
            y: 0 → 80px + opacity 1 → 0 with --ease-out-quart. Skipped under
            reduced-motion (the border flash alone communicates submit). */}
        <AnimatePresence>
          {igniting && !shouldReduce ? (
            <motion.div
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 80, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
              className="absolute left-0 right-0 bottom-0 h-px pointer-events-none"
              style={{
                backgroundColor: "var(--hud-cyan-bright)",
                boxShadow: "0 0 8px var(--hud-cyan-glow)",
              }}
              aria-hidden="true"
            />
          ) : null}
        </AnimatePresence>

        <div className="flex items-center justify-between px-4 pb-2.5 pt-2 border-t border-[color-mix(in_oklch,var(--edge)_60%,transparent)]">
          <span className="font-sans text-[12px] text-[color-mix(in_oklch,var(--ink-muted)_85%,transparent)]">
            Enter to send · <span className="font-mono text-[11px]">/</span>{" "}
            commands · <span className="font-mono text-[11px]">$</span> projects
            · <span className="font-mono text-[11px]">#</span> tags
          </span>
          {/* ⌘K hint chip — cleaner pill, sentence-case-style label tucked
              behind the kbd glyph. Hidden below md per UI-SPEC §10c. */}
          <kbd
            className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono text-[var(--ink-muted)] select-none"
            style={{
              border:
                "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
              backgroundColor:
                "color-mix(in oklch, var(--surface) 92%, transparent)",
            }}
            aria-hidden="true"
            title="Focus JARVIS from anywhere"
          >
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </div>
      </div>

      {slashOpen ? (
        <SlashCommandPopover
          query={slashQuery}
          selectedIndex={slashSelected}
          onSelect={(key) => {
            if (key === "help") {
              setShowHelp(true);
              setSlashOpen(false);
              return;
            }
            // Mouse-select: PIN the command (don't submit). User types body.
            pinSlashCommand(key);
          }}
        />
      ) : null}

      {showHelp ? (
        <div className="absolute bottom-full left-0 mb-2 min-w-[20rem] rounded-md border bg-popover p-3 font-mono text-xs shadow-md z-50">
          <div className="mb-1.5 text-muted-foreground">Commands:</div>
          <ul className="space-y-0.5">
            <li>
              <span className="text-foreground">/task</span> — force task creation
            </li>
            <li>
              <span className="text-foreground">/capture</span> — force capture creation
            </li>
            <li>
              <span className="text-foreground">/event</span> — force calendar event
            </li>
            <li>
              <span className="text-foreground">/ask</span> — ask a question (text reply, no action)
            </li>
            <li>
              <span className="text-foreground">/help</span> — show this list
            </li>
          </ul>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Press Esc or click anywhere to dismiss.
          </div>
          <button
            type="button"
            className="mt-2 underline text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowHelp(false)}
          >
            dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
