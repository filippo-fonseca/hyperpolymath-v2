/**
 * Typed Drizzle read queries for the Study Review surface. Issue #400.
 *
 * CLAUDE.md Critical Pattern 2: Drizzle for typed queries; `supabase-js` is
 * reserved for Realtime subscriptions only. No `createClient` here.
 *
 * Auth happens one layer up — Server Components and Server Actions call
 * `getClaims()` before passing `userId` into these helpers.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  studyAssessmentTopics,
  studyAssessments,
  studyPlanItems,
  studyReviews,
  studyTopics,
} from "@/lib/db/schema";
import {
  currentRetrievability,
  priorityFor,
  type StudyWeight,
  type TopicMemory,
} from "@/lib/study/scheduler";

export type TopicRow = typeof studyTopics.$inferSelect;
export type AssessmentRow = typeof studyAssessments.$inferSelect;
export type ReviewRow = typeof studyReviews.$inferSelect;
export type PlanItemRow = typeof studyPlanItems.$inferSelect;

/** A topic decorated with everything the queue and the tree need to render. */
export type TopicWithState = TopicRow & {
  projectName: string;
  courseCode: string | null;
  /** Nearest upcoming assessment covering this topic, if any. */
  nextAssessment: { id: string; title: string; dueDate: string } | null;
  /** Live retrievability, 0–1. Never stored. */
  retrievability: number;
  /** Queue score. > 0 means it has fallen below its bar. */
  priority: number;
};

/** Shape the scheduler needs, projected off a row. */
function memoryOf(row: TopicRow): TopicMemory {
  return {
    weight: row.weight as StudyWeight,
    difficulty: row.difficulty,
    stability: row.stability,
    lastReviewedAt: row.lastReviewedAt,
    reps: row.reps,
    lapses: row.lapses,
  };
}

/**
 * Parse a Postgres `date` (always "YYYY-MM-DD") as local midnight.
 *
 * `new Date("2026-09-01")` parses as UTC midnight, which lands on the previous
 * evening for anyone west of Greenwich and silently shifts every countdown by a
 * day. Splitting the parts avoids it.
 */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Every active topic for a user, decorated with live memory state and the
 * assessment that anchors its schedule.
 *
 * One round trip for the topics, one for the assessment links. The nearest
 * upcoming assessment per topic is resolved in memory — the alternative is a
 * lateral join, and at one user's worth of coursework this is not the
 * bottleneck.
 */
export async function getStudyTopics(
  userId: string,
  opts: { projectId?: string; now?: Date } = {},
): Promise<TopicWithState[]> {
  const now = opts.now ?? new Date();

  const rows = await db
    .select({
      topic: studyTopics,
      projectName: projects.name,
      courseCode: projects.courseCode,
    })
    .from(studyTopics)
    .innerJoin(projects, eq(projects.id, studyTopics.projectId))
    .where(
      and(
        eq(studyTopics.userId, userId),
        isNull(studyTopics.archivedAt),
        ...(opts.projectId ? [eq(studyTopics.projectId, opts.projectId)] : []),
      ),
    )
    .orderBy(asc(studyTopics.orderIndex), asc(studyTopics.createdAt));

  if (rows.length === 0) return [];

  const byTopic = await getAssessmentsByTopic(
    userId,
    rows.map((r) => r.topic.id),
    now,
  );

  return rows.map(({ topic, projectName, courseCode }) => {
    const nextAssessment = byTopic.get(topic.id) ?? null;
    const anchor = nextAssessment ? parseDateOnly(nextAssessment.dueDate) : null;
    const memory = memoryOf(topic);
    return {
      ...topic,
      projectName,
      courseCode,
      nextAssessment,
      retrievability: currentRetrievability(memory, now),
      priority: priorityFor(memory, now, anchor),
    };
  });
}

/**
 * The nearest *upcoming* assessment for each of the given topics.
 *
 * Upcoming matters: a topic examined by both a past midterm and a future final
 * must anchor on the final, or the scheduler would clamp every interval to a
 * date that has already gone by.
 */
async function getAssessmentsByTopic(
  userId: string,
  topicIds: string[],
  now: Date,
): Promise<Map<string, { id: string; title: string; dueDate: string }>> {
  if (topicIds.length === 0) return new Map();

  const links = await db
    .select({
      topicId: studyAssessmentTopics.topicId,
      id: studyAssessments.id,
      title: studyAssessments.title,
      dueDate: studyAssessments.dueDate,
    })
    .from(studyAssessmentTopics)
    .innerJoin(
      studyAssessments,
      eq(studyAssessments.id, studyAssessmentTopics.assessmentId),
    )
    .where(
      and(
        eq(studyAssessmentTopics.userId, userId),
        inArray(studyAssessmentTopics.topicId, topicIds),
        isNull(studyAssessments.completedAt),
      ),
    )
    .orderBy(asc(studyAssessments.dueDate));

  const out = new Map<string, { id: string; title: string; dueDate: string }>();
  const today = startOfDay(now);
  for (const link of links) {
    if (parseDateOnly(link.dueDate) < today) continue;
    // Rows arrive date-ascending, so the first hit per topic is the nearest.
    if (!out.has(link.topicId)) {
      out.set(link.topicId, { id: link.id, title: link.title, dueDate: link.dueDate });
    }
  }
  return out;
}

/** Upcoming assessments across all classes, soonest first. */
export async function getUpcomingAssessments(
  userId: string,
  opts: { projectId?: string; limit?: number } = {},
): Promise<Array<AssessmentRow & { projectName: string; courseCode: string | null }>> {
  return db
    .select({
      id: studyAssessments.id,
      userId: studyAssessments.userId,
      projectId: studyAssessments.projectId,
      title: studyAssessments.title,
      kind: studyAssessments.kind,
      dueDate: studyAssessments.dueDate,
      weightPct: studyAssessments.weightPct,
      completedAt: studyAssessments.completedAt,
      createdAt: studyAssessments.createdAt,
      updatedAt: studyAssessments.updatedAt,
      projectName: projects.name,
      courseCode: projects.courseCode,
    })
    .from(studyAssessments)
    .innerJoin(projects, eq(projects.id, studyAssessments.projectId))
    .where(
      and(
        eq(studyAssessments.userId, userId),
        isNull(studyAssessments.completedAt),
        ...(opts.projectId ? [eq(studyAssessments.projectId, opts.projectId)] : []),
      ),
    )
    .orderBy(asc(studyAssessments.dueDate))
    .limit(opts.limit ?? 50);
}

/** Which topics each assessment covers. Keyed by assessment id. */
export async function getAssessmentCoverage(
  userId: string,
): Promise<Map<string, string[]>> {
  const links = await db
    .select({
      assessmentId: studyAssessmentTopics.assessmentId,
      topicId: studyAssessmentTopics.topicId,
    })
    .from(studyAssessmentTopics)
    .where(eq(studyAssessmentTopics.userId, userId));

  const out = new Map<string, string[]>();
  for (const l of links) {
    const list = out.get(l.assessmentId);
    if (list) list.push(l.topicId);
    else out.set(l.assessmentId, [l.topicId]);
  }
  return out;
}

export type PlanItemWithTopic = PlanItemRow & {
  topicTitle: string;
  topicWeight: string;
  topicParentId: string | null;
  projectId: string;
  projectName: string;
  courseCode: string | null;
  assessmentTitle: string | null;
};

/**
 * Plan items across a date window, for the board and the LifeOS widget.
 * `from`/`to` are inclusive "YYYY-MM-DD" strings.
 */
export async function getPlanItems(
  userId: string,
  from: string,
  to: string,
): Promise<PlanItemWithTopic[]> {
  return db
    .select({
      id: studyPlanItems.id,
      userId: studyPlanItems.userId,
      planDate: studyPlanItems.planDate,
      topicId: studyPlanItems.topicId,
      assessmentId: studyPlanItems.assessmentId,
      orderIndex: studyPlanItems.orderIndex,
      status: studyPlanItems.status,
      completedAt: studyPlanItems.completedAt,
      reviewId: studyPlanItems.reviewId,
      createdAt: studyPlanItems.createdAt,
      updatedAt: studyPlanItems.updatedAt,
      topicTitle: studyTopics.title,
      topicWeight: studyTopics.weight,
      topicParentId: studyTopics.parentId,
      projectId: studyTopics.projectId,
      projectName: projects.name,
      courseCode: projects.courseCode,
      assessmentTitle: studyAssessments.title,
    })
    .from(studyPlanItems)
    .innerJoin(studyTopics, eq(studyTopics.id, studyPlanItems.topicId))
    .innerJoin(projects, eq(projects.id, studyTopics.projectId))
    .leftJoin(
      studyAssessments,
      eq(studyAssessments.id, studyPlanItems.assessmentId),
    )
    .where(
      and(
        eq(studyPlanItems.userId, userId),
        sql`${studyPlanItems.planDate} >= ${from}`,
        sql`${studyPlanItems.planDate} <= ${to}`,
      ),
    )
    .orderBy(asc(studyPlanItems.planDate), asc(studyPlanItems.orderIndex));
}

/** Recent review history for one topic — the detail panel timeline. */
export async function getTopicReviews(
  userId: string,
  topicId: string,
  limit = 30,
): Promise<ReviewRow[]> {
  return db
    .select()
    .from(studyReviews)
    .where(and(eq(studyReviews.userId, userId), eq(studyReviews.topicId, topicId)))
    .orderBy(desc(studyReviews.reviewedAt))
    .limit(limit);
}

/**
 * Everything the /review cockpit needs, in one place.
 *
 * Deliberately a single helper so the page does one Promise.all and the client
 * island receives a coherent snapshot rather than four independently-timed ones.
 */
export async function getStudyOverview(
  userId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const [topics, assessments, planItems, coverage] = await Promise.all([
    getStudyTopics(userId, { now }),
    getUpcomingAssessments(userId),
    getPlanItems(userId, from, to),
    getAssessmentCoverage(userId),
  ]);

  return {
    topics,
    assessments,
    planItems,
    coverage: Object.fromEntries(coverage),
  };
}

/** Class projects, which are the only ones that can hold topics. */
export async function getClassProjects(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      courseCode: projects.courseCode,
      icon: projects.icon,
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isClass, true),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.orderIndex), asc(projects.name));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
