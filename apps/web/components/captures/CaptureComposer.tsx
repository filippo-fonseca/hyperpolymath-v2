"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

interface Hashtag {
  id: string;
  name: string;
  displayName: string;
}

interface Props {
  /**
   * Signed-in user id — embedded in the optimistic row so it satisfies
   * `CaptureWithLinks`'s shape when handed to CapturesClient's reducer. Not
   * persisted from the composer (the Server Action resolves userId from the
   * session via getClaims) — purely for the optimistic-row shape.
   */
  userId?: string;
  hashtags: Hashtag[];
  projects: ProjectMultiSelectOption[];
  /**
   * Phase 3 — optional optimistic-insert callback. When the composer is
   * mounted inside CapturesClient, this is wired to `addOptimistic({ type:
   * "insert", row })` so the new capture appears instantly. When mounted
   * inside Cmd+K (CommandMenuContent) the caller passes undefined; the
   * Realtime echo will populate /captures on next visit.
   */
  onOptimisticInsert?: (row: CaptureWithLinks) => void;
  onSubmitSuccess?: () => void;
  autoFocus?: boolean;
}

/**
 * Single source-of-truth capture composer (D-09).
 *
 * Phase 3:
 * - Generates `crypto.randomUUID()` BEFORE the Server Action (RT-05 dedupe key).
 * - Calls `onOptimisticInsert?.(row)` BEFORE awaiting createCapture — the feed
 *   updates instantly; the Realtime echo + TanStack Query refetch carries the
 *   same UUID so the optimistic insert dedupes (CapturesClient reducer is
 *   idempotent on `insert` by id).
 * - On server rejection: `toast.error(r.error)` + nothing else — useOptimistic
 *   auto-reverts when the transition completes without committing real state.
 * - No manual page refresh — Realtime owns cross-window propagation now (D-12).
 *
 * Editor:
 * - TipTap 3.x with StarterKit (block features disabled) + Mention extension
 * - `immediatelyRender: false` avoids Next 16 + React 19 strict-mode SSR
 *   hydration mismatch
 * - `#` triggers the hashtag suggestion popover (tiptap-suggestions.ts)
 * - Plain `#word` text is picked up at save via the permissive parser (same
 *   logic as CaptureDetailPanel.parseEditorJSON)
 */
export function CaptureComposer({
  userId,
  hashtags: initialHashtags,
  projects,
  onOptimisticInsert,
  onSubmitSuccess,
  autoFocus,
}: Props) {
  const [hashtags] = useState(initialHashtags);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

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
    // Preserve first-seen casing when we extract `#word` from plain text
    // (the server lowercases via upsertHashtag for canonical CAPT-08 storage).
    const tagCasing = new Map<string, string>();
    let content = "";

    // Permissive plain-text hashtag extraction: matches `#word` patterns within
    // text nodes. The TipTap Mention extension only creates a `mention` node when
    // the user actively engages the suggestion popover — but most users type
    // `#idea` and keep typing, leaving plain text. We extract those too so the
    // hashtag flow doesn't silently fail. Server-side `createCapture` dedupes
    // case-insensitively and `upsertHashtag` is race-safe (Pitfall 9).
    const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
    function extractFromText(text: string): void {
      for (const m of text.matchAll(HASHTAG_RE)) {
        const raw = m[1];
        if (!raw) continue;
        const lower = raw.toLowerCase();
        if (!tagCasing.has(lower)) tagCasing.set(lower, raw);
        tagSet.add(tagCasing.get(lower) ?? raw);
      }
    }

    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as {
        type?: string;
        text?: string;
        attrs?: { label?: string };
        content?: unknown[];
      };
      if (n.type === "text" && typeof n.text === "string") {
        content += n.text;
        extractFromText(n.text);
      }
      if (n.type === "mention" && typeof n.attrs?.label === "string") {
        // Mention nodes always win casing — they were explicitly committed via popover
        const label = n.attrs.label;
        const lower = label.toLowerCase();
        tagCasing.set(lower, label);
        tagSet.add(label);
        content += `#${label}`;
      }
      if (n.type === "paragraph" || n.type === "doc") {
        (n.content ?? []).forEach(walk);
        if (n.type === "paragraph") content += "\n";
      }
    }
    walk(json);

    // Final pass: rebuild tagSet from tagCasing so mention-node casing wins on collision
    const finalTags = Array.from(tagCasing.values());
    void tagSet; // keep eslint happy; tagSet was used as an accumulator
    return { content: content.trim(), hashtagNames: finalTags };
  }

  const handleSubmit = useCallback(() => {
    const { content, hashtagNames } = parseEditor();
    if (!content) return;

    // RT-05 echo-dedupe key. Generated BEFORE the Server Action so the
    // optimistic row + the Realtime echo share the same primary key. The
    // CapturesClient reducer is idempotent on `insert` by id, so the echo
    // is a no-op once the canonical row lands via refetch.
    const newId = crypto.randomUUID();

    // Build an optimistic capture row that matches CaptureWithLinks shape.
    // Hashtag/project link rows here are derived from the composer state —
    // they look right inline but are NOT the canonical join rows; the
    // Realtime echo + TanStack Query refetch reconciles to ground truth.
    const now = new Date();
    const optimisticRow: CaptureWithLinks = {
      id: newId,
      content,
      createdAt: now,
      updatedAt: now,
      // Optimistic hashtags — `id: "pending-${name}"` because the canonical
      // hashtag rows may not exist yet (Server Action upserts them). Replaced
      // by the canonical join on the next refetch.
      hashtags: hashtagNames.map((name) => ({
        id: `pending-${name}`,
        name: name.toLowerCase(),
        displayName: name,
      })),
      // Optimistic project chips — map id → name from the in-scope `projects`
      // option list. Same caveat: replaced by canonical join on refetch.
      projects: selectedProjectIds
        .map((id) => {
          const p = projects.find((proj) => proj.id === id);
          return p ? { id: p.id, name: p.name } : null;
        })
        .filter((p): p is { id: string; name: string } => p !== null),
    };
    // userId is captured on the row implicitly via the surrounding context
    // (CapturesClient owns the feed and is already filtered to this user).
    // It's not in CaptureWithLinks shape so we don't add it here.
    void userId;

    onOptimisticInsert?.(optimisticRow);

    startTransition(async () => {
      const r = await createCapture({
        id: newId,
        content,
        hashtagNames,
        projectIds: selectedProjectIds,
      });
      if (!r.success) {
        toast.error(r.error);
        // useOptimistic auto-reverts: when the transition completes without
        // committing real state, React rolls the optimistic row back. No
        // explicit `addOptimistic({ type: "delete" })` needed.
        return;
      }
      toast("Captured.");
      editor?.commands.clearContent();
      setSelectedProjectIds([]);
      onSubmitSuccess?.();
      // No manual cache busting — Realtime echo + invalidation handles it (D-12).
    });
    // editor is captured via closure; intentionally stable for the lifetime of the editor instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editor,
    selectedProjectIds,
    onSubmitSuccess,
    onOptimisticInsert,
    projects,
    userId,
  ]);

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
