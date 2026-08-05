"use client";

import { moveProjectToArea } from "@/app/actions/projects";
import { Spinner } from "@/components/shared/Spinner";
import { usePendingAction } from "@/components/shared/use-pending-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface Props {
  projectId: string;
  projectName: string;
  currentAreaId: string;
  allAreas: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Page-local settle: the project has left the area this list renders, so the
   * owning list drops the card.
   */
  onMoved: (projectId: string) => void;
}

/**
 * Locked decision (Quick 260611-g2z #4): wired directly to moveProjectToArea
 * server action. Closes on success and settles through the owning list's
 * onMoved callback rather than refetching the route.
 */
export function MoveProjectDialog({
  projectId,
  projectName,
  currentAreaId,
  allAreas,
  open,
  onOpenChange,
  onMoved,
}: Props) {
  const { run, pending: isMoving } = usePendingAction();
  const [targetAreaId, setTargetAreaId] = useState("");

  const eligibleAreas = allAreas.filter((a) => a.id !== currentAreaId);

  async function handleMove() {
    if (!targetAreaId) return;
    await run(() => moveProjectToArea({ projectId, newAreaId: targetAreaId }), {
      success: "Project moved.",
      onSuccess: () => {
        onOpenChange(false);
        setTargetAreaId("");
        onMoved(projectId);
      },
    });
  }

  function handleClose(next: boolean) {
    if (!next) setTargetAreaId("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move project</DialogTitle>
          <DialogDescription className="text-sm text-[var(--ink-muted)]">
            {projectName} → another area
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
 <Label htmlFor="move-target-area" className="font-sans text-meta">
            Destination area
          </Label>
          <Select value={targetAreaId} onValueChange={setTargetAreaId}>
            <SelectTrigger id="move-target-area" className="h-9">
              <SelectValue placeholder="Select area" />
            </SelectTrigger>
            <SelectContent>
              {eligibleAreas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isMoving}>
            Never mind
          </Button>
          <Button onClick={handleMove} disabled={isMoving || !targetAreaId}>
            {isMoving ? (
              <>
                <Spinner size={14} label="Moving project" />
                Moving…
              </>
            ) : (
              "Move project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
