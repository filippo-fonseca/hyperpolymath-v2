"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/shared/RelativeTime";
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
import { deleteCapture } from "@/app/actions/captures";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { ConvertCaptureToTaskDialog } from "./ConvertCaptureToTaskDialog";

interface Props {
  capture: CaptureWithLinks;
  compact?: boolean;
  /**
   * Click on the card body opens the canonical CaptureDetailPanel.
   * In `compact` mode (project detail Captures column) the panel is owned by
   * a different surface — pass `onOpen` if you want the click to do anything.
   */
  onOpen?: () => void;
  /**
   * Phase 3 — optimistic delete callback. When the card is rendered inside
   * CapturesClient (via CapturesFeed), this is wired to
   * `addOptimistic({ type: "delete", id })` so the row disappears instantly.
   * When undefined (e.g. project detail Captures column), delete still fires
   * the Server Action; the Realtime echo + TanStack Query invalidation will
   * remove the row on the next refetch.
   */
  onOptimisticDelete?: (id: string) => void;
  /**
   * Phase 6 Plan 06-02 (RES-02) — when provided, the card hands off the
   * entire delete flow to the parent (CapturesClient) which wraps it in
   * useUndoToast (5s sonner Undo). Bypasses the card's inline server call
   * + confirm dialog flow — the toast IS the confirmation surface.
   */
  onDeleteCapture?: (capture: CaptureWithLinks) => void;
  /**
   * Signed-in user's avatar URL (from Supabase Auth `user_metadata.avatar_url`).
   * Rendered Twitter-style on the leading edge of the card in non-compact mode
   * — single-user life-OS, so the avatar is always "you". Compact mode (project
   * detail Captures column) does NOT render the avatar to keep the inline list
   * uncluttered.
   */
  userAvatarUrl?: string | null;
  /** Single-char fallback for `<AvatarFallback>` when no avatar URL is set. */
  userInitials?: string;
  /**
   * Plan 05-04 (JARVIS-13 / D-14) — Projects available for the Convert-to-task
   * dialog's ProjectMultiSelect. Only consumed when the capture's
   * `createdVia === "jarvis"` and the user opens the ⋯ menu's "Convert to
   * task" item. Pass an empty array to disable the affordance (the menu item
   * still renders for jarvis-created captures; the dialog just has no
   * pickable projects).
   */
  availableProjects?: ProjectMultiSelectOption[];
}

/**
 * Capture feed card (UI-SPEC §Capture Cards).
 *
 * Phase 3 changes:
 * - Optimistic delete via `onOptimisticDelete` — the row disappears instantly
 *   when the user confirms. The Server Action then persists; on rejection
 *   useOptimistic auto-reverts (row reappears) + toast.error fires (D-03).
 * - No manual page refresh after delete — Realtime + TanStack Query own cross-window
 *   propagation now (D-12). The motion exit animation still plays via local
 *   `removed` state for visual continuity.
 *
 * UI:
 * - bg card, border 1px, rounded-lg (flat — no shadow)
 * - Hover: ⋯ menu reveals top-right (Open / Delete) + entire card body is clickable
 * - Click body → opens CaptureDetailPanel (Notion-style Sheet, owned by parent)
 * - Inline edit removed — the detail panel is the canonical edit surface,
 *   so content + hashtags + project links all stay in one consistent place.
 * - Delete: confirm dialog with exact UI-SPEC copy ("Delete this capture?" / "This can't be undone." / "Delete capture" / "Never mind")
 * - On delete success: motion fade-out + height collapse, then toast "Capture deleted."
 * - compact: smaller padding, no project chips (used by project detail Captures column)
 */
export function CaptureCard({
  capture,
  compact = false,
  onOpen,
  onOptimisticDelete,
  onDeleteCapture,
  userAvatarUrl,
  userInitials,
  availableProjects = [],
}: Props) {
  const showAvatar = !compact;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  // D-14 / JARVIS-13: "Convert to task" affordance is shown ONLY when this
  // capture was created via JARVIS. Manual captures (composer / detail panel
  // save) keep createdVia=null and don't get the menu item.
  const isJarvisCreated = capture.createdVia === "jarvis";

  function handleDelete() {
    // Phase 6 Plan 06-02 (RES-02): when the parent provides onDeleteCapture,
    // defer the entire flow (optimistic remove + 5s Undo toast + server
    // commit) to it. The toast IS the confirmation surface — close the local
    // confirm dialog and play the exit animation.
    if (onDeleteCapture) {
      setConfirmOpen(false);
      setRemoved(true);
      onDeleteCapture(capture);
      return;
    }
    // Legacy path (project detail Captures column, etc.) — keep the
    // pre-Phase-6 inline delete so the card works standalone.
    onOptimisticDelete?.(capture.id);
    setConfirmOpen(false);
    setRemoved(true);
    startTransition(async () => {
      const r = await deleteCapture(capture.id);
      if (!r.success) {
        toast.error(r.error);
        setRemoved(false);
        return;
      }
      toast("Capture deleted.");
    });
  }

  // Keyboard activation parity: Enter / Space on a focused card opens detail
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
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
            "group relative border border-border rounded-lg bg-card transition-colors",
            compact ? "p-2" : "p-4",
            onOpen && "cursor-pointer hover:bg-card/80",
          )}
          {...(onOpen
            ? {
                role: "button",
                tabIndex: 0,
                "aria-label": "Open capture",
                onClick: onOpen,
                onKeyDown: handleKeyDown,
              }
            : {})}
        >
          {/* ⋯ hover-reveal action menu — stops propagation so clicks here don't open the panel */}
          <div
            className={cn(
              "absolute top-2 right-2 opacity-0 transition-opacity",
              "group-hover:opacity-100 data-[state=open]:opacity-100",
            )}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
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
              <DropdownMenuContent
                align="end"
                className="font-sans text-[13px]"
              >
                {onOpen && (
                  <DropdownMenuItem onSelect={() => onOpen()}>
                    Open
                  </DropdownMenuItem>
                )}
                {isJarvisCreated && (
                  // D-14 / JARVIS-13 — only render this item for createdVia === "jarvis"
                  <DropdownMenuItem onSelect={() => setConvertOpen(true)}>
                    Convert to task
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

          {showAvatar ? (
            <div className="flex gap-3">
              {/* Twitter-style avatar column — single-user life-OS, this is always "you".
                  No ring/border (journal-paper aesthetic), fallback initial sits on
                  the existing AvatarFallback bg-muted token. */}
              <Avatar className="h-9 w-9 flex-shrink-0">
                {userAvatarUrl ? (
                  <AvatarImage
                    src={userAvatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback className="font-sans text-[13px] text-muted-foreground">
                  {userInitials ?? "·"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <CaptureBody capture={capture} compact={compact} />
              </div>
            </div>
          ) : (
            <CaptureBody capture={capture} compact={compact} />
          )}
        </motion.div>
      )}

      {/* JARVIS-13 / D-14 — Convert capture-to-task dialog, mounted only for
          createdVia === "jarvis" captures (the menu item that opens it is
          itself gated, so the dialog mount-condition is a clean two-layer
          guard). */}
      {isJarvisCreated && convertOpen ? (
        <ConvertCaptureToTaskDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          capture={{ id: capture.id, content: capture.content }}
          existingProjectIds={capture.projects.map((p) => p.id)}
          availableProjects={availableProjects}
          onOptimisticDelete={onOptimisticDelete}
        />
      ) : null}

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
        <RelativeTime date={capture.createdAt} />
      </div>
    </div>
  );
}
