"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  Brain,
  CalendarDays,
  CheckCircle2,
  FileText,
  HelpCircle,
  ListTodo,
  Sparkles,
} from "lucide-react";
import type { ScrollbackAction } from "./jarvis-types";
import { useUndoCountdown } from "./use-undo-countdown";
import { cn } from "@/lib/utils";
import { forgetFactAction } from "@/app/actions/jarvis-facts";
import { Button } from "@/components/ui/button";

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
 *     with jarvis-queued-shimmer while the executor is in-flight (D-P3). The Console
 *     upgrades the placeholder to `status: "done"` when `event: action` lands.
 *   - `result` is now optional — queued placeholders have no result yet.
 *
 * Phase 5.1 Plan 03 (D-M3 / JARVIS-18):
 *   - Added `remember_fact` receipt type — user_explicit shows a standard
 *     receipt with 5s undo; jarvis_suggested shows Keep/Discard with 10s
 *     countdown (useUndoCountdown(10, onExpire) reused from Phase 5).
 *   - jarvis_suggested fact is persisted IMMEDIATELY by the executor; Discard
 *     hard-deletes via forgetFactAction; Keep is implicit on countdown expire.
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
  remember_fact: {
    label: "MEMORY",
    icon: Brain,
    classes: "border-violet-500/50 bg-violet-500/5",
  },
  // Phase 5.1 D-A1 / JARVIS-19: ask_clarification gets a receipt badge too
  // (the event: action still fires for uniform dispatch loop; the dedicated
  // event: clarification SSE provides the interactive question UI above this).
  ask_clarification: {
    label: "QUESTION",
    icon: HelpCircle,
    classes: "border-violet-500/50 bg-violet-500/5",
  },
} as const;

interface Props {
  action: ScrollbackAction;
  /**
   * Phase 5.1 D-R1: visual weight control.
   * - "default" (base): border-l-2 px-4 py-2 — standard receipt weight (UI-SPEC §5a, on-grid).
   * - "compact": border-l px-2 py-1 opacity-95 — de-emphasized under prose text (UI-SPEC §5a, on-grid).
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
  // Phase 6 Plan 06-03 (D-08, UI-SPEC §7d): reduced-motion guard for the
  // holographic fade-in. Hooks must be called unconditionally before any
  // early returns, so this lives at the very top of the component.
  const shouldReduce = useReducedMotion();
  const meta = INTENT_META[action.name];
  if (!meta) return null;
  const Icon = meta.icon;

  // Phase 5.1 D-P3: queued placeholder — renders before executor resolves.
  // The Console will upgrade this to status: "done" when event: action lands.
  //
  // Phase 6 Plan 06-03 (D-08, UI-SPEC §7a): replaced the generic Tailwind
  // pulse with jarvis-queued-shimmer — a JARVIS-blue scan-line sweep that
  // signals "agent is working" instead of "loading skeleton." Reduced-motion
  // override in globals.css disables the sweep while keeping the placeholder
  // visible. Padding snapped to px-2 py-1 per UI-SPEC §5a (compact-on-grid).
  if (action.status === "queued" && !action.result) {
    return (
      <div
        data-status="queued"
        className={cn(
          "rounded border-l-2 px-2 py-1 my-1 opacity-60 jarvis-queued-shimmer",
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

  // Phase 5.1 Plan 03 (D-M3 / JARVIS-18): jarvis_suggested branch.
  // The executor persisted the fact immediately; this receipt is the 10s
  // undo window (Keep/Discard) — Discard hard-deletes via forgetFactAction.
  if (
    action.name === "remember_fact" &&
    action.result.ok === true &&
    (action.result.receipt as { source?: string }).source === "jarvis_suggested"
  ) {
    return <SuggestedFactReceipt action={action} />;
  }

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

  // Phase 5.1 D-R1: compact variant uses thinner border + reduced padding.
  // Phase 6 Plan 06-03 (UI-SPEC §5a): padding snapped to grid — compact uses
  // px-2 py-1 (8px/4px) and default uses px-4 py-2 (16px/8px) so both values
  // align with the spacing scale and preserve the 2× horizontal ratio.
  // Undone tombstone: drop opacity + grayscale so the user sees what they
  // reversed (the row stays as a record, doesn't disappear from scrollback).
  const containerCls = cn(
    "rounded my-1",
    variant === "compact"
      ? "border-l px-2 py-1 opacity-95"
      : "border-l-2 px-4 py-2",
    meta.classes,
    undone && "opacity-50 grayscale",
  );

  // Body text size: compact uses text-xs (de-emphasized); default uses text-sm
  const bodyTextCls = variant === "compact" ? "text-xs" : "text-sm";
  // Tombstone styling on title text when undone.
  const titleCls = cn("font-serif", undone && "line-through text-muted-foreground");

  return (
    <motion.div
      // Phase 6 Plan 06-03 (D-08, UI-SPEC §7d): holographic fade-in — a brief
      // blue-shifted hue-rotate that resolves to the natural intent color
      // within 300ms. "JARVIS bringing the element online" metaphor. Reduced
      // motion → opacity-only, no filter, no y-offset, no duration.
      initial={{
        opacity: 0,
        y: shouldReduce ? 0 : 4,
        filter: shouldReduce ? "none" : "brightness(1.4) saturate(0.3) hue-rotate(160deg)",
      }}
      animate={{
        opacity: 1,
        y: 0,
        filter: "brightness(1) saturate(1) hue-rotate(0deg)",
      }}
      transition={{
        duration: shouldReduce ? 0 : 0.3,
        ease: "easeOut",
        filter: { duration: shouldReduce ? 0 : 0.25 },
      }}
      data-undone={undone ? "true" : undefined}
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
        {undone ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Undone
          </span>
        ) : undoEligible ? (
          <UndoButton onUndo={onUndo as () => void} />
        ) : null}
      </div>

      {ok && receipt ? (
        <div className={cn("mt-1.5 space-y-0.5", bodyTextCls)}>
          {action.name === "create_task" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
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
              <div className={titleCls}>{String(receipt.content ?? "")}</div>
              {Array.isArray(receipt.hashtags) && receipt.hashtags.length ? (
                <div className="font-mono text-xs text-muted-foreground">
                  #{(receipt.hashtags as string[]).join(" #")}
                </div>
              ) : null}
            </>
          ) : null}
          {action.name === "create_event" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {fmtDate(receipt.start, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}
                {" → "}
                {fmtDate(receipt.end, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}
              </div>
            </>
          ) : null}
          {action.name === "remember_fact" ? (
            <>
              <div className={titleCls}>
                <strong>{String(receipt.key ?? "")}</strong>: {String(receipt.value ?? "")}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {String(receipt.type ?? "")} · remembered
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

/**
 * jarvis_suggested fact receipt — Keep/Discard with 10s countdown (Blocker 2 / D-M3).
 *
 * The executor inserts the fact row IMMEDIATELY. This component is the user's
 * undo window. On expiry → Keep (no-op, fact stays). On Discard → forgetFactAction
 * hard-deletes the just-inserted row.
 */
function SuggestedFactReceipt({ action }: { action: ScrollbackAction }) {
  const result = action.result as { ok: true; id: string; receipt: Record<string, unknown> };
  const receipt = result.receipt as {
    type: string;
    key: string;
    value: string;
    source: string;
    factId?: string;
  };
  const [discarded, setDiscarded] = useState(false);
  const [kept, setKept] = useState(false);

  const handleExpire = useCallback(() => {
    // Countdown expired — Keep is implicit. Fact is already persisted.
    setKept(true);
  }, []);

  const { seconds, cancel } = useUndoCountdown(10, handleExpire);

  async function handleDiscard() {
    cancel();
    const factId = receipt.factId;
    if (!factId) return;
    const result = await forgetFactAction({ factId });
    if (result.ok) {
      setDiscarded(true);
    }
  }

  function handleKeep() {
    cancel();
    setKept(true);
  }

  if (discarded) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-source="jarvis_suggested"
      className="rounded border-l-2 border-violet-500/50 bg-violet-500/5 px-4 py-2 my-1"
    >
      <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" />
        SUGGESTED FACT — {receipt.type}
      </div>
      <div className="font-serif text-sm mt-1">
        <strong>{receipt.key}</strong>: {receipt.value}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleKeep}
          aria-label="Keep"
          className="h-6 px-2 text-xs"
        >
          Keep
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDiscard}
          aria-label="Discard"
          className="h-6 px-2 text-xs"
        >
          Discard
        </Button>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {kept ? "kept" : seconds > 0 ? `auto-keep in ${seconds}s` : "kept"}
        </span>
      </div>
    </motion.div>
  );
}
