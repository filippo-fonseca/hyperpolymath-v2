import { and, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  habitCompletions,
  habits,
  hashtags,
  jarvisEvents,
  jarvisFacts,
  projects,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";

/**
 * Analytics dataset for /insights.
 *
 * Shape returns:
 *   - `events`: flat 365d activity feed (one row per action). The client
 *     filters by the current range pill and re-aggregates view-by-view. This
 *     keeps the server query simple (one fetch covers every range) and the
 *     client aggregation cheap at single-user scale (~thousands of rows max).
 *   - `meta`: range-independent state — current open task counts, current
 *     overdue, current best streak, etc. — that doesn't change when the
 *     user slides the window.
 *   - `lookups`: id → name maps for projects + hashtags so the events list
 *     can stay compact.
 *   - `activityByDate`: pre-bucketed 365d heatmap data. The heatmap is
 *     always year-view, so pre-bucketing avoids re-walking events every
 *     range switch.
 */
export interface AnalyticsEvent {
  date: string; // YYYY-MM-DD (server-local)
  hour: number | null; // 0..23, null for habit completions (date-only granularity)
  dow: number; // 0..6
  kind: "task" | "capture" | "habit" | "jarvis";
  projectIds?: string[];
  hashtagIds?: string[];
  via?: "jarvis" | "manual";
  actionTypes?: string[];
  latencyMs?: number | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheCreation?: number;
  error?: boolean;
}

export interface AnalyticsData {
  rangeStartISO: string;
  rangeEndISO: string;

  activityByDate: Record<
    string,
    { tasks: number; captures: number; habits: number; jarvis: number }
  >;

  events: AnalyticsEvent[];

  lookups: {
    projectNames: Record<string, { name: string; archived: boolean }>;
    hashtagNames: Record<string, { name: string; displayName: string }>;
  };

  meta: {
    taskTotalCompleted: number;
    taskTotalActive: number;
    taskOverdueCount: number;
    taskByPriority: Array<{
      priority: "P∞" | "P1" | "P2" | "P3";
      total: number;
      done: number;
    }>;
    taskByStatus: Array<{ status: string; count: number }>;
    taskAvgCompletionHours: number | null;

    habitActiveCount: number;
    habitBestStreak: { habitId: string; name: string; streak: number } | null;
    habitConsistencyPct28d: number | null;

    factsCount: number;

    currentActivityStreak: number;
    longestActivityStreak: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getAnalyticsData(userId: string): Promise<AnalyticsData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start365 = new Date(today.getTime() - 364 * DAY_MS);
  const rangeStartISO = toISODate(start365);
  const rangeEndISO = toISODate(today);

  const [
    taskRows,
    taskProjectLinks,
    captureRows,
    captureHashLinks,
    habitRows,
    habitCompletionRows,
    jarvisRows,
    factCount,
    projectRows,
    hashtagRows,
  ] = await Promise.all([
    db
      .select({
        id: tasks.id,
        priority: tasks.priority,
        status: tasks.status,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),

    db
      .select({
        taskId: tasksProjects.taskId,
        projectId: tasksProjects.projectId,
      })
      .from(tasksProjects)
      .where(eq(tasksProjects.userId, userId)),

    db
      .select({
        id: captures.id,
        createdAt: captures.createdAt,
        createdVia: captures.createdVia,
      })
      .from(captures)
      .where(and(eq(captures.userId, userId), gte(captures.createdAt, start365))),

    db
      .select({
        captureId: capturesHashtags.captureId,
        hashtagId: capturesHashtags.hashtagId,
      })
      .from(capturesHashtags)
      .where(eq(capturesHashtags.userId, userId)),

    db
      .select({
        id: habits.id,
        name: habits.name,
        daysOfWeek: habits.daysOfWeek,
        archivedAt: habits.archivedAt,
        createdAt: habits.createdAt,
      })
      .from(habits)
      .where(eq(habits.userId, userId)),

    db
      .select({
        habitId: habitCompletions.habitId,
        completedDate: habitCompletions.completedDate,
        status: habitCompletions.status,
      })
      .from(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          gte(habitCompletions.completedDate, rangeStartISO),
        ),
      ),

    db
      .select({
        createdAt: jarvisEvents.createdAt,
        actionTypes: jarvisEvents.actionTypes,
        latencyMs: jarvisEvents.latencyMs,
        error: jarvisEvents.error,
        inputTokens: jarvisEvents.inputTokens,
        outputTokens: jarvisEvents.outputTokens,
        cacheReadInputTokens: jarvisEvents.cacheReadInputTokens,
        cacheCreationInputTokens: jarvisEvents.cacheCreationInputTokens,
      })
      .from(jarvisEvents)
      .where(
        and(eq(jarvisEvents.userId, userId), gte(jarvisEvents.createdAt, start365)),
      ),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(jarvisFacts)
      .where(eq(jarvisFacts.userId, userId))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ id: projects.id, name: projects.name, archivedAt: projects.archivedAt })
      .from(projects)
      .where(eq(projects.userId, userId)),

    db
      .select({
        id: hashtags.id,
        name: hashtags.name,
        displayName: hashtags.displayName,
      })
      .from(hashtags)
      .where(eq(hashtags.userId, userId)),
  ]);

  // Project lookup
  const projectNames: Record<string, { name: string; archived: boolean }> = {};
  for (const p of projectRows) {
    projectNames[p.id] = { name: p.name, archived: p.archivedAt !== null };
  }

  // Hashtag lookup
  const hashtagNames: Record<string, { name: string; displayName: string }> = {};
  for (const h of hashtagRows) {
    hashtagNames[h.id] = { name: h.name, displayName: h.displayName };
  }

  // Build per-task project link index for events.
  const projectIdsByTask = new Map<string, string[]>();
  for (const l of taskProjectLinks) {
    const arr = projectIdsByTask.get(l.taskId) ?? [];
    arr.push(l.projectId);
    projectIdsByTask.set(l.taskId, arr);
  }

  // Build per-capture hashtag link index for events.
  const hashtagIdsByCapture = new Map<string, string[]>();
  for (const l of captureHashLinks) {
    const arr = hashtagIdsByCapture.get(l.captureId) ?? [];
    arr.push(l.hashtagId);
    hashtagIdsByCapture.set(l.captureId, arr);
  }

  // ── Construct the flat events array.
  const events: AnalyticsEvent[] = [];

  for (const t of taskRows) {
    if (!t.completedAt) continue;
    events.push({
      date: toISODate(t.completedAt),
      hour: t.completedAt.getHours(),
      dow: t.completedAt.getDay(),
      kind: "task",
      projectIds: projectIdsByTask.get(t.id),
    });
  }
  for (const c of captureRows) {
    events.push({
      date: toISODate(c.createdAt),
      hour: c.createdAt.getHours(),
      dow: c.createdAt.getDay(),
      kind: "capture",
      hashtagIds: hashtagIdsByCapture.get(c.id),
      via: c.createdVia === "jarvis" ? "jarvis" : "manual",
    });
  }
  for (const c of habitCompletionRows) {
    const d = new Date(`${c.completedDate}T00:00:00`);
    events.push({
      date: c.completedDate,
      hour: null,
      dow: d.getDay(),
      kind: "habit",
    });
  }
  for (const e of jarvisRows) {
    events.push({
      date: toISODate(e.createdAt),
      hour: e.createdAt.getHours(),
      dow: e.createdAt.getDay(),
      kind: "jarvis",
      actionTypes: e.actionTypes ?? [],
      latencyMs: e.latencyMs,
      inputTokens: e.inputTokens ?? 0,
      outputTokens: e.outputTokens ?? 0,
      cacheRead: e.cacheReadInputTokens ?? 0,
      cacheCreation: e.cacheCreationInputTokens ?? 0,
      error: e.error != null && e.error !== "",
    });
  }

  // ── Heatmap (always 365d). Pre-seed all dates with zeros so the client
  // can iterate dates without null-checks.
  const activityByDate: AnalyticsData["activityByDate"] = {};
  for (let i = 0; i < 365; i++) {
    const d = new Date(start365.getTime() + i * DAY_MS);
    activityByDate[toISODate(d)] = { tasks: 0, captures: 0, habits: 0, jarvis: 0 };
  }
  for (const ev of events) {
    const cell = activityByDate[ev.date];
    if (!cell) continue;
    if (ev.kind === "task") cell.tasks++;
    else if (ev.kind === "capture") cell.captures++;
    else if (ev.kind === "habit") cell.habits++;
    else if (ev.kind === "jarvis") cell.jarvis++;
  }

  // ── Range-independent meta.

  // Task aggregates — all-time, current state.
  const byPriorityMap = new Map<string, { total: number; done: number }>();
  for (const p of ["P∞", "P1", "P2", "P3"] as const)
    byPriorityMap.set(p, { total: 0, done: 0 });
  const byStatusMap = new Map<string, number>();
  let overdueCount = 0;
  const todayDateOnly = toISODate(today);
  const completionDeltas: number[] = [];
  for (const t of taskRows) {
    const pri = byPriorityMap.get(t.priority);
    if (pri) {
      pri.total++;
      if (t.completedAt) pri.done++;
    }
    byStatusMap.set(t.status, (byStatusMap.get(t.status) ?? 0) + 1);
    if (
      t.dueDate &&
      !t.completedAt &&
      t.status !== "lesno" &&
      t.dueDate < todayDateOnly
    )
      overdueCount++;
    if (t.createdAt && t.completedAt) {
      const dt = t.completedAt.getTime() - t.createdAt.getTime();
      if (dt > 0) completionDeltas.push(dt);
    }
  }
  const taskByPriority = (["P∞", "P1", "P2", "P3"] as const).map((priority) => ({
    priority,
    ...(byPriorityMap.get(priority) ?? { total: 0, done: 0 }),
  }));
  const taskByStatus = Array.from(byStatusMap.entries()).map(([status, count]) => ({
    status,
    count,
  }));
  const taskAvgCompletionHours =
    completionDeltas.length === 0
      ? null
      : Math.round(
          completionDeltas.reduce((a, b) => a + b, 0) /
            completionDeltas.length /
            (1000 * 60 * 60),
        );

  // Habit best-streak + 28d consistency (range-independent).
  // Only 'done' rows count for streak / consistency — partial-progress rows
  // ('in_progress', 'almost_done') still show on the heatmap but don't earn
  // streak credit, preserving the original "did you actually finish" semantic.
  const completionsByHabit = new Map<string, Set<string>>();
  for (const c of habitCompletionRows) {
    if (c.status !== "done") continue;
    let set = completionsByHabit.get(c.habitId);
    if (!set) {
      set = new Set();
      completionsByHabit.set(c.habitId, set);
    }
    set.add(c.completedDate);
  }
  const activeHabits = habitRows.filter((h) => h.archivedAt === null);
  let bestStreak: AnalyticsData["meta"]["habitBestStreak"] = null;
  let scheduledTotal28 = 0;
  let doneTotal28 = 0;
  for (const h of activeHabits) {
    const completed = completionsByHabit.get(h.id) ?? new Set<string>();
    const createdISO = toISODate(h.createdAt);
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const iso = toISODate(d);
      if (iso < createdISO) break;
      const dow = d.getDay();
      const scheduled = h.daysOfWeek[dow] ?? false;
      if (!scheduled) continue;
      if (completed.has(iso)) streak++;
      else break;
    }
    if (!bestStreak || streak > bestStreak.streak) {
      bestStreak = { habitId: h.id, name: h.name, streak };
    }
    for (let i = 0; i < 28; i++) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const iso = toISODate(d);
      if (iso < createdISO) continue;
      const dow = d.getDay();
      if (!(h.daysOfWeek[dow] ?? false)) continue;
      scheduledTotal28++;
      if (completed.has(iso)) doneTotal28++;
    }
  }
  const habitConsistencyPct28d =
    scheduledTotal28 === 0
      ? null
      : Math.round((doneTotal28 / scheduledTotal28) * 100);
  if (bestStreak && bestStreak.streak === 0) bestStreak = null;

  // Activity streak (always 365d).
  let currentActivityStreak = 0;
  let longestActivityStreak = 0;
  let runningStreak = 0;
  const sortedDates = Object.keys(activityByDate).sort();
  for (const iso of sortedDates) {
    const cell = activityByDate[iso]!;
    const any = cell.tasks + cell.captures + cell.habits + cell.jarvis > 0;
    if (any) {
      runningStreak++;
      if (runningStreak > longestActivityStreak) longestActivityStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const cell = activityByDate[toISODate(d)];
    if (!cell) break;
    const any = cell.tasks + cell.captures + cell.habits + cell.jarvis > 0;
    if (any) currentActivityStreak++;
    else break;
  }

  return {
    rangeStartISO,
    rangeEndISO,
    activityByDate,
    events,
    lookups: { projectNames, hashtagNames },
    meta: {
      taskTotalCompleted: taskRows.filter((t) => t.completedAt !== null).length,
      taskTotalActive: taskRows.filter(
        (t) => t.completedAt === null && t.status !== "lesno",
      ).length,
      taskOverdueCount: overdueCount,
      taskByPriority,
      taskByStatus,
      taskAvgCompletionHours,
      habitActiveCount: activeHabits.length,
      habitBestStreak: bestStreak,
      habitConsistencyPct28d,
      factsCount: factCount,
      currentActivityStreak,
      longestActivityStreak,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 9 / TEL-02 — per-stage latency aggregator for the new /insights
// "Pipeline Latency" panel (D-03/D-04). Composite p50 stacked bar + 7-day
// per-stage sparkline. Re-uses percentile() from latency-check.ts so the
// discrete-percentile semantics are shared with the JARVIS-15 smoke helper.
// ─────────────────────────────────────────────────────────────────────────

import { percentile } from "@/lib/jarvis/latency-check";

/** The 8 stages we measure. Composite "overall speech→audio" is derived
 *  from the vad_end_at → audio_first_play_at span. */
export type StageName =
  | "vad_to_stt"
  | "stt_to_prompt_built"
  | "prompt_built_to_first_token"
  | "first_token_to_last_token"
  | "last_token_to_tool_loop_done"
  | "tool_loop_done_to_tts_first_byte"
  | "tts_first_byte_to_audio_first_play"
  | "speech_end_to_audio_first_play"; // composite — full voice pipeline

export interface StageStat {
  name: StageName;
  label: string; // human-readable for chart axis
  p50Ms: number;
  p95Ms: number;
  count: number; // rows contributing (both endpoints non-null)
  sparkline: Array<{ date: string; p50Ms: number; p95Ms: number }>; // 7 entries
}

export interface PipelineLatencyStats {
  stages: StageStat[];
  totalTurns: number;
  voiceTurns: number;
  sinceISO: string; // window start, for the panel subtitle
}

interface RawStageRow {
  createdAt: Date;
  voiceActive: boolean;
  vadEndAt: Date | null;
  sttDoneAt: Date | null;
  promptBuiltAt: Date | null;
  firstTokenAt: Date | null;
  lastTokenAt: Date | null;
  toolLoopDoneAt: Date | null;
  ttsFirstByteAt: Date | null;
  audioFirstPlayAt: Date | null;
}

function stageDeltaMs(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const d = b.getTime() - a.getTime();
  return d >= 0 ? d : null;
}

const STAGE_DEFS: Array<{
  name: StageName;
  label: string;
  from: keyof RawStageRow;
  to: keyof RawStageRow;
}> = [
  { name: "vad_to_stt",                         label: "VAD → STT",         from: "vadEndAt",       to: "sttDoneAt" },
  { name: "stt_to_prompt_built",                label: "STT → Prompt",      from: "sttDoneAt",      to: "promptBuiltAt" },
  { name: "prompt_built_to_first_token",        label: "Prompt → Token 1",  from: "promptBuiltAt",  to: "firstTokenAt" },
  { name: "first_token_to_last_token",          label: "Token 1 → Token N", from: "firstTokenAt",   to: "lastTokenAt" },
  { name: "last_token_to_tool_loop_done",       label: "Tokens → Tools",    from: "lastTokenAt",    to: "toolLoopDoneAt" },
  { name: "tool_loop_done_to_tts_first_byte",   label: "Tools → TTS TTFB",  from: "toolLoopDoneAt", to: "ttsFirstByteAt" },
  { name: "tts_first_byte_to_audio_first_play", label: "TTS → Audio",       from: "ttsFirstByteAt", to: "audioFirstPlayAt" },
  { name: "speech_end_to_audio_first_play",     label: "Speech → Audio",    from: "vadEndAt",       to: "audioFirstPlayAt" },
];

export async function getStageLatencyStats(
  userId: string,
  sinceMinutes: number,
): Promise<PipelineLatencyStats> {
  const sinceDate = new Date(Date.now() - sinceMinutes * 60 * 1000);

  const rows: RawStageRow[] = await db
    .select({
      createdAt: jarvisEvents.createdAt,
      voiceActive: jarvisEvents.voiceActive,
      vadEndAt: jarvisEvents.vadEndAt,
      sttDoneAt: jarvisEvents.sttDoneAt,
      promptBuiltAt: jarvisEvents.promptBuiltAt,
      firstTokenAt: jarvisEvents.firstTokenAt,
      lastTokenAt: jarvisEvents.lastTokenAt,
      toolLoopDoneAt: jarvisEvents.toolLoopDoneAt,
      ttsFirstByteAt: jarvisEvents.ttsFirstByteAt,
      audioFirstPlayAt: jarvisEvents.audioFirstPlayAt,
    })
    .from(jarvisEvents)
    .where(
      and(
        eq(jarvisEvents.userId, userId),
        gte(jarvisEvents.createdAt, sinceDate),
        // Exclude rows with NO instrumented stages at all (Phase 5-era rows
        // from before migration 0017). Cheap future-proofing — the
        // percentile() layer also handles per-stage nullability, but pushing
        // this filter into SQL avoids scanning rows that contribute nothing.
        or(isNotNull(jarvisEvents.firstTokenAt), isNotNull(jarvisEvents.vadEndAt)),
      ),
    );

  const totalTurns = rows.length;
  const voiceTurns = rows.filter((r) => r.voiceActive).length;

  // Build 7-day date axis (oldest first).
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    d.setHours(0, 0, 0, 0);
    dayKeys.push(toISODate(d));
  }

  const stages: StageStat[] = STAGE_DEFS.map((def) => {
    // Per-row deltas for this stage where both endpoints are populated.
    const deltas: Array<{ ms: number; date: string }> = [];
    for (const r of rows) {
      const a = r[def.from] as Date | null;
      const b = r[def.to] as Date | null;
      const ms = stageDeltaMs(a, b);
      if (ms == null) continue;
      deltas.push({ ms, date: toISODate(r.createdAt) });
    }
    const sortedMs = deltas.map((d) => d.ms).sort((a, b) => a - b);
    const p50Ms = Math.round(percentile(sortedMs, 0.5));
    const p95Ms = Math.round(percentile(sortedMs, 0.95));

    // Per-day sparkline — bucket deltas by their row's createdAt date,
    // in dayKeys order. Days with no contributing rows render as 0.
    const byDay = new Map<string, number[]>();
    for (const k of dayKeys) byDay.set(k, []);
    for (const d of deltas) {
      const bucket = byDay.get(d.date);
      if (bucket) bucket.push(d.ms);
    }
    const sparkline = dayKeys.map((k) => {
      const xs = (byDay.get(k) ?? []).sort((a, b) => a - b);
      return {
        date: k,
        p50Ms: Math.round(percentile(xs, 0.5)),
        p95Ms: Math.round(percentile(xs, 0.95)),
      };
    });

    return {
      name: def.name,
      label: def.label,
      p50Ms,
      p95Ms,
      count: deltas.length,
      sparkline,
    };
  });

  return {
    stages,
    totalTurns,
    voiceTurns,
    sinceISO: sinceDate.toISOString(),
  };
}
