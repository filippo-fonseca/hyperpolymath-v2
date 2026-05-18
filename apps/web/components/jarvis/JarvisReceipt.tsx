"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FileText,
  ListTodo,
} from "lucide-react";
import type { ScrollbackAction } from "./jarvis-types";
import { useUndoCountdown } from "./use-undo-countdown";
import { cn } from "@/lib/utils";

/**
 * Intent-badged action receipt (D-09 / JARVIS-09).
 *
 * Plan 05-03 shipped the shell — title + badge + resolved fields.
 * Plan 05-04 wires the 5s undo countdown (D-03 / D-04).
 *
 * Phase 5.1 (D-R1 / JARVIS-20):
 *   - Added `variant?: "default" | "compact"` prop. Compact de-emphasizes the
 *     receipt visually when prose text appears above it (thinner border, smaller
 *     padding, reduced font) so prose reads as primary, receipt as supplementary.
 *   - Added `status === "queued"` early-return: renders a placeholder receipt
 *     with animate-pulse while the executor is in-flight (D-P3). The Console
 *     upgrades the placeholder to `status: "done"` when `event: action` lands.
 *   - `result` is now optional — queued placeholders have no result yet.
 *
 * Undo lifecycle:
 *   - On mount of a successful, not-yet-undone receipt, start a 5s countdown.
 *   - Render "Undo (N)" while countdown > 0.
 *   - Click Undo → call `onUndo()` + locally hide the button immediately.
 *   - Countdown reaches 0 → hide the Undo button (receipt body stays).
 *
 * The receipt never gates rendering on the Undo state — only the button is
 * conditional. Once an action arrives, the receipt is visible.
 */

const INTENT_META = {
  create_task: {
    label: "TASK",
    icon: ListTodo,
    classes: "border-blue-500/50 bg-blue-500/5",
  },
  create_capture: {
    label: "CAPTURE",
    icon: FileText,
    classes: "border-amber-500/50 bg-amber-500/5",
  },
  create_event: {
    label: "EVENT",
    icon: CalendarDays,
    classes: "border-emerald-500/50 bg-emerald-500/5",
  },
} as const;

interface Props {
  action: ScrollbackAction;
  /**
   * Phase 5.1 D-R1: visual weight control.
   * - "default" (base): border-l-2 px-3 py-2 — standard receipt weight.
   * - "compact": border-l px-2.5 py-1 opacity-95 — de-emphasized under prose text.
   */
  variant?: "default" | "compact";
  /**
   * Plan 05-04: fired when the user clicks Undo within the 5s window.
   * Parent (JarvisConsole) handles the optimistic scrollback update + the
   * server round-trip. When undefined, the Undo button is not rendered.
   */
  onUndo?: () => void;
}

export function JarvisReceipt({ action, variant = "default", onUndo }: Props) {
  const meta = INTENT_META[action.name];
  if (!meta) return null;
  const Icon = meta.icon;

  // Phase 5.1 D-P3: queued placeholder — renders before executor resolves.
  // The Console will upgrade this to status: "done" when event: action lands.
  if (action.status === "queued" && !action.result) {
    return (
      <div
        data-status="queued"
        className={cn(
          "rounded border-l-2 px-3 py-1 my-1 opacity-60 animate-pulse",
          meta.classes,
        )}
      >
        <span className="font-mono text-xs uppercase tracking-wide flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {meta.label} <span className="text-muted-foreground">queued…</span>
        </span>
      </div>
    );
  }

  // Guard: if result is not yet populated (shouldn't happen outside queued state,
  // but defensive for type safety since result is now optional).
  if (!action.result) return null;

  const ok = action.result.ok;
  const undone = action.undone === true;
  // Receipt is eligible for undo iff: action succeeded, has not been undone,
  // and the parent wired the onUndo callback.
  const undoEligible = ok && !undone && typeof onUndo === "function";

  const receipt = ok
    ? ((action.result as { receipt?: Record<string, unknown> }).receipt ?? {})
    : null;
  const errorMsg = !ok
    ? (action.result as { error: string }).error
    : null;

  /**
   * Format a date for receipt display (B6 fix — Plan 05-03 hotfix).
   *
   * The server now attaches an authoritative `allDay` boolean to the receipt
   * payload (derived from chrono's `hourKnown` flag at parse time). When
   * present we trust it; otherwise we fall back to the (fragile, but
   * harmless) midnight/noon heuristic so legacy callsites still degrade
   * sanely.
   *
   * `allDay=true`  → "May 16" (no time)
   * `allDay=false` → "May 16, 8:00 PM"
   * relative same-day → "today" / "tomorrow"
   */
  function fmtDate(iso: unknown, allDay?: boolean): string {
    if (typeof iso !== "string") return String(iso ?? "");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    let inferredAllDay: boolean;
    if (typeof allDay === "boolean") {
      inferredAllDay = allDay;
    } else {
      const m = d.getMinutes();
      const s = d.getSeconds();
      const h = d.getHours();
      inferredAllDay = s === 0 && m === 0 && (h === 0 || h === 12);
    }

    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();

    if (inferredAllDay) {
      if (sameDay) return "today";
      if (isTomorrow) return "tomorrow";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Phase 5.1 D-R1: compact variant uses thinner border + reduced padding
  const containerCls = cn(
    "rounded my-1",
    variant === "compact"
      ? "border-l px-2.5 py-1 opacity-95"
      : "border-l-2 px-3 py-2",
    meta.classes,
  );

  // Body text size: compact uses text-xs (de-emphasized); default uses text-sm
  const bodyTextCls = variant === "compact" ? "text-xs" : "text-sm";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={containerCls}
    >
      <div className="flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <span>{meta.label}</span>
          {ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-red-600" />
          )}
        </span>
        {undoEligible ? (
          <UndoButton onUndo={onUndo as () => void} />
        ) : null}
      </div>

      {ok && receipt ? (
        <div className={cn("mt-1.5 space-y-0.5", bodyTextCls)}>
          {action.name === "create_task" ? (
            <>
              <div className="font-serif">{String(receipt.title ?? "")}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {String(receipt.priority ?? "P3")}
                {receipt.due
                  ? ` · due ${fmtDate(receipt.due, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}`
                  : ""}
                {Array.isArray(receipt.project_ids) &&
                receipt.project_ids.length
                  ? ` · ${receipt.project_ids.length} project${receipt.project_ids.length > 1 ? "s" : ""}`
                  : ""}
              </div>
            </>
          ) : null}
          {action.name === "create_capture" ? (
            <>
              <div className="font-serif">{String(receipt.content ?? "")}</div>
              {Array.isArray(receipt.hashtags) && receipt.hashtags.length ? (
                <div className="font-mono text-xs text-muted-foreground">
                  #{(receipt.hashtags as string[]).join(" #")}
                </div>
              ) : null}
            </>
          ) : null}
          {action.name === "create_event" ? (
            <>
              <div className="font-serif">{String(receipt.title ?? "")}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {fmtDate(receipt.start, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}
                {" → "}
                {fmtDate(receipt.end, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-1.5 font-mono text-xs text-red-600">
          {errorMsg}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Internal Undo button — owns the countdown lifecycle.
 *
 * Lives in its own component so the useUndoCountdown hook only mounts when
 * the parent considers this receipt undo-eligible (the parent's conditional
 * render unmounts → effects clean up automatically).
 *
 * Three states:
 *   1. countdown > 0           → render "Undo (N)" button, clickable
 *   2. user clicks Undo        → call onUndo + locally hide (cancel countdown)
 *   3. countdown reaches 0     → hide via expired state (receipt body stays)
 */
function UndoButton({ onUndo }: { onUndo: () => void }) {
  const [expired, setExpired] = useState(false);
  const [clicked, setClicked] = useState(false);

  const handleExpire = useCallback(() => {
    setExpired(true);
  }, []);

  const { seconds, cancel } = useUndoCountdown(5, handleExpire);

  if (expired || clicked) return null;

  return (
    <button
      type="button"
      onClick={() => {
        cancel();
        setClicked(true);
        onUndo();
      }}
      className="text-muted-foreground hover:text-foreground"
    >
      Undo ({seconds})
    </button>
  );
}
