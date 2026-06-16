"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarClock, CheckSquare, NotebookPen, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * MorningDump — a self-contained daily-planning surface (issues #32/#33).
 *
 * Flow:
 *   1. Dump  — the user free-types everything on their mind into one big
 *      textarea. Loosely structured rambling is fine.
 *   2. Parse — POST /api/jarvis/morning-dump { mode: "parse" } asks JARVIS to
 *      propose a plan (tasks / events / captures). Nothing is committed.
 *   3. Review — the proposed items render as an editable list. The user can
 *      tweak titles/content, change an item's kind, or drop items.
 *   4. Commit — POST { mode: "commit", items } executes the reviewed list via
 *      the same executor the live console uses.
 *
 * This component owns NO global JARVIS state and does not touch the console or
 * undo machinery. It is a standalone page island.
 */

type ItemKind = "task" | "event" | "capture";

interface PlanItem {
  uid: string;
  kind: ItemKind;
  // A single human-editable label. For tasks/events it maps to title; for
  // captures it maps to content. Date/priority detail is kept verbatim in the
  // raw payload and surfaced read-only as a hint.
  label: string;
  hint?: string;
  raw: Record<string, unknown>;
}

interface ParseResponseItem {
  kind: ItemKind;
  input: Record<string, unknown>;
}

const KIND_META: Record<ItemKind, { icon: typeof CheckSquare; label: string }> = {
  task: { icon: CheckSquare, label: "Task" },
  event: { icon: CalendarClock, label: "Event" },
  capture: { icon: NotebookPen, label: "Capture" },
};

function toPlanItem(item: ParseResponseItem, i: number): PlanItem {
  const raw = { ...item.input };
  if (item.kind === "capture") {
    return {
      uid: `${i}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "capture",
      label: typeof raw.content === "string" ? raw.content : "",
      raw,
    };
  }
  const title = typeof raw.title === "string" ? raw.title : "";
  const hintBits: string[] = [];
  if (item.kind === "task") {
    if (typeof raw.due === "string") hintBits.push(formatWhen(raw.due));
    if (typeof raw.priority === "string") hintBits.push(raw.priority);
    else hintBits.push("Inbox");
  } else {
    if (typeof raw.start === "string") hintBits.push(formatWhen(raw.start));
  }
  return {
    uid: `${i}-${Math.random().toString(36).slice(2, 8)}`,
    kind: item.kind,
    label: title,
    hint: hintBits.join(" · "),
    raw,
  };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}

function itemToCommitPayload(item: PlanItem) {
  const input = { ...item.raw };
  if (item.kind === "capture") input.content = item.label;
  else input.title = item.label;
  return { kind: item.kind, input };
}

type Stage = "dump" | "review";

export function MorningDump() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("dump");
  const [dump, setDump] = useState("");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const dumpRef = useRef<HTMLTextAreaElement>(null);

  // Focus the composer when the dump stage is active so the user can start
  // typing immediately (without the a11y-flagged autoFocus attribute).
  useEffect(() => {
    if (stage === "dump") dumpRef.current?.focus();
  }, [stage]);

  async function handleParse() {
    const text = dump.trim();
    if (text.length === 0) return;
    setParsing(true);
    try {
      const res = await fetch("/api/jarvis/morning-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "parse", dump: text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Could not read your dump, sir. Try again.");
        return;
      }
      const data = (await res.json()) as { items: ParseResponseItem[] };
      const planned = (data.items ?? []).map(toPlanItem);
      if (planned.length === 0) {
        toast.message("Nothing concrete to plan from that. Try adding a few specifics.");
        return;
      }
      setItems(planned);
      setStage("review");
    } catch {
      toast.error("Network hiccup reaching JARVIS.");
    } finally {
      setParsing(false);
    }
  }

  async function handleCommit() {
    const payload = items.filter((it) => it.label.trim().length > 0).map(itemToCommitPayload);
    if (payload.length === 0) {
      toast.message("Nothing left to commit.");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/jarvis/morning-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", items: payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Commit failed.");
        return;
      }
      const data = (await res.json()) as { committed: number; total: number };
      toast.success(`Filed ${data.committed} of ${data.total}. Your day is set, sir.`);
      setDump("");
      setItems([]);
      setStage("dump");
      router.refresh();
    } catch {
      toast.error("Network hiccup committing your plan.");
    } finally {
      setCommitting(false);
    }
  }

  function updateLabel(uid: string, label: string) {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, label } : it)));
  }

  function cycleKind(uid: string) {
    const order: ItemKind[] = ["task", "event", "capture"];
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        const next = order[(order.indexOf(it.kind) + 1) % order.length] ?? "capture";
        return { ...it, kind: next };
      })
    );
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[var(--ink-muted)]">
          <Sparkles className="size-4" />
          <span className="font-mono text-xs uppercase tracking-[0.18em]">Morning Dump</span>
        </div>
        <h1 className="font-serif text-3xl text-[var(--ink)]">What&apos;s on your mind today?</h1>
        <p className="text-sm text-[var(--ink-muted)]">
          Dump everything: tasks, meetings, half-formed thoughts. JARVIS will shape it into a plan
          you can review and edit before anything is filed.
        </p>
      </header>

      {stage === "dump" ? (
        <div className="flex flex-col gap-4">
          <textarea
            ref={dumpRef}
            value={dump}
            onChange={(e) => setDump(e.target.value)}
            rows={12}
            placeholder={
              "e.g. need to finish the orthopaedics lit review, lunch with Brian at noon, " +
              "remember to email the lab about the antibiotic assay, p1 ship the morning dump PR, " +
              "maybe think about the talk next week…"
            }
            className={cn(
              "min-h-[18rem] w-full resize-y rounded-lg border border-[var(--edge)]",
              "bg-[var(--surface)] p-4 font-serif text-base leading-relaxed text-[var(--ink)]",
              "placeholder:text-[var(--ink-muted)] focus:outline-none",
              "focus:border-[var(--hud-cyan)] focus:ring-4 focus:ring-[color:rgb(34_211_238_/_0.12)]"
            )}
          />
          <div className="flex items-center justify-end gap-3">
            <Button onClick={handleParse} disabled={parsing || dump.trim().length === 0}>
              {parsing ? "Reading…" : "Shape my day"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl text-[var(--ink)]">Proposed plan</h2>
            <span className="text-sm text-[var(--ink-muted)]">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">
            Review and edit before committing. Click an item&apos;s tag to change its type. Nothing
            is filed until you confirm.
          </p>

          <ul className="flex flex-col gap-2">
            {items.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              return (
                <li
                  key={it.uid}
                  className="flex items-start gap-3 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-3"
                >
                  <button
                    type="button"
                    onClick={() => cycleKind(it.uid)}
                    title="Change type"
                    className={cn(
                      "mt-0.5 flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--edge)]",
                      "px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]",
                      "transition-colors hover:border-[var(--hud-cyan)] hover:text-[var(--ink)]"
                    )}
                  >
                    <Icon className="size-3" />
                    {meta.label}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <textarea
                      value={it.label}
                      onChange={(e) => updateLabel(it.uid, e.target.value)}
                      rows={1}
                      className={cn(
                        "w-full resize-none rounded-md border border-transparent bg-transparent",
                        "font-serif text-base text-[var(--ink)] focus:border-[var(--edge)]",
                        "focus:outline-none"
                      )}
                    />
                    {it.hint ? (
                      <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                        {it.hint}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.uid)}
                    title="Remove"
                    className="mt-0.5 shrink-0 rounded-md p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--ink-coral)]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => setStage("dump")} disabled={committing}>
              Back to dump
            </Button>
            <Button onClick={handleCommit} disabled={committing || items.length === 0}>
              {committing ? "Filing…" : `Commit plan (${items.length})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
