"use client";

import { deleteArea, updateArea } from "@/app/actions/areas";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  areaId: string;
  areaName: string;
  areaEmoji: string | null;
  /**
   * Page-local settle for an edit. Supplied by the surface that owns the list,
   * so a rename costs a state update rather than a full route refetch.
   */
  onUpdated?: (id: string, patch: { name: string; emoji: string | null }) => void;
  /** Page-local settle for a delete. Same rationale as onUpdated. */
  onDeleted?: (id: string) => void;
}

/**
 * Per-area-card ⋯ dropdown for the /areas page.
 *
 * Deliberately decoupled from the sidebar's optimistic dispatcher — the sidebar
 * reconciles itself off the Realtime echo on ['areas', userId]. The list this
 * menu sits in is server-rendered, so it settles through the onUpdated /
 * onDeleted callbacks; router.refresh() remains only as the fallback for a
 * surface that supplies neither.
 *
 * Items: Edit (name + emoji) / Delete.
 */
export function AreaCardMenu({
  areaId,
  areaName,
  areaEmoji,
  onUpdated,
  onDeleted,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Edit state
  const [name, setName] = useState(areaName);
  const [emoji, setEmoji] = useState(areaEmoji ?? "");
  const { run: runSave, pending: isSaving } = usePendingAction();

  // Delete state
  const { run: runDelete, pending: isDeleting } = usePendingAction();

  function openEdit() {
    setName(areaName);
    setEmoji(areaEmoji ?? "");
    setOpen(false);
    setEditDialogOpen(true);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await runSave(
      () => updateArea({ id: areaId, name: trimmedName, emoji: emoji.trim() || null }),
      {
        success: "Area updated.",
        onSuccess: () => {
          setEditDialogOpen(false);
          if (onUpdated) {
            onUpdated(areaId, { name: trimmedName, emoji: emoji.trim() || null });
          } else {
            router.refresh();
          }
        },
      }
    );
  }

  async function handleDelete() {
    await runDelete(() => deleteArea(areaId), {
      success: "Area deleted.",
      onSuccess: () => {
        setDeleteDialogOpen(false);
        if (onDeleted) onDeleted(areaId);
        else router.refresh();
      },
    });
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Area options"
            onClick={(e) => e.preventDefault()}
            className={[
              "flex items-center justify-center h-6 w-6 rounded",
              "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
              "opacity-0 group-hover/area-row:opacity-100",
              "data-[state=open]:opacity-100 transition-opacity duration-150",
              "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--edge-hud)] outline-none",
            ].join(" ")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={openEdit}>Edit area</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog — name + emoji in one form */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit area</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-area-name">Name</Label>
              <Input
                id="edit-area-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setEditDialogOpen(false);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-area-emoji">Emoji (optional)</Label>
              <Input
                id="edit-area-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
                placeholder="e.g. 🎓"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isSaving}>
              Never mind
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving ? (
                <>
                  <Spinner size={14} label="Saving area" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this area?</DialogTitle>
            <DialogDescription>
              Any projects under it will be moved to the <strong>No Area</strong> bucket. Tasks and
              captures stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Never mind
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Spinner size={14} label="Deleting area" />
                  Deleting…
                </>
              ) : (
                "Delete area"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
