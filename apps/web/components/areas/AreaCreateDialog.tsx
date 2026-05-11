"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createArea } from "@/app/actions/areas";
import type { AreaOptimisticDispatch } from "@/components/shell/Sidebar";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  children: React.ReactNode;
  userId: string;
  addOptimisticArea: AreaOptimisticDispatch;
  /**
   * Length of the current active-areas list — used to assign a reasonable
   * orderIndex on the optimistic row (the server's authoritative value will
   * arrive via the Realtime echo refetch).
   */
  currentAreaCount: number;
}

export function AreaCreateDialog({
  children,
  userId,
  addOptimisticArea,
  currentAreaCount,
}: Props) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) {
      setName("");
      setEmoji("");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    // RT-05: client-generates the UUID BEFORE the Server Action call so the
    // optimistic row id and the persisted row id match — Realtime echo dedupes.
    const newId = crypto.randomUUID();
    const trimmedName = name.trim();
    const trimmedEmoji = emoji.trim() || null;

    startTransition(async () => {
      // D-04: optimistic insert FIRST — sidebar flashes the new area immediately.
      addOptimisticArea({
        type: "insert",
        row: {
          id: newId,
          name: trimmedName,
          emoji: trimmedEmoji,
          orderIndex: currentAreaCount,
          archivedAt: null,
          projects: [],
        } satisfies SidebarArea,
      });

      // Close the dialog optimistically — D-02 instant.
      setOpen(false);
      setName("");
      setEmoji("");

      const result = await createArea({
        id: newId,
        name: trimmedName,
        emoji: trimmedEmoji,
      });
      setIsSubmitting(false);
      if (!result.success) {
        // D-03: silent revert (useOptimistic auto-reverts) + toast.error
        toast.error(result.error);
        // Reopen so the user can correct
        setOpen(true);
        setName(trimmedName);
        setEmoji(emoji.trim());
        setError(result.error);
        return;
      }
      toast("Area created.");
      // Realtime echo invalidates ['areas', userId] → refetch → cache settles
      // with the canonical row carrying the same id (RT-05 dedupe → no-op).
    });
    // Intentionally not gating on userId here — server action enforces auth.
    void userId;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Area</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-name">Name</Label>
              <Input
                id="area-name"
                placeholder="e.g. Yale College"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-emoji">Emoji (optional)</Label>
              <Input
                id="area-emoji"
                placeholder="e.g. 🎓"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpen(false)}
            >
              Never mind
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Creating..." : "New Area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
