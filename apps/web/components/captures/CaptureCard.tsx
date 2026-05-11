"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HashtagChip } from "./HashtagChip";
import { deleteCapture, updateCapture } from "@/app/actions/captures";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

interface Props {
  capture: CaptureWithLinks;
  compact?: boolean;
}

/**
 * Capture feed card (UI-SPEC §Capture Cards).
 *
 * - bg card, border 1px, rounded-lg (flat — no shadow)
 * - Hover: ⋯ menu reveals top-right (Edit / Delete)
 * - Edit: body becomes Textarea + Save/Cancel
 * - Delete: confirm dialog with exact UI-SPEC copy ("Delete this capture?" / "This can't be undone." / "Delete capture" / "Never mind")
 * - On delete success: motion fade-out + height collapse, then toast "Capture deleted."
 * - compact: smaller padding, no project chips, no inline edit (used by project detail Captures column)
 */
export function CaptureCard({ capture, compact = false }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(capture.content);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const next = editValue.trim();
    if (!next) {
      toast.error("Capture cannot be empty.");
      return;
    }
    startTransition(async () => {
      const r = await updateCapture({ id: capture.id, content: next });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast("Capture updated.");
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const r = await deleteCapture(capture.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setRemoved(true);
      setConfirmOpen(false);
      // Toast after the local fade so it feels intentional
      toast("Capture deleted.");
      // Slight delay before refreshing so the AnimatePresence exit can play
      setTimeout(() => router.refresh(), 220);
    });
  }

  return (
    <AnimatePresence initial={false}>
      {!removed && (
        <motion.div
          key={capture.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "group relative border border-border rounded-lg bg-card",
            compact ? "p-2" : "p-4",
          )}
        >
          {/* ⋯ hover-reveal action menu */}
          {!editing && (
            <div
              className={cn(
                "absolute top-2 right-2 opacity-0 transition-opacity",
                "group-hover:opacity-100 data-[state=open]:opacity-100",
              )}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    aria-label="Capture actions"
                  >
                    <MoreHorizontal size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-sans text-[13px]">
                  {!compact && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(true);
                        setEditValue(capture.content);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmOpen(true)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="font-serif text-base min-h-[80px] resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={pending}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <CaptureBody capture={capture} compact={compact} />
          )}
        </motion.div>
      )}

      {/* Confirm dialog — UI-SPEC exact copy */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="font-serif">
          <DialogHeader>
            <DialogTitle className="font-serif text-[20px]">
              Delete this capture?
            </DialogTitle>
            <DialogDescription className="font-serif text-base">
              This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Never mind
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              Delete capture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
}

/**
 * Renders capture content with inline #hashtag chips substituted into the text.
 * Walks the raw `content` string, splits on `#word` patterns, and renders matched
 * substrings as <HashtagChip asButton={false} /> (no interaction inside the card body).
 */
function CaptureBody({
  capture,
  compact,
}: {
  capture: CaptureWithLinks;
  compact: boolean;
}) {
  // Map lowercase-name → displayName lookup
  const tagLookup = new Map(
    capture.hashtags.map((h) => [h.name, h.displayName]),
  );

  // Split content on whitespace, but preserve whitespace by capturing groups
  const parts = capture.content.split(/(\s+)/);

  const rendered = parts.map((part, i) => {
    const m = /^#([\p{L}\p{N}_]+)$/u.exec(part);
    if (m && m[1]) {
      const lower = m[1].toLowerCase();
      const displayName = tagLookup.get(lower) ?? m[1];
      return (
        <HashtagChip
          key={`${i}-tag`}
          displayName={displayName}
          asButton={false}
        />
      );
    }
    return <span key={`${i}-text`}>{part}</span>;
  });

  return (
    <div className="flex flex-col gap-2 pr-8">
      <div className="font-serif text-base text-foreground whitespace-pre-wrap break-words">
        {rendered}
      </div>
      <div className="flex flex-wrap items-center gap-2 font-sans text-[13px] text-muted-foreground">
        {!compact && capture.projects.length > 0 && (
          <>
            {capture.projects.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center bg-secondary/50 rounded-md px-2 py-0.5"
              >
                {p.name}
              </span>
            ))}
            <span aria-hidden>·</span>
          </>
        )}
        <span>
          {formatDistanceToNow(capture.createdAt, { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
