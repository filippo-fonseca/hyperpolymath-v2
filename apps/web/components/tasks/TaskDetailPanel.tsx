"use client";

import { createTask, updateTask } from "@/app/actions/tasks";
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
import { Textarea } from "@/components/ui/textarea";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MoveToMenu } from "./MoveToMenu";
import { ProjectAutocomplete } from "./ProjectAutocomplete";
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

interface Props {
  task: TaskWithProjects | null;
  projects: ProjectOption[];
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
              "group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 cursor-pointer-always",
              "font-mono text-[11px] uppercase tracking-[0.08em] backdrop-blur-md",
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
    </div>
  );
}

interface FormState {
  title: string;
  status: Status;
  priority: Priority;
  dueDate: string;
  notes: string;
  projectIds: string[];
}

function toFormState(task: TaskWithProjects): FormState {
  return {
    title: task.title,
    status: task.status as Status,
    priority: task.priority as Priority,
    dueDate: task.dueDate ?? "",
    notes: task.notes ?? "",
    projectIds: task.projects.map((p) => p.id),
  };
}

function isDirty(a: FormState, b: FormState): boolean {
  return (
    a.title !== b.title ||
    a.status !== b.status ||
    a.priority !== b.priority ||
    a.dueDate !== b.dueDate ||
    a.notes !== b.notes ||
    JSON.stringify(a.projectIds.sort()) !== JSON.stringify(b.projectIds.sort())
  );
}

export function TaskDetailPanel({
  task,
  projects,
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
  // Discard-confirm dialog. Same pattern as CaptureDetailPanel: when the
  // user attempts to close (Esc, click outside, ×) or hits Cancel while
  // dirty, queue the action and show the AlertDialog.
  const [pendingDiscardAction, setPendingDiscardAction] = useState<"close" | "cancel" | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    status: "not started",
    priority: "P3",
    dueDate: "",
    notes: "",
    projectIds: [],
  });
  const [initialForm, setInitialForm] = useState<FormState>(form);

  // Sync form when task changes
  useEffect(() => {
    if (task) {
      const f = toFormState(task);
      setForm(f);
      setInitialForm(f);
    }
  }, [task?.id]);

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
        notes: form.notes || null,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || null,
        kanbanPosition: 0,
        completedAt: null,
        createdAt: new Date(),
        projects: projectChips,
      },
    });
    const r = await createTask({
      id: newId,
      title,
      notes: form.notes || null,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || null,
      projectIds: form.projectIds,
    });
    if (!r.success) {
      toast.error(r.error);
      addOptimistic({ type: "revert", id: newId });
      return;
    }
    onClose();
  }, [form, projects, addOptimistic, onClose]);

  const handleSave = useCallback(async () => {
    if (!task) return;
    if (isCreate) {
      await handleCreate();
      return;
    }
    const patch = {
      title: form.title.trim() || task.title,
      notes: form.notes || null,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || null,
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
      },
    });
    const r = await updateTask({
      id: task.id,
      ...patch,
      projectIds: form.projectIds,
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
    setInitialForm(form);
    // Realtime echo invalidates ['tasks', userId] → refetch → cache settles.
  }, [task, form, projects, addOptimistic, isCreate, handleCreate]);

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
          className="w-[420px] p-0 flex flex-col [background:var(--glass-bg)] [backdrop-filter:blur(12px)]"
          showCloseButton={false}
        >
          {task && (
            <>
              {/* Header — Linear-style side panel chrome (UI-SPEC §5h) */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--glass-border)]">
                <div className="flex items-start justify-between gap-3">
                  <SheetTitle className="flex-1 p-0 m-0">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      autoFocus={isCreate}
                      placeholder={isCreate ? "Task title…" : undefined}
                      className={cn(
                        "font-serif text-xl font-semibold text-[var(--ink)] w-full",
                        "bg-transparent focus:outline-none border-b border-transparent",
                        "focus:border-[var(--edge-hud)] transition-colors duration-150 ease-out",
                        "placeholder:text-[var(--ink-muted)] placeholder:font-normal"
                      )}
                      aria-label="Task title"
                    />
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => handleSheetOpenChange(false)}
                    aria-label="Close detail panel"
                    className="p-1 rounded hover:bg-[var(--surface)] transition-colors duration-150 ease-out flex-shrink-0 mt-1 cursor-pointer-always"
                  >
                    <X size={16} className="text-[var(--ink-muted)]" />
                  </button>
                </div>
              </SheetHeader>

              {/* Body — scrollable field sections */}
              <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
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

                {/* 5. Description */}
                <FieldSection label="Description">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Add a description…"
                    className="font-serif text-base resize-none min-h-[100px]"
                    rows={4}
                  />
                </FieldSection>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)]">
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
                    className="glass-button rounded-md px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink)]"
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
    <div className="flex flex-col gap-1.5">
      {/* Mono uppercase chrome label per UI-SPEC §5h/§5k metadata register */}
      <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
