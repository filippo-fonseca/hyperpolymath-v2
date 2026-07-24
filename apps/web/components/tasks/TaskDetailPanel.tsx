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
import {
  InspectorShell,
  MetaRow,
  MetaSection,
} from "@/components/ui/explorer";
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
  Bell,
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
import { TaskRecurrenceControl } from "./TaskRecurrenceControl";
import { TaskRemindersControl } from "./TaskRemindersControl";
import type { TasksOptimisticDispatch } from "./TasksClient";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";
import type { TaskReminder } from "@/lib/tasks/reminders";

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
   * Phase 6 Plan 06-02 (RES-02): delete-task handler lifted to TasksClient so
   * it can wrap the server action in useUndoToast. The panel only invokes
   * the parent's handler; it no longer owns the optimistic delete or the
   * server call.
   */
  onDeleteTask?: (task: TaskWithProjects) => void;
  /**
   * "create" mode: `task` is a draft (not yet persisted). Save calls the
   * createTask Server Action; Cancel/close discards. "edit" mode (default):
   * existing behavior — Save calls updateTask, Delete is offered.
   */
  mode?: "edit" | "create";
}

// Per-status accent hue — mirrors KanbanColumn's STATUS_ACCENT so the pill
// dot matches its column color exactly.
const STATUS_PILL: { value: Status; label: string; dot: string }[] = [
  { value: "not started", label: "Not Started", dot: "oklch(0.72 0.02 80)" },
  { value: "up next", label: "Up Next", dot: "oklch(0.78 0.16 80)" },
  { value: "in progress", label: "In Progress", dot: "oklch(0.74 0.16 240)" },
  { value: "almost done", label: "Almost Done", dot: "oklch(0.78 0.16 305)" },
  { value: "lesno", label: "Lesno", dot: "oklch(0.78 0.18 160)" },
];

// Priority shares the amber dominance ladder used by PriorityChip (alpha, not
// hue) so the document register stays calm. P∞ is the strongest signal.
const PRIORITY_PILL: { value: Priority; label: string; opacity: number }[] = [
  { value: "P∞", label: "P∞", opacity: 1 },
  { value: "P1", label: "P1", opacity: 1 },
  { value: "P2", label: "P2", opacity: 0.6 },
  { value: "P3", label: "P3", opacity: 0.35 },
];

/**
 * Single-select pill row on the sd two-tier grammar (D6): the option's
 * functional hue lives only in a 6-7px dot; selection is a NEUTRAL
 * `--sd-selected` backplate, never an accent ring around the pill. Mirrors
 * the kanban column colors through the dot while staying in inspector
 * register (11px medium, ink-dull → ink on select).
 */
function PillGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; color: string }[];
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
            onClick={() => onChange(opt.value)}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 cursor-pointer-always",
              "text-[11px] font-medium tracking-[0.01em]",
              "transition-[color,background-color,border-color] duration-100 ease-out motion-reduce:transition-none",
              selected
                ? "border-[var(--sd-line)] bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                : "border-[var(--sd-line)] bg-transparent text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
            )}
          >
            <span
              className="inline-block h-[7px] w-[7px] rounded-full shrink-0 transition-opacity duration-100 motion-reduce:transition-none"
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
  dueTime: string;
  reminders: TaskReminder[] | null;
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
    dueTime: task.dueTime ?? "",
    reminders: task.reminders ?? null,
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
    a.dueTime !== b.dueTime ||
    JSON.stringify(a.reminders) !== JSON.stringify(b.reminders) ||
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
  // Discard-confirm dialog. Same pattern as CaptureDetailPanel: when the
  // user attempts to close (Esc, click outside, ×) or hits Cancel while
  // dirty, queue the action and show the AlertDialog.
  const [pendingDiscardAction, setPendingDiscardAction] = useState<"close" | "cancel" | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    status: "not started",
    priority: "P3",
    dueDate: "",
    dueTime: "",
    reminders: null,
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
          "task-notes-editor focus:outline-none min-h-[80px] max-h-[200px] overflow-y-auto p-3 font-serif text-base",
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
  // The old getHTML() equality guard is gone with the HTML seed: a doc holding
  // chips never round-trips to the naive `<p>…</p>` string it was compared
  // against, so the guard could only ever be false here. This effect runs once
  // per task open, which is exactly when a reseed is wanted anyway.
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
        dueTime: form.dueTime || null,
        reminders: form.reminders,
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
      dueTime: form.dueTime || null,
      reminders: form.reminders,
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
      dueTime: form.dueTime || null,
      reminders: form.reminders,
      url: form.url,
      recurrence: form.recurrence,
    };
    // D-04: optimistic update first (D-02 instant) — project links also flow
    // through to optimistic state via the patch
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
      // D-03: explicit revert (RT-06: overlay no longer auto-reverts) + toast.error
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

  // Intercept close attempts (Esc, click outside, × button). When dirty,
  // surface the confirm dialog instead of closing immediately. With the Radix
  // Sheet dropped (InspectorShell owns the single slide, D1d anti-jank), this
  // is the shared dirty-guard the Esc listener and the outside-click backdrop
  // both route through.
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

  // Esc closes through the dirty-guard (re-added after dropping the Sheet,
  // which used to own this). Scoped to when the panel is open.
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, requestClose]);

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

  // Action-row: copy the task title (cheap copy-on-click affordance, seed §7).
  const handleCopyTitle = useCallback(() => {
    const t = (form.title || task?.title || "").trim();
    if (!t) return;
    void navigator.clipboard?.writeText(t);
    toast("Copied.");
  }, [form.title, task]);

  function handleDelete() {
    if (!task) return;
    // Phase 6 Plan 06-02 (RES-02): defer to parent handler which wraps the
    // server call in useUndoToast (5s Undo window). The parent dispatches the
    // optimistic delete + commit/restore via the shared sonner toast helper.
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
      {/* Outside-click backdrop — transparent (no dimming, Linear/Spacedrive
          register). Routes through the shared dirty-guard, mirroring the Radix
          Sheet overlay we replaced. Rendered only while open. */}
      {open ? (
        <div
          className="fixed inset-0 z-40"
          onClick={requestClose}
          aria-hidden="true"
        />
      ) : null}

      {/* Fixed host floats the shared InspectorShell on the right so the
          primitive is consumed UNCHANGED (it owns the single slide — D1d, no
          double-transform jank). pointer-events gate keeps the empty host inert
          when closed. */}
      <div className="pointer-events-none fixed inset-y-0 right-0 z-50 flex">
        <InspectorShell
          open={open}
          className="pointer-events-auto h-full w-[340px]"
          header={
            task ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  {/* Name stays serif (app content identity, D9). */}
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    autoFocus={isCreate}
                    placeholder={isCreate ? "Task title…" : undefined}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent font-serif !text-base !font-bold text-[var(--sd-ink)]",
                      "border-b border-transparent focus:border-[var(--sd-accent)] focus:outline-none",
                      "transition-colors duration-[120ms] ease-out",
                      "placeholder:font-normal placeholder:text-[var(--sd-ink-faint)]"
                    )}
                    aria-label="Task title"
                  />
                  <ActionIconButton
                    icon={X}
                    label="Close detail panel"
                    onClick={requestClose}
                  />
                </div>
                {/* Action row — quiet icon buttons, soft-landing hover (seed §7).
                    Only affordances whose logic exists: copy title, open link. */}
                <div className="-ml-1 flex items-center gap-0.5">
                  <ActionIconButton
                    icon={Copy}
                    label="Copy task title"
                    onClick={handleCopyTitle}
                  />
                  <ActionIconButton
                    icon={ExternalLink}
                    label="Open linked URL"
                    disabled={!form.url}
                    onClick={() => {
                      if (form.url) window.open(form.url, "_blank", "noopener,noreferrer");
                    }}
                  />
                </div>
              </div>
            ) : null
          }
        >
          {task ? (
            <div className="flex min-h-full flex-col">
              <div className="flex-1">
                <MetaSection title="Details">
                  <div className="flex flex-col gap-4 pt-1">
                    {/* Status — sd two-tier pills mirroring the kanban columns */}
                    <FieldSection label="Status" icon={CircleDot}>
                      <PillGroup
                        ariaLabel="Status"
                        value={form.status}
                        onChange={(v) => set("status", v)}
                        options={STATUS_PILL.map((s) => ({
                          value: s.value,
                          label: s.label,
                          color: s.dot,
                        }))}
                      />
                    </FieldSection>

                    {/* Priority — same pill treatment on the amber ladder */}
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

                    {/* Due date — sd-input register, focus ring sd-accent */}
                    <FieldSection label="Due date" icon={Clock}>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => set("dueDate", e.target.value)}
                          className={cn(
                            "h-8 flex-1 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-2",
                            "font-sans text-[13px] text-[var(--sd-ink)] outline-none",
                            "focus-visible:border-[var(--sd-accent)] focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
                            "transition-colors duration-[120ms] ease-out"
                          )}
                        />
                        {/* I-2 (D-03): inline clear — empties the date → Inbox on
                           save. Reversible, so no confirm dialog. */}
                        {form.dueDate && (
                          <button
                            type="button"
                            onClick={() => set("dueDate", "")}
                            title="Clear due date (move to Inbox)"
                            aria-label="Clear due date (move to Inbox)"
                            className="cursor-pointer-always rounded p-0.5 text-[var(--sd-ink-faint)] transition-colors duration-[120ms] hover:text-[var(--ink-coral)]"
                          >
                            <X size={12} strokeWidth={1.5} />
                          </button>
                        )}
                        {/* MoveToMenu kept as the secondary clear path (D-03). */}
                        <MoveToMenu
                          variant="inline"
                          allowClear
                          onPick={(ymd) => set("dueDate", ymd ?? "")}
                        />
                      </div>
                      {form.dueDate && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
                            Time
                          </label>
                          <input
                            type="time"
                            value={form.dueTime}
                            onChange={(e) => set("dueTime", e.target.value)}
                            className={cn(
                              "h-8 w-[8.5rem] rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-2",
                              "font-sans text-[13px] text-[var(--sd-ink)] outline-none",
                              "focus-visible:border-[var(--sd-accent)] focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
                            )}
                          />
                          {form.dueTime ? (
                            <button
                              type="button"
                              onClick={() => set("dueTime", "")}
                              className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)] hover:text-[var(--ink-coral)]"
                            >
                              Clear
                            </button>
                          ) : (
                            <span className="font-sans text-[11px] text-[var(--sd-ink-faint)]">
                              Defaults to 9:00 for reminders
                            </span>
                          )}
                        </div>
                      )}
                      {!form.dueDate && task?.dueDate && (
                        <p className="font-sans text-[11px] text-[var(--sd-ink-faint)]">
                          Will move to Inbox
                        </p>
                      )}
                    </FieldSection>

                    <FieldSection label="Reminders" icon={Bell}>
                      <TaskRemindersControl
                        value={form.reminders}
                        onChange={(next) => set("reminders", next)}
                        disabled={isPending}
                        hasDueDate={Boolean(form.dueDate)}
                      />
                    </FieldSection>

                    {/* URL (issue #101) — Notion-style link property. */}
                    <FieldSection label="URL" icon={Link2}>
                      <UrlField
                        value={form.url}
                        onChange={(next) => set("url", next)}
                        disabled={isPending}
                      />
                    </FieldSection>

                    {/* Recurrence (issue #144) — recurring TASK, distinct from
                        Habits. Accent-toned "advance to next" action. */}
                    <FieldSection label="Repeat" icon={Repeat}>
                      <TaskRecurrenceControl
                        value={form.recurrence}
                        onChange={(next) => set("recurrence", next)}
                        disabled={isPending}
                      />
                      {!isCreate && form.recurrence && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => startTransition(() => void handleAdvanceOccurrence())}
                          className={cn(
                            "mt-1 inline-flex w-fit items-center gap-1.5 rounded-[6px] px-2.5 py-1",
                            "font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
                            "border border-[var(--sd-accent)]/50 text-[var(--sd-accent)]",
                            "hover:bg-[color-mix(in_oklch,var(--sd-accent)_12%,transparent)]",
                            "transition-colors duration-[120ms] ease-out disabled:opacity-40"
                          )}
                        >
                          Complete · advance to next
                        </button>
                      )}
                    </FieldSection>

                    {/* Linked projects */}
                    <FieldSection label="Projects" icon={FolderOpen}>
                      <ProjectAutocomplete
                        value={form.projectIds}
                        onChange={(ids) => set("projectIds", ids)}
                        projects={projects}
                        areas={areas}
                        onCreateProject={onCreateProject}
                      />
                    </FieldSection>

                    {/* Linked people — first-class editable property. */}
                    <FieldSection label="People" icon={Users}>
                      <PersonListField
                        value={form.personNames}
                        onChange={(next) => set("personNames", next)}
                        suggestions={people}
                        disabled={isPending}
                      />
                    </FieldSection>
                  </div>
                </MetaSection>

                {/* Description — TipTap editor stays serif (content identity, D9). */}
                <MetaSection title="Description">
                  <div className="rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] transition-colors duration-[120ms] focus-within:border-[var(--sd-accent)]">
                    <EditorContent editor={notesEditor} />
                  </div>
                </MetaSection>

                {/* Activity — real read-only fields only (no updated/modified col). */}
                {!isCreate && (
                  <MetaSection title="Activity">
                    <MetaRow
                      label={
                        <span className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-[var(--sd-ink-faint)]" />
                          Created
                        </span>
                      }
                      value={fmtDate(task.createdAt) ?? "--"}
                    />
                    <MetaRow
                      label={
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={12} className="text-[var(--sd-ink-faint)]" />
                          Completed
                        </span>
                      }
                      value={fmtDate(task.completedAt) ?? "--"}
                    />
                  </MetaSection>
                )}
              </div>

              {/* Footer — sticky, full-bleed divider (counters InspectorShell p-2). */}
              <div className="sticky bottom-0 z-10 -mx-2 mt-2 flex items-center justify-between gap-2 border-t border-[var(--sd-line)] bg-[var(--sd-app)] px-4 py-3">
                {isCreate ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isPending}
                    className={cn(
                      "cursor-pointer-always rounded-[6px] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-coral)]",
                      "transition-colors duration-[120ms] ease-out disabled:opacity-40",
                      "hover:bg-[color-mix(in_oklch,var(--ink-coral)_12%,transparent)]"
                    )}
                  >
                    Delete task
                  </button>
                )}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    disabled={isPending}
                    title={
                      isCreate
                        ? "Discard this draft"
                        : dirty
                          ? "Discard unsaved changes"
                          : undefined
                    }
                    className={cn(
                      "cursor-pointer-always rounded-[6px] px-3 py-1.5 text-xs font-medium text-[var(--sd-ink-dull)]",
                      "transition-colors duration-[120ms] ease-out disabled:opacity-40",
                      "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => startTransition(() => void handleSave())}
                    disabled={!dirty || isPending}
                    className={cn(
                      "cursor-pointer-always rounded-[6px] px-4 py-1.5 text-xs font-semibold text-white",
                      "bg-[var(--sd-accent)] transition-[background-color,opacity] duration-[120ms] ease-out",
                      "hover:bg-[var(--sd-accent-deep)] disabled:opacity-40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sd-app)]"
                    )}
                  >
                    {isCreate ? "Create task" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </InspectorShell>
      </div>

      {/* Discard-unsaved-changes confirm */}
      <AlertDialog
        open={pendingDiscardAction !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDiscardAction(null);
        }}
      >
        <AlertDialogContent className="font-serif">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[20px]">Discard changes?</AlertDialogTitle>
            <AlertDialogDescription className="font-serif text-base">
              Your edits haven&apos;t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-[13px]">Keep editing</AlertDialogCancel>
            <AlertDialogAction className="font-sans text-[13px]" onClick={handleConfirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">Delete task?</DialogTitle>
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
    <div className="flex flex-col gap-1.5">
      {/* MetaRow-law label: text-xs dull, Phosphor-style leading icon (D §B). */}
      <label className="flex items-center gap-1.5 text-xs font-medium tracking-[0.01em] text-[var(--sd-ink-dull)]">
        {Icon ? (
          <Icon size={13} strokeWidth={1.75} className="text-[var(--sd-ink-faint)]" />
        ) : null}
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Quiet action-row / header icon button (seed §7): 18px glyph, soft-landing
 * hover on the sd-hover backplate, focus ring on sd-accent. Disabled affordances
 * dim rather than disappear so the row layout stays stable.
 */
function ActionIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] cursor-pointer-always",
        "text-[var(--sd-ink-dull)] transition-colors duration-[120ms] ease-out",
        "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        "disabled:pointer-events-none disabled:opacity-35"
      )}
    >
      <Icon size={18} strokeWidth={1.75} />
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
