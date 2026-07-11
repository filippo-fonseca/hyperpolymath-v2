"use client";

import {
  EMPTY_LINK_EMBED_PROPS,
  resolveLinkEmbed,
  type LinkEmbedProps,
} from "@/components/pages/blocks/LinkEmbedBlock";
import type { Editor } from "@/components/pages/PageBlockEditor";
import { isEmptyParagraph, pastedHttpUrl, type LinkEmbedVariant } from "@/lib/pages/link-embed";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { Bookmark, CodeXml, Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface PasteChoice {
  url: string;
  blockId: string;
  x: number;
  y: number;
}

export function useLinkEmbedPaste(editor: Editor) {
  const [choice, setChoice] = useState<PasteChoice | null>(null);

  const insertEmbed = useCallback(
    (variant: LinkEmbedVariant) => {
      if (!choice) return;
      const skeleton = { ...EMPTY_LINK_EMBED_PROPS, url: choice.url, variant };
      editor.updateBlock(choice.blockId, { type: "linkEmbed", props: skeleton });
      setChoice(null);
      void resolveLinkEmbed(choice.url, variant).then((props) => {
        if (editor.getBlock(choice.blockId)) editor.updateBlock(choice.blockId, { props });
      });
    },
    [choice, editor]
  );

  const pasteAsLink = useCallback(() => {
    if (!choice) return;
    editor.updateBlock(choice.blockId, {
      content: [{ type: "link", href: choice.url, content: choice.url }],
    });
    editor.setTextCursorPosition(choice.blockId, "end");
    setChoice(null);
  }, [choice, editor]);

  useEffect(() => {
    if (!choice) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setChoice(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        insertEmbed("bookmark");
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest(".bn-link-paste-menu")) setChoice(null);
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [choice, insertEmbed]);

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const url = pastedHttpUrl(event.clipboardData.getData("text/plain"));
      if (!url || editor.getSelection()) return;
      const block = editor.getTextCursorPosition().block;
      if (!isEmptyParagraph(block)) return;
      event.preventDefault();
      const rect = window.getSelection()?.rangeCount
        ? window.getSelection()?.getRangeAt(0).getBoundingClientRect()
        : null;
      setChoice({
        url,
        blockId: block.id,
        x: Math.min(rect?.left ?? 24, window.innerWidth - 250),
        y: Math.min((rect?.bottom ?? 24) + 8, window.innerHeight - 140),
      });
    },
    [editor]
  );

  const menu = choice ? (
    <div
      className="bn-link-paste-menu"
      style={{ left: choice.x, top: choice.y }}
      role="menu"
      aria-label="Paste link as"
      contentEditable={false}
    >
      <PasteMenuButton icon={<Link2 size={15} />} label="Paste as link" onClick={pasteAsLink} />
      <PasteMenuButton
        icon={<Bookmark size={15} />}
        label="Create bookmark"
        hint="Enter"
        onClick={() => insertEmbed("bookmark")}
      />
      <PasteMenuButton
        icon={<CodeXml size={15} />}
        label="Create embed"
        onClick={() => insertEmbed("embed")}
      />
    </div>
  ) : null;

  return { onPaste, menu };
}

function PasteMenuButton({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {hint ? <kbd>{hint}</kbd> : null}
    </button>
  );
}

export function linkEmbedSlashItems(editor: Editor): DefaultReactSuggestionItem[] {
  return [linkEmbedSlashItem(editor, "bookmark"), linkEmbedSlashItem(editor, "embed")];
}

function linkEmbedSlashItem(editor: Editor, variant: LinkEmbedVariant): DefaultReactSuggestionItem {
  const bookmark = variant === "bookmark";
  return {
    title: bookmark ? "Bookmark" : "Embed",
    subtext: bookmark ? "Preview a web page" : "Embed media or a web page",
    aliases: bookmark ? ["bookmark"] : ["embed", "yt", "youtube"],
    group: "Media",
    icon: bookmark ? <Bookmark size={15} /> : <CodeXml size={15} />,
    onItemClick: () =>
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "linkEmbed",
        props: { ...EMPTY_LINK_EMBED_PROPS, variant } as LinkEmbedProps,
      }),
  };
}
