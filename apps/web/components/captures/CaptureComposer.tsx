"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";

import { createCapture } from "@/app/actions/captures";
import { Button } from "@/components/ui/button";
import {
  ProjectMultiSelect,
  type ProjectMultiSelectOption,
} from "@/components/shared/ProjectMultiSelect";
import { createHashtagSuggestion } from "./tiptap-suggestions";

interface Hashtag {
  id: string;
  name: string;
  displayName: string;
}

interface Props {
  hashtags: Hashtag[];
  projects: ProjectMultiSelectOption[];
  onSubmitSuccess?: () => void;
  autoFocus?: boolean;
}

/**
 * Single source-of-truth capture composer (D-09).
 *
 * - TipTap 3.x editor with StarterKit (extras disabled for bundle) + Mention extension
 * - `immediatelyRender: false` avoids Next 16 + React 19 strict-mode SSR hydration mismatch (research Open Q#1)
 * - `#` triggers the hashtag suggestion popover (tiptap-suggestions.ts)
 * - Pitfall 4: NEVER auto-saves — only on Cmd+Enter / Capture button click
 * - Blocker 4: links projects via ProjectMultiSelect, passes selectedProjectIds to createCapture (CAPT-07 UI path)
 * - Blocker 5 / Warning 6: uses router.refresh after submit — preserves nuqs URL params, scroll, sidebar collapse (no full page reload)
 * - Warning 8: no inline style block — composer CSS lives in app/globals.css
 */
export function CaptureComposer({
  hashtags: initialHashtags,
  projects,
  onSubmitSuccess,
  autoFocus,
}: Props) {
  const [hashtags] = useState(initialHashtags);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
        suggestion: createHashtagSuggestion(() => hashtags),
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "capture-composer-content focus:outline-none min-h-[48px] max-h-[160px] overflow-y-auto p-3 font-serif text-base",
        "data-placeholder": "What's on your mind? Use #tags to organize.",
      },
    },
    autofocus: autoFocus ?? false,
  });

  function parseEditor(): { content: string; hashtagNames: string[] } {
    if (!editor) return { content: "", hashtagNames: [] };
    const json = editor.getJSON();
    const tagSet = new Set<string>();
    let content = "";

    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as {
        type?: string;
        text?: string;
        attrs?: { label?: string };
        content?: unknown[];
      };
      if (n.type === "text" && typeof n.text === "string") content += n.text;
      if (n.type === "mention" && typeof n.attrs?.label === "string") {
        tagSet.add(n.attrs.label);
        content += `#${n.attrs.label}`;
      }
      if (n.type === "paragraph" || n.type === "doc") {
        (n.content ?? []).forEach(walk);
        if (n.type === "paragraph") content += "\n";
      }
    }
    walk(json);
    return { content: content.trim(), hashtagNames: Array.from(tagSet) };
  }

  const handleSubmit = useCallback(() => {
    const { content, hashtagNames } = parseEditor();
    if (!content) return;
    startTransition(async () => {
      const r = await createCapture({
        content,
        hashtagNames,
        projectIds: selectedProjectIds,
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast("Captured.");
      editor?.commands.clearContent();
      setSelectedProjectIds([]);
      onSubmitSuccess?.();
      router.refresh();
    });
    // editor is captured via closure; intentionally stable for the lifetime of the editor instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, selectedProjectIds, onSubmitSuccess, router]);

  // Cmd+Enter submit (per UI-SPEC §Captures Composer)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        editor?.isFocused
      ) {
        e.preventDefault();
        handleSubmit();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor, handleSubmit]);

  return (
    <div className="border border-border rounded-lg bg-card">
      <EditorContent editor={editor} />
      {/* Blocker 4: project multi-select below the editor (CAPT-07 UI path) */}
      <div className="px-3 pb-2">
        <ProjectMultiSelect
          value={selectedProjectIds}
          onChange={setSelectedProjectIds}
          projects={projects}
          placeholder="Link to projects"
        />
      </div>
      <div className="flex items-center justify-between p-2 border-t border-border">
        <span className="font-sans text-[13px] text-muted-foreground">
          Cmd+Enter to capture
        </span>
        <Button onClick={handleSubmit} disabled={pending || !editor}>
          Capture
        </Button>
      </div>
    </div>
  );
}
