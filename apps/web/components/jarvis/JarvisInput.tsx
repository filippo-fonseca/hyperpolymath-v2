"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { useCallback, useMemo, useState } from "react";
import { createHashtagSuggestion } from "@/components/captures/tiptap-suggestions";
import { createProjectSuggestion } from "./project-suggestions";
import {
  SlashCommandPopover,
  SLASH_COMMANDS,
  type SlashCommandKey,
} from "./SlashCommandPopover";
import {
  parseDates,
  parseSlashCommand,
  type ParsedDate,
} from "@hyperpolymath/jarvis-core";

/**
 * JARVIS Console composer (Plan 05-03 Task 3).
 *
 * Mounts TWO Mention extension instances in the same TipTap editor:
 *   - `#hashtag`  → default Mention (node name "mention", reused from Phase 2)
 *   - `$project`  → Mention.extend({ name: "projectMention" })
 * Different node names let both popovers coexist without trigger collision.
 *
 * Slash commands are NOT a Mention — they shape the prompt sent to Claude
 * (forcing tool_choice). Detected via text-prefix scan in onUpdate; selection
 * is intercepted in handleKeyDown (N4: `_view.state.doc.textContent` not the
 * closure-captured `editor`).
 *
 * On submit:
 *   1. parseSlashCommand(text)  → strip slash + record slashCommand
 *   2. walk editor JSON         → collect hashtag labels + projectMention ids
 *   3. permissive #hashtag regex over the rest of the text (catches typed-but-
 *      not-popped hashtags, same convention as Phase 2 CaptureComposer)
 *   4. parseDates(text, tz)      → ParsedDate[] (D-10 client-side chrono)
 *   5. onSubmit(payload)        → parent (JarvisConsole) drives SSE stream
 *   6. clearContent()
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

export interface JarvisInputPayload {
  input: string;
  parsedDates: ParsedDate[];
  slashCommand: SlashCommandKey | null;
  hashtags: string[];
  projectIds: string[];
}

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
        const text = _view.state.doc.textContent;
        const trimmed = text.trimStart();
        const slashIsOpen =
          trimmed.startsWith("/") &&
          !/\s/.test(trimmed.slice(1).split(/\s/)[0] ?? "");

        // M3 fix: explicit slash-popover keyboard branch
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
          if (event.key === "Enter" && !event.shiftKey) {
            const picked =
              filtered[Math.min(slashSelected, filtered.length - 1)];
            if (picked) {
              if (picked.key === "help") {
                setShowHelp(true);
                setSlashOpen(false);
                return true;
              }
              // Submit the body as the chosen command. The body is the rest
              // of the text after the slash-prefix word.
              submitWithSlash(text, picked.key);
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
          handleSubmit();
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
   * Extract payload from current editor state. Pure — caller decides whether
   * to call onSubmit / clearContent.
   */
  function extractPayload(slashCommandOverride: SlashCommandKey | null): JarvisInputPayload | null {
    if (!editor) return null;
    const rawText = editor.getText().trim();
    if (rawText.length === 0) return null;

    // Slash command parsing
    let slashCommand: SlashCommandKey | null = slashCommandOverride;
    let inputText = rawText;
    if (slashCommand === null) {
      const slashParsed = parseSlashCommand(rawText);
      if (slashParsed) {
        slashCommand = slashParsed.command as SlashCommandKey;
        inputText = slashParsed.body;
      }
    } else {
      // Strip the slash prefix word for the body.
      inputText = rawText.replace(/^\/\S*\s*/, "");
    }

    // /help is local — don't send to server
    const slashCommandForServer: SlashCommandKey | null =
      slashCommand === "help" ? null : slashCommand;

    // Walk JSON for Mention nodes
    const json = editor.getJSON();
    const hashtags: string[] = [];
    const projectIds: string[] = [];
    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as {
        type?: string;
        attrs?: { id?: string; label?: string };
        content?: unknown[];
      };
      if (n.type === "mention" && typeof n.attrs?.label === "string") {
        const t = n.attrs.label.toLowerCase();
        if (!hashtags.includes(t)) hashtags.push(t);
      }
      if (n.type === "projectMention" && typeof n.attrs?.id === "string") {
        if (!projectIds.includes(n.attrs.id)) projectIds.push(n.attrs.id);
      }
      if (Array.isArray(n.content)) for (const c of n.content) walk(c);
    }
    walk(json);

    // Permissive #hashtag regex over the input text (Phase 2 convention)
    const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
    for (const m of inputText.matchAll(HASHTAG_RE)) {
      const tag = m[1]?.toLowerCase();
      if (tag && !hashtags.includes(tag)) hashtags.push(tag);
    }

    // Client-side chrono pre-parse (D-10)
    const parsedDates = parseDates(inputText, userTimezone);

    return {
      input: inputText,
      parsedDates,
      slashCommand: slashCommandForServer,
      hashtags,
      projectIds,
    };
  }

  const handleSubmit = useCallback(() => {
    const payload = extractPayload(null);
    if (!payload || !editor) return;
    onSubmit(payload);
    editor.commands.clearContent();
    setSlashOpen(false);
    setShowHelp(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, userTimezone, onSubmit]);

  function submitWithSlash(_text: string, key: SlashCommandKey) {
    const payload = extractPayload(key);
    if (!payload || !editor) return;
    onSubmit(payload);
    editor.commands.clearContent();
    setSlashOpen(false);
    setShowHelp(false);
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
            // Mouse-select: drive submit with the chosen key.
            submitWithSlash(editor?.getText() ?? "", key);
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
