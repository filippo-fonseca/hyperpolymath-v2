"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { logStudyReview } from "@/app/actions/study";
import {
  intervalForRetention,
  reviewTopic,
  type StudyGrade,
  type StudyMode,
  type StudyWeight,
} from "@/lib/study/scheduler";
import { cn } from "@/lib/utils";
import {
  GRADE_META,
  GRADE_ORDER,
  MODE_META,
  MODE_ORDER,
  bareDays,
} from "./study-ui";

export type LogTarget = {
  topicId: string;
  title: string;
  courseLabel: string;
  weight: StudyWeight;
  difficulty: number;
  stability: number | null;
  lastReviewedAt: Date | null;
  reps: number;
  lapses: number;
  planItemId?: string | null;
  assessmentId?: string | null;
  assessmentDate?: Date | null;
  assessmentTitle?: string | null;
};

/**
 * Log one retrieval session.
 *
 * Two required decisions, both a single click: how you reviewed, and how it
 * went. Everything else is optional. The friction budget for this dialog is
 * tiny — a tracker you resent filling in stops getting filled in, and then the
 * whole model is running on stale data.
 *
 * The forecast line is the payoff: it runs the real scheduler client-side as you
 * pick, so you see the consequence of an honest "blanked" before you commit to
 * it. That is the thing that makes honest grading feel worth it.
 */
export function LogReviewDialog({
  target,
  open,
  onOpenChange,
  onLogged,
}: {
  target: LogTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLogged?: () => void;
}) {
  const [mode, setMode] = useState<StudyMode>("blank_recall");
  const [grade, setGrade] = useState<StudyGrade | null>(null);
  const [reachedCriterion, setReachedCriterion] = useState(true);
  const [gaps, setGaps] = useState("");
  const [minutes, setMinutes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setMode("blank_recall");
    setGrade(null);
    setReachedCriterion(true);
    setGaps("");
    setMinutes("");
  }

  if (!target) return null;

  // Live forecast. Same function the server runs, so what it says is what
  // happens — no separate preview formula to drift out of sync.
  const forecast =
    grade &&
    reviewTopic(
      {
        weight: target.weight,
        difficulty: target.difficulty,
        stability: target.stability,
        lastReviewedAt: target.lastReviewedAt,
        reps: target.reps,
        lapses: target.lapses,
      },
      { grade, mode, assessmentDate: target.assessmentDate ?? null, now: new Date() },
    );

  const gapDays = forecast
    ? (forecast.nextDueAt.getTime() - Date.now()) / 86_400_000
    : 0;
  const clampedByExam =
    forecast != null &&
    target.assessmentDate != null &&
    intervalForRetention(forecast.stability, 0.9) > gapDays + 0.5;

  async function submit() {
    if (!target || !grade) return;
    setSaving(true);
    const res = await logStudyReview({
      topicId: target.topicId,
      mode,
      grade,
      reachedCriterion,
      gaps: gaps.trim() || null,
      durationMin: minutes ? Number(minutes) : null,
      planItemId: target.planItemId ?? null,
      assessmentId: target.assessmentId ?? null,
      source: target.planItemId ? "planned" : "manual",
    });
    setSaving(false);

    if (!res.success) {
      toast.error(res.error || "Could not log review");
      return;
    }
    toast.success(
      `Logged. Back in ${bareDays((new Date(res.data.nextDueAt).getTime() - Date.now()) / 86_400_000)}.`,
    );
    reset();
    onOpenChange(false);
    onLogged?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="truncate">{target.title}</DialogTitle>
          <DialogDescription>
            {target.courseLabel}
            {target.assessmentTitle ? ` · for ${target.assessmentTitle}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="How did you review it?">
            <div className="grid grid-cols-3 gap-1.5">
              {MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  title={MODE_META[m].hint}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                    mode === m
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
                      : "border-[var(--edge)] text-[var(--ink-muted)] hover:border-[var(--ink-faint)] hover:text-[var(--ink)]",
                    MODE_META[m].passive && mode !== m && "text-[var(--ink-faint)]",
                  )}
                >
                  {MODE_META[m].label}
                </button>
              ))}
            </div>
            {MODE_META[mode].passive && (
              <p className="mt-1.5 text-micro text-[var(--ink-faint)]">
                Rereading earns half the credit of recalling. Logged honestly, it
                just means this comes back sooner.
              </p>
            )}
          </Field>

          <Field label="How did it go?">
            <div className="grid grid-cols-4 gap-1.5">
              {GRADE_ORDER.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  title={GRADE_META[g].hint}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs transition-all",
                    grade === g
                      ? "border-transparent text-white"
                      : "border-[var(--edge)] text-[var(--ink-muted)] hover:border-[var(--ink-faint)] hover:text-[var(--ink)]",
                  )}
                  style={grade === g ? { background: GRADE_META[g].hue } : undefined}
                >
                  {GRADE_META[g].label}
                </button>
              ))}
            </div>
          </Field>

          {/* The forecast. Shows the cost of an honest answer before you give it. */}
          <div
            className={cn(
              "rounded-xl border px-3 py-2.5 transition-colors",
              forecast
                ? "border-[var(--edge)] bg-[var(--surface)]"
                : "border-dashed border-[var(--edge)]",
            )}
          >
            {forecast ? (
              <p className="text-meta text-[var(--ink-muted)]">
                Back in{" "}
                <span className="font-medium text-[var(--ink)]">
                  {bareDays(gapDays)}
                </span>
                {clampedByExam && target.assessmentTitle ? (
                  <span className="text-[var(--ink-faint)]">
                    {" "}
                    — pulled in so it lands before {target.assessmentTitle}
                  </span>
                ) : null}
                .
              </p>
            ) : (
              <p className="text-meta text-[var(--ink-faint)]">
                Pick how it went to see when this comes back.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={reachedCriterion}
              onChange={(e) => setReachedCriterion(e.target.checked)}
              className="mt-[3px] size-3.5 accent-[var(--ink)]"
            />
            <span className="text-meta text-[var(--ink-muted)]">
              Got at least one clean run before stopping
              <span className="block text-micro text-[var(--ink-faint)]">
                Stopping only once you have produced it correctly is the single
                biggest lever in the research.
              </span>
            </span>
          </label>

          <Field label="What did you blank on?" optional>
            <Textarea
              value={gaps}
              onChange={(e) => setGaps(e.target.value)}
              rows={2}
              placeholder="Forgot the boundary conditions on the inverse transform…"
              className="resize-none text-sm"
            />
            <p className="mt-1 text-micro text-[var(--ink-faint)]">
              These pile up into the most useful thing you own the night before.
            </p>
          </Field>

          <Field label="Minutes" optional>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="40"
              className="w-24 rounded-lg border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1 text-sm tabular-nums text-[var(--ink)] outline-none focus:border-[var(--ink-faint)]"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!grade || saving}>
            {saving ? "Logging…" : "Log review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-micro font-medium text-[var(--ink-muted)]">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-[var(--ink-faint)]">optional</span>
        )}
      </p>
      {children}
    </div>
  );
}
