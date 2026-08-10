"use dom";

// The REAL BlockNote editor, run as an Expo DOM component (SDK 56 `'use dom'`).
// This file is bundled by Metro as a WEB bundle and rendered inside a WebView;
// `@blocknote/*` therefore runs in its native web habitat. Native talks to it
// only through serializable props + async top-level callbacks.
//
// #46374 mitigation: the editor mounts EMPTY (tiny initial payload), signals
// `onReady`, and only then does native hand it `content` — applied post-mount
// via `replaceBlocks`, never as a multi-KB initial prop that would blank the
// WKWebView on this stack.

import "@blocknote/mantine/style.css";
import "./wiki-editor.css";

import type { DOMProps } from "expo/dom";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type { Block, PartialBlock } from "@blocknote/core";
import { useEffect, useRef, useState } from "react";

import { sanitizeBlocks } from "./sanitize";
import { EditorAccessory } from "./EditorAccessory";

type Props = {
  /** Injected by Expo — WebView config (style, scroll, …). */
  dom?: DOMProps;
  /**
   * BlockNote document JSON for the current page (raw from the API; may hold
   * web-authored custom nodes — sanitized here). Null/undefined for a legacy
   * page → seed from `markdownFallback` instead.
   */
  content?: unknown[] | null;
  /** Markdown mirror, used only when `content` is null (legacy migration). */
  markdownFallback?: string;
  /**
   * Bumped by native each time a NEW page's content should be applied. The DOM
   * side applies content once per distinct key, so native re-renders (from
   * unrelated prop churn) never wipe in-progress edits.
   */
  contentKey?: string;
  editable?: boolean;
  /** Drop the caret into the body once content is applied (daily quick entry). */
  autoFocus?: boolean;
  /** Page title, rendered as the in-document header above the blocks. */
  title?: string;
  /** Page emoji, shown above the title when set. */
  emoji?: string | null;
  /** Whether the in-document title can be edited (false for locked pages). */
  titleEditable?: boolean;
  /** Craft scheme, mirrored from the native color scheme. */
  scheme?: "light" | "dark";
  /** Fired once the editor is mounted — native then delivers `content`. */
  onReady?: () => Promise<void>;
  /** Debounced by native; carries the full document JSON on every edit. */
  onChange?: (doc: Block[]) => Promise<void>;
  /** Bridged on every title keystroke; native owns the debounce + PATCH. */
  onTitleChange?: (title: string) => Promise<void>;
};

export default function WikiEditorDom({
  content,
  markdownFallback,
  contentKey,
  editable = true,
  autoFocus = false,
  title,
  emoji,
  titleEditable = true,
  scheme = "dark",
  onReady,
  onChange,
  onTitleChange,
}: Props) {
  const editor = useCreateBlockNote({});

  // Craft scheme: the stylesheet keys every color off html[data-scheme].
  useEffect(() => {
    document.documentElement.dataset.scheme = scheme;
  }, [scheme]);

  // The in-document title. Kept as local state so typing never fights a prop
  // echo from native; re-seeded only when a NEW page loads (contentKey change).
  const [titleValue, setTitleValue] = useState(title ?? "");
  const titleKey = useRef<string | null>(null);
  useEffect(() => {
    const key = contentKey ?? "";
    if (titleKey.current === key) return;
    titleKey.current = key;
    setTitleValue(title ?? "");
  }, [contentKey, title]);

  // Which contentKey we've already applied — so we seed exactly once per page
  // and later native re-renders can't clobber live edits.
  const appliedKey = useRef<string | null>(null);
  // Suppress the onChange that our own programmatic seeding triggers, so opening
  // a page doesn't immediately fire a "save" of unchanged content.
  const applying = useRef(false);

  // Announce readiness once, after mount. Native withholds `content` until it
  // sees this, keeping the initial prop payload tiny (#46374).
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    void onReady?.();
  }, [onReady]);

  // Apply content for a given page exactly once (keyed by contentKey).
  useEffect(() => {
    const key = contentKey ?? "";
    if (appliedKey.current === key) return;
    // Nothing to apply yet (native hasn't delivered content for this key).
    const hasJson = Array.isArray(content) && content.length > 0;
    const hasMarkdown =
      typeof markdownFallback === "string" && markdownFallback.trim().length > 0;
    if (!hasJson && !hasMarkdown) return;

    appliedKey.current = key;
    void (async () => {
      applying.current = true;
      try {
        let blocks: PartialBlock[];
        if (hasJson) {
          blocks = sanitizeBlocks(content) as PartialBlock[];
        } else {
          blocks = (await editor.tryParseMarkdownToBlocks(
            markdownFallback as string,
          )) as PartialBlock[];
        }
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
        if (autoFocus) {
          const first = editor.document[0];
          if (first) editor.setTextCursorPosition(first.id, "start");
          editor.focus();
        }
      } finally {
        // Let the seeding settle before re-enabling change propagation.
        applying.current = false;
      }
    })();
  }, [content, markdownFallback, contentKey, autoFocus, editor]);

  return (
    <div className="wiki-doc">
      <div className="wiki-page-header">
        {emoji ? <div className="wiki-page-emoji">{emoji}</div> : null}
        <input
          className="wiki-page-title"
          value={titleValue}
          placeholder="Untitled"
          disabled={!titleEditable}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            setTitleValue(next);
            void onTitleChange?.(next);
          }}
        />
        <div className="wiki-page-divider" />
      </div>
      {/*
       * Phone UX: kill BlockNote's desktop affordances. `slashMenu={false}`
       * suppresses the typed-`/` floating dropdown (EditorAccessory re-binds `/`
       * to the bottom-sheet picker); `formattingToolbar={false}` drops the
       * selection bubble that collides with the iOS selection menu (the bar
       * carries bold/italic/underline/strike + list/indent instead).
       */}
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={scheme}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          if (applying.current) return;
          void onChange?.(editor.document);
        }}
      />
      {editable ? <EditorAccessory editor={editor} /> : null}
    </div>
  );
}
