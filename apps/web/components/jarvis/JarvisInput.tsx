"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { useMemo, useRef, useState } from "react";
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

interface Props {
  userTimezone: string;
  getProjects: () => ProjectSource[];
  getHashtags: () => HashtagSource[];
  onSubmit: (payload: JarvisInputPayload) => void;
  disabled?: boolean;
}

export function JarvisInput({
  userTimezone,
  getProjects,
  getHashtags,
  onSubmit,
  disabled,
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
          "jarvis-input-content focus:outline-none min-h-[40px] max-h-[200px] overflow-y-auto px-3 py-2 font-mono text-base",
        "data-placeholder": "Type a sentence — JARVIS will route it.",
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

  return (
    <div className="relative">
      <div
        className={
          disabled
            ? "rounded-md border bg-card opacity-60 pointer-events-none"
            : "rounded-md border bg-card"
        }
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
        <div className="flex items-center justify-between px-3 pb-1.5 border-t border-border/50 pt-1.5">
          <span className="font-sans text-[12px] text-muted-foreground">
            <span className="opacity-60 select-none mr-1.5">{">"}</span>
            Enter to send · type / for commands · $ for projects · # for hashtags
          </span>
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
