"use client";

import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import {
  advanceRecurringTask,
  createTask,
  ensureTaskPeople,
  updateTask,
} from "@/app/actions/tasks";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidePanel } from "@/components/ui/SidePanel";
import { HashtagDecorations } from "@/components/captures/hashtag-decorations";

import { createPersonDecorations } from "@/components/captures/person-decorations";
import { createHashtagSuggestion } from "@/components/captures/tiptap-suggestions";
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
  refToEntityMentionNode,
  segmentTextForSeeding,
} from "@/lib/references/tiptap-tokens";
import { serializeReference } from "@/lib/references/token";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  ExternalLink,
  Flag,
  FolderOpen,
  Link2,
  Repeat,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { UrlField } from "@/components/shared/UrlField";
import { PersonListField } from "@/components/shared/PersonListField";
import { MoveToMenu } from "./MoveToMenu";
import { ProjectAutocomplete } from "./ProjectAutocomplete";
import { STATUS_DOT, STATUS_TINT } from "./status";
import { TaskRecurrenceControl } from "./TaskRecurrenceControl";
import type { TasksOptimisticDispatch } from "./TasksClient";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";

type Priority = "P∞" | "P1" | "P2" | "P3";
type Status = "not started" | "up next" | "in progress" | "almost done" | "lesno";

interface ProjectOption {
  id: string;
  name: string;
  icon?: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaName?: string | null;
  areaEmoji?: string | null;
}

interface HashtagOption {
  id: string;
  name: string;
  displayName: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface Props {
  task: TaskWithProjects | null;
  projects: ProjectOption[];
  /** User's existing hashtags — feeds the # suggestion popover. */
  hashtags?: HashtagOption[];
  /** User's known people — feeds the @ suggestion popover + live decoration. */
  people?: PersonOption[];
  /**
   * Areas the user can file a new inline-created project under (issue #34).
   * Passed straight through to ProjectAutocomplete's create form.
   */
  areas: { id: string; name: string; emoji: string | null }[];
  /**
   * Inline project creation handler. Creates the project, surfaces it in the
   * picker, and resolves with its id so it can be auto-linked to the task.
   */
  onCreateProject: (input: { name: string; areaId: string }) => Promise<string | null>;
  open: boolean;
  onClose: () => void;
  addOptimistic: TasksOptimisticDispatch;
  /**
   * Delete-task handler lifted to TasksClient so it can wrap the server action
   * in useUndoToast. The panel only invokes the parent's handler; it does not
   * own the optimistic delete or the server call.
   */
  onDeleteTask?: (task: TaskWithProjects) => void;
  /**
   * "create" mode: `task` is a draft (not yet persisted). Save calls the
   * createTask Server Action; Cancel/close discards. "edit" mode (default):
   * existing behavior — Save calls updateTask, Delete is offered.
   */
  mode?: "edit" | "create";
}

const STATUS_PILL: { value: Status; label: string }[] = [
  { value: "not started", label: "Not started" },
  { value: "up next", label: "Up next" },
  { value: "in progress", label: "In progress" },
  { value: "almost done", label: "Almost done" },
  { value: "lesno", label: "Lesno" },
];

// Priority keeps the amber dominance ladder used by PriorityChip (alpha, not
// hue) so the register stays calm. P∞ is the strongest signal.
const PRIORITY_PILL: { value: Priority; label: string; opacity: number }[] = [
  { value: "P∞", label: "P∞", opacity: 1 },
  { value: "P1", label: "P1", opacity: 1 },
  { value: "P2", label: "P2", opacity: 0.6 },
  { value: "P3", label: "P3", opacity: 0.35 },
];

/**
 * Single-select craft-chip row (craft-ui-v2). Each value is a `.craft-chip`
 * pill; the selected one fills with its semantic tint where one exists
 * (status via STATUS_TINT) and falls back to the neutral `--selected` fill
 * otherwise (priority keeps its amber alpha ladder in the dot, no tint —
 * accent budget: color is data). `data-active` is set only while selected.
 */
function PillGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; color: string; tint?: string | null }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-active={selected ? "true" : undefined}
            onClick={() => onChange(opt.value)}
            className={cn("craft-chip cursor-pointer-always", selected && opt.tint)}
          >
            <span
              className="inline-block size-1.5 shrink-0 rounded-full transition-opacity duration-[160ms] motion-reduce:transition-none"
              style={{ backgroundColor: opt.color, opacity: selected ? 1 : 0.45 }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Case-insensitive union of two name lists, preserving first-seen casing/order. */
function unionNames(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...a, ...b]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

interface FormState {
  title: string;
  status: Status;
  priority: Priority;
  dueDate: string;
  url: string | null;
  notes: string;
  projectIds: string[];
  recurrence: RecurrenceRule | null;
  hashtagNames: string[];
  personNames: string[];
}

function toFormState(task: TaskWithProjects): FormState {
  return {
    title: task.title,
    status: task.status as Status,
    priority: task.priority as Priority,
    dueDate: task.dueDate ?? "",
    url: task.url ?? null,
    notes: task.notes ?? "",
    projectIds: task.projects.map((p) => p.id),
    recurrence: task.recurrence ?? null,
    hashtagNames: task.hashtags.map((h) => h.displayName),
    personNames: task.people.map((p) => p.name),
  };
}

function isDirty(a: FormState, b: FormState): boolean {
  return (
    a.title !== b.title ||
    a.status !== b.status ||
    a.priority !== b.priority ||
    a.dueDate !== b.dueDate ||
    a.url !== b.url ||
    a.notes !== b.notes ||
    JSON.stringify(a.projectIds.sort()) !== JSON.stringify(b.projectIds.sort()) ||
    JSON.stringify(a.recurrence) !== JSON.stringify(b.recurrence) ||
    JSON.stringify([...a.hashtagNames].sort()) !== JSON.stringify([...b.hashtagNames].sort()) ||
    JSON.stringify([...a.personNames].sort()) !== JSON.stringify([...b.personNames].sort())
  );
}

/**
 * Seed the notes editor from the stored string.
 *
 * Replaces `<p>${notes.split("\n").join("</p><p>")}</p>`, which could not seed
 * a reference at all: the token would parse as literal text and the chip the
 * user inserted would come back as raw `@[Label](ref://…)` the next time the
 * panel opened. Building the doc as JSON also means the notes are never spliced
 * into an HTML string on their way into the editor.
 *
 * Only references are structured here. `#tags` and `@names` in notes stay plain
 * text and are chipped by the live decorations, exactly as before.
 */
function notesToDoc(notes: string): Record<string, unknown> {
  return {
    type: "doc",
    content: notes.split("\n").map((para) => {
      const inline: Record<string, unknown>[] = [];
      for (const part of segmentTextForSeeding(para)) {
        if (part.kind === "ref") {
          inline.push(refToEntityMentionNode(part.ref));
        } else if (part.text) {
          inline.push({ type: "text", text: part.text });
        }
      }
      return inline.length === 0
        ? { type: "paragraph" }
        : { type: "paragraph", content: inline };
    }),
  };
}

/**
 * Task detail as an inline `SidePanel` (SDC-1 §2.8). The panel is part of the
 * page: opening it slides the Dock out of the shared right slot and the stage
 * genuinely narrows. No overlay, no backdrop, no fixed positioning, no focus
 * trap; the user keeps working with it open.
 *
 * The old fixed `inset-0` outside-click backdrop is gone by design. Closing is
 * explicit (X, Escape, route change), and every close path routes through the
 * dirty guard before it reaches the parent's `onClose`.
 */
export function TaskDetailPanel({
  task,
  projects,
  hashtags: initialHashtags = [],
  people: initialPeople = [],
  areas,
  onCreateProject,
  open,
  onClose,
  addOptimistic,
  onDeleteTask,
  mode = "edit",
}: Props) {
  const isCreate = mode === "create";
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hashtags] = useState(initialHashtags);
  const [people] = useState(initialPeople);
  // Discard-confirm dialog. When the user attempts to close (Esc, ×) or hits
  // Cancel while dirty, queue the action and show the AlertDialog.
  const [pendingDiscardAction, setPendingDiscardAction] = useState<"close" | "cancel" | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    status: "not started",
    priority: "P3",
    dueDate: "",
    url: null,
    notes: "",
    projectIds: [],
    recurrence: null,
    hashtagNames: [],
    personNames: [],
  });
  const [initialForm, setInitialForm] = useState<FormState>(form);

  // TipTap notes editor — supports #hashtag and the universal @ inline.
  // `immediatelyRender: false` avoids SSR hydration mismatch (Next 16 + React 19).
  // The panel itself is mounted only while open (TasksClient gates the mount),
  // so this editor no longer costs anything on a cold /tasks load.
  const notesEditor = useEditor({
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
      // Still in the schema (it seeds existing `@name` text and receives the
      // create-person sentinel) but no longer driven by `@` directly.
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
      EntityMention.configure({
        HTMLAttributes: ENTITY_MENTION_HTML_ATTRIBUTES,
        renderHTML: renderEntityMentionHTML,
        suggestion: createEntityMentionSuggestion({
          allowCreatePerson: true,
          onCreatePerson: ({ name, editor: ed, range }) =>
            insertCreatedPerson(ed, range, name),
        }),
      }),
      HashtagDecorations,
      createPersonDecorations(() => people),
    ],
    editorProps: {
      attributes: {
        class:
          "task-notes-editor focus:outline-none min-h-[80px] max-h-[200px] overflow-y-auto p-3 text-body",
        "data-placeholder": "Add a description… Use #tags and @people.",
      },
    },
    content: notesToDoc(form.notes),
  });

  // Parse the notes TipTap doc into { notes, hashtagNames, personNames }.
  function parseNotesEditor(): { notes: string; hashtagNames: string[]; personNames: string[] } {
    if (!notesEditor) return { notes: "", hashtagNames: [], personNames: [] };
    const json = notesEditor.getJSON();
    const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
    const tagCasing = new Map<string, string>();
    const personCasing = new Map<string, string>();
    let notes = "";

    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as {
        type?: string;
        text?: string;
        attrs?: { label?: string };
        content?: unknown[];
      };
      if (n.type === "text" && typeof n.text === "string") {
        notes += n.text;
        for (const m of n.text.matchAll(HASHTAG_RE)) {
          const raw = m[1];
          if (!raw) continue;
          const lower = raw.toLowerCase();
          if (!tagCasing.has(lower)) tagCasing.set(lower, raw);
        }
      }
      // Without this the node contributes nothing to the saved notes
      // (doc.textContent ignores renderText), so the reference would be erased
      // the first time the task was saved after inserting it.
      if (n.type === ENTITY_MENTION_NODE) {
        const ref = entityMentionAttrsToRef(n.attrs);
        if (ref) {
          notes += serializeReference(ref);
          // Keep personNames fed so ensureTaskPeople still links a referenced
          // person — the switch from personMention to entityMention must not
          // quietly stop writing people_references.
          if (ref.type === "person") {
            const lower = ref.label.toLowerCase();
            if (!personCasing.has(lower)) personCasing.set(lower, ref.label);
          }
        }
      }
      if (n.type === "mention" && typeof n.attrs?.label === "string") {
        const label = n.attrs.label;
        tagCasing.set(label.toLowerCase(), label);
        notes += `#${label}`;
      }
      if (n.type === "personMention" && typeof n.attrs?.label === "string") {
        const label = n.attrs.label;
        const lower = label.toLowerCase();
        if (!personCasing.has(lower)) personCasing.set(lower, label);
        notes += `@${label}`;
      }
      if (n.type === "paragraph" || n.type === "doc") {
        (n.content ?? []).forEach(walk);
        if (n.type === "paragraph") notes += "\n";
      }
    }
    walk(json);
    return {
      notes: notes.trim(),
      hashtagNames: Array.from(tagCasing.values()),
      personNames: Array.from(personCasing.values()),
    };
  }

  // Sync notes editor content when the task changes (panel opens a different task).
  useEffect(() => {
    if (!notesEditor) return;
    notesEditor.commands.setContent(notesToDoc(form.notes), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Sync form when task changes
  useEffect(() => {
    if (task) {
      const f = toFormState(task);
      setForm(f);
      setInitialForm(f);
    }
  }, [task?.id]);

  // Lazy retroactive backfill for LINKED PEOPLE — runs at most once per task
  // (gated on `peopleDerivedAt` being null), firing the Haiku smart-match to
  // link any existing person confidently referenced in the title/notes. Folds
  // the result into the panel + kanban; a no-op for tasks already derived and
  // skipped entirely in create mode (nothing is persisted yet).
  useEffect(() => {
    if (!open || !task || isCreate) return;
    if (task.peopleDerivedAt != null) return;

    let cancelled = false;
    const taskId = task.id;
    const key = (names: string[]) =>
      JSON.stringify(Array.from(new Set(names.map((n) => n.trim().toLowerCase()))).sort());
    const baseline = key(task.people.map((p) => p.name));
    void ensureTaskPeople(taskId).then((r) => {
      if (cancelled || !r.success || !r.data.changed) return;
      const nextNames = r.data.people.map((p) => p.name);
      setForm((prev) =>
        key(prev.personNames) === baseline ? { ...prev, personNames: nextNames } : prev,
      );
      setInitialForm((prev) =>
        key(prev.personNames) === baseline ? { ...prev, personNames: nextNames } : prev,
      );
      addOptimistic({ type: "update", id: taskId, patch: { people: r.data.people } });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  // In create mode, "dirty" = "has a title" — we just need something to save.
  // In edit mode, "dirty" = "form diverged from the initial snapshot".
  const dirty = task
    ? isCreate
      ? form.title.trim().length > 0
      : isDirty(form, initialForm)
    : false;

  const handleCreate = useCallback(async () => {
    const title = form.title.trim();
    if (!title) return;
    const parsed = parseNotesEditor();
    const { notes, hashtagNames } = parsed;
    // Save the union of the notes `@`-mentions and the explicit people field.
    const personNames = unionNames(parsed.personNames, form.personNames);
    const newId = crypto.randomUUID();
    const projectChips = projects
      .filter((p) => form.projectIds.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    // Optimistic insert so the new row pops into the kanban immediately.
    addOptimistic({
      type: "insert",
      row: {
        id: newId,
        title,
        notes: notes || null,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || null,
        url: form.url,
        kanbanPosition: 0,
        completedAt: null,
        createdAt: new Date(),
        recurrence: form.recurrence,
        projects: projectChips,
        hashtags: hashtagNames.map((name) => ({ id: `pending-${name}`, name: name.toLowerCase(), displayName: name })),
        people: personNames.map((name) => ({ id: `pending-${name}`, name })),
        peopleDerivedAt: null,
      },
    });
    const r = await createTask({
      id: newId,
      title,
      notes: notes || null,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || null,
      url: form.url,
      projectIds: form.projectIds,
      recurrence: form.recurrence,
      hashtagNames,
      personNames,
    });
    if (!r.success) {
      toast.error(r.error);
      addOptimistic({ type: "revert", id: newId });
      return;
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, projects, addOptimistic, onClose, notesEditor]);

  const handleSave = useCallback(async () => {
    if (!task) return;
    if (isCreate) {
      await handleCreate();
      return;
    }
    const parsed = parseNotesEditor();
    const { notes, hashtagNames } = parsed;
    // Save the union of the notes `@`-mentions and the explicit people field.
    const personNames = unionNames(parsed.personNames, form.personNames);
    const patch = {
      title: form.title.trim() || task.title,
      notes: notes || null,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || null,
      url: form.url,
      recurrence: form.recurrence,
    };
    // Optimistic update first — project links also flow through to optimistic
    // state via the patch.
    const projectChips = projects
      .filter((p) => form.projectIds.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    addOptimistic({
      type: "update",
      id: task.id,
      patch: {
        ...patch,
        projects: projectChips,
        hashtags: hashtagNames.map((name) => ({ id: `pending-${name}`, name: name.toLowerCase(), displayName: name })),
        people: personNames.map((name) => ({ id: `pending-${name}`, name })),
      },
    });
    const r = await updateTask({
      id: task.id,
      ...patch,
      projectIds: form.projectIds,
      hashtagNames,
      personNames,
    });
    if (!r.success) {
      toast.error(r.error);
      addOptimistic({ type: "revert", id: task.id });
      return;
    }
    if (form.status === "lesno" && task.status !== "lesno") {
      toast("Lesno.");
    }
    // Reflect the saved union into both the field and the dirty baseline so a
    // notes-only `@`-mention doesn't leave the panel stuck dirty after save.
    setForm((prev) => ({ ...prev, personNames }));
    setInitialForm({ ...form, notes, hashtagNames, personNames });
    // Realtime echo invalidates ['tasks', userId] → refetch → cache settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, form, projects, addOptimistic, isCreate, handleCreate, notesEditor]);

  // Advance a recurring task to its next occurrence (issue #144). Completing an
  // occurrence does NOT permanently finish the series — the row rolls its due
  // date forward and resets to "not started". Optimistic so the panel reflects
  // it instantly; Realtime echo reconciles.
  const handleAdvanceOccurrence = useCallback(async () => {
    if (!task || !form.recurrence) return;
    const r = await advanceRecurringTask({ id: task.id, mode: "complete" });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    addOptimistic({
      type: "update",
      id: task.id,
      patch: { dueDate: r.data.nextDueDate, status: "not started", completedAt: null },
    });
    toast("Done. Next occurrence scheduled.");
    onClose();
  }, [task, form.recurrence, addOptimistic, onClose]);

  // Cmd+Enter to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (dirty) handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dirty, handleSave]);

  // beforeunload guard — fires the browser's native "Leave site?" prompt
  // when the panel has unsaved changes and the user refreshes/closes-tab.
  useEffect(() => {
    if (!open || !dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, dirty]);

  // Every close path (the host's Escape, the header ×, a route change) routes
  // through this dirty guard. SidePanelHost owns the Escape listener, so the
  // panel no longer needs one of its own.
  const requestClose = useCallback(() => {
    // Create mode: nothing is persisted yet; closing is always safe.
    if (isCreate) {
      onClose();
      return;
    }
    if (dirty) {
      setPendingDiscardAction("close");
      return;
    }
    onClose();
  }, [dirty, onClose, isCreate]);

  // Cancel button: confirm when dirty (edit mode only); otherwise close.
  const handleCancelClick = useCallback(() => {
    if (isCreate) {
      onClose();
      return;
    }
    if (dirty) {
      setPendingDiscardAction("cancel");
      return;
    }
    onClose();
  }, [dirty, onClose, isCreate]);

  // Confirmed discard: reset form to initial, then close the panel.
  const handleConfirmDiscard = useCallback(() => {
    setPendingDiscardAction(null);
    setForm(initialForm);
    onClose();
  }, [initialForm, onClose]);

  // Action-row: copy the task title (cheap copy-on-click affordance).
  const handleCopyTitle = useCallback(() => {
    const t = (form.title || task?.title || "").trim();
    if (!t) return;
    void navigator.clipboard?.writeText(t);
    toast("Copied.");
  }, [form.title, task]);

  function handleDelete() {
    if (!task) return;
    // Defer to the parent handler, which wraps the server call in useUndoToast
    // (5s Undo window) and owns the optimistic delete.
    if (onDeleteTask) {
      onDeleteTask(task);
      setShowDeleteConfirm(false);
      onClose();
      return;
    }
    // Defensive fallback (parent always passes onDeleteTask in current usage):
    // no-op + close the dialog.
    setShowDeleteConfirm(false);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <SidePanel
        open={open && task !== null}
        onClose={requestClose}
        title={isCreate ? "New task" : "Task"}
        actions={
          <>
            <PanelIconButton icon={Copy} label="Copy task title" onClick={handleCopyTitle} />
            {form.url ? (
              <PanelIconButton
                icon={ExternalLink}
                label="Open linked URL"
                onClick={() => {
                  if (form.url) window.open(form.url, "_blank", "noopener,noreferrer");
                }}
              />
            ) : null}
          </>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            {isCreate ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
                className={cn(
                  "cursor-pointer-always rounded-lg px-2.5 py-1.5 text-meta font-medium text-[var(--ink-coral)]",
                  "transition-colors duration-[160ms] ease-out disabled:opacity-40",
                  "hover:bg-[color-mix(in_oklch,var(--ink-coral)_12%,transparent)]"
                )}
              >
                Delete
              </button>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={handleCancelClick}
                disabled={isPending}
                title={
                  isCreate
                    ? "Discard this draft"
                    : dirty
                      ? "Discard unsaved changes"
                      : undefined
                }
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-lg"
                onClick={() => startTransition(() => void handleSave())}
                disabled={!dirty || isPending}
              >
                {isCreate ? "Create task" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        {task ? (
          <div className="flex flex-col gap-6">
            {/* Title — inline editable, quiet underline that only reads on focus. */}
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              autoFocus={isCreate}
              placeholder={isCreate ? "Task title…" : undefined}
              className={cn(
                "w-full bg-transparent text-subtitle font-medium text-[var(--ink)]",
                "border-b border-transparent pb-1 focus:border-[var(--edge-strong)] focus:outline-none",
                "transition-colors duration-[160ms] ease-out",
                "placeholder:font-normal placeholder:text-[var(--ink-faint)]"
              )}
              aria-label="Task title"
            />

            <FieldSection label="Status" icon={CircleDot}>
              <PillGroup
                ariaLabel="Status"
                value={form.status}
                onChange={(v) => set("status", v)}
                options={STATUS_PILL.map((s) => ({
                  value: s.value,
                  label: s.label,
                  color: STATUS_DOT[s.value],
                  tint: STATUS_TINT[s.value],
                }))}
              />
            </FieldSection>

            <FieldSection label="Priority" icon={Flag}>
              <PillGroup
                ariaLabel="Priority"
                value={form.priority}
                onChange={(v) => set("priority", v)}
                options={PRIORITY_PILL.map((p) => ({
                  value: p.value,
                  label: p.label,
                  color: `color-mix(in oklch, var(--ink-amber) ${Math.round(p.opacity * 100)}%, var(--edge))`,
                }))}
              />
            </FieldSection>

            <FieldSection label="Due date" icon={Clock}>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  className={cn(
                    "h-8 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-2",
                    "font-mono text-meta text-[var(--ink)] outline-none tabular-nums",
                    "focus-visible:border-[var(--edge-strong)]",
                    "transition-colors duration-[160ms] ease-out"
                  )}
                />
                {/* Inline clear — empties the date → Inbox on save. Reversible,
                    so no confirm dialog. */}
                {form.dueDate && (
                  <button
                    type="button"
                    onClick={() => set("dueDate", "")}
                    title="Clear due date (move to Inbox)"
                    aria-label="Clear due date (move to Inbox)"
                    className="cursor-pointer-always rounded-sm p-1 text-[var(--ink-faint)] transition-colors duration-[160ms] hover:text-[var(--ink)]"
                  >
                    <X size={12} strokeWidth={1.5} />
                  </button>
                )}
                {/* MoveToMenu kept as the shortcut path. */}
                <MoveToMenu
                  variant="inline"
                  allowClear
                  onPick={(ymd) => set("dueDate", ymd ?? "")}
                />
              </div>
              {!form.dueDate && task?.dueDate && (
                <p className="text-micro text-[var(--ink-faint)]">Will move to Inbox</p>
              )}
            </FieldSection>

            <FieldSection label="URL" icon={Link2}>
              <UrlField
                value={form.url}
                onChange={(next) => set("url", next)}
                disabled={isPending}
              />
            </FieldSection>

            <FieldSection label="Repeat" icon={Repeat}>
              <TaskRecurrenceControl
                value={form.recurrence}
                onChange={(next) => set("recurrence", next)}
                disabled={isPending}
              />
              {!isCreate && form.recurrence && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-fit rounded-lg"
                  disabled={isPending}
                  onClick={() => startTransition(() => void handleAdvanceOccurrence())}
                >
                  Complete and advance to next
                </Button>
              )}
            </FieldSection>

            <FieldSection label="Projects" icon={FolderOpen}>
              <ProjectAutocomplete
                value={form.projectIds}
                onChange={(ids) => set("projectIds", ids)}
                projects={projects}
                areas={areas}
                onCreateProject={onCreateProject}
              />
            </FieldSection>

            <FieldSection label="People" icon={Users}>
              <PersonListField
                value={form.personNames}
                onChange={(next) => set("personNames", next)}
                suggestions={people}
                disabled={isPending}
              />
            </FieldSection>

            <FieldSection label="Description">
              <div className="rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] transition-colors duration-[160ms] focus-within:border-[var(--edge-strong)]">
                <EditorContent editor={notesEditor} />
              </div>
            </FieldSection>

            {/* Activity — real read-only fields only. */}
            {!isCreate && (
              <div className="flex flex-col gap-2 border-t border-[var(--edge)] pt-4">
                <ActivityRow icon={Calendar} label="Created" value={fmtDate(task.createdAt)} />
                <ActivityRow
                  icon={CheckCircle2}
                  label="Completed"
                  value={fmtDate(task.completedAt)}
                />
              </div>
            )}
          </div>
        ) : null}
      </SidePanel>

      {/* Discard-unsaved-changes confirm */}
      <AlertDialog
        open={pendingDiscardAction !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDiscardAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title font-semibold">
              Discard changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              Your edits haven&apos;t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-meta">Keep editing</AlertDialogCancel>
            <AlertDialogAction className="text-meta" onClick={handleConfirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-title font-semibold">Delete task?</DialogTitle>
            <DialogDescription className="text-body">
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-meta"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Never mind
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-lg text-meta"
              onClick={() => startTransition(() => handleDelete())}
              disabled={isPending}
            >
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldSection({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-micro font-medium text-[var(--ink-muted)]">
        {Icon ? (
          <Icon size={13} strokeWidth={1.75} className="text-[var(--ink-faint)]" />
        ) : null}
        {label}
      </label>
      {children}
    </div>
  );
}

function ActivityRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-meta">
      <span className="flex items-center gap-1.5 text-[var(--ink-muted)]">
        <Icon size={12} strokeWidth={1.75} className="text-[var(--ink-faint)]" />
        {label}
      </span>
      <span className="font-mono text-micro tabular-nums text-[var(--ink-muted)]">
        {value ?? "--"}
      </span>
    </div>
  );
}

/**
 * Quiet header icon button: 16px glyph, soft hover backplate. Rendered inside
 * the SidePanel header's actions slot.
 */
function PanelIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg cursor-pointer-always",
        "text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out",
        "hover:bg-[var(--hover)] hover:text-[var(--ink)]"
      )}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}

/** Format a real timestamp for the Activity read-only rows; null when absent. */
function fmtDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
