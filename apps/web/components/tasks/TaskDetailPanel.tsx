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
import { HashtagDecorations } from "@/components/captures/hashtag-decorations";
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
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { createPersonDecorations } from "@/components/captures/person-decorations";
import { createPersonSuggestion } from "@/components/captures/person-suggestions";
import { createHashtagSuggestion } from "@/components/captures/tiptap-suggestions";
import { PersonListField } from "@/components/shared/PersonListField";
import { UrlField } from "@/components/shared/UrlField";
import { MetaSection } from "@/components/spacedrive";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MoveToMenu } from "./MoveToMenu";
import { ProjectAutocomplete } from "./ProjectAutocomplete";
import { TaskRecurrenceControl } from "./TaskRecurrenceControl";
import type { TasksOptimisticDispatch } from "./TasksClient";

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
 * Glassy single-select pill row. Each option is a backdrop-blurred pill with a
 * live indicator dot; the selected pill lights its accent ring + wash. Replaces
 * the shadcn Select for status/priority so the control reads like the kanban
 * columns it mirrors.
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
    <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 cursor-pointer-always",
              "font-mono text-[11px] uppercase tracking-[0.08em] backdrop-blur-md focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
              "border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out",
              selected
                ? "text-[var(--ink)]"
                : "border-[var(--edge)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]"
            )}
            style={
              selected
                ? {
                    borderColor: opt.color,
                    backgroundColor: `color-mix(in oklch, ${opt.color} 14%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${opt.color} 45%, transparent), 0 0 12px color-mix(in oklch, ${opt.color} 22%, transparent)`,
                  }
                : undefined
            }
          >
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0 transition-opacity"
              style={{
                backgroundColor: opt.color,
                opacity: selected ? 1 : 0.4,
                boxShadow: selected
                  ? `0 0 6px color-mix(in oklch, ${opt.color} 70%, transparent)`
                  : "none",
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </fieldset>
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
  const reducedMotion = useReducedMotion() ?? false;
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
    url: null,
    notes: "",
    projectIds: [],
    recurrence: null,
    hashtagNames: [],
    personNames: [],
  });
  const [initialForm, setInitialForm] = useState<FormState>(form);

  // TipTap notes editor — supports #hashtag and @person inline.
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
    content: form.notes ? `<p>${form.notes.split("\n").join("</p><p>")}</p>` : "",
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
    const newContent = form.notes ? `<p>${form.notes.split("\n").join("</p><p>")}</p>` : "";
    if (notesEditor.getHTML() !== newContent) {
      notesEditor.commands.setContent(newContent, { emitUpdate: false });
    }
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
        key(prev.personNames) === baseline ? { ...prev, personNames: nextNames } : prev
      );
      setInitialForm((prev) =>
        key(prev.personNames) === baseline ? { ...prev, personNames: nextNames } : prev
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
        hashtags: hashtagNames.map((name) => ({
          id: `pending-${name}`,
          name: name.toLowerCase(),
          displayName: name,
        })),
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
        hashtags: hashtagNames.map((name) => ({
          id: `pending-${name}`,
          name: name.toLowerCase(),
          displayName: name,
        })),
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

  // Intercept Sheet close attempts (Esc, click outside, × button). When
  // dirty, surface the confirm dialog instead of closing immediately.
  const handleSheetOpenChange = useCallback(
    (next: boolean) => {
      if (next) return;
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
    },
    [dirty, onClose, isCreate]
  );

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
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        {/* Warning 7 fix: bg-transparent SheetOverlay (no dimming — Linear style) */}
        <SheetContent
          side="right"
          className={cn(
            "flex w-[min(420px,100vw)] flex-col border-l border-[var(--deck-line)] bg-[var(--deck-panel)] p-0",
            reducedMotion && "[&[data-state=open]]:animate-none [&[data-state=closed]]:animate-none"
          )}
          showCloseButton={false}
        >
          {task && (
            <>
              {/* Header — Linear-style side panel chrome (UI-SPEC §5h) */}
              <SheetHeader className="border-b border-[var(--deck-line)] px-4 pb-3 pt-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <SheetTitle className="flex-1 p-0 m-0">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      placeholder={isCreate ? "Task title…" : undefined}
                      className={cn(
                        "w-full bg-transparent font-[family-name:var(--font-sans)] text-lg font-semibold text-[var(--deck-ink)] placeholder:font-normal placeholder:text-[var(--deck-ink-dull)] focus:outline-none",
                        "border-b border-transparent transition-colors duration-[var(--dur-hover)] focus:border-[var(--deck-accent)]"
                      )}
                      aria-label="Task title"
                    />
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => handleSheetOpenChange(false)}
                    aria-label="Close detail panel"
                    className="mt-1 min-h-8 min-w-8 flex-shrink-0 rounded-[0.375rem] p-1 text-[var(--deck-ink-dull)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--deck-hover)] hover:text-[var(--deck-ink)] cursor-pointer-always focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                  >
                    <X size={16} className="text-[var(--ink-muted)]" />
                  </button>
                </div>
              </SheetHeader>

              {/* Body — scrollable field sections */}
              <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                {/* 1. Status — glassy colored pills mirroring the kanban columns */}
                <FieldSection label="Status">
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

                {/* 2. Priority — same pill treatment on the amber ladder */}
                <FieldSection label="Priority">
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

                {/* 3. Due date */}
                <FieldSection label="Due date">
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => set("dueDate", e.target.value)}
                      className="font-sans text-[13px] h-8 flex-1"
                    />
                    {/* I-2 (D-03): inline clear — empties the date → Inbox on save.
                       Reversible, so no confirm dialog. Shown only when a date set. */}
                    {form.dueDate && (
                      <button
                        type="button"
                        onClick={() => set("dueDate", "")}
                        title="Clear due date (move to Inbox)"
                        aria-label="Clear due date (move to Inbox)"
                        className="p-0.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] cursor-pointer-always transition-colors duration-150"
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
                  {!form.dueDate && task?.dueDate && (
                    <p className="font-mono text-[11px] text-[var(--ink-muted)]">
                      Will move to Inbox
                    </p>
                  )}
                </FieldSection>

                {/* 3a. URL (issue #101) — Notion-style link property. Clickable
                    link when set; inline input to add/edit/clear. */}
                <FieldSection label="URL">
                  <UrlField
                    value={form.url}
                    onChange={(next) => set("url", next)}
                    disabled={isPending}
                  />
                </FieldSection>

                {/* 3b. Recurrence (issue #144) — recurring TASK, distinct from
                    Habits. Cyan-accented control + an "advance to next" action
                    that rolls the due date forward when this occurrence is done. */}
                <FieldSection label="Repeat">
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
                        "mt-1 inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1",
                        "font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
                        "border border-[var(--hud-cyan)]/50 text-[var(--hud-cyan)]",
                        "hover:bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)]",
                        "transition-colors duration-150 ease-out disabled:opacity-40"
                      )}
                    >
                      Complete · advance to next
                    </button>
                  )}
                </FieldSection>

                {/* 4. Linked projects */}
                <FieldSection label="Projects">
                  <ProjectAutocomplete
                    value={form.projectIds}
                    onChange={(ids) => set("projectIds", ids)}
                    projects={projects}
                    areas={areas}
                    onCreateProject={onCreateProject}
                  />
                </FieldSection>

                {/* 4a. Linked people — first-class editable property. People are
                    auto-derived from the title/notes (Haiku smart-match) and via
                    inline `@`-mentions; add/remove them here too. */}
                <FieldSection label="People">
                  <PersonListField
                    value={form.personNames}
                    onChange={(next) => set("personNames", next)}
                    suggestions={people}
                    disabled={isPending}
                  />
                </FieldSection>

                {/* 5. Description — TipTap editor with #hashtag and @person support */}
                <FieldSection label="Description">
                  <div className="rounded-md border border-[var(--edge)] focus-within:border-[var(--hud-cyan)] focus-within:[--glass-glow-color:var(--hud-cyan)] transition-colors duration-150">
                    <EditorContent editor={notesEditor} />
                  </div>
                </FieldSection>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--deck-line)] px-4 py-3 sm:px-5">
                {isCreate ? (
                  <span />
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isPending}
                  >
                    Delete task
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
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
                    variant="ghost"
                    size="sm"
                    className="rounded-[0.375rem] bg-[var(--deck-selected)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                    onClick={() => startTransition(() => void handleSave())}
                    disabled={!dirty || isPending}
                  >
                    {isCreate ? "Create task" : "Save changes"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <MetaSection label={label} className="px-0 py-3 first:pt-0">
      {children}
    </MetaSection>
  );
}
