"use client";

import { forgetFactAction } from "@/app/actions/jarvis-facts";
import { HashtagChip } from "@/components/captures/HashtagChip";
import { Button } from "@/components/ui/button";
import { entityHref, findResultRef, receiptEntityRef } from "@/lib/entity-href";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowUpRight,
  Brain,
  CalendarDays,
  Edit3,
  FileText,
  HelpCircle,
  Link2,
  ListTodo,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useState } from "react";
import type { ScrollbackAction } from "./jarvis-types";
import { useUndoCountdown } from "./use-undo-countdown";

/**
 * JARVIS receipt card (Spacedrive register).
 *
 * A single solid --sd-box plate per action with a hairline border — no blur,
 * no glass bevels, no glow. The intent chip is a flat sd inset pill; a single
 * cyan accent marks actions, functional red (--ink-coral) marks deletes/errors,
 * and passive finds stay neutral. Undo folds into a cyan pill plus a hairline
 * that depletes across the bottom edge. The data contract (ScrollbackAction)
 * and undo wiring in JarvisScrollback are untouched — only the presentation
 * moves. The .receipt-* classes are retuned additively in globals.css.
 */

type IntentMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ink: string;
};

// Single cyan accent (UI-CONTRACT §0): every intent chip speaks --sd-accent,
// except destructive deletes (functional red --ink-coral) and passive finds
// (neutral --sd-ink-faint — a lookup is not an accent-worthy action).
const INTENT_META = {
  create_task: { label: "Task", icon: ListTodo, ink: "var(--sd-accent)" },
  create_capture: { label: "Capture", icon: FileText, ink: "var(--sd-accent)" },
  create_event: { label: "Event", icon: CalendarDays, ink: "var(--sd-accent)" },
  remember_fact: { label: "Memory", icon: Brain, ink: "var(--sd-accent)" },
  ask_clarification: { label: "Question", icon: HelpCircle, ink: "var(--sd-accent)" },
  update_task: { label: "Update task", icon: Edit3, ink: "var(--sd-accent)" },
  delete_task: { label: "Delete task", icon: Trash2, ink: "var(--ink-coral)" },
  update_capture: { label: "Update capture", icon: Edit3, ink: "var(--sd-accent)" },
  delete_capture: { label: "Delete capture", icon: Trash2, ink: "var(--ink-coral)" },
  update_event: { label: "Update event", icon: Edit3, ink: "var(--sd-accent)" },
  delete_event: { label: "Delete event", icon: Trash2, ink: "var(--ink-coral)" },
  find_tasks: { label: "Find tasks", icon: Search, ink: "var(--sd-ink-faint)" },
  find_captures: { label: "Find captures", icon: Search, ink: "var(--sd-ink-faint)" },
  find_events: { label: "Find events", icon: Search, ink: "var(--sd-ink-faint)" },
  find_people: { label: "Find people", icon: Search, ink: "var(--sd-ink-faint)" },
  create_person: { label: "Person", icon: UserPlus, ink: "var(--sd-accent)" },
  link_people: { label: "Linked", icon: Link2, ink: "var(--sd-accent)" },
} as const satisfies Record<string, IntentMeta>;

interface Props {
  action: ScrollbackAction;
  /**
   * Visual weight control.
   * - "default": full receipt weight, primary title in serif.
   * - "compact": tighter padding + reduced opacity — de-emphasized when
   *   prose text appears above (receipt reads as supplementary).
   */
  variant?: "default" | "compact";
  /** Fired when the user clicks Undo within the countdown window. */
  onUndo?: () => void;
}

export function JarvisReceipt({ action, variant = "default", onUndo }: Props) {
  const shouldReduce = useReducedMotion();
  const router = useRouter();
  const meta = (INTENT_META as Record<string, IntentMeta | undefined>)[action.name];
  if (!meta) return null;
  const Icon = meta.icon;

  const padCls = variant === "compact" ? "px-3 py-2" : "px-4 py-3";
  const bodyTextCls = variant === "compact" ? "text-[13px]" : "text-sm";

  // Queued placeholder — subtle shimmer only, no busy border-trace.
  if (action.status === "queued" && !action.result) {
    return (
      <div
        data-status="queued"
        className={cn("receipt-card overflow-hidden", padCls)}
      >
        {!shouldReduce ? <div className="receipt-shimmer" aria-hidden="true" /> : null}
        <div className="relative flex items-center gap-2">
          <IntentChip meta={meta} icon={Icon} />
          <span className="font-mono text-[11px] tracking-[0.06em] text-[var(--sd-ink-dull)]">
            queued
            <AnimatedDots reduced={shouldReduce ?? false} />
          </span>
        </div>
      </div>
    );
  }

  if (!action.result) return null;

  // jarvis_suggested memory — Keep/Discard with 10s countdown.
  if (
    action.name === "remember_fact" &&
    action.result.ok === true &&
    (action.result.receipt as { source?: string }).source === "jarvis_suggested"
  ) {
    return <SuggestedFactReceipt action={action} meta={meta} icon={Icon} />;
  }

  const ok = action.result.ok;
  const undone = action.undone === true;
  const undoEligible = ok && !undone && typeof onUndo === "function";

  const receipt = ok
    ? ((action.result as { receipt?: Record<string, unknown> }).receipt ?? {})
    : null;
  const errorMsg = !ok ? (action.result as { error: string }).error : null;

  const entityId = ok ? (action.result as { id?: string }).id : undefined;
  const navRef = ok && !undone && entityId ? receiptEntityRef(action.name, entityId) : null;
  const navHref = navRef ? entityHref(navRef) : null;

  function fmtDate(input: unknown, allDay?: boolean): string {
    let d: Date;
    let dateOnly = false;
    if (input instanceof Date) {
      d = input;
    } else if (typeof input === "string") {
      const iso = input;
      dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
      d = dateOnly
        ? (() => {
            const [y, m, day] = iso.split("-").map(Number);
            return new Date(y, m - 1, day);
          })()
        : new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
    } else {
      return String(input ?? "");
    }
    if (Number.isNaN(d.getTime())) return "";

    let inferredAllDay: boolean;
    if (dateOnly) {
      inferredAllDay = true;
    } else if (typeof allDay === "boolean") {
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
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    if (sameDay) {
      return `Today at ${d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }
    if (isTomorrow) {
      return `Tomorrow at ${d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const TIMESTAMP_KEYS = new Set([
    "updatedAt",
    "createdAt",
    "due",
    "dueDate",
    "start",
    "end",
    "startDate",
    "endDate",
    "scheduledAt",
    "completedAt",
  ]);

  function isTimestampValue(key: string, value: unknown): boolean {
    if (value instanceof Date) return true;
    if (TIMESTAMP_KEYS.has(key) && typeof value === "string") {
      return !Number.isNaN(new Date(value).getTime());
    }
    return false;
  }

  function fmtChangeValue(key: string, value: unknown): string {
    if (value == null) return "—";
    if (isTimestampValue(key, value)) return fmtDate(value);
    if (typeof value === "boolean") return value ? "yes" : "no";
    if (typeof value === "object") {
      // gcal event start/end are {dateTime, date} objects
      const obj = value as { dateTime?: unknown; date?: unknown };
      if (obj.dateTime != null) return fmtDate(obj.dateTime);
      if (obj.date != null) return fmtDate(obj.date, true);
      return JSON.stringify(value);
    }
    return String(value);
  }

  function prettifyFieldName(key: string): string {
    // camelCase / snake_case → Sentence case
    const spaced = key
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  const isError = !ok;
  const dataStatus = isError ? "error" : "done";

  const titleCls = cn(
    "leading-snug",
    variant === "compact" ? "text-[14px]" : "text-[15px]",
    undone && "line-through text-[var(--sd-ink-dull)]"
  );
  const metaCls = "font-mono text-[11px] tracking-[0.02em] text-[var(--sd-ink-dull)] mt-1";

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduce ? 0 : 0.24, ease: [0.25, 1, 0.5, 1] }}
      data-status={dataStatus}
      data-undone={undone ? "true" : undefined}
      className={cn(
        "receipt-card overflow-hidden group/receipt",
        padCls,
        variant === "compact" && "opacity-95",
        navHref && "cursor-pointer"
      )}
      {...(navHref
        ? {
            role: "link",
            tabIndex: 0,
            "aria-label": "Open this item",
            onClick: () => router.push(navHref),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(navHref);
              }
            },
          }
        : {})}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <IntentChip meta={meta} icon={Icon} />
          {isError ? (
            <AlertCircle
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--ink-coral)" }}
              aria-hidden="true"
            />
          ) : null}
          {navHref ? (
            <ArrowUpRight
              className="h-3.5 w-3.5 opacity-0 transition-opacity duration-150 group-hover/receipt:opacity-100 shrink-0"
              style={{ color: "var(--sd-accent)" }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        {undone ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
            Undone
          </span>
        ) : undoEligible ? (
          <UndoAffordance onUndo={onUndo as () => void} durationMs={5000} />
        ) : null}
      </div>

      {ok && receipt ? (
        <div className={cn("relative mt-2 space-y-0.5", bodyTextCls)}>
          {action.name === "create_task" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
              <div className={metaCls}>
                {String(receipt.priority ?? "P3")}
                {receipt.due
                  ? ` · due ${fmtDate(receipt.due, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}`
                  : ""}
                {!receipt.due && receipt.inbox ? " · Added to your Inbox." : ""}
                {Array.isArray(receipt.project_ids) && receipt.project_ids.length
                  ? ` · ${receipt.project_ids.length} project${receipt.project_ids.length > 1 ? "s" : ""}`
                  : ""}
              </div>
            </>
          ) : null}
          {action.name === "create_capture" ? (
            <>
              <div className={titleCls}>{String(receipt.content ?? "")}</div>
              {Array.isArray(receipt.hashtags) && receipt.hashtags.length ? (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {(receipt.hashtags as string[]).map((tag) => (
                    <HashtagChip key={tag} displayName={tag} asButton={false} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {action.name === "create_event" ? (
            <>
              <div className={titleCls}>{String(receipt.title ?? "")}</div>
              <div className={metaCls}>
                {fmtDate(
                  receipt.start,
                  typeof receipt.allDay === "boolean" ? receipt.allDay : undefined
                )}
                {" → "}
                {fmtDate(
                  receipt.end,
                  typeof receipt.allDay === "boolean" ? receipt.allDay : undefined
                )}
              </div>
            </>
          ) : null}
          {action.name === "remember_fact" ? (
            <>
              <div className={titleCls}>
                <strong className="font-semibold">{String(receipt.key ?? "")}</strong>
                {": "}
                {String(receipt.value ?? "")}
              </div>
              <div className={metaCls}>{String(receipt.type ?? "")} · remembered</div>
            </>
          ) : null}
          {action.name === "create_person" ? (
            <>
              <div className={titleCls}>{String(receipt.name ?? "")}</div>
              <div className={metaCls}>
                added to People
                {Array.isArray(receipt.tags) && receipt.tags.length
                  ? ` · ${(receipt.tags as string[]).join(", ")}`
                  : ""}
              </div>
            </>
          ) : null}
          {action.name === "link_people" ? (
            <>
              <div className={titleCls}>
                {((receipt.linked ?? []) as Array<Record<string, unknown>>)
                  .map((p) => String(p.name ?? ""))
                  .filter(Boolean)
                  .join(", ") || "(no one linked)"}
              </div>
              <div className={metaCls}>
                linked to {String(receipt.from_type ?? "entity")}
                {((receipt.linked ?? []) as Array<Record<string, unknown>>).some((p) => p.created)
                  ? " · new contact added"
                  : ""}
              </div>
            </>
          ) : null}
          {action.name === "ask_clarification" ? (
            <div className={titleCls}>{String(receipt.question ?? "waiting for a reply")}</div>
          ) : null}
          {action.name.startsWith("find_") ? (
            <div className="space-y-1">
              {((receipt.matches ?? []) as Array<Record<string, unknown>>)
                .slice(0, 5)
                .map((m, idx) => {
                  const rowId = String(m.id ?? "");
                  const rowRef = rowId ? findResultRef(action.name, rowId) : null;
                  const rowHref = rowRef ? entityHref(rowRef) : null;
                  const label = String(m.title ?? m.name ?? m.preview ?? m.summary ?? "(untitled)");
                  return rowHref ? (
                    <button
                      type="button"
                      key={rowId || idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(rowHref);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 text-left rounded-md px-1.5 py-1 -mx-1.5",
                        "hover:bg-[color-mix(in_oklch,var(--sd-accent)_8%,transparent)]",
                        "transition-colors duration-150"
                      )}
                    >
                      <code className="font-mono text-[10px] opacity-60 shrink-0">
                        {rowId.slice(0, 8)}
                      </code>
                      <span className="truncate">{label}</span>
                    </button>
                  ) : (
                    <div
                      key={rowId || idx}
                      className="flex items-center gap-2 px-1.5 py-1 -mx-1.5"
                      style={{ color: "var(--sd-ink-dull)" }}
                    >
                      <code className="font-mono text-[10px] opacity-60 shrink-0">
                        {rowId.slice(0, 8)}
                      </code>
                      <span className="truncate">{label}</span>
                    </div>
                  );
                })}
              {((receipt.matches ?? []) as unknown[]).length === 0 && (
                <em className="font-mono text-[11px]" style={{ color: "var(--sd-ink-dull)" }}>
                  no matches
                </em>
              )}
            </div>
          ) : null}
          {action.name.startsWith("update_") ? (() => {
            const rawChanges = (receipt.changes ?? {}) as Record<string, unknown>;
            const before = (receipt.before ?? {}) as Record<string, unknown>;
            // Hoist updatedAt out of the visible diff — it's implementation
            // churn, not a change the user asked for. Surface it once as a
            // human-readable footer instead.
            const { updatedAt, ...visibleChanges } = rawChanges;
            const visibleEntries = Object.entries(visibleChanges);
            return (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-1">
                  {visibleEntries.map(([field, value]) => {
                    const beforeVal = before[field];
                    const hasBefore = beforeVal != null && beforeVal !== "";
                    return (
                      <Fragment key={field}>
                        <dt
                          className="font-mono text-[11px] tracking-[0.02em] self-center uppercase"
                          style={{ color: "var(--sd-ink-dull)" }}
                        >
                          {prettifyFieldName(field)}
                        </dt>
                        <dd className="text-sm leading-snug">
                          {hasBefore ? (
                            <>
                              <span
                                className="line-through"
                                style={{ color: "var(--sd-ink-dull)" }}
                              >
                                {fmtChangeValue(field, beforeVal)}
                              </span>
                              <span className="mx-1.5 text-[var(--sd-ink-dull)]">→</span>
                            </>
                          ) : (
                            <span className="text-[var(--sd-ink-dull)] mr-1">→</span>
                          )}
                          <span style={{ color: "var(--sd-accent)" }}>
                            {fmtChangeValue(field, value)}
                          </span>
                        </dd>
                      </Fragment>
                    );
                  })}
                  {visibleEntries.length === 0 ? (
                    <Fragment>
                      <dt
                        className="font-mono text-[11px] col-span-2"
                        style={{ color: "var(--sd-ink-dull)" }}
                      >
                        {String(receipt.title ?? receipt.content ?? receipt.id ?? "")}
                      </dt>
                    </Fragment>
                  ) : null}
                </dl>
                {isTimestampValue("updatedAt", updatedAt) ? (
                  <div className={cn(metaCls, "mt-2")}>
                    Updated {fmtDate(updatedAt).toLowerCase()}
                  </div>
                ) : null}
              </>
            );
          })() : null}
          {action.name.startsWith("delete_") ? (
            <div className="flex items-baseline gap-2">
              <span
                className="line-through"
                style={{ color: "color-mix(in oklch, var(--ink-coral) 70%, var(--sd-ink-dull))" }}
              >
                {String(receipt.title ?? receipt.content ?? "(deleted)")}
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ color: "var(--sd-ink-dull)" }}
              >
                deleted
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="relative mt-2 font-mono text-[12px]"
          style={{ color: "var(--ink-coral)" }}
        >
          {errorMsg}
        </div>
      )}

      {undoEligible && !shouldReduce ? (
        <span
          className="receipt-undo-hairline"
          style={{ ["--undo-duration" as string]: "5000ms" }}
          aria-hidden="true"
        />
      ) : null}
    </motion.div>
  );
}

/**
 * Intent chip — softly-inset pill with the Lucide glyph + label,
 * tinted by the tool's intent ink.
 */
function IntentChip({
  meta,
  icon: Icon,
}: {
  meta: IntentMeta;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className="receipt-chip"
      style={{ ["--chip-ink" as string]: meta.ink }}
    >
      <Icon className="shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * Tiny animated ellipsis for the queued state — three dots that gently
 * fade in sequence. Disabled under reduced-motion (renders a static "…").
 */
function AnimatedDots({ reduced }: { reduced: boolean }) {
  if (reduced) return <span aria-hidden="true">…</span>;
  return (
    <span aria-hidden="true" className="inline-flex ml-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.2,
            ease: "easeInOut",
            repeat: Infinity,
            delay: i * 0.18,
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Undo affordance — the fading cyan pill that Kiwi surfaces during the
 * countdown window. The hairline (depleting bottom edge) is rendered by
 * the parent card; this owns the click target + label. Countdown state
 * lives inside so the hook only mounts when the parent decides the
 * receipt is undo-eligible.
 */
function UndoAffordance({
  onUndo,
  durationMs = 5000,
}: {
  onUndo: () => void;
  durationMs?: number;
}) {
  const [expired, setExpired] = useState(false);
  const [clicked, setClicked] = useState(false);
  const seconds = Math.round(durationMs / 1000);

  const handleExpire = useCallback(() => setExpired(true), []);
  const { cancel } = useUndoCountdown(seconds, handleExpire);

  if (expired || clicked) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        cancel();
        setClicked(true);
        onUndo();
      }}
      className="receipt-undo-pill shrink-0"
      aria-label="Undo this action"
    >
      Undo
    </button>
  );
}

/**
 * jarvis_suggested fact receipt — Keep/Discard with 10s countdown.
 * The fact row is already persisted; Discard hard-deletes via
 * forgetFactAction; Keep is implicit on countdown expire.
 */
function SuggestedFactReceipt({
  action,
  meta,
  icon: Icon,
}: {
  action: ScrollbackAction;
  meta: IntentMeta;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const shouldReduce = useReducedMotion();
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
  const [expired, setExpired] = useState(false);

  const handleExpire = useCallback(() => {
    setKept(true);
    setExpired(true);
  }, []);
  const { seconds, cancel } = useUndoCountdown(10, handleExpire);

  async function handleDiscard() {
    cancel();
    const factId = receipt.factId;
    if (!factId) return;
    const r = await forgetFactAction({ factId });
    if (r.ok) setDiscarded(true);
  }

  function handleKeep() {
    cancel();
    setKept(true);
  }

  if (discarded) return null;

  const suggestedChip: IntentMeta = {
    label: "Suggested memory",
    icon: Sparkles,
    ink: "var(--sd-accent)",
  };

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduce ? 0 : 0.24, ease: [0.25, 1, 0.5, 1] }}
      data-source="jarvis_suggested"
      data-status="done"
      className="receipt-card overflow-hidden px-4 py-3"
    >
      <div className="relative flex items-center justify-between gap-3">
        <IntentChip meta={suggestedChip} icon={Sparkles} />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
          {receipt.type}
        </span>
      </div>
      <div className="relative text-[15px] mt-2 leading-snug">
        <strong className="font-semibold">{receipt.key}</strong>
        {": "}
        {receipt.value}
      </div>
      <div className="relative flex items-center gap-2 mt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleKeep}
          aria-label="Keep"
          className="h-6 px-3 text-xs font-mono uppercase tracking-[0.06em]"
        >
          Keep
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDiscard}
          aria-label="Discard"
          className="h-6 px-3 text-xs font-mono uppercase tracking-[0.06em]"
        >
          Discard
        </Button>
        <span className="ml-auto font-mono text-[11px] text-[var(--sd-ink-dull)]">
          {kept ? "kept" : seconds > 0 ? `auto-keep in ${seconds}s` : "kept"}
        </span>
      </div>
      {!kept && !expired && !shouldReduce ? (
        <span
          className="receipt-undo-hairline"
          style={{ ["--undo-duration" as string]: "10000ms" }}
          aria-hidden="true"
        />
      ) : null}
      {/* Silence unused-var lints — Icon is passed through the props for
          symmetry with the standard receipt render. */}
      <span className="hidden" aria-hidden="true">
        <Icon />
        {meta.label}
      </span>
    </motion.div>
  );
}
