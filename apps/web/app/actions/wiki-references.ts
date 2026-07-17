"use server";

import { db } from "@/lib/db";
import {
  areas,
  captures,
  pages,
  people,
  projects,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";
import {
  type EntityMentionCandidate,
  type EntityMentionGroup,
  type EntityMentionResults,
  MAX_PER_KIND as MENTION_MAX_PER_KIND,
  MAX_RECENT_PER_KIND,
  assembleMentionGroups,
  escapeLikePattern,
  toPrefixTsQuery,
} from "@/lib/references/mention-search";
import {
  type EntityLabelRequest,
  type ResolvedEntityLabel,
  assembleResolvedLabels,
  groupIdsByType,
  normalizeLabelRequests,
  previewContext,
} from "@/lib/references/resolve-labels";
import { captureLabel } from "@/lib/references/token";
import { createClient } from "@/lib/supabase/server";
import {
  type SQLWrapper,
  and,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";

/**
 * The universal @-mention picker's search (S4).
 *
 * The single search action for every reference surface: it adds captures and
 * people to the areas/projects/tasks/pages the wiki picker needs, groups by
 * kind, and returns recents on an empty query.
 *
 * Two things it does differently from a naive picker, both deliberate. Matching
 * happens in SQL rather than by pulling every entity into memory and filtering:
 * loading all tasks and all pages per keystroke is fine at a few hundred rows
 * and isn't at a few thousand, and it can't be made to work for captures at
 * all. And every query is userId-scoped in its WHERE. The app connects as
 * `postgres`, which carries BYPASSRLS, so RLS is not the gate here and scoping
 * is the app's job.
 *
 * The six queries run concurrently: one round trip's worth of latency, not six.
 */
export async function searchEntityMentions(
  rawQuery: string,
): Promise<EntityMentionResults> {
  const query = rawQuery.trim();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  // Degrade quietly: an unauthenticated menu shows nothing rather than throwing
  // into the editor.
  if (error || !data?.claims) return { groups: [], query };
  const userId = data.claims.sub;

  const limit = query ? MENTION_MAX_PER_KIND : MAX_RECENT_PER_KIND;
  const lower = query.toLowerCase();
  // Matched with LIKE rather than ILIKE so the lower(col) expression is
  // explicit on both sides; % and _ in the query are escaped to stay literal.
  const escaped = escapeLikePattern(lower);
  const prefixPattern = `${escaped}%`;
  const containsPattern = `%${escaped}%`;

  /**
   * Prefix hits first, then substring, then alphabetical. "ma" should surface
   * "Marathon" above "Summer marathon" — the thing the user is most likely
   * typing toward, not just anything containing the letters.
   */
  const rankFor = (col: SQLWrapper) =>
    sql`case when lower(${col}) like ${prefixPattern} escape '\\' then 0 else 1 end`;

  const [captureRows, taskRows, pageRows, projectRows, areaRows, personRows] =
    await Promise.all([
      searchCaptureMentions(userId, query, limit),
      // Tasks: title only. Notes can be long, and a mention picker matching on
      // body text surfaces rows whose label doesn't contain the query at all,
      // which reads as a bug.
      (async () => {
        const projectName = sql<string | null>`(
          select ${projects.name} from ${tasksProjects}
          join ${projects} on ${projects.id} = ${tasksProjects.projectId}
          where ${tasksProjects.taskId} = ${tasks.id}
          limit 1
        )`;
        const base = db
          .select({
            id: tasks.id,
            label: tasks.title,
            sublabel: projectName,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .$dynamic();
        return query
          ? base
              .where(
                and(
                  eq(tasks.userId, userId),
                  sql`lower(${tasks.title}) like ${containsPattern} escape '\\'`,
                ),
              )
              .orderBy(rankFor(tasks.title), sql`lower(${tasks.title})`)
              .limit(limit)
          : base
              .where(eq(tasks.userId, userId))
              .orderBy(desc(tasks.updatedAt))
              .limit(limit);
      })(),
      // Pages: an untitled page has nothing to show in a chip, so it's not
      // offered (parity with the wiki picker above).
      (async () => {
        const base = db
          .select({
            id: pages.id,
            label: pages.title,
            emoji: pages.emoji,
            updatedAt: pages.updatedAt,
          })
          .from(pages)
          .$dynamic();
        const hasTitle = sql`length(trim(${pages.title})) > 0`;
        return query
          ? base
              .where(
                and(
                  eq(pages.userId, userId),
                  hasTitle,
                  sql`lower(${pages.title}) like ${containsPattern} escape '\\'`,
                ),
              )
              .orderBy(rankFor(pages.title), sql`lower(${pages.title})`)
              .limit(limit)
          : base
              .where(and(eq(pages.userId, userId), hasTitle))
              .orderBy(desc(pages.updatedAt))
              .limit(limit);
      })(),
      // Projects: parent area as sublabel. Archived is excluded, matching the
      // wiki picker — an archived project shouldn't be offered for new links.
      (async () => {
        const base = db
          .select({
            id: projects.id,
            label: projects.name,
            sublabel: areas.name,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .leftJoin(areas, eq(areas.id, projects.areaId))
          .$dynamic();
        const live = and(
          eq(projects.userId, userId),
          isNull(projects.archivedAt),
        );
        return query
          ? base
              .where(
                and(
                  live,
                  sql`lower(${projects.name}) like ${containsPattern} escape '\\'`,
                ),
              )
              .orderBy(rankFor(projects.name), sql`lower(${projects.name})`)
              .limit(limit)
          : base.where(live).orderBy(desc(projects.updatedAt)).limit(limit);
      })(),
      (async () => {
        const base = db
          .select({
            id: areas.id,
            label: areas.name,
            emoji: areas.emoji,
            updatedAt: areas.updatedAt,
          })
          .from(areas)
          .$dynamic();
        const live = and(eq(areas.userId, userId), isNull(areas.archivedAt));
        return query
          ? base
              .where(
                and(
                  live,
                  sql`lower(${areas.name}) like ${containsPattern} escape '\\'`,
                ),
              )
              .orderBy(rankFor(areas.name), sql`lower(${areas.name})`)
              .limit(limit)
          : base.where(live).orderBy(desc(areas.updatedAt)).limit(limit);
      })(),
      // People: name matches, email shown as sublabel to tell namesakes apart.
      (async () => {
        const base = db
          .select({
            id: people.id,
            label: people.name,
            sublabel: people.email,
            updatedAt: people.updatedAt,
          })
          .from(people)
          .$dynamic();
        return query
          ? base
              .where(
                and(
                  eq(people.userId, userId),
                  sql`lower(${people.name}) like ${containsPattern} escape '\\'`,
                ),
              )
              .orderBy(rankFor(people.name), sql`lower(${people.name})`)
              .limit(limit)
          : base
              .where(eq(people.userId, userId))
              .orderBy(desc(people.updatedAt))
              .limit(limit);
      })(),
    ]);

  const iso = (d: Date | null | undefined): string | undefined =>
    d ? d.toISOString() : undefined;

  const candidates: EntityMentionCandidate[] = [
    ...captureRows,
    ...taskRows.map((r) => ({
      kind: "task" as const,
      id: r.id,
      label: r.label,
      sublabel: r.sublabel ?? undefined,
      updatedAt: iso(r.updatedAt),
    })),
    ...pageRows.map((r) => ({
      kind: "page" as const,
      id: r.id,
      label: r.label,
      emoji: r.emoji,
      updatedAt: iso(r.updatedAt),
    })),
    ...projectRows.map((r) => ({
      kind: "project" as const,
      id: r.id,
      label: r.label,
      sublabel: r.sublabel ?? undefined,
      updatedAt: iso(r.updatedAt),
    })),
    ...areaRows.map((r) => ({
      kind: "area" as const,
      id: r.id,
      label: r.label,
      emoji: r.emoji,
      updatedAt: iso(r.updatedAt),
    })),
    ...personRows.map((r) => ({
      kind: "person" as const,
      id: r.id,
      label: r.label,
      sublabel: r.sublabel ?? undefined,
      updatedAt: iso(r.updatedAt),
    })),
  ];

  return { groups: assembleMentionGroups(candidates), query };
}

/**
 * Captures are the awkward kind: no title to match on, just a content blob.
 *
 * A real query goes at the tsvector first (stemmed, prefix-matched, GIN-backed)
 * and falls back to a substring match on the raw content, which the trigram
 * index from 0035 serves. The fallback is what catches a query the English
 * stemmer won't — a fragment mid-word, a name, a URL.
 *
 * Trigram *similarity* would be the wrong tool here even though the index is
 * the same one: similarity() scores whole strings, so a 3-character query
 * against a 500-character capture scores near zero no matter how well it
 * matches. The index earns its keep accelerating the ILIKE, not a threshold.
 */
async function searchCaptureMentions(
  userId: string,
  query: string,
  limit: number,
): Promise<EntityMentionCandidate[]> {
  const toCandidate = (r: {
    id: string;
    content: string;
    updatedAt: Date | null;
  }): EntityMentionCandidate => ({
    kind: "capture",
    id: r.id,
    label: captureLabel(r.content),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : undefined,
  });

  if (!query) {
    const rows = await db
      .select({
        id: captures.id,
        content: captures.content,
        updatedAt: captures.updatedAt,
      })
      .from(captures)
      .where(eq(captures.userId, userId))
      .orderBy(desc(captures.updatedAt))
      .limit(limit);
    return rows.map(toCandidate);
  }

  const tsQuery = toPrefixTsQuery(query);
  const contains = `%${escapeLikePattern(query)}%`;
  // ILIKE against the raw content column (not lower(content)) so the planner can
  // use captures_content_trgm_idx — a gin_trgm_ops index on content, which a
  // lower(content) wrapper would hide. ILIKE carries the case-insensitivity the
  // lower() used to. An all-punctuation query leaves no tsquery; ILIKE still works.
  const match = tsQuery
    ? sql`(${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})
        or ${captures.content} ilike ${contains} escape '\\')`
    : sql`${captures.content} ilike ${contains} escape '\\'`;

  const rows = await db
    .select({
      id: captures.id,
      content: captures.content,
      updatedAt: captures.updatedAt,
    })
    .from(captures)
    .where(and(eq(captures.userId, userId), match))
    // Rank the tsvector hits first where there is one, then most recent. A
    // capture has no title to sort alphabetically by.
    .orderBy(
      tsQuery
        ? sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) desc`
        : desc(captures.updatedAt),
      desc(captures.updatedAt),
    )
    .limit(limit);

  return rows.map(toCandidate);
}

/**
 * Batch-resolve the live labels behind a render tree's reference tokens (S7).
 *
 * A token carries a label snapshot taken when it was inserted. That snapshot is
 * a fallback, not the truth: rename a project and every pill pointing at it
 * should say the new name on the next render. This is the action that makes
 * that so, and the reason `useEntityLabels` collects a whole tree's refs before
 * calling it — one round trip per tree, not one per pill.
 *
 * Every requested ref comes back, whether or not it resolved. `exists: false`
 * means the target is gone and the pill renders as a tombstone against its
 * snapshot label; per S3 the token stays in the source text after a delete, so
 * this is a normal steady state, not an error.
 *
 * Scoping is in the WHERE on every query, not left to RLS: the app connects as
 * `postgres`, which carries BYPASSRLS. Resolving is a read of arbitrary
 * caller-supplied ids, so it is exactly the path where a missing user_id
 * predicate would leak another user's titles. A ref to someone else's entity
 * simply doesn't resolve, and reads as deleted.
 */
export async function resolveEntityLabels(
  refs: EntityLabelRequest[],
): Promise<ResolvedEntityLabel[]> {
  const requests = normalizeLabelRequests(refs);
  if (requests.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  // Degrade like the pickers do: unauthenticated resolves to nothing, so pills
  // fall back to their snapshot labels instead of throwing into a render.
  if (error || !data?.claims) return [];
  const userId = data.claims.sub;

  const byType = groupIdsByType(requests);

  const [
    captureRows,
    taskRows,
    pageRows,
    projectRows,
    areaRows,
    personRows,
  ] = await Promise.all([
    byType.capture.length
      ? db
          .select({
            id: captures.id,
            content: captures.content,
          })
          .from(captures)
          .where(
            and(
              eq(captures.userId, userId),
              inArray(captures.id, byType.capture),
            ),
          )
      : [],
    byType.task.length
      ? db
          .select({
            id: tasks.id,
            label: tasks.title,
            notes: tasks.notes,
            sublabel: sql<string | null>`(
              select ${projects.name} from ${tasksProjects}
              join ${projects} on ${projects.id} = ${tasksProjects.projectId}
              where ${tasksProjects.taskId} = ${tasks.id}
              limit 1
            )`,
          })
          .from(tasks)
          .where(and(eq(tasks.userId, userId), inArray(tasks.id, byType.task)))
      : [],
    byType.page.length
      ? db
          .select({
            id: pages.id,
            label: pages.title,
            emoji: pages.emoji,
            body: pages.content,
          })
          .from(pages)
          .where(and(eq(pages.userId, userId), inArray(pages.id, byType.page)))
      : [],
    byType.project.length
      ? db
          .select({
            id: projects.id,
            label: projects.name,
            description: projects.description,
            sublabel: areas.name,
          })
          .from(projects)
          .leftJoin(areas, eq(areas.id, projects.areaId))
          .where(
            and(
              eq(projects.userId, userId),
              inArray(projects.id, byType.project),
            ),
          )
      : [],
    byType.area.length
      ? db
          .select({ id: areas.id, label: areas.name, emoji: areas.emoji })
          .from(areas)
          .where(and(eq(areas.userId, userId), inArray(areas.id, byType.area)))
      : [],
    byType.person.length
      ? db
          .select({
            id: people.id,
            label: people.name,
            sublabel: people.email,
            bio: people.bio,
          })
          .from(people)
          .where(
            and(eq(people.userId, userId), inArray(people.id, byType.person)),
          )
      : [],
  ]);

  const found: ResolvedEntityLabel[] = [
    // A capture's label is a synthesized first line, so its preview skips that
    // line — showing it twice would just be the chip again, larger.
    ...captureRows.map((r) => ({
      type: "capture" as const,
      id: r.id,
      label: captureLabel(r.content),
      exists: true,
      context: previewContext(r.content, { skipFirstLine: true }),
    })),
    ...taskRows.map((r) => ({
      type: "task" as const,
      id: r.id,
      label: r.label,
      exists: true,
      sublabel: r.sublabel ?? undefined,
      context: previewContext(r.notes),
    })),
    ...pageRows.map((r) => ({
      type: "page" as const,
      id: r.id,
      label: r.label,
      exists: true,
      emoji: r.emoji,
      context: previewContext(r.body),
    })),
    ...projectRows.map((r) => ({
      type: "project" as const,
      id: r.id,
      label: r.label,
      exists: true,
      sublabel: r.sublabel ?? undefined,
      context: previewContext(r.description),
    })),
    ...areaRows.map((r) => ({
      type: "area" as const,
      id: r.id,
      label: r.label,
      exists: true,
      emoji: r.emoji,
    })),
    ...personRows.map((r) => ({
      type: "person" as const,
      id: r.id,
      label: r.label,
      exists: true,
      sublabel: r.sublabel ?? undefined,
      context: previewContext(r.bio),
    })),
  ];

  return assembleResolvedLabels(requests, found);
}

export type {
  EntityMentionCandidate,
  EntityMentionGroup,
  EntityMentionResults,
  EntityLabelRequest,
  ResolvedEntityLabel,
};

