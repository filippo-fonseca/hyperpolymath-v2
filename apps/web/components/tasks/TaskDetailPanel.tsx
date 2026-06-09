"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectAutocomplete } from "./ProjectAutocomplete";
import { MoveToMenu } from "./MoveToMenu";
import { createTask, updateTask } from "@/app/actions/tasks";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { TasksOptimisticDispatch } from "./TasksClient";
import { cn } from "@/lib/utils";

type Priority = "P∞" | "P1" | "P2" | "P3";
type Status =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

interface ProjectOption {
  id: string;
  name: string;
  isClass: boolean;
  courseCode: string | null;
}

interface Props {
  task: TaskWithProjects | null;
  projects: ProjectOption[];
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
  const [pendingDiscardAction, setPendingDiscardAction] = useState<
    "close" | "cancel" | null
  >(null);
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
      // D-03: silent revert + toast.error
      toast.error(r.error);
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
    [dirty, onClose, isCreate],
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
          className="w-[420px] p-0 flex flex-col"
          showCloseButton={false}
        >
          {task && (
            <>
              {/* Header — Linear-style side panel chrome (UI-SPEC §5h) */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--edge)]">
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
                        "focus:border-[var(--ink-amber)] transition-colors duration-150 ease-out",
                        "placeholder:text-[var(--ink-muted)] placeholder:font-normal",
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
                {/* 1. Status */}
                <FieldSection label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => set("status", v as Status)}
                  >
                    <SelectTrigger className="font-sans text-[13px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not started" className="font-sans text-[13px]">
                        Not Started
                      </SelectItem>
                      <SelectItem value="up next" className="font-sans text-[13px]">
                        Up Next
                      </SelectItem>
                      <SelectItem value="in progress" className="font-sans text-[13px]">
                        In Progress
                      </SelectItem>
                      <SelectItem value="almost done" className="font-sans text-[13px]">
                        Almost Done
                      </SelectItem>
                      <SelectItem value="lesno" className="font-sans text-[13px]">
                        Lesno
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldSection>

                {/* 2. Priority */}
                <FieldSection label="Priority">
                  <Select
                    value={form.priority}
                    onValueChange={(v) => set("priority", v as Priority)}
                  >
                    <SelectTrigger className="font-sans text-[13px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P∞" className="font-sans text-[13px]">P∞</SelectItem>
                      <SelectItem value="P1" className="font-sans text-[13px]">P1</SelectItem>
                      <SelectItem value="P2" className="font-sans text-[13px]">P2</SelectItem>
                      <SelectItem value="P3" className="font-sans text-[13px]">P3</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <MoveToMenu
                      variant="inline"
                      allowClear
                      onPick={(ymd) => set("dueDate", ymd ?? "")}
                    />
                  </div>
                </FieldSection>

                {/* 4. Linked projects */}
                <FieldSection label="Projects">
                  <ProjectAutocomplete
                    value={form.projectIds}
                    onChange={(ids) => set("projectIds", ids)}
                    projects={projects}
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
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--edge)]">
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
                    size="sm"
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
            <AlertDialogTitle className="font-serif text-[20px]">
              Discard changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-serif text-base">
              Your edits to this task will be lost.
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

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">
              Delete this task?
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
      <label className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
