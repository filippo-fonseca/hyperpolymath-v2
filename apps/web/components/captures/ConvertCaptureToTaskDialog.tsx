"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ProjectMultiSelect,
  type ProjectMultiSelectOption,
} from "@/components/shared/ProjectMultiSelect";
import { TaskRecurrenceControl } from "@/components/tasks/TaskRecurrenceControl";
import type { RecurrenceRule } from "@/lib/tasks/recurrence";
import { convertCaptureToTask } from "@/app/actions/jarvis";

/**
 * Convert-capture-to-task dialog (JARVIS-13 / D-14, Plan 05-04 Task 2).
 *
 * Rendered conditionally by the parent (CaptureCard or CaptureDetailPanel)
 * ONLY when `capture.createdVia === "jarvis"`. The dialog itself does NOT
 * check the gating condition — that's the parent's job — so this component
 * stays focused on the form + server-action submission.
 *
 * Form fields:
 *   - Title (pre-filled with capture.content[0..80], user-editable)
 *   - Priority (P∞ | P1 | P2 | P3, default P3)
 *   - Projects (ProjectMultiSelect; pre-filled with capture's existing links)
 *
 * Submission:
 *   - calls convertCaptureToTask({ captureId, title, priority, projectIds })
 *     (Plan 05-02 Server Action — auth + RLS-safe transaction).
 *   - Success → toast.success("Converted to task") + onOpenChange(false).
 *     The capture disappears from the feed via Realtime echo on the delete
 *     side of the transaction; the task appears in /tasks via the insert
 *     echo. (No optimistic state at this layer — the underlying
 *     `addOptimistic({ type: "delete", id })` is wired at CapturesClient.)
 *   - Failure → toast.error(error); dialog stays open with form values
 *     preserved so the user can re-try.
 */

const PRIORITY_OPTIONS: Array<{ value: "P∞" | "P1" | "P2" | "P3"; label: string }> = [
  { value: "P∞", label: "P∞ (top)" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Capture being converted — id + content are all this dialog needs. */
  capture: { id: string; content: string };
  /**
   * Project IDs the capture is currently linked to. Pre-fills the project
   * picker so the user can keep them, drop some, or add new ones.
   */
  existingProjectIds: string[];
  /** Project options for the ProjectMultiSelect picker. */
  availableProjects: ProjectMultiSelectOption[];
  /**
   * Optional optimistic-delete callback. When wired (CapturesClient mounts
   * the dialog inside CaptureCard or CaptureDetailPanel), the capture
   * vanishes from the feed instantly on submit success; Realtime echo
   * reconciles.
   */
  onOptimisticDelete?: (id: string) => void;
}

export function ConvertCaptureToTaskDialog({
  open,
  onOpenChange,
  capture,
  existingProjectIds,
  availableProjects,
  onOptimisticDelete,
}: Props) {
  // Pre-fill title with first 80 chars of capture content (D-14 / JARVIS-13).
  const [title, setTitle] = useState(() => capture.content.slice(0, 80));
  const [priority, setPriority] = useState<"P∞" | "P1" | "P2" | "P3">("P3");
  const [projectIds, setProjectIds] = useState<string[]>(existingProjectIds);
  // Issue #144 — optional recurrence + anchor due date for the converted task.
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);

  // If the parent passes a different capture (rare but possible if the
  // dialog is re-mounted with a fresh row), re-seed the form.
  useEffect(() => {
    setTitle(capture.content.slice(0, 80));
    setProjectIds(existingProjectIds);
    setPriority("P3");
    setRecurrence(null);
    setDueDate("");
  }, [capture.id]);
  // existingProjectIds is captured by `capture.id`-keyed remount; intentional.

  async function handleSubmit() {
    setPending(true);
    const result = await convertCaptureToTask({
      captureId: capture.id,
      title: title.trim(),
      priority,
      projectIds,
      recurrence,
      dueDate: dueDate || null,
    });
    setPending(false);

    if (result.ok) {
      // Optimistic — let the parent flip the capture out of the feed
      // immediately. Realtime echo on the server-side delete reconciles.
      onOptimisticDelete?.(capture.id);
      toast.success("Converted to task");
      onOpenChange(false);
    } else {
      toast.error(`Failed to convert: ${result.error}`);
      // Stay open; form values preserved so the user can re-try.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-title">
            Convert capture to task
          </DialogTitle>
          <DialogDescription className="text-base">
            The capture is deleted in the same transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="convert-title">Task title</Label>
            <Input
              id="convert-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="convert-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) =>
                setPriority(v as "P∞" | "P1" | "P2" | "P3")
              }
            >
              <SelectTrigger id="convert-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Projects</Label>
            <ProjectMultiSelect
              value={projectIds}
              onChange={setProjectIds}
              projects={availableProjects}
              placeholder="Link to projects"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="convert-due">
              {recurrence ? "Starts on" : "Due date"}
            </Label>
            <Input
              id="convert-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {/* Issue #144 — turn the converted task into a recurring task right
              from the capture flow. Distinct from Habits (cyan, no streaks). */}
          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <TaskRecurrenceControl
              value={recurrence}
              onChange={setRecurrence}
              disabled={pending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || title.trim().length === 0}
          >
            {pending ? "Converting…" : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
