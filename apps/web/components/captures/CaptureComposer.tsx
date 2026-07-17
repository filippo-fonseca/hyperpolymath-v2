"use client";

import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Sparkles } from "lucide-react";

import { createCapture, suggestTagsForCapture } from "@/app/actions/captures";
import {
  ProjectMultiSelect,
  type ProjectMultiSelectOption,
} from "@/components/shared/ProjectMultiSelect";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import type { SuggestedTag } from "@/lib/captures/suggest-tags";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { sfx } from "@/lib/ui/sfx";
import { mergeContentUrls } from "@/lib/url";
import { HashtagChip } from "./HashtagChip";
import { HashtagDecorations } from "./hashtag-decorations";
import { createPersonDecorations } from "./person-decorations";
import {
  EntityMention,
  ENTITY_MENTION_HTML_ATTRIBUTES,
  renderEntityMentionHTML,
} from "@/components/references/entity-mention-node";
import {
  createEntityMentionSuggestion,
  insertCreatedPerson,
} from "@/components/references/entity-mention-suggestion";
import {
  ENTITY_MENTION_NODE,
  entityMentionAttrsToRef,
} from "@/lib/references/tiptap-tokens";
import { serializeReference } from "@/lib/references/token";
import { createHashtagSuggestion } from "./tiptap-suggestions";

interface Hashtag {
  id: string;
  name: string;
  displayName: string;
}

interface Person {
  id: string;
  name: string;
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
  /**
   * The current user's people, used to populate the `@`-mention menu (Phase C).
   * Optional so existing mount sites (Cmd+K) keep working; when omitted the menu
   * only offers the inline-create sentinel for a typed name.
   */
  people?: Person[];
  projects: ProjectMultiSelectOption[];
  /**
   * Phase 3 — optional optimistic-insert callback. When the composer is
   * mounted inside CapturesClient, this is wired to `addOptimistic({ type:
   * "insert", row })` so the new capture appears instantly. When mounted
   * inside Cmd+K (CommandMenuContent) the caller passes undefined; the
   * Realtime echo will populate /captures on next visit.
   */
  onOptimisticInsert?: (row: CaptureWithLinks) => void;
  /**
   * Rolls the optimistic insert back when the Server Action rejects. Required
   * now that the feed overlay (useOptimisticList) persists pending rows until
   * canonical reconciles — it no longer auto-reverts on its own.
   */
  onOptimisticRevert?: (id: string) => void;
  onSubmitSuccess?: () => void;
  autoFocus?: boolean;
  /**
   * Seed value for the project multi-select. Used by `/projects/[id]` so a
   * capture composed from a project page is auto-linked to that project
   * (and the user can still add/remove links before submitting). When
   * omitted, the multi-select starts empty (existing behavior).
   */
  defaultProjectIds?: string[];
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
  people: initialPeople = [],
  projects,
  onOptimisticInsert,
  onOptimisticRevert,
  onSubmitSuccess,
  autoFocus,
  defaultProjectIds,
}: Props) {
  const [hashtags] = useState(initialHashtags);
  const [people] = useState(initialPeople);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(defaultProjectIds ?? []);
  const [pending, startTransition] = useTransition();
  // Smart tag suggestions (#36 / #40). `suggestions` holds tags the user hasn't
  // acted on yet; accepting one appends it to the editor and drops it from the
  // list, dismissing one just drops it. Nothing is applied without the user.
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Live editor handle for editorProps.handleKeyDown — the `editor` const below
  // is used-before-definition inside useEditor's config, so the Cmd+K handler
  // reads the instance through this ref instead (kept in sync right after the
  // hook returns). Mirrors the JarvisInput composer pattern.
  const editorRef = useRef<Editor | null>(null);

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
      // `personMention` — kept in the schema, but no longer driven by `@`.
      // It stores the typed NAME (not a person id) so createCapture resolves-
      // or-creates by name on save, exactly like hashtags canonicalize server
      // side. That flow is still live: it is what the universal menu's
      // "Create person" sentinel inserts, and it is what already-drafted
      // person chips are.
      Mention.extend({ name: "personMention" }).configure({
        HTMLAttributes: { class: "person-chip-inline" },
        renderHTML({ options, node }) {
          return [
            "span",
            { ...options.HTMLAttributes, "data-person": node.attrs.label },
            `@${node.attrs.label}`,
          ];
        },
      }),
      // `@` now opens the universal picker: captures, tasks, pages, projects,
      // areas AND people, instead of people alone. Picking an EXISTING entity
      // inserts an id-carrying entityMention; picking the create sentinel falls
      // back to the name-carrying personMention above, because there is no id
      // to point at until the server resolves the name on save.
      EntityMention.configure({
        HTMLAttributes: ENTITY_MENTION_HTML_ATTRIBUTES,
        renderHTML: renderEntityMentionHTML,
        suggestion: createEntityMentionSuggestion({
          allowCreatePerson: true,
          onCreatePerson: ({ name, editor: ed, range }) =>
            insertCreatedPerson(ed, range, name),
        }),
      }),
      // Live-decorate plain `#word` text so the token styling lands without
      // waiting for the suggestion popover to commit a Mention node (#41).
      HashtagDecorations,
      // Same idea for `@name` matching a known person (amber register).
      createPersonDecorations(() => people),
    ],
    editorProps: {
      attributes: {
        class:
          "capture-composer-content focus:outline-none min-h-[48px] max-h-[160px] overflow-y-auto p-3 text-[15px]",
        "data-placeholder": "What's on your mind? Use #tags to organize.",
      },
      // Cmd/Ctrl+K opens the inline `#`-token dropdown at the caret (#145).
      // We insert the trigger char into the doc, which is exactly what typing
      // `#` does — the Mention suggestion plugin observes the new char and
      // opens its popover, giving full parity with the typed trigger (same
      // items, same keyboard nav, same commit path).
      //
      // This handler runs on the editor's DOM node during dispatch, BEFORE the
      // window-level GlobalHotkeys listener that binds plain Cmd+K to "focus
      // JARVIS". stopPropagation() keeps that global handler from also firing
      // and yanking focus out of the composer; preventDefault() suppresses any
      // browser default for the chord.
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === "k") {
          event.preventDefault();
          event.stopPropagation();
          editorRef.current?.chain().focus().insertContent("#").run();
          return true;
        }
        return false;
      },
    },
    autofocus: autoFocus ?? false,
  });

  // Keep the ref pointed at the live editor instance so editorProps.handleKeyDown
  // (frozen at editor-creation time) can reach the current editor for Cmd+K.
  editorRef.current = editor;

  const parseEditor = useCallback((): {
    content: string;
    hashtagNames: string[];
    personNames: string[];
  } => {
    if (!editor) return { content: "", hashtagNames: [], personNames: [] };
    const json = editor.getJSON();
    const tagSet = new Set<string>();
    // Person mentions are committed nodes only (no permissive plain-text @parse,
    // since @ commonly appears in emails/handles). Preserve first-seen casing.
    const personCasing = new Map<string, string>();
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
      // An entityMention writes its canonical S1 token into the saved content —
      // the id-carrying half of the universal `@`. Without this branch the node
      // contributes nothing at all (doc.textContent ignores renderText) and the
      // reference the user deliberately inserted vanishes on save.
      if (n.type === ENTITY_MENTION_NODE) {
        const ref = entityMentionAttrsToRef(n.attrs);
        if (ref) {
          content += serializeReference(ref);
          // A referenced PERSON also feeds personNames, so the people_references
          // join keeps being written. entity_references (the token's own index)
          // and people_references answer different questions and the shipped UI
          // — the "Linked people" field, the person decorations — reads the
          // latter. Resolve-or-create by name lands on the existing person.
          if (ref.type === "person") {
            const lower = ref.label.toLowerCase();
            if (!personCasing.has(lower)) personCasing.set(lower, ref.label);
          }
        }
      }
      if (n.type === "personMention" && typeof n.attrs?.label === "string") {
        const label = n.attrs.label;
        const lower = label.toLowerCase();
        if (!personCasing.has(lower)) personCasing.set(lower, label);
        // The mirror keeps the @name inline so the saved content reads naturally.
        content += `@${label}`;
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
    return {
      content: content.trim(),
      hashtagNames: finalTags,
      personNames: Array.from(personCasing.values()),
    };
  }, [editor]);

  const handleSuggestTags = useCallback(async () => {
    const { content, hashtagNames } = parseEditor();
    if (!content || suggesting) return;
    setSuggesting(true);
    try {
      const r = await suggestTagsForCapture({ content });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      // Hide anything the user already typed as a hashtag so we don't suggest
      // a tag that's already in the capture (case-insensitive).
      const already = new Set(hashtagNames.map((t) => t.toLowerCase()));
      const fresh = r.data.filter((t) => !already.has(t.name.toLowerCase()));
      setSuggestions(fresh);
      if (fresh.length === 0) toast("No tag suggestions.");
    } finally {
      setSuggesting(false);
    }
  }, [parseEditor, suggesting]);

  const acceptSuggestion = useCallback(
    (tag: SuggestedTag) => {
      if (!editor) return;
      // Append `#tag ` at the end of the document so it's picked up by the
      // permissive plain-text hashtag parser at save time.
      editor.commands.focus("end");
      editor.commands.insertContent(`#${tag.name} `);
      setSuggestions((prev) => prev.filter((t) => t.name.toLowerCase() !== tag.name.toLowerCase()));
    },
    [editor]
  );

  const dismissSuggestion = useCallback((tag: SuggestedTag) => {
    setSuggestions((prev) => prev.filter((t) => t.name.toLowerCase() !== tag.name.toLowerCase()));
  }, []);

  const handleSubmit = useCallback(() => {
    const { content, hashtagNames, personNames } = parseEditor();
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
    const optimisticUrls = mergeContentUrls(content, {});
    const optimisticRow: CaptureWithLinks = {
      id: newId,
      content,
      createdAt: now,
      updatedAt: now,
      // D-14 surface — composer captures are manual (no JARVIS round-trip),
      // so createdVia stays null. JARVIS-created captures only originate
      // from the /api/jarvis executor (Plan 05-02).
      createdVia: null,
      sourceDevice: "Web",
      sourceInput: "text",
      sourceChannel: null,
      // The URL property auto-derives from links in the body; reflect that
      // optimistically so a pasted link shows up immediately (the server
      // performs the authoritative derivation and the refetch reconciles).
      url: optimisticUrls.url,
      urls: optimisticUrls.urls,
      favorite: false,
      // Composer captures never set a resurface date on creation.
      resurfaceAt: null,
      // Not yet derived — the server schedules the people match in the
      // background; the marker + linked people reconcile on the next refetch.
      peopleDerivedAt: null,
      // Optimistic hashtags — `id: "pending-${name}"` because the canonical
      // hashtag rows may not exist yet (Server Action upserts them). Replaced
      // by the canonical join on the next refetch.
      hashtags: hashtagNames.map((name) => ({
        id: `pending-${name}`,
        name: name.toLowerCase(),
        displayName: name,
      })),
      // Optimistic person chips — `id: "pending-${name}"` since createCapture
      // resolve-or-creates the canonical person row server side. Replaced by
      // the canonical people_references join on the next refetch.
      people: personNames.map((name) => ({ id: `pending-${name}`, name })),
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
        // Person names (not ids): createCapture resolve-or-creates each and
        // reconciles people_references for this capture (Phase C).
        personNames,
        projectIds: selectedProjectIds,
      });
      if (!r.success) {
        toast.error(r.error);
        // RT-06: the feed overlay persists optimistic rows until canonical
        // reconciles, so a rejected insert must be rolled back explicitly.
        onOptimisticRevert?.(newId);
        return;
      }
      toast("Captured.");
      // sesh-sd3 SFX core pack — subtle "sent" cue on a successful dispatch.
      // Single-line, never throws, silent when muted / gesture-locked.
      sfx.play("captureSent");
      editor?.commands.clearContent();
      setSuggestions([]);
      // Reset to the original seed so a project-scoped composer keeps that
      // project pre-linked for the next capture (a quick-fire capture flow
      // on /projects/[id] shouldn't make the user re-select the project each
      // time).
      setSelectedProjectIds(defaultProjectIds ?? []);
      onSubmitSuccess?.();
      // No manual cache busting — Realtime echo + invalidation handles it (D-12).
    });
  }, [
    editor,
    parseEditor,
    selectedProjectIds,
    onSubmitSuccess,
    onOptimisticInsert,
    onOptimisticRevert,
    projects,
    userId,
    defaultProjectIds,
  ]);

  // Cmd+Enter submit (per UI-SPEC §Captures Composer)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && editor?.isFocused) {
        e.preventDefault();
        handleSubmit();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor, handleSubmit]);

  return (
    // sd writing surface — recessed --sd-input field, 1px --sd-line hairline,
    // no glow ring. focus-within brings the border to the single cyan accent so
    // the composer reads "live" while typing, matching every sd input.
    <div className="rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-input)] transition-colors focus-within:border-[var(--sd-accent)]">
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
      {/* Smart tag suggestions (#36 / #40) — accept (left-click) appends the
          tag to the note; the small x dismisses it. Nothing applies on its own. */}
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          <span className="font-mono text-[11px] text-[var(--sd-ink-faint)] mr-0.5">Suggested:</span>
          {suggestions.map((tag) => (
            <span key={tag.name} className="inline-flex items-center gap-0.5">
              <HashtagChip
                displayName={tag.name}
                isNew={!tag.existing}
                onClick={() => acceptSuggestion(tag)}
              />
              <button
                type="button"
                aria-label={`Dismiss ${tag.name}`}
                onClick={() => dismissSuggestion(tag)}
                className="font-mono text-xs text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] cursor-pointer-always px-0.5"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between p-2 border-t border-[var(--sd-line)]">
        <button
          type="button"
          onClick={handleSuggestTags}
          disabled={suggesting || !editor}
          className="inline-flex items-center gap-1 font-mono text-xs text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] disabled:opacity-50 cursor-pointer-always"
        >
          {suggesting ? (
            <Spinner size={12} label="Suggesting tags" />
          ) : (
            <Sparkles className="size-3" aria-hidden />
          )}
          {suggesting ? "Suggesting…" : "Suggest tags"}
        </button>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xs text-[var(--sd-ink-faint)]"
            title="Press ⌘K (Ctrl+K) in the editor to insert a #tag"
          >
            <span className="font-mono">⌘K</span> for tags ·{" "}
            <span className="font-mono">⌘Enter</span> to capture
          </span>
          <Button onClick={handleSubmit} disabled={pending || !editor} size="sm">
            {pending ? (
              <>
                <Spinner size={13} label="Capturing" />
                Capturing…
              </>
            ) : (
              "Capture"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
