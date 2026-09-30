"use server";

/**
 * Server actions for Study Review. Issue #400.
 *
 * The interesting one is `logStudyReview`: it is the single write path that
 * advances a topic's memory state, so the scheduler runs here and the review
 * insert plus the topic update share one transaction. Nothing else may write
 * difficulty / stability / next_due_at.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  projects,
  studyAssessmentTopics,
  studyAssessments,
  studyPlanItems,
  studyReviews,
  studyTopics,
} from "@/lib/db/schema";
import { parseDateOnly } from "@/lib/db/queries/study";
import { reviewTopic, type StudyGrade, type StudyMode, type StudyWeight } from "@/lib/study/scheduler";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const WEIGHTS = ["skim", "familiar", "working", "fluent", "core"] as const;
const GRADES = ["blanked", "shaky", "solid", "fluent"] as const;
const MODES = [
  "blank_recall",
  "derivation",
  "problem_set",
  "past_paper",
  "teach_back",
  "skim",
] as const;
const KINDS = ["quiz", "pset", "midterm", "final", "exam", "project"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Topics may only hang off a class. Enforced here rather than as a CHECK,
 * because expressing it in SQL needs a subquery on every insert.
 */
async function assertOwnedClass(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        eq(projects.isClass, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function ownsTopics(userId: string, topicIds: string[]): Promise<boolean> {
  if (topicIds.length === 0) return true;
  const owned = await db
    .select({ id: studyTopics.id })
    .from(studyTopics)
    .where(and(eq(studyTopics.userId, userId), inArray(studyTopics.id, topicIds)));
  return owned.length === new Set(topicIds).size;
}

// ─── TOPICS ────────────────────────────────────────────────────────────────

const TopicInputSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  weight: z.enum(WEIGHTS).default("working"),
  notes: z.string().max(4000).nullable().optional(),
  /** Index into the same batch, for nesting freshly-created topics. */
  parentIndex: z.number().int().min(0).optional(),
});

const CreateTopicsSchema = z.object({
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  topics: z.array(TopicInputSchema).min(1).max(300),
});

/**
 * Bulk-create topics under a class.
 *
 * Accepts a flat list where an entry may point at an earlier entry via
 * `parentIndex`, which is what lets Kiwi turn a pasted syllabus into a two-level
 * tree in one call without a round trip per node.
 */
export async function createStudyTopics(
  input: unknown,
): Promise<ActionResult<{ ids: string[] }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = CreateTopicsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { projectId, parentId, topics } = parsed.data;

  if (!(await assertOwnedClass(userId, projectId))) {
    return { success: false, error: "Class not found" };
  }
  if (parentId && !(await ownsTopics(userId, [parentId]))) {
    return { success: false, error: "Parent topic not found" };
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${studyTopics.orderIndex}), -1)` })
    .from(studyTopics)
    .where(eq(studyTopics.projectId, projectId));

  const ids = await db.transaction(async (tx) => {
    const created: string[] = [];
    let order = (maxOrder ?? -1) + 1;

    for (const [i, t] of topics.entries()) {
      // A parentIndex may only point backwards, so the parent always exists by
      // the time we get here. Anything else falls back to the explicit parentId.
      const resolvedParent =
        t.parentIndex != null && t.parentIndex < i
          ? created[t.parentIndex]!
          : (parentId ?? null);

      const [row] = await tx
        .insert(studyTopics)
        .values({
          userId,
          projectId,
          parentId: resolvedParent,
          title: t.title.trim(),
          notes: t.notes?.trim() || null,
          weight: t.weight,
          orderIndex: order++,
        })
        .returning({ id: studyTopics.id });
      if (!row) throw new Error("Insert failed");
      created.push(row.id);
    }
    return created;
  });

  return { success: true, data: { ids } };
}

const UpdateTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(4000).nullable().optional(),
  weight: z.enum(WEIGHTS).optional(),
  parentId: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function updateStudyTopic(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpdateTopicSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, archived, ...fields } = parsed.data;

  // Re-parenting a topic under itself would orphan the subtree from the tree
  // walk and render as an invisible row.
  if (fields.parentId === id) {
    return { success: false, error: "A topic cannot be its own parent" };
  }

  const [row] = await db
    .update(studyTopics)
    .set({
      ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
      ...(fields.notes !== undefined ? { notes: fields.notes?.trim() || null } : {}),
      ...(fields.weight !== undefined ? { weight: fields.weight } : {}),
      ...(fields.parentId !== undefined ? { parentId: fields.parentId } : {}),
      ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(studyTopics.id, id), eq(studyTopics.userId, userId)))
    .returning({ id: studyTopics.id });

  if (!row) return { success: false, error: "Topic not found" };
  return { success: true, data: { id: row.id } };
}

export async function deleteStudyTopic(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const [row] = await db
    .delete(studyTopics)
    .where(and(eq(studyTopics.id, parsed.data.id), eq(studyTopics.userId, userId)))
    .returning({ id: studyTopics.id });

  if (!row) return { success: false, error: "Topic not found" };
  return { success: true, data: { id: row.id } };
}

export async function reorderStudyTopics(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z
    .object({ ids: z.array(z.string().uuid()).min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };
  if (!(await ownsTopics(userId, parsed.data.ids))) {
    return { success: false, error: "Topic not found" };
  }

  await db.transaction(async (tx) => {
    for (const [i, id] of parsed.data.ids.entries()) {
      await tx
        .update(studyTopics)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(and(eq(studyTopics.id, id), eq(studyTopics.userId, userId)));
    }
  });

  return { success: true, data: { count: parsed.data.ids.length } };
}

// ─── ASSESSMENTS ───────────────────────────────────────────────────────────

const CreateAssessmentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  kind: z.enum(KINDS).default("exam"),
  dueDate: z.string().regex(ISO_DATE, "Expected YYYY-MM-DD"),
  weightPct: z.number().int().min(0).max(100).nullable().optional(),
  topicIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function createStudyAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = CreateAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { projectId, topicIds = [], ...fields } = parsed.data;

  if (!(await assertOwnedClass(userId, projectId))) {
    return { success: false, error: "Class not found" };
  }
  if (!(await ownsTopics(userId, topicIds))) {
    return { success: false, error: "One or more topics not found" };
  }

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(studyAssessments)
      .values({
        userId,
        projectId,
        title: fields.title.trim(),
        kind: fields.kind,
        dueDate: fields.dueDate,
        weightPct: fields.weightPct ?? null,
      })
      .returning({ id: studyAssessments.id });
    if (!row) throw new Error("Insert failed");

    if (topicIds.length > 0) {
      await tx
        .insert(studyAssessmentTopics)
        .values(topicIds.map((topicId) => ({ assessmentId: row.id, topicId, userId })))
        .onConflictDoNothing();
    }
    return row.id;
  });

  return { success: true, data: { id } };
}

const UpdateAssessmentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  kind: z.enum(KINDS).optional(),
  dueDate: z.string().regex(ISO_DATE).optional(),
  weightPct: z.number().int().min(0).max(100).nullable().optional(),
  completed: z.boolean().optional(),
  /** When present, replaces the coverage set wholesale. */
  topicIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function updateStudyAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpdateAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, completed, topicIds, ...fields } = parsed.data;

  if (topicIds && !(await ownsTopics(userId, topicIds))) {
    return { success: false, error: "One or more topics not found" };
  }

  const ok = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(studyAssessments)
      .set({
        ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
        ...(fields.kind !== undefined ? { kind: fields.kind } : {}),
        ...(fields.dueDate !== undefined ? { dueDate: fields.dueDate } : {}),
        ...(fields.weightPct !== undefined ? { weightPct: fields.weightPct } : {}),
        ...(completed !== undefined
          ? { completedAt: completed ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(studyAssessments.id, id), eq(studyAssessments.userId, userId)))
      .returning({ id: studyAssessments.id });
    if (!row) return false;

    if (topicIds) {
      await tx
        .delete(studyAssessmentTopics)
        .where(
          and(
            eq(studyAssessmentTopics.assessmentId, id),
            eq(studyAssessmentTopics.userId, userId),
          ),
        );
      if (topicIds.length > 0) {
        await tx
          .insert(studyAssessmentTopics)
          .values(topicIds.map((topicId) => ({ assessmentId: id, topicId, userId })))
          .onConflictDoNothing();
      }
    }
    return true;
  });

  if (!ok) return { success: false, error: "Assessment not found" };
  return { success: true, data: { id } };
}

export async function deleteStudyAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const [row] = await db
    .delete(studyAssessments)
    .where(
      and(eq(studyAssessments.id, parsed.data.id), eq(studyAssessments.userId, userId)),
    )
    .returning({ id: studyAssessments.id });

  if (!row) return { success: false, error: "Assessment not found" };
  return { success: true, data: { id: row.id } };
}

// ─── THE PLAN BOARD ────────────────────────────────────────────────────────

const PlanItemSchema = z.object({
  topicId: z.string().uuid(),
  planDate: z.string().regex(ISO_DATE, "Expected YYYY-MM-DD"),
  assessmentId: z.string().uuid().nullable().optional(),
});

/**
 * Drop a topic onto a day.
 *
 * Idempotent by design: the unique index means re-dropping the same topic onto
 * the same day is a no-op rather than a duplicate card.
 */
export async function planStudyTopic(
  input: unknown,
): Promise<ActionResult<{ id: string | null }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = PlanItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { topicId, planDate, assessmentId } = parsed.data;

  if (!(await ownsTopics(userId, [topicId]))) {
    return { success: false, error: "Topic not found" };
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${studyPlanItems.orderIndex}), -1)` })
    .from(studyPlanItems)
    .where(and(eq(studyPlanItems.userId, userId), eq(studyPlanItems.planDate, planDate)));

  // If no assessment was named, anchor on whatever the topic is next examined
  // by, so a card dropped from the fading rail still says what it is for.
  const resolvedAssessment = assessmentId ?? (await nearestAssessmentFor(userId, topicId));

  const [row] = await db
    .insert(studyPlanItems)
    .values({
      userId,
      topicId,
      planDate,
      assessmentId: resolvedAssessment,
      orderIndex: (maxOrder ?? -1) + 1,
    })
    .onConflictDoNothing()
    .returning({ id: studyPlanItems.id });

  return { success: true, data: { id: row?.id ?? null } };
}

/**
 * Today as YYYY-MM-DD in LOCAL time.
 *
 * `toISOString().slice(0,10)` is UTC, which west of Greenwich reads as tomorrow
 * for the last hours of the evening — long enough to hide an assessment that is
 * due today from the person revising for it tonight.
 */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

async function nearestAssessmentFor(
  userId: string,
  topicId: string,
): Promise<string | null> {
  const today = localToday();
  const [row] = await db
    .select({ id: studyAssessments.id })
    .from(studyAssessmentTopics)
    .innerJoin(
      studyAssessments,
      eq(studyAssessments.id, studyAssessmentTopics.assessmentId),
    )
    .where(
      and(
        eq(studyAssessmentTopics.userId, userId),
        eq(studyAssessmentTopics.topicId, topicId),
        isNull(studyAssessments.completedAt),
        sql`${studyAssessments.dueDate} >= ${today}`,
      ),
    )
    .orderBy(asc(studyAssessments.dueDate))
    .limit(1);
  return row?.id ?? null;
}

/** Move a card to another day, or reorder it within one. */
export async function moveStudyPlanItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z
    .object({
      id: z.string().uuid(),
      planDate: z.string().regex(ISO_DATE),
      orderIndex: z.number().int().min(0).max(10_000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const [row] = await db
    .update(studyPlanItems)
    .set({
      planDate: parsed.data.planDate,
      ...(parsed.data.orderIndex !== undefined
        ? { orderIndex: parsed.data.orderIndex }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(studyPlanItems.id, parsed.data.id), eq(studyPlanItems.userId, userId)))
    .returning({ id: studyPlanItems.id });

  if (!row) return { success: false, error: "Plan item not found" };
  return { success: true, data: { id: row.id } };
}

export async function removeStudyPlanItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const [row] = await db
    .delete(studyPlanItems)
    .where(and(eq(studyPlanItems.id, parsed.data.id), eq(studyPlanItems.userId, userId)))
    .returning({ id: studyPlanItems.id });

  if (!row) return { success: false, error: "Plan item not found" };
  return { success: true, data: { id: row.id } };
}

/** Mark a planned card skipped without logging a review against it. */
export async function skipStudyPlanItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = z
    .object({ id: z.string().uuid(), skipped: z.boolean().default(true) })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const [row] = await db
    .update(studyPlanItems)
    .set({
      status: parsed.data.skipped ? "skipped" : "planned",
      updatedAt: new Date(),
    })
    .where(and(eq(studyPlanItems.id, parsed.data.id), eq(studyPlanItems.userId, userId)))
    .returning({ id: studyPlanItems.id });

  if (!row) return { success: false, error: "Plan item not found" };
  return { success: true, data: { id: row.id } };
}

// ─── LOGGING A REVIEW ──────────────────────────────────────────────────────

const LogReviewSchema = z.object({
  topicId: z.string().uuid(),
  mode: z.enum(MODES),
  grade: z.enum(GRADES),
  durationMin: z.number().int().min(0).max(1440).nullable().optional(),
  reachedCriterion: z.boolean().default(false),
  gaps: z.string().max(4000).nullable().optional(),
  planItemId: z.string().uuid().nullable().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
  source: z.enum(["manual", "planned", "kiwi"]).default("manual"),
});

/**
 * Log one retrieval session and advance the topic's memory state.
 *
 * THE ONLY WRITE PATH for difficulty / stability / next_due_at. The scheduler
 * runs here and the topic update shares a transaction with the review insert,
 * so the ledger and the memory state can never disagree.
 */
export async function logStudyReview(
  input: unknown,
): Promise<ActionResult<{ id: string; nextDueAt: string; stability: number }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = LogReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, p.topicId), eq(studyTopics.userId, userId)))
    .limit(1);
  if (!topic) return { success: false, error: "Topic not found" };

  const now = new Date();

  // Anchor on whatever this session is for, falling back to the topic's next
  // exam. Without an anchor the scheduler happily books a review for after it.
  const assessmentId = p.assessmentId ?? (await nearestAssessmentFor(userId, p.topicId));
  const assessmentDate = assessmentId
    ? await assessmentDueDate(userId, assessmentId)
    : null;

  const next = reviewTopic(
    {
      weight: topic.weight as StudyWeight,
      difficulty: topic.difficulty,
      stability: topic.stability,
      lastReviewedAt: topic.lastReviewedAt,
      reps: topic.reps,
      lapses: topic.lapses,
    },
    {
      grade: p.grade as StudyGrade,
      mode: p.mode as StudyMode,
      assessmentDate,
      now,
    },
  );

  const reviewId = await db.transaction(async (tx) => {
    const [review] = await tx
      .insert(studyReviews)
      .values({
        userId,
        topicId: p.topicId,
        projectId: topic.projectId,
        assessmentId,
        reviewedAt: now,
        mode: p.mode,
        grade: p.grade,
        durationMin: p.durationMin ?? null,
        reachedCriterion: p.reachedCriterion,
        gaps: p.gaps?.trim() || null,
        source: p.source,
        planItemId: p.planItemId ?? null,
      })
      .returning({ id: studyReviews.id });
    if (!review) throw new Error("Insert failed");

    await tx
      .update(studyTopics)
      .set({
        difficulty: next.difficulty,
        stability: next.stability,
        lastReviewedAt: next.lastReviewedAt,
        nextDueAt: next.nextDueAt,
        reps: next.reps,
        lapses: next.lapses,
        status: next.status,
        updatedAt: now,
      })
      .where(and(eq(studyTopics.id, p.topicId), eq(studyTopics.userId, userId)));

    if (p.planItemId) {
      await tx
        .update(studyPlanItems)
        .set({
          status: "done",
          completedAt: now,
          reviewId: review.id,
          updatedAt: now,
        })
        .where(
          and(eq(studyPlanItems.id, p.planItemId), eq(studyPlanItems.userId, userId)),
        );
    }

    return review.id;
  });

  return {
    success: true,
    data: {
      id: reviewId,
      nextDueAt: next.nextDueAt.toISOString(),
      stability: next.stability,
    },
  };
}

async function assessmentDueDate(
  userId: string,
  assessmentId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ dueDate: studyAssessments.dueDate })
    .from(studyAssessments)
    .where(
      and(eq(studyAssessments.id, assessmentId), eq(studyAssessments.userId, userId)),
    )
    .limit(1);
  return row ? parseDateOnly(row.dueDate) : null;
}
