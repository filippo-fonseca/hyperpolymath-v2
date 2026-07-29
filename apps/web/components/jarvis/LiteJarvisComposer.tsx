"use client";

import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import {
  EntityMention,
  ENTITY_MENTION_HTML_ATTRIBUTES,
  renderEntityMentionHTML,
} from "@/components/references/entity-mention-node";
import { createEntityMentionSuggestion } from "@/components/references/entity-mention-suggestion";
import { serializeEntityMentionNode } from "@/lib/references/tiptap-tokens";
import { playSend } from "@/lib/ui/play-send";
import { cn } from "@/lib/utils";

/**
 * The key event the composer offers to a host's interceptor.
 *
 * Structural rather than `React.KeyboardEvent<HTMLTextAreaElement>` because the
 * textarea is gone: TipTap hands us a native KeyboardEvent, which satisfies
 * this shape. Nothing that was passing a React event has to change — a React
 * synthetic event satisfies it too.
 */
export interface ComposerKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
}

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  className?: string;
  /** Fires on every value change — lets a host drive a live search dropdown. */
  onValueChange?: (value: string) => void;
  /**
   * Optional keydown pre-handler. Runs before the composer's own key logic;
   * return true to signal the event was fully handled (composer then bails,
   * preserving the host's Arrow/Enter/Escape control for an attached dropdown).
   * Cmd/Ctrl+Enter (send to JARVIS) is never offered to the interceptor.
   */
  keyboardInterceptor?: (e: ComposerKeyEvent) => boolean;
  /** Blocks typing and sending, e.g. while a turn is already in flight. */
  disabled?: boolean;
}

/**
 * Autosize cap: 8 rows at the 24px line-height, as a literal because Tailwind
 * cannot see an interpolated class name. The editor grows with its content on
 * its own, so this replaces the textarea's manual scrollHeight measuring.
 */
const MAX_HEIGHT_CLASS = "max-h-[192px]";

/**
 * LiteJarvisComposer — the composer used by both LifeOsQuickSend (inline on
 * /lifeos) and GlobalJarvisDialog (Cmd+K dialog on other routes).
 *
 * Now a slim TipTap editor rather than a plain textarea. The reason is the
 * universal `@`: a textarea has no caret geometry to anchor a menu to and no
 * way to hold a chip, and there is zero caret math anywhere in this app. TipTap
 * gives both for free, and it is already the editor behind every other input
 * that takes a mention. Still deliberately lighter than JarvisInput.tsx (no
 * slash popover, no ignite state machine, no #/$ chips): this is a text capture
 * surface whose turn actually fires after a sessionStorage handoff into
 * JarvisConsole on /today.
 *
 * Keys — UNCHANGED from the textarea version, deliberately:
 *   - Cmd/Ctrl+Enter → onSubmit(trimmed). Clears on success. Never intercepted.
 *   - Enter          → offered to keyboardInterceptor, else a newline.
 *   - Shift+Enter    → newline.
 *   - Escape         → onCancel?.()
 *
 * Enter does NOT submit, and that is load-bearing rather than an oversight:
 * GlobalJarvisDialog's palette interceptor returns false on Enter when no row
 * is focused precisely so the key falls through, and the visible hint has
 * always read ⌘⏎. See the u2 control-file blocker of 2026-07-16.
 */
export function LiteJarvisComposer({
  placeholder = "Tell JARVIS what's on your mind…",
  autoFocus = false,
  onSubmit,
  onCancel,
  className,
  onValueChange,
  keyboardInterceptor,
  disabled = false,
}: Props) {
  // TipTap freezes editorProps at editor-creation time, so the keydown handler
  // must reach these through refs or it would pin them to their first-render
  // values. GlobalJarvisDialog's interceptor is a useCallback that changes on
  // every result-set change — reading it directly would run a stale palette.
  // Same pattern as JarvisInput's userTimezoneRef/onSubmitRef.
  const keyboardInterceptorRef = useRef(keyboardInterceptor);
  keyboardInterceptorRef.current = keyboardInterceptor;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      // Single paragraph: every block feature off, and hardBreak left on so
      // Shift+Enter still makes a newline.
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
      EntityMention.configure({
        HTMLAttributes: ENTITY_MENTION_HTML_ATTRIBUTES,
        renderHTML: renderEntityMentionHTML,
        // Mention-existing-only, like JarvisInput: this composer hands text to
        // JarvisConsole and has no save path to resolve a new person against.
        suggestion: createEntityMentionSuggestion({ allowCreatePerson: false }),
      }),
    ],
    editorProps: {
      attributes: {
        class: cn(
          "lite-jarvis-content block w-full outline-none overflow-y-auto",
          "text-[15px] leading-[1.5] text-[var(--sd-ink)]",
          MAX_HEIGHT_CLASS,
        ),
        "data-placeholder": placeholder,
      },
      handleKeyDown: (view, event) => {
        // Cmd/Ctrl+Enter always sends to JARVIS — never intercepted.
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          submitFrom(view);
          return true;
        }
        // Let the host claim Arrow/Enter/Escape for an attached dropdown.
        // Read through the ref so a host that re-creates its interceptor (as
        // GlobalJarvisDialog's useCallback does on every result change) is seen
        // — TipTap freezes editorProps at editor-creation time.
        if (keyboardInterceptorRef.current?.(event)) return true;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancelRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onValueChangeRef.current?.(readText(ed.getJSON()));
    },
  });

  /**
   * Send, reading straight from the live ProseMirror view.
   *
   * Takes the view rather than closing over `editor` for two reasons: the
   * handler is defined inside useEditor's own config, where `editor` does not
   * exist yet, and reading the view guarantees the sent text is what is on
   * screen regardless of closure staleness — the same reasoning behind
   * JarvisInput's `_view.state.doc` read.
   */
  function submitFrom(view: EditorView) {
    if (disabledRef.current) return;
    const trimmed = readText(view.state.doc.toJSON()).trim();
    if (!trimmed) return;
    playSend();
    onSubmitRef.current(trimmed);
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
    onValueChangeRef.current?.("");
  }

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "agent-mode-scope group/composer rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-input)]",
        "px-4 py-3",
        "transition-[border-color,box-shadow] duration-[140ms] ease-out",
        "focus-within:border-[var(--sd-accent)]",
        "focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--sd-accent)_10%,transparent)]",
        disabled && "opacity-60",
        className,
      )}
    >
      <EditorContent editor={editor} />
      <div className="mt-2 flex items-center justify-end">
        {/* kbd hint: the glyphs keep mono inside real <kbd> elements; the
            words stay sentence case (SDC-1 §2.4 bans the uppercase transform
            outside kbd, and this span used to carry it). */}
        <span className="text-micro text-[var(--ink-faint)]">
          <kbd className="font-mono">⌘⏎</kbd> to send · <kbd className="font-mono">⎋</kbd> to
          cancel
        </span>
      </div>
    </div>
  );
}

/**
 * The composer's text, with references as S1 tokens.
 *
 * Reads the JSON rather than `editor.getText()` for the usual reason: an
 * entityMention is invisible to doc.textContent, so a chip the user inserted
 * would contribute nothing and silently vanish on send.
 */
function readText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const n = json as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return typeof n.text === "string" ? n.text : "";
  const token = serializeEntityMentionNode(n);
  if (token !== null) return token;
  if (n.type === "hardBreak") return "\n";
  if (Array.isArray(n.content)) {
    const parts = n.content.map(readText);
    return parts.join(n.type === "doc" ? "\n" : "");
  }
  return "";
}

export default LiteJarvisComposer;
