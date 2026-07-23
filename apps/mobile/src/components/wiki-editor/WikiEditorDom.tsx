"use dom";

// The REAL BlockNote editor, run as an Expo DOM component (SDK 56 `'use dom'`).
// This file is bundled by Metro as a WEB bundle and rendered inside a WebView;
// `@blocknote/*` therefore runs in its native web habitat. Native talks to it
// only through serializable props + async top-level callbacks (see the bridge
// rules in .planning/RESEARCH-expo-dom-blocknote.md).
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
import { useEffect, useRef } from "react";

import { sanitizeBlocks } from "./sanitize";

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
  /** Fired once the editor is mounted — native then delivers `content`. */
  onReady?: () => Promise<void>;
  /** Debounced by native; carries the full document JSON on every edit. */
  onChange?: (doc: Block[]) => Promise<void>;
};

export default function WikiEditorDom({
  content,
  markdownFallback,
  contentKey,
  editable = true,
  autoFocus = false,
  onReady,
  onChange,
}: Props) {
  const editor = useCreateBlockNote({});

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
    const hasMarkdown = typeof markdownFallback === "string" && markdownFallback.trim().length > 0;
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
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme="dark"
      onChange={() => {
        if (applying.current) return;
        void onChange?.(editor.document);
      }}
    />
  );
}
