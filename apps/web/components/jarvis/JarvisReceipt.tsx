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
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";

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
 *     with an outline-trace + shimmer while the executor is in-flight (D-P3).
 *     The Console upgrades the placeholder to `status: "done"` when
 *     `event: action` lands.
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

/**
 * Phase 6.1 Plan 02 (UI-SPEC §9b + §9i): intent communicated via the
 * leading 6px dot color (not via card border or background). The card
 * itself is a clean 1px --edge-hud rectangle with --hud-cyan-glow-soft
 * ambient — intent is signal via the dot only.
 *
 * Color mapping per UI-SPEC §3c intent ink palette:
 *   create_task        → --ink-amber  (action items, deadlines)
 *   create_capture     → --ink-sage   (preservation, growth)
 *   create_event       → --ink-coral  (time-bound, sharp edge)
 *   remember_fact      → --hud-cyan-light (agent-side, low chroma)
 *   ask_clarification  → --hud-cyan-light (agent-side, same family)
 */
const INTENT_META = {
  create_task: {
    label: "TASK",
    icon: ListTodo,
    intentDot: "var(--ink-amber)",
  },
  create_capture: {
    label: "CAPTURE",
    icon: FileText,
    intentDot: "var(--ink-sage)",
  },
  create_event: {
    label: "EVENT",
    icon: CalendarDays,
    intentDot: "var(--ink-coral)",
  },
  remember_fact: {
    label: "MEMORY",
    icon: Brain,
    intentDot: "var(--hud-cyan-light)",
  },
  // Phase 5.1 D-A1 / JARVIS-19: ask_clarification gets a receipt badge too
  // (the event: action still fires for uniform dispatch loop; the dedicated
  // event: clarification SSE provides the interactive question UI above this).
  ask_clarification: {
    label: "QUESTION",
    icon: HelpCircle,
    intentDot: "var(--hud-cyan-light)",
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
  // Phase 6.1 Plan 02 (UI-SPEC §6c queued state): outline-trace SVG draws the
  // border clockwise over 360ms via .hud-receipt-outline-trace (stroke-dasharray
  // reveal), then the .hud-receipt-shimmer class sweeps a --hud-cyan-glow
  // gradient through the card interior at 1800ms/loop until the action arrives.
  // Phase 6's intent-color border + Tailwind-pulse treatment fully retired.
  if (action.status === "queued" && !action.result) {
    return (
      <div
        data-status="queued"
        className="relative rounded-lg px-2 py-1 my-1 opacity-80 overflow-hidden transition-[border-color,box-shadow] duration-200 ease-out"
        style={{
          // Phase 6.1 polish — glassy pill recipe (mirrors /settings profile pill).
          // Translucent surface + backdrop-blur + inset cyan inner halo + single
          // downward outer shadow. Cyan halo intentionally absent here (queued
          // state surfaces it via the outline-trace SVG instead).
          backgroundColor: "color-mix(in oklch, var(--surface) 82%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          // Static placeholder border so the outline-trace SVG draws over it
          border: "1px solid color-mix(in oklch, var(--edge-hud) 55%, transparent)",
          boxShadow:
            "inset 0 1px 0 color-mix(in oklch, white 12%, transparent)," +
            "inset 0 -1px 0 color-mix(in oklch, var(--ink) 10%, transparent)," +
            "inset 0 0 24px color-mix(in oklch, var(--hud-cyan) 6%, transparent)," +
            "0 10px 32px color-mix(in oklch, var(--ink) 22%, transparent)," +
            "0 2px 6px color-mix(in oklch, var(--ink) 10%, transparent)",
        }}
      >
        {/* Outline-trace SVG — draws the receipt border clockwise over 360ms */}
        {!shouldReduce ? (
          <svg
            className="absolute inset-0 pointer-events-none hud-receipt-outline-trace"
            aria-hidden="true"
            preserveAspectRatio="none"
            style={{
              // Approximation of card perimeter; the stroke-dashoffset
              // keyframe interpolates against this length
              ["--receipt-outline-len" as string]: "320",
            }}
          >
            <rect
              x="0.5"
              y="0.5"
              width="calc(100% - 1px)"
              height="calc(100% - 1px)"
              fill="none"
              stroke="var(--hud-cyan-bright)"
              strokeWidth="1"
              rx="2"
              strokeDasharray="320"
            />
          </svg>
        ) : null}
        {/* Shimmer sweeps through card body until action arrives */}
        {!shouldReduce ? (
          <div
            className="absolute inset-0 pointer-events-none hud-receipt-shimmer"
            aria-hidden="true"
          />
        ) : null}
        <span className="relative font-mono text-xs uppercase tracking-[0.08em] flex items-center gap-1.5 text-[var(--ink-muted)]">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: meta.intentDot }}
            aria-hidden="true"
          />
          <Icon className="h-3.5 w-3.5" />
          {meta.label} <span className="text-[var(--ink-muted)]">queued…</span>
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

  // Phase 6.1 Plan 02 (UI-SPEC §5a + §9b): padding stays on the same grid as
  // Phase 6 — compact px-2 py-1, default px-4 py-2. Border replaced with
  // 1px --edge-hud at rest. Intent now communicated via the leading dot
  // (intentDot color in INTENT_META), not the card border.
  //
  // Error path (UI-SPEC §6b state 8): card gets a 3px --ink-coral left edge
  // overriding the standard border, AND the .hud-error-glitch class fires
  // the 80ms translateX(2px) jitter once on mount.
  //
  // Undone tombstone: drop opacity + grayscale so the user sees what they
  // reversed (the row stays as a record, doesn't disappear from scrollback).
  const isError = !ok;
  const containerCls = cn(
    "relative rounded-lg my-1 overflow-hidden group/receipt transition-[border-color,box-shadow] duration-200 ease-out",
    variant === "compact" ? "px-2 py-1 opacity-95" : "px-4 py-2",
    isError && !shouldReduce && "hud-error-glitch",
    undone && "opacity-50 grayscale",
  );

  // Phase 6.1 polish — glassy pill recipe (mirrors /settings profile pill).
  // Translucent surface + backdrop-blur + inset cyan inner halo (the bit that
  // makes it read "glassy" rather than just shadowed) + a single downward
  // outer shadow for depth. On resolved receipts we stack the ambient
  // --hud-cyan-glow-soft halo on top so the inner + outer cyan signals blend.
  const glassyShadow =
    "inset 0 1px 0 color-mix(in oklch, white 12%, transparent)," +
    "inset 0 -1px 0 color-mix(in oklch, var(--ink) 10%, transparent)," +
    "inset 0 0 24px color-mix(in oklch, var(--hud-cyan) 6%, transparent)," +
    "0 10px 32px color-mix(in oklch, var(--ink) 22%, transparent)," +
    "0 2px 6px color-mix(in oklch, var(--ink) 10%, transparent)";

  const containerStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in oklch, var(--surface) 82%, transparent)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    // 1px --edge-hud (softened) base border; error overrides LEFT edge to 3px coral
    border: "1px solid color-mix(in oklch, var(--edge-hud) 55%, transparent)",
    ...(isError
      ? {
          borderLeftWidth: "3px",
          borderLeftColor: "var(--ink-coral)",
          boxShadow: glassyShadow,
        }
      : {
          // Phase 6.1 Plan 02 (UI-SPEC §9b): ambient --hud-cyan-glow-soft
          // halo on resolved receipts — gives the "JARVIS bringing the
          // element online" feel via a soft surrounding glow (UI-SPEC §13
          // explicitly rejects filter-channel theatrics on this surface).
          // Layered AFTER the glassy stack so inner + outer cyan signals blend.
          boxShadow: `${glassyShadow}, 0 0 24px var(--hud-cyan-glow-soft)`,
        }),
  };

  // Body text size: compact uses text-xs (de-emphasized); default uses text-sm
  const bodyTextCls = variant === "compact" ? "text-xs" : "text-sm";
  // Phase 6.1 Plan 02 (UI-SPEC §4): receipt title in serif body register
  // (the receipt is content, not chrome). Tombstone styling on undo.
  const titleCls = cn("font-serif", undone && "line-through text-muted-foreground");

  return (
    <motion.div
      // Phase 6.1 Plan 02 (UI-SPEC §6c landing state): content fade-in
      // opacity 0 → 1 + y: 4 → 0 over 220ms. Phase 6's holographic filter
      // channel (brightness + saturate + hue shift) is REJECTED per
      // UI-SPEC §13 anti-pattern catalog.
      initial={shouldReduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduce ? 0 : 0.22,
        ease: [0.25, 1, 0.5, 1],
      }}
      data-undone={undone ? "true" : undefined}
      className={containerCls}
      style={containerStyle}
    >
      {/* Phase 6.1 Plan 02 (UI-SPEC §6c landing): corner crops on the receipt
          card (10px legs, static — not viewport-level breathing) frame the
          receipt as an "artifact materialized by JARVIS". */}
      <HudCornerCrops
        size={10}
        className="absolute inset-0 pointer-events-none"
        breathing={false}
      />

      <div className="relative flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.08em]">
        <span className="flex items-center gap-1.5">
          {/* Phase 6.1 Plan 02 (UI-SPEC §6c + §9i): intent dot — 6px filled
              circle, scale 1 → 1.4 → 1 over 280ms via Motion 12 on mount.
              Color encodes the intent (amber/sage/coral/cyan-light). */}
          <motion.span
            initial={shouldReduce ? false : { scale: 1 }}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{
              duration: shouldReduce ? 0 : 0.28,
              ease: [0.25, 1, 0.5, 1],
            }}
            className="inline-block rounded-full"
            style={{
              width: "6px",
              height: "6px",
              backgroundColor: meta.intentDot,
            }}
            aria-hidden="true"
          />
          <Icon className="h-3.5 w-3.5" />
          <span>{meta.label}</span>
          {ok ? (
            <CheckCircle2
              className="h-3.5 w-3.5"
              style={{ color: "var(--ink-sage)" }}
            />
          ) : (
            <AlertCircle
              className="h-3.5 w-3.5"
              style={{ color: "var(--ink-coral)" }}
            />
          )}
        </span>
        {undone ? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            Undone
          </span>
        ) : undoEligible ? (
          <UndoButton onUndo={onUndo as () => void} />
        ) : null}
      </div>

      {ok && receipt ? (
        <div className={cn("relative mt-1.5 space-y-0.5", bodyTextCls)}>
          {action.name === "create_task" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
              <div className="font-mono text-xs text-[var(--ink-muted)]">
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
                <div className="font-mono text-xs text-[var(--ink-muted)]">
                  #{(receipt.hashtags as string[]).join(" #")}
                </div>
              ) : null}
            </>
          ) : null}
          {action.name === "create_event" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
              <div className="font-mono text-xs text-[var(--ink-muted)]">
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
              <div className="font-mono text-xs text-[var(--ink-muted)]">
                {String(receipt.type ?? "")} · remembered
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div
          className="relative mt-1.5 font-mono text-xs"
          style={{ color: "var(--ink-coral)" }}
        >
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
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      data-source="jarvis_suggested"
      className="relative rounded-lg px-4 py-2 my-1 overflow-hidden transition-[border-color,box-shadow] duration-200 ease-out"
      style={{
        // Phase 6.1 polish — glassy pill recipe (mirrors /settings profile pill).
        // Translucent surface + backdrop-blur + inset cyan inner halo + single
        // downward outer shadow, composed under the JARVIS ambient cyan glow.
        backgroundColor: "color-mix(in oklch, var(--surface) 82%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid color-mix(in oklch, var(--edge-hud) 55%, transparent)",
        boxShadow:
          "inset 0 1px 0 color-mix(in oklch, white 12%, transparent)," +
          "inset 0 -1px 0 color-mix(in oklch, var(--ink) 10%, transparent)," +
          "inset 0 0 24px color-mix(in oklch, var(--hud-cyan) 6%, transparent)," +
          "0 10px 32px color-mix(in oklch, var(--ink) 22%, transparent)," +
          "0 2px 6px color-mix(in oklch, var(--ink) 10%, transparent)," +
          "0 0 24px var(--hud-cyan-glow-soft)",
      }}
    >
      <HudCornerCrops
        size={10}
        className="absolute inset-0 pointer-events-none"
        breathing={false}
      />
      <div
        className="relative flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em]"
        style={{ color: "var(--hud-cyan-light)" }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "var(--hud-cyan-light)" }}
          aria-hidden="true"
        />
        <Sparkles className="h-3.5 w-3.5" />
        SUGGESTED FACT — {receipt.type}
      </div>
      <div className="relative font-serif text-sm mt-1">
        <strong>{receipt.key}</strong>: {receipt.value}
      </div>
      <div className="relative flex items-center gap-2 mt-2">
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
        <span className="text-xs text-[var(--ink-muted)] font-mono ml-auto">
          {kept ? "kept" : seconds > 0 ? `auto-keep in ${seconds}s` : "kept"}
        </span>
      </div>
    </motion.div>
  );
}
