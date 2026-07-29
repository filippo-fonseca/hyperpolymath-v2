"use client";

import { createArea } from "@/app/actions/areas";
import { Spinner } from "@/components/shared/Spinner";
import type { AreaOptimisticDispatch } from "@/components/shell/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

interface Props {
  children: React.ReactNode;
  userId: string;
  /**
   * Optimistic dispatcher supplied by the Sidebar. Optional — when neither this
   * nor `onCreated` is supplied the dialog falls back to router.refresh() after
   * a successful create so the SSR page re-fetches. This keeps the sidebar's
   * existing instant-feedback UX while allowing the /areas page to use the same
   * dialog without a fake dispatcher.
   */
  addOptimisticArea?: AreaOptimisticDispatch;
  /**
   * Length of the current active-areas list — used to assign a reasonable
   * orderIndex on the optimistic row (the server's authoritative value will
   * arrive via the Realtime echo refetch). Optional when addOptimisticArea is absent.
   */
  currentAreaCount?: number;
  /** Optional page-local callback for surfaces that want instant UI updates without the Sidebar. */
  onCreated?: (area: SidebarArea) => void;
  /** Removes a page-local optimistic row when creation fails server-side. */
  onCreateFailed?: (id: string) => void;
}

export function AreaCreateDialog({
  children,
  userId,
  addOptimisticArea,
  currentAreaCount,
  onCreated,
  onCreateFailed,
}: Props) {
  const router = useRouter();
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
    const optimisticArea: SidebarArea = {
      id: newId,
      name: trimmedName,
      emoji: trimmedEmoji,
      orderIndex: currentAreaCount ?? 0,
      archivedAt: null,
      // The server stamps its own now(); this is the optimistic row's stand-in
      // until the refetch replaces it, and it sorts last either way.
      createdAt: new Date(),
      projects: [],
    };

    startTransition(async () => {
      if (addOptimisticArea) {
        // D-04: optimistic insert FIRST — sidebar flashes the new area immediately.
        addOptimisticArea({
          type: "insert",
          row: optimisticArea,
        });
      }
      onCreated?.(optimisticArea);

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
        onCreateFailed?.(newId);
        // Reopen so the user can correct
        setOpen(true);
        setName(trimmedName);
        setEmoji(emoji.trim());
        setError(result.error);
        return;
      }
      toast("Area created.");
      if (!addOptimisticArea && !onCreated) {
        // Neither settle path available — re-fetch the SSR page to show the
        // new area. Surfaces that pass onCreated already hold the row: it
        // carries the client-generated id the server persisted, so there is
        // nothing left to reconcile that a whole-route refetch would supply.
        router.refresh();
      }
      // When the sidebar dispatcher IS present, the Realtime echo invalidates
      // ['areas', userId] → refetch → cache settles with the canonical row
      // carrying the same id (RT-05 dedupe → no-op).
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
            <Button type="button" variant="outline" onClick={() => handleOpen(false)}>
              Never mind
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? (
                <>
                  <Spinner size={14} label="Creating area" />
                  Creating…
                </>
              ) : (
                "New Area"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
