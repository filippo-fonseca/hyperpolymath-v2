"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { X } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ProjectMultiSelect,
  type ProjectMultiSelectOption,
} from "@/components/shared/ProjectMultiSelect";
import type { InlineProjectArea } from "@/components/shared/InlineProjectCreateForm";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { UrlField } from "@/components/shared/UrlField";
import { createHashtagSuggestion } from "./tiptap-suggestions";
import { HashtagDecorations } from "./hashtag-decorations";
import { createPersonDecorations } from "./person-decorations";
import { createPersonSuggestion } from "./person-suggestions";
import { deleteCapture, updateCapture } from "@/app/actions/captures";
import { tokenizeContent } from "@/lib/captures/tokenize-content";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { cn } from "@/lib/utils";
import { ConvertCaptureToTaskDialog } from "./ConvertCaptureToTaskDialog";

interface HashtagSource {
  id: string;
  name: string;
  displayName: string;
}

interface PersonSource {
  id: string;
  name: string;
}

interface Props {
  capture: CaptureWithLinks | null;
  hashtags: HashtagSource[];
  /** The user's people, for the `@`-mention menu + live decoration (Phase C). */
  people?: PersonSource[];
  projects: ProjectMultiSelectOption[];
  /** Areas a new project can be filed under (inline project creation). */
  areas?: InlineProjectArea[];
  /** Creates a project inline; resolves to the new id, or null on failure. */
  onCreateProject?: (input: { name: string; areaId: string }) => Promise<string | null>;
  open: boolean;
  onClose: () => void;
  /**
   * Phase 3 — optimistic update callback. When wired (CapturesClient mounts
   * the panel), edits are reflected in the feed instantly via
   * `addOptimistic({ type: "update", id, patch })`. Server reject → silent
   * revert via useOptimistic + toast.error (D-03).
   */
  onOptimisticUpdate?: (
    id: string,
    patch: Partial<CaptureWithLinks>,
  ) => void;
  /**
   * Phase 3 — optimistic delete callback. Same shape as the one threaded
   * through CapturesFeed → CaptureCard.
   */
  onOptimisticDelete?: (id: string) => void;
  /**
   * RT-06 rollback — drops the optimistic update/delete for this id when the
   * Server Action rejects. The feed overlay (useOptimisticList) persists
   * pending ops until canonical reconciles, so it no longer auto-reverts.
   */
  onOptimisticRevert?: (id: string) => void;
  /**
   * Signed-in user's Google profile avatar URL (from Supabase Auth metadata).
   * Rendered slightly larger (h-10 w-10) alongside the panel header — mirrors
   * the Twitter-style rhythm on feed cards for visual continuity.
   */
  userAvatarUrl?: string | null;
  /** Single-char fallback for `<AvatarFallback>` when no avatar URL is set. */
  userInitials?: string;
}

interface FormState {
  content: string;
  hashtagNames: string[];
  personNames: string[];
  projectIds: string[];
  url: string | null;
}

function captureToFormState(c: CaptureWithLinks): FormState {
  return {
    content: c.content,
    // Preserve first-seen casing from the loaded capture
    hashtagNames: c.hashtags.map((h) => h.displayName),
    personNames: c.people.map((p) => p.name),
    projectIds: c.projects.map((p) => p.id),
    url: c.url ?? null,
  };
}

/**
 * Build a TipTap doc JSON from a stored capture's plain content + hashtags.
 *
 * Captures are stored as plain text in `content` (with literal `#word`
 * substrings). The TipTap editor wants a structured doc with `mention` nodes
 * for chips. We split the content on `#word` boundaries — for each match that
 * corresponds to a known hashtag on this capture, we emit a mention node;
 * otherwise plain text. This matches the read path that CaptureCard uses for
 * inline chip rendering.
 */
function contentToTipTapDoc(
  content: string,
  knownHashtags: { name: string; displayName: string }[],
  knownPeople: { name: string }[] = [],
) {
  const lookup = new Map(knownHashtags.map((h) => [h.name, h.displayName]));
  type Inline =
    | { type: "text"; text: string }
    | { type: "mention"; attrs: { id: string; label: string } }
    | { type: "personMention"; attrs: { id: string; label: string } };
  // Split paragraphs first (preserve newlines as paragraph boundaries)
  const paragraphs = content.split(/\n+/);
  return {
    type: "doc",
    content: paragraphs.map((para) => {
      // Tokenize each paragraph with the shared tokenizer so #tags and known
      // @people seed as committed mention nodes (the rest stays plain text).
      const segments = tokenizeContent(para, {
        hashtagDisplay: lookup,
        personNames: knownPeople.map((p) => p.name),
      });
      const inline: Inline[] = [];
      for (const seg of segments) {
        if (seg.kind === "hashtag") {
          inline.push({ type: "mention", attrs: { id: seg.display, label: seg.display } });
        } else if (seg.kind === "person") {
          inline.push({ type: "personMention", attrs: { id: seg.display, label: seg.display } });
        } else if (seg.value) {
          inline.push({ type: "text", text: seg.value });
        }
      }
      return inline.length === 0
        ? { type: "paragraph" }
        : { type: "paragraph", content: inline };
    }),
  };
}

/**
 * Notion-style detail panel for editing a capture.
 *
 * Mirrors TaskDetailPanel's shadcn Sheet pattern but wider (560px) since
 * captures are freeform — content + hashtag chips + project links + timestamps
 * all live inline. Reuses the same TipTap editor + Mention extension as the
 * composer (single source of truth for chip rendering + extraction).
 *
 * - Content edits via TipTap (chips render inline; `#word` plain text is
 *   permissively parsed on save — matches CaptureComposer.parseEditor)
 * - Hashtags edited implicitly via the editor (no separate input)
 * - Project links edited via ProjectMultiSelect
 * - Save: Cmd+Enter or "Save changes"button
 * - Delete: footer button with confirm dialog (same copy as inline delete)
 * - Close: Esc, click outside, or × button
 */
export function CaptureDetailPanel({
  capture,
  hashtags,
  people = [],
  projects,
  areas,
  onCreateProject,
  open,
  onClose,
  onOptimisticUpdate,
  onOptimisticDelete,
  onOptimisticRevert,
  userAvatarUrl,
  userInitials,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Plan 05-04 (JARVIS-13 / D-14) — Convert-to-task dialog mount state.
  const [showConvert, setShowConvert] = useState(false);
  const isJarvisCreated = capture?.createdVia === "jarvis";
  // Discard-confirm dialog. `pendingDiscardAction` records what to do *after*
  // the user confirms discard: "close" (Sheet close attempt) or "cancel"
  // (Cancel button click while dirty).
  const [pendingDiscardAction, setPendingDiscardAction] = useState<
    "close" | "cancel" | null
  >(null);

  const [form, setForm] = useState<FormState>({
    content: "",
    hashtagNames: [],
    personNames: [],
    projectIds: [],
    url: null,
  });
  const [initialForm, setInitialForm] = useState<FormState>(form);
  // Mirror of the editor's current parsed state. TipTap's editor instance
  // updates internally on every keystroke but does NOT trigger a re-render of
  // this React component — so the dirty check (which reads the editor) used
  // to be stale until something else (e.g. project link change) forced a
  // re-render. We mirror parsed content into React state via `onUpdate` so
  // any keystroke or hashtag insertion immediately re-evaluates `dirty`.
  const [editorState, setEditorState] = useState<{
    content: string;
    hashtagNames: string[];
    personNames: string[];
  }>({ content: "", hashtagNames: [], personNames: [] });

  // Build initial TipTap doc from the loaded capture (rebuilt on capture change)
  const initialDoc = useMemo(() => {
    if (!capture) return { type: "doc", content: [{ type: "paragraph" }] };
    return contentToTipTapDoc(capture.content, capture.hashtags, capture.people);
  }, [capture]);

  // Permissive parse of an arbitrary TipTap JSON doc. Pulled out of the
  // closure-captured `parseEditor` so `onUpdate` (which receives a fresh
  // editor instance) can use the same extraction logic without depending on
  // the closed-over `editor` ref.
  const parseEditorJSON = useCallback(
    (json: unknown): { content: string; hashtagNames: string[]; personNames: string[] } => {
      const tagCasing = new Map<string, string>();
      const personCasing = new Map<string, string>();
      let content = "";
      const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;

      function extractFromText(text: string): void {
        for (const m of text.matchAll(HASHTAG_RE)) {
          const raw = m[1];
          if (!raw) continue;
          const lower = raw.toLowerCase();
          if (!tagCasing.has(lower)) tagCasing.set(lower, raw);
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
          const label = n.attrs.label;
          const lower = label.toLowerCase();
          tagCasing.set(lower, label);
          content += `#${label}`;
        }
        if (n.type === "personMention" && typeof n.attrs?.label === "string") {
          const label = n.attrs.label;
          const lower = label.toLowerCase();
          if (!personCasing.has(lower)) personCasing.set(lower, label);
          content += `@${label}`;
        }
        if (n.type === "paragraph" || n.type === "doc") {
          (n.content ?? []).forEach(walk);
          if (n.type === "paragraph") content += "\n";
        }
      }
      walk(json);
      return {
        content: content.trim(),
        hashtagNames: Array.from(tagCasing.values()),
        personNames: Array.from(personCasing.values()),
      };
    },
    [],
  );

  const editor = useEditor(
    {
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
        // `@person` mention — twin of the composer's personMention node so
        // editing a capture supports the same dropdown + inline-create flow.
        Mention.extend({ name: "personMention" }).configure({
          HTMLAttributes: { class: "person-chip-inline" },
          renderHTML({ options, node }) {
            return [
              "span",
              { ...options.HTMLAttributes, "data-person": node.attrs.label },
              `@${node.attrs.label}`,
            ];
          },
          suggestion: createPersonSuggestion(() => people),
        }),
        // Live-decorate plain `#word` text so the token styling lands without
        // waiting for the suggestion popover to commit a Mention node (#41).
        HashtagDecorations,
        // Same for `@name` matching a known person (amber register).
        createPersonDecorations(() => people),
      ],
      editorProps: {
        attributes: {
          class:
            "capture-detail-editor focus:outline-none min-h-[160px] max-h-[400px] overflow-y-auto p-4 font-serif text-base",
        },
      },
      content: initialDoc,
      // Mirror parsed editor state into React on every doc change. Without
      // this, `dirty` only re-evaluated when other React state (e.g. project
      // links) changed, so text-only / hashtag-only edits never enabled Save.
      // Fires for user input AND `editor.commands.setContent(...)` — which is
      // what we want for `resetToInitial` to also clear the dirty flag.
      onUpdate({ editor: e }) {
        setEditorState(parseEditorJSON(e.getJSON()));
      },
    },
    // Recreate the editor when the capture identity changes so its content
    // reflects the freshly-loaded doc (otherwise reusing the same editor
    // instance shows stale content).
    [capture?.id, hashtags, people],
  );

  // Sync form state when capture changes. `onUpdate` doesn't fire on initial
  // editor creation, so seed `editorState` from the canonical capture content
  // here to keep the dirty comparison anchored to the loaded doc.
  useEffect(() => {
    if (capture) {
      const f = captureToFormState(capture);
      setForm(f);
      setInitialForm(f);
      setEditorState({
        content: f.content,
        hashtagNames: f.hashtagNames,
        personNames: f.personNames,
      });
    }
  }, [capture?.id]);

  // Permissive parse — wraps `parseEditorJSON` for the imperative save path.
  // Mirrors CaptureComposer.parseEditor exactly so detail edits get the same
  // hashtag extraction behavior (plain `#word` text counts).
  const parseEditor = useCallback((): {
    content: string;
    hashtagNames: string[];
    personNames: string[];
  } => {
    if (!editor) return { content: "", hashtagNames: [], personNames: [] };
    return parseEditorJSON(editor.getJSON());
  }, [editor, parseEditorJSON]);

  // Dirty check — content/hashtags/people from `editorState` (kept in sync by
  // `onUpdate`), projects from `form` state.
  const dirty =
    !!capture &&
    (editorState.content !== initialForm.content ||
      JSON.stringify([...editorState.hashtagNames].sort()) !==
        JSON.stringify([...initialForm.hashtagNames].sort()) ||
      JSON.stringify([...editorState.personNames].sort()) !==
        JSON.stringify([...initialForm.personNames].sort()) ||
      JSON.stringify([...form.projectIds].sort()) !==
        JSON.stringify([...initialForm.projectIds].sort()) ||
      form.url !== initialForm.url);

  const handleSave = useCallback(async () => {
    if (!capture) return;
    const { content, hashtagNames, personNames } = parseEditor();
    if (!content) {
      toast.error("Capture cannot be empty.");
      return;
    }
    // Phase 3 — optimistic update first. Build an optimistic patch that
    // mirrors what the server will store; the Realtime echo + TanStack Query
    // refetch reconciles the join rows (hashtags + projects) to the canonical
    // shape on the next pass.
    const optimisticHashtags = hashtagNames.map((name) => {
      const lower = name.toLowerCase();
      const known = capture.hashtags.find((h) => h.name === lower);
      return (
        known ?? {
          id: `pending-${name}`,
          name: lower,
          displayName: name,
        }
      );
    });
    const optimisticProjects = form.projectIds
      .map((id) => {
        const p = projects.find((proj) => proj.id === id);
        return p ? { id: p.id, name: p.name } : null;
      })
      .filter((p): p is { id: string; name: string } => p !== null);
    const optimisticPeople = personNames.map((name) => {
      const known = capture.people.find((p) => p.name.toLowerCase() === name.toLowerCase());
      return known ?? { id: `pending-${name}`, name };
    });
    onOptimisticUpdate?.(capture.id, {
      content,
      hashtags: optimisticHashtags,
      people: optimisticPeople,
      projects: optimisticProjects,
      url: form.url,
      updatedAt: new Date(),
    });

    const r = await updateCapture({
      id: capture.id,
      content,
      hashtagNames,
      personNames,
      projectIds: form.projectIds,
      url: form.url,
    });
    if (!r.success) {
      toast.error(r.error);
      onOptimisticRevert?.(capture.id);
      return;
    }
    toast("Capture updated.");
    setInitialForm({ content, hashtagNames, personNames, projectIds: form.projectIds, url: form.url });
    // No manual cache busting — Realtime echo + invalidation handles it (D-12).
  }, [capture, parseEditor, form.projectIds, form.url, onOptimisticUpdate, onOptimisticRevert, projects]);

  // Cmd+Enter to save (per UI-SPEC §Right-Side Detail Panel)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (dirty) startTransition(() => void handleSave());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dirty, handleSave]);

  // beforeunload guard — show native browser "Leave site?"prompt when the
  // panel has unsaved changes and the user tries to refresh/close-tab.
  // Only wired when the panel is open AND dirty.
  useEffect(() => {
    if (!open || !dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Required for some browsers (Chrome/Edge) to actually show the prompt
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, dirty]);

  // Reset the editor + form state back to the initial capture (used when
  // discarding edits via Cancel button or via the close-confirm dialog).
  const resetToInitial = useCallback(() => {
    if (!capture) return;
    setForm(initialForm);
    if (editor) {
      editor.commands.setContent(contentToTipTapDoc(initialForm.content, capture.hashtags));
    }
  }, [capture, editor, initialForm]);

  // Intercept Sheet close attempts (Esc, click outside, × button). If the
  // panel is dirty, open the discard-confirm dialog instead of closing.
  const handleSheetOpenChange = useCallback(
    (next: boolean) => {
      if (next) return; // opening — no-op (panel is opened by parent state)
      if (dirty) {
        setPendingDiscardAction("close");
        return;
      }
      onClose();
    },
    [dirty, onClose],
  );

  // Cancel button click: if dirty → confirm discard; if clean → just close.
  const handleCancelClick = useCallback(() => {
    if (dirty) {
      setPendingDiscardAction("cancel");
      return;
    }
    onClose();
  }, [dirty, onClose]);

  // Confirm discard: reset edits, then perform the pending action.
  const handleConfirmDiscard = useCallback(() => {
    const action = pendingDiscardAction;
    setPendingDiscardAction(null);
    resetToInitial();
    if (action === "close" || action === "cancel") {
      // Both end in the panel closing — Cancel was always going to close too.
      onClose();
    }
  }, [pendingDiscardAction, resetToInitial, onClose]);

  async function handleDelete() {
    if (!capture) return;
    // Phase 3 — optimistic delete first; row vanishes from the feed instantly.
    onOptimisticDelete?.(capture.id);
    const r = await deleteCapture(capture.id);
    if (!r.success) {
      toast.error(r.error);
      onOptimisticRevert?.(capture.id);
      return;
    }
    toast("Capture deleted.");
    setShowDeleteConfirm(false);
    onClose();
    // No manual cache busting — Realtime echo + invalidation handles it (D-12).
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[560px] p-0 flex flex-col"
          showCloseButton={false}
        >
          {capture && (
            <>
              {/* Header — minimal, journal-paper feel. Avatar mirrors the Twitter-
                  style rhythm of the feed cards for visual continuity across surfaces. */}
              <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0 mt-0.5">
                    {userAvatarUrl ? (
                      <AvatarImage
                        src={userAvatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <AvatarFallback className="font-sans text-[13px] text-muted-foreground">
                      {userInitials ?? "·"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <SheetTitle className="font-serif text-[20px] font-semibold leading-tight text-foreground p-0 m-0">
                      Capture
                    </SheetTitle>
                    <p className="font-sans text-[13px] text-muted-foreground">
                      <RelativeTime date={capture.createdAt} />
                      <span aria-hidden> · </span>
                      <span title={format(capture.createdAt, "PPpp")}>
                        {format(capture.createdAt, "PP")}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSheetOpenChange(false)}
                    aria-label="Close detail panel"
                    className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0 mt-1"
                  >
                    <X size={16} className="text-muted-foreground" />
                  </button>
                </div>
              </SheetHeader>

              {/* Body */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-6 px-6 py-5">
                {/* Content editor — generous whitespace, journal-paper aesthetic */}
                <section className="flex flex-col gap-2">
                  <h3 className="font-sans text-[13px] text-muted-foreground uppercase tracking-wider">
                    Content
                  </h3>
                  <div className="rounded-xl glass-tile focus-within:border-[var(--hud-cyan)] focus-within:[--glass-glow-color:var(--hud-cyan)] focus-within:[--glass-glow:12%]">
                    <EditorContent editor={editor} />
                  </div>
                  <p className="font-sans text-[13px] text-muted-foreground italic">
                    Type # to add a hashtag. Plain #words are picked up too.
                  </p>
                </section>

                {/* Project links */}
                <section className="flex flex-col gap-2">
                  <h3 className="font-sans text-[13px] text-muted-foreground uppercase tracking-wider">
                    Linked projects
                  </h3>
                  <ProjectMultiSelect
                    value={form.projectIds}
                    onChange={(ids) =>
                      setForm((prev) => ({ ...prev, projectIds: ids }))
                    }
                    projects={projects}
                    placeholder="Link to projects"
                    areas={areas}
                    onCreateProject={onCreateProject}
                  />
                </section>

                {/* URL property (issue #101) — Notion-style link field. Clickable
                    when set; inline input to add/edit/clear. */}
                <section className="flex flex-col gap-2">
                  <h3 className="font-sans text-[13px] text-muted-foreground uppercase tracking-wider">
                    URL
                  </h3>
                  <UrlField
                    value={form.url}
                    onChange={(next) => setForm((prev) => ({ ...prev, url: next }))}
                    disabled={isPending}
                  />
                </section>

                {/* Metadata */}
                <section className="flex flex-col gap-2">
                  <h3 className="font-sans text-[13px] text-muted-foreground uppercase tracking-wider">
                    Info
                  </h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-sans text-[13px] p-4 rounded-xl glass-tile">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-foreground">
                      {format(capture.createdAt, "PPpp")}
                    </dd>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="text-foreground">
                      {format(capture.updatedAt, "PPpp")}
                    </dd>
                    {capture.sourceChannel && (
                      <>
                        <dt className="text-muted-foreground">Channel</dt>
                        <dd className="text-foreground">
                          {capture.sourceChannel === "email" ? "Email" : capture.sourceChannel}
                        </dd>
                      </>
                    )}
                    {(capture.sourceDevice || capture.sourceInput) && (
                      <>
                        <dt className="text-muted-foreground">Source</dt>
                        <dd className="text-foreground">
                          {capture.sourceDevice ?? "Unknown device"}
                          {capture.sourceInput
                            ? ` · ${
                                capture.sourceInput === "voice"
                                  ? "spoken"
                                  : capture.sourceInput === "email"
                                    ? "email"
                                    : "typed"
                              }`
                            : ""}
                        </dd>
                      </>
                    )}
                  </dl>
                </section>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-sans text-[13px] text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isPending}
                  >
                    Delete capture
                  </Button>
                  {isJarvisCreated && (
                    // D-14 / JARVIS-13 — only render for createdVia === "jarvis"
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-sans text-[13px]"
                      onClick={() => setShowConvert(true)}
                      disabled={isPending}
                    >
                      Convert to task
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-sans text-[13px] text-muted-foreground transition-opacity",
                      dirty ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden={!dirty}
                  >
                    Cmd+Enter to save
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-sans text-[13px]"
                    onClick={handleCancelClick}
                    disabled={isPending}
                    title={dirty ? "Discard unsaved changes" : "Close"}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="font-sans text-[13px]"
                    onClick={() => startTransition(() => void handleSave())}
                    disabled={!dirty || isPending}
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Discard-unsaved-changes confirm — fires on close (Esc / outside / ×)
          or on Cancel button click while dirty. Rendered outside the Sheet
          portal stacking; z-[60] in the AlertDialog overlay keeps it above
          the Sheet (z-50) so Esc-to-close on the AlertDialog doesn't bubble
          into the Sheet. */}
      <AlertDialog
        open={pendingDiscardAction !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDiscardAction(null);
        }}
      >
        <AlertDialogContent className="font-serif">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[20px]">
              Discard changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-serif text-base">
              Your edits to this capture will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-[13px]">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-sans text-[13px]"
              onClick={handleConfirmDiscard}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* JARVIS-13 / D-14 — Convert-to-task dialog (gated on createdVia === "jarvis") */}
      {capture && isJarvisCreated && showConvert ? (
        <ConvertCaptureToTaskDialog
          open={showConvert}
          onOpenChange={(o) => {
            setShowConvert(o);
            // On successful submit the dialog closes itself + the capture is
            // deleted server-side. Close the detail panel too — once the
            // capture is gone, the panel has no canonical row to render.
            if (!o) {
              // Re-evaluate via parent: if the capture id is no longer present
              // in the feed (post-Realtime echo), `selectedCapture` becomes
              // null and `open` flips to false. Until then, the panel still
              // renders the stale row briefly. We force-close here for snap.
              // (Non-destructive: if the convert failed and the dialog stayed
              // open, this branch never runs because onOpenChange(false)
              // doesn't fire.)
              onClose();
            }
          }}
          capture={{ id: capture.id, content: capture.content }}
          existingProjectIds={capture.projects.map((p) => p.id)}
          availableProjects={projects}
          onOptimisticDelete={onOptimisticDelete}
        />
      ) : null}

      {/* Delete confirm dialog — UI-SPEC exact copy */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">
              Delete this capture?
            </DialogTitle>
            <DialogDescription className="font-serif text-base">
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="font-sans text-[13px]"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Never mind
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="font-sans text-[13px]"
              onClick={() => startTransition(() => void handleDelete())}
              disabled={isPending}
            >
              Delete capture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
