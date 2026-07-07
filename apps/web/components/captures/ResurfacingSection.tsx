"use client";

import { useState } from "react";
import { format, isToday } from "date-fns";
import { CalendarClock, ChevronRight, X } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { cn } from "@/lib/utils";

interface Props {
  /** Captures due to resurface today (already server-filtered + reconciled). */
  captures: CaptureWithLinks[];
  /** Open the capture's detail panel (where the date can be edited/cleared). */
  onSelect: (capture: CaptureWithLinks) => void;
  /** Clear the resurface date so the capture leaves this section. */
  onDismiss: (capture: CaptureWithLinks) => void;
}

/**
 * "Resurfacing today" — a collapsible section pinned to the top of /captures.
 *
 * Shows captures whose resurface (remind-me) date has come due (server query:
 * resurface_at <= end of today in the user's timezone). A capture leaves the
 * section when its date is cleared — via the inline Dismiss button here, or by
 * opening it and clearing/moving the date in the detail panel. Overdue items
 * (a past resurface date never cleared) keep showing so nothing is dropped.
 *
 * Renders nothing when there is nothing due, so it never adds noise to a quiet
 * inbox. Opens by default when items are present; the user can collapse it.
 */
export function ResurfacingSection({ captures, onSelect, onDismiss }: Props) {
  const [open, setOpen] = useState(true);
  if (captures.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-[var(--hud-cyan)]/25 bg-[var(--hud-cyan)]/[0.04]"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left">
        <ChevronRight
          size={15}
          className={cn(
            "text-[var(--hud-cyan)] transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <CalendarClock size={15} className="text-[var(--hud-cyan)]" />
        <span className="font-sans text-[13px] font-medium uppercase tracking-wider text-foreground">
          Resurfacing today
        </span>
        <span className="font-sans text-[12px] text-muted-foreground">
          {captures.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="flex flex-col gap-1 px-2 pb-2">
          {captures.map((c) => {
            const due = c.resurfaceAt ? new Date(c.resurfaceAt) : null;
            const overdue = due ? !isToday(due) && due.getTime() < Date.now() : false;
            return (
              <li key={c.id}>
                <div className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-background/60 transition-colors">
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="flex-1 min-w-0 text-left"
                    title="Open capture"
                  >
                    <p className="font-serif text-[14px] text-foreground line-clamp-2">
                      {c.content}
                    </p>
                    {due && (
                      <p
                        className={cn(
                          "mt-0.5 font-sans text-[12px]",
                          overdue ? "text-[var(--ink-coral)]" : "text-muted-foreground",
                        )}
                      >
                        {overdue ? "Was due " : "Due "}
                        {format(due, "PP")}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(c)}
                    title="Dismiss (clear resurface date)"
                    aria-label="Dismiss (clear resurface date)"
                    className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-[var(--ink-coral)] transition-all flex-shrink-0"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
