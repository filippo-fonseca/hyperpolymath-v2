"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { updateTask, deleteTask } from "@/app/actions/tasks";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
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

export function TaskDetailPanel({ task, projects, open, onClose }: Props) {
  const router = useRouter();
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

  const dirty = task ? isDirty(form, initialForm) : false;

  const handleSave = useCallback(async () => {
    if (!task) return;
    const r = await updateTask({
      id: task.id,
      title: form.title.trim() || task.title,
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
    if (form.status === "lesno" && task.status !== "lesno") {
      toast("Lesno.");
    }
    setInitialForm(form);
    router.refresh();
  }, [task, form, router]);

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
      if (dirty) {
        setPendingDiscardAction("close");
        return;
      }
      onClose();
    },
    [dirty, onClose],
  );

  // Cancel button: confirm when dirty, otherwise just close.
  const handleCancelClick = useCallback(() => {
    if (dirty) {
      setPendingDiscardAction("cancel");
      return;
    }
    onClose();
  }, [dirty, onClose]);

  // Confirmed discard: reset form to initial, then close the panel.
  const handleConfirmDiscard = useCallback(() => {
    setPendingDiscardAction(null);
    setForm(initialForm);
    onClose();
  }, [initialForm, onClose]);

  async function handleDelete() {
    if (!task) return;
    const r = await deleteTask(task.id);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Task deleted.");
    setShowDeleteConfirm(false);
    onClose();
    startTransition(() => {
      router.refresh();
    });
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
              {/* Header */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <SheetTitle className="flex-1 p-0 m-0">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      className={cn(
                        "font-serif text-xl font-semibold text-foreground w-full",
                        "bg-transparent focus:outline-none border-b border-transparent",
                        "focus:border-ring transition-colors",
                      )}
                      aria-label="Task title"
                    />
                  </SheetTitle>
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
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => set("dueDate", e.target.value)}
                    className="font-sans text-[13px] h-8"
                  />
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
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-sans text-[13px] text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                >
                  Delete task
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-sans text-[13px]"
                    onClick={handleCancelClick}
                    disabled={!dirty || isPending}
                    title={dirty ? "Discard unsaved changes" : undefined}
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
          or on Cancel button click while dirty. Matches the CaptureDetailPanel
          pattern. z-[60] AlertDialog overlay/content keeps it above the
          Sheet (z-50). */}
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

      {/* Delete confirm dialog — UI-SPEC exact copy */}
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
              onClick={() => startTransition(() => void handleDelete())}
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
      <label className="font-sans text-[13px] text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
