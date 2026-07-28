// Phone editor UX for the BlockNote-in-DOM wiki editor.
//
// Replaces BlockNote's desktop affordances (typed-`/` floating dropdown + the
// selection-bubble formatting toolbar, both of which collide with the iOS
// selection menu) with the phone pattern from Notion/Craft/Bear:
//
//   1. An accessory BAR that appears ONLY while a block is focused (caret in
//      the document) — default off when the page is merely open/scrolled. It
//      pins above the software keyboard via Visual Viewport resize (keyboard
//      height only — never vv.offsetTop / vv.scroll, which used to drag the
//      bar while the page scrolled). Notion native uses InputAccessoryView;
//      in this Expo DOM WebView we approximate that with fixed + kb height.
//   2. A categorized bottom-SHEET block picker (Basic / Lists / Media /
//      Advanced) with icon + name + one-line description rows, opened by `+`
//      OR by typing `/` in the document (the default floating slash menu is
//      suppressed in WikiEditorDom). The sheet's chrome mirrors the web
//      slash-menu canon (page-block-editor.css §.bn-suggestion-menu), scaled to
//      44px touch targets.
//
// LITERAL `/` (Notion semantics): typing `/` is NEVER swallowed — the character
// lands in the document like any other keystroke. It opens the sheet in "slash"
// mode; the live query is read back OUT of the document (the text after the `/`)
// so typing filters the list. Choosing a block deletes the `/`+query range and
// then inserts. Dismissing (Esc / tap-away) or typing a space / prose that
// matches nothing leaves the `/` in place as ordinary text and closes the sheet.
//
// This module is imported by the `'use dom'` WikiEditorDom, so it is bundled
// into the WEB bundle and runs inside the WKWebView alongside @blocknote — it
// is NOT a React Native component. It only ever runs on a touch device.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultReactSlashMenuItems, useActiveStyles } from "@blocknote/react";
import type { BlockNoteEditor } from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import { Icon, type IconName } from "./editorIcons";

/** A block type offered in the picker, keyed to its default slash-menu item. */
type PickerEntry = {
  /** Slash-menu item key (see @blocknote default schema). */
  key: string;
  /** sd icon glyph. */
  icon: IconName;
};

/** Categories mirror Notion's mobile picker; only default-schema blocks. */
const CATEGORIES: { label: string; entries: PickerEntry[] }[] = [
  {
    label: "Basic",
    entries: [
      { key: "paragraph", icon: "text" },
      { key: "heading", icon: "h1" },
      { key: "heading_2", icon: "h2" },
      { key: "heading_3", icon: "h3" },
      { key: "quote", icon: "quote" },
    ],
  },
  {
    label: "Lists",
    entries: [
      { key: "bullet_list", icon: "bullet" },
      { key: "numbered_list", icon: "numbered" },
      { key: "check_list", icon: "check" },
    ],
  },
  {
    label: "Media",
    entries: [
      { key: "image", icon: "image" },
      { key: "video", icon: "video" },
      { key: "audio", icon: "audio" },
      { key: "file", icon: "file" },
    ],
  },
  {
    label: "Advanced",
    entries: [
      { key: "code_block", icon: "code" },
      { key: "table", icon: "table" },
    ],
  },
];

/** Fallback labels for keys whose default item is missing from the schema. */
const FALLBACK: Record<string, { title: string; subtext: string }> = {
  paragraph: { title: "Text", subtext: "Plain paragraph" },
  heading: { title: "Heading 1", subtext: "Top-level heading" },
  heading_2: { title: "Heading 2", subtext: "Key section heading" },
  heading_3: { title: "Heading 3", subtext: "Subsection heading" },
  quote: { title: "Quote", subtext: "Quote or excerpt" },
  bullet_list: { title: "Bullet List", subtext: "Unordered list" },
  numbered_list: { title: "Numbered List", subtext: "Ordered list" },
  check_list: { title: "Check List", subtext: "To-do checklist" },
  image: { title: "Image", subtext: "Insert an image" },
  video: { title: "Video", subtext: "Insert a video" },
  audio: { title: "Audio", subtext: "Insert audio" },
  file: { title: "File", subtext: "Insert a file" },
  code_block: { title: "Code Block", subtext: "Code with highlighting" },
  table: { title: "Table", subtext: "Insert a table" },
};

/** A resolved picker row: display copy + the block-insert callback. */
type Row = {
  key: string;
  icon: IconName;
  title: string;
  subtext: string;
  aliases: string[];
  onSelect: () => void;
};

type SheetMode = "plus" | "slash";

/** True when the caret sits where typing `/` should summon the picker: an
 * empty spot or right after whitespace (never mid-word, so "and/or" is safe). */
function slashContextOk(): boolean {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || !sel.isCollapsed) return false;
  const node = sel.anchorNode;
  if (!node) return true;
  if (node.nodeType === Node.TEXT_NODE) {
    const before = node.textContent?.charAt(sel.anchorOffset - 1) ?? "";
    return before === "" || before === " " || before === " " || before === "\n";
  }
  return true;
}

/** Match rows against a query over title / key / aliases. */
function matchRows(rows: Row[], q: string): Row[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.title.toLowerCase().includes(needle) ||
      r.key.includes(needle) ||
      r.aliases.some((a) => a.toLowerCase().includes(needle)),
  );
}

export function EditorAccessory({
  editor,
  disabled = false,
}: {
  editor: BlockNoteEditor;
  disabled?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("plus");
  const [query, setQuery] = useState("");
  // Keyboard height (px) from Visual Viewport resize — bar/sheet rise by this.
  const [kbOffset, setKbOffset] = useState(0);
  // Notion-like: formatting bar stays off until the caret is in a block.
  const [blockFocused, setBlockFocused] = useState(false);
  const filterRef = useRef<HTMLInputElement | null>(null);
  // ProseMirror doc position of the literal `/` that opened the slash picker
  // (null whenever the sheet was opened by the `+` button instead).
  const slashPos = useRef<number | null>(null);

  const activeStyles = useActiveStyles(editor);

  // Current block type, kept fresh so the list toggles can reflect active state.
  const [blockType, setBlockType] = useState<string>("paragraph");
  useEffect(() => {
    const sync = () => {
      try {
        setBlockType(editor.getTextCursorPosition().block.type);
      } catch {
        /* editor not ready */
      }
    };
    sync();
    const un1 = editor.onSelectionChange?.(sync);
    const un2 = editor.onChange?.(sync);
    return () => {
      un1?.();
      un2?.();
    };
  }, [editor]);

  // Show the accessory only while the editor surface holds focus. Toolbar
  // buttons use pointerdown preventDefault so they never steal focus.
  // Also treat the in-document title input as "editing" (sibling of .bn-editor).
  useEffect(() => {
    const root = editor.domElement;
    if (!root) return;
    const host = root.closest(".wiki-doc") ?? root.parentElement ?? root;

    const isEditingTarget = (node: EventTarget | null) => {
      if (!(node instanceof Node)) return false;
      if (host.contains(node)) return true;
      if (node instanceof Element) {
        return Boolean(node.closest(".wiki-bar") || node.closest(".wiki-sheet"));
      }
      return false;
    };

    const onFocusIn = () => setBlockFocused(true);
    const onFocusOut = () => {
      // Defer: relatedTarget is often null on iOS; check activeElement next tick.
      window.setTimeout(() => {
        if (sheetOpen) return;
        if (isEditingTarget(document.activeElement)) {
          setBlockFocused(true);
          return;
        }
        setBlockFocused(false);
      }, 0);
    };

    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);
    if (isEditingTarget(document.activeElement)) setBlockFocused(true);

    return () => {
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
    };
  }, [editor, sheetOpen]);

  // Build the picker rows from the editor's actual default slash-menu items so
  // insertion (empty-block replacement, media file panels, cursor placement)
  // exactly matches BlockNote. Anything absent from the schema is skipped.
  const rows: Row[] = useMemo(() => {
    const items = getDefaultReactSlashMenuItems(editor) as (DefaultReactSuggestionItem & {
      key?: string;
    })[];
    const byKey = new Map<string, DefaultReactSuggestionItem & { key?: string }>();
    for (const it of items) if (it.key) byKey.set(it.key, it);
    const out: Row[] = [];
    for (const cat of CATEGORIES) {
      for (const entry of cat.entries) {
        const item = byKey.get(entry.key);
        const fb = FALLBACK[entry.key];
        if (!item && !fb) continue;
        out.push({
          key: entry.key,
          icon: entry.icon,
          title: item?.title ?? fb!.title,
          subtext: item?.subtext ?? fb!.subtext,
          aliases: item?.aliases ?? [],
          onSelect: () => item?.onItemClick?.(),
        });
      }
    }
    return out;
  }, [editor]);

  const openPlusSheet = useCallback(() => {
    slashPos.current = null;
    setSheetMode("plus");
    setQuery("");
    setSheetOpen(true);
  }, []);

  // Close the sheet WITHOUT touching the document. In slash mode the typed
  // `/`+query is left intact as ordinary text — exactly Notion's dismiss.
  const closeSheet = useCallback(() => {
    slashPos.current = null;
    setSheetOpen(false);
    setQuery("");
  }, []);

  const pick = useCallback(
    (row: Row) => {
      const start = slashPos.current;
      const isSlash = start !== null;
      // Drop sheet state first so the slash-tracking effect can't re-fire on the
      // document mutations below.
      slashPos.current = null;
      setSheetOpen(false);
      setQuery("");
      // In slash mode the caret never left the document (the filter box is a
      // read-only mirror), so the selection is live: delete the `/`+query range,
      // then let BlockNote insert/convert at the now-empty spot.
      if (isSlash) {
        try {
          const caret = editor.prosemirrorState.selection.from;
          if (caret > start!) {
            editor.transact((tr) => tr.delete(start!, caret));
          }
        } catch {
          /* range already gone */
        }
      }
      editor.focus();
      row.onSelect();
    },
    [editor],
  );

  // `/` handling: never preventDefault (the char must land in the doc). On a
  // valid trigger, record the `/`'s position next frame and open the sheet in
  // slash mode. Escape closes the sheet, keeping any typed text.
  useEffect(() => {
    if (disabled) return;
    const el =
      (editor.domElement as HTMLElement | undefined) ??
      document.querySelector<HTMLElement>(".ProseMirror");
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (slashPos.current !== null) closeSheet();
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (slashPos.current !== null) return; // already tracking a slash
      if (!slashContextOk()) return;
      // Let the "/" type, then capture its doc position on the next frame.
      requestAnimationFrame(() => {
        try {
          const caret = editor.prosemirrorState.selection.from;
          const start = caret - 1;
          if (
            start < 0 ||
            editor.prosemirrorState.doc.textBetween(start, caret, "\n", "\n") !== "/"
          ) {
            return;
          }
          slashPos.current = start;
          setSheetMode("slash");
          setQuery("");
          setSheetOpen(true);
        } catch {
          /* editor not ready */
        }
      });
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [editor, disabled, closeSheet]);

  // While a slash picker is up, mirror the document's post-`/` text into the
  // live query. Close (leaving the text) the moment the `/` is deleted, the
  // caret leaves it, whitespace is typed, or the query matches nothing.
  useEffect(() => {
    if (!sheetOpen || sheetMode !== "slash") return;
    const sync = () => {
      const start = slashPos.current;
      if (start === null) return;
      try {
        const state = editor.prosemirrorState;
        const caret = state.selection.from;
        if (!state.selection.empty || caret <= start) {
          closeSheet();
          return;
        }
        if (state.doc.textBetween(start, start + 1, "\n", "\n") !== "/") {
          closeSheet();
          return;
        }
        const text = state.doc.textBetween(start + 1, caret, "\n", "\n");
        if (/\s/.test(text)) {
          closeSheet();
          return;
        }
        // Non-matching prose after the `/` closes the picker (keeping the text).
        if (text.length > 0 && matchRows(rows, text).length === 0) {
          closeSheet();
          return;
        }
        setQuery(text);
      } catch {
        closeSheet();
      }
    };
    sync();
    const un1 = editor.onChange?.(sync);
    const un2 = editor.onSelectionChange?.(sync);
    return () => {
      un1?.();
      un2?.();
    };
  }, [sheetOpen, sheetMode, editor, rows, closeSheet]);

  // Pin bar/sheet above the software keyboard. Use keyboard height only
  // (innerHeight − visualViewport.height). Do NOT subtract offsetTop or listen
  // to visualViewport "scroll" — on iOS WKWebView those fire while the page
  // scrolls with the keyboard open and drag the fixed bar with the content.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height);
      // Ignore sub-threshold jitter from browser chrome; real keyboards are tall.
      setKbOffset(kb > 80 ? kb : 0);
    };
    update();
    vv.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
    };
  }, []);

  // Focus the filter box shortly after a `+`-opened sheet slides in. In slash
  // mode the editor MUST keep focus (so typing keeps flowing into the document),
  // so the box is a read-only mirror and is never focused here.
  useEffect(() => {
    if (!sheetOpen || sheetMode !== "plus") return;
    const t = setTimeout(() => filterRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, [sheetOpen, sheetMode]);

  if (disabled) return null;

  // Default off: no bar until a block is focused (or the insert sheet is open).
  const showBar = blockFocused || sheetOpen;

  // Toolbar actions keep the editor's selection + keyboard by preventing the
  // default pointer-down blur; the action then runs on the live selection.
  const hold = (fn: () => void) => ({
    onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      fn();
    },
  });

  const toggleStyle = (style: "bold" | "italic" | "underline" | "strike") => {
    editor.focus();
    editor.toggleStyles({ [style]: true } as never);
  };

  const toggleBlock = (type: string) => {
    try {
      const block = editor.getTextCursorPosition().block;
      const next = block.type === type ? "paragraph" : type;
      editor.updateBlock(block, { type: next } as never);
      editor.focus();
    } catch {
      /* no cursor */
    }
  };

  const indent = () => {
    if (editor.canNestBlock()) editor.nestBlock();
    editor.focus();
  };
  const outdent = () => {
    if (editor.canUnnestBlock()) editor.unnestBlock();
    editor.focus();
  };

  const isSlash = sheetMode === "slash";
  const filtered = matchRows(rows, query);

  // Fixed bar: set `bottom` to keyboard height (stable; no scroll-driven transform).
  const barPin = { bottom: kbOffset } as const;
  // Sheet is flex-end inside a full-screen root — pad the root above the keyboard.
  const sheetPin = { paddingBottom: kbOffset } as const;

  return (
    <>
      {/* Accessory bar — Notion-like: only while editing a block. */}
      {showBar ? (
      <div className="wiki-bar" style={barPin} data-testid="wiki-bar">
        <div className="wiki-bar-scroll">
          <button
            type="button"
            className="wiki-bar-btn wiki-bar-plus"
            aria-label="Insert block"
            data-testid="wiki-bar-plus"
            {...hold(openPlusSheet)}
          >
            <Icon name="plus" />
          </button>
          <span className="wiki-bar-sep" />
          <button
            type="button"
            className={`wiki-bar-btn${activeStyles.bold ? " is-active" : ""}`}
            aria-label="Bold"
            {...hold(() => toggleStyle("bold"))}
          >
            <Icon name="bold" />
          </button>
          <button
            type="button"
            className={`wiki-bar-btn${activeStyles.italic ? " is-active" : ""}`}
            aria-label="Italic"
            {...hold(() => toggleStyle("italic"))}
          >
            <Icon name="italic" />
          </button>
          <button
            type="button"
            className={`wiki-bar-btn${activeStyles.underline ? " is-active" : ""}`}
            aria-label="Underline"
            {...hold(() => toggleStyle("underline"))}
          >
            <Icon name="underline" />
          </button>
          <button
            type="button"
            className={`wiki-bar-btn${activeStyles.strike ? " is-active" : ""}`}
            aria-label="Strikethrough"
            {...hold(() => toggleStyle("strike"))}
          >
            <Icon name="strike" />
          </button>
          <span className="wiki-bar-sep" />
          <button
            type="button"
            className={`wiki-bar-btn${blockType === "bulletListItem" ? " is-active" : ""}`}
            aria-label="Bullet list"
            {...hold(() => toggleBlock("bulletListItem"))}
          >
            <Icon name="bullet" />
          </button>
          <button
            type="button"
            className={`wiki-bar-btn${blockType === "numberedListItem" ? " is-active" : ""}`}
            aria-label="Numbered list"
            {...hold(() => toggleBlock("numberedListItem"))}
          >
            <Icon name="numbered" />
          </button>
          <button
            type="button"
            className={`wiki-bar-btn${blockType === "checkListItem" ? " is-active" : ""}`}
            aria-label="Checklist"
            {...hold(() => toggleBlock("checkListItem"))}
          >
            <Icon name="check" />
          </button>
          <span className="wiki-bar-sep" />
          <button
            type="button"
            className="wiki-bar-btn"
            aria-label="Outdent"
            {...hold(outdent)}
          >
            <Icon name="outdent" />
          </button>
          <button
            type="button"
            className="wiki-bar-btn"
            aria-label="Indent"
            {...hold(indent)}
          >
            <Icon name="indent" />
          </button>
        </div>
      </div>
      ) : null}

      {/* Block picker — categorized bottom sheet, solid sd surface, no blur. */}
      {sheetOpen ? (
        <div className="wiki-sheet-root" style={sheetPin} data-testid="wiki-sheet">
          <div
            className="wiki-sheet-scrim"
            onPointerDown={closeSheet}
            aria-hidden="true"
          />
          <div className="wiki-sheet" role="dialog" aria-label="Insert block">
            <div className="wiki-sheet-grabber" />
            {isSlash ? (
              // Read-only mirror of the `/`-query being typed in the document.
              // The editor keeps focus so keystrokes keep filtering the list.
              <div className="wiki-sheet-filter wiki-sheet-filter-slash" aria-live="polite">
                <span className="wiki-sheet-slash-mark">/</span>
                <span className="wiki-sheet-slash-query">
                  {query || <span className="wiki-sheet-slash-hint">Filter blocks…</span>}
                </span>
              </div>
            ) : (
              <input
                ref={filterRef}
                className="wiki-sheet-filter"
                placeholder="Filter blocks…"
                value={query}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <div className="wiki-sheet-list">
              {query ? (
                <PickerRows rows={filtered} onPick={pick} />
              ) : (
                CATEGORIES.map((cat) => {
                  const catRows = filtered.filter((r) =>
                    cat.entries.some((e) => e.key === r.key),
                  );
                  if (catRows.length === 0) return null;
                  return (
                    <div key={cat.label} className="wiki-sheet-group">
                      <div className="wiki-sheet-group-label">{cat.label}</div>
                      <PickerRows rows={catRows} onPick={pick} />
                    </div>
                  );
                })
              )}
              {filtered.length === 0 ? (
                <div className="wiki-sheet-empty">No blocks match “{query}”.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PickerRows({ rows, onPick }: { rows: Row[]; onPick: (r: Row) => void }) {
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="wiki-sheet-row"
          data-testid={`wiki-sheet-row-${row.key}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onPick(row)}
        >
          <span className="wiki-sheet-row-icon">
            <Icon name={row.icon} />
          </span>
          <span className="wiki-sheet-row-text">
            <span className="wiki-sheet-row-title">{row.title}</span>
            <span className="wiki-sheet-row-sub">{row.subtext}</span>
          </span>
        </button>
      ))}
    </>
  );
}
