"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveProjectToArea } from "@/app/actions/projects";

interface Props {
  projectId: string;
  projectName: string;
  currentAreaId: string;
  allAreas: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Locked decision (Quick 260611-g2z #4): wired directly to moveProjectToArea
 * server action. Closes and calls router.refresh() on success.
 */
export function MoveProjectDialog({
  projectId,
  projectName,
  currentAreaId,
  allAreas,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [targetAreaId, setTargetAreaId] = useState("");
  const [isMoving, setIsMoving] = useState(false);

  const eligibleAreas = allAreas.filter((a) => a.id !== currentAreaId);

  async function handleMove() {
    if (!targetAreaId) return;
    setIsMoving(true);
    const result = await moveProjectToArea({ projectId, newAreaId: targetAreaId });
    setIsMoving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast("Project moved.");
    onOpenChange(false);
    setTargetAreaId("");
    router.refresh();
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
          <DialogDescription className="font-serif italic text-sm text-[var(--ink-muted)]">
            {projectName} → another area
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="move-target-area" className="font-sans text-[13px]">
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
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isMoving}
          >
            Never mind
          </Button>
          <Button onClick={handleMove} disabled={isMoving || !targetAreaId}>
            {isMoving ? "Moving..." : "Move project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
