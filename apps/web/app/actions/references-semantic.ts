"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entityEmbeddings } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isReferencesSemanticEnabled } from "@/lib/references/semantic-flag";
import {
  SEMANTIC_MIN_QUERY_LENGTH,
  SEMANTIC_SIMILARITY_FLOOR,
  SEMANTIC_TOP_K,
  toVectorLiteral,
} from "@/lib/references/semantic-search";
import type {
  EntityMentionCandidate,
  SemanticMentionResults,
} from "@/lib/references/mention-search";
import type { EntityRefType } from "@/lib/references/token";
import { resolveEntityLabels } from "./wiki-references";

/**
 * The client's read-once probe for the semantic rung (U7).
 *
 * The dropdown host calls this ONCE on mount and caches it, so the second
 * (semantic) search call is armed only where the deployment has embeddings to
 * search. Off by default → the "Related" section is simply absent, no layout
 * shift, and the exact path never knows semantic exists.
 */
export async function getReferencesSemanticEnabled(): Promise<boolean> {
  return isReferencesSemanticEnabled();
}

/**
 * The STAGED semantic @-mention search (U7) — a SECOND action, entirely separate
 * from the exact `searchEntityMentions` (S4), which it never touches or slows.
 *
 * It embeds the query with the same gte-small edge function the write path uses,
 * runs a userId-scoped pgvector cosine top-K over entity_embeddings, floors the
 * results at SEMANTIC_SIMILARITY_FLOOR, and resolves live labels for the hits
 * (reusing resolveEntityLabels, which drops entities that no longer exist — an
 * embedding row can outlive its entity, since entity_id carries no FK). The
 * result is a flat, similarity-ordered candidate list the dropdown appends as a
 * "Related" section beneath the exact groups.
 *
 * Every exit is quiet and empty: flag off, unauthenticated, a too-short query,
 * or an embed failure all return `{ candidates: [], query }` so the picker just
 * shows no semantic section rather than throwing into the editor.
 *
 * Scoping is in the WHERE, not left to RLS: the app connects as `postgres`
 * (BYPASSRLS), so a missing user_id predicate here would search every user's
 * vectors. The floor and top-K are named constants in semantic-search.ts.
 */
export async function searchEntityMentionsSemantic(
  rawQuery: string,
): Promise<SemanticMentionResults> {
  const query = rawQuery.trim();

  // Flag gate first — the whole point of staging. Off by default → nothing runs.
  if (!isReferencesSemanticEnabled()) return { candidates: [], query };
  // Too short to be worth an embed; the exact prefix match already covers it.
  if (query.length < SEMANTIC_MIN_QUERY_LENGTH) return { candidates: [], query };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { candidates: [], query };
  const userId = data.claims.sub;

  // Embed the query via the edge function's QUERY mode (no write). Service-role
  // client because the function requires role=service_role.
  let queryVector: number[];
  try {
    const admin = createAdminClient();
    const { data: embed, error: embedError } = await admin.functions.invoke(
      "embed-entity",
      { body: { query } },
    );
    if (embedError || !Array.isArray(embed?.embedding)) {
      console.error("[references-semantic] query embed failed", embedError);
      return { candidates: [], query };
    }
    queryVector = embed.embedding as number[];
  } catch (err) {
    console.error("[references-semantic] query embed threw", err);
    return { candidates: [], query };
  }

  const vectorLiteral = toVectorLiteral(queryVector);
  // Cosine distance via `<=>` (the HNSW index is vector_cosine_ops), similarity
  // = 1 - distance. The floor is expressed as a distance bound (distance <=
  // 1 - floor) so the index can drive the ordering; similarity is surfaced too.
  const distance = sql<number>`${entityEmbeddings.embedding} <=> ${vectorLiteral}::vector`;
  const rows = await db
    .select({
      entityType: entityEmbeddings.entityType,
      entityId: entityEmbeddings.entityId,
      similarity: sql<number>`1 - (${entityEmbeddings.embedding} <=> ${vectorLiteral}::vector)`,
    })
    .from(entityEmbeddings)
    .where(
      and(
        eq(entityEmbeddings.userId, userId),
        sql`(${entityEmbeddings.embedding} <=> ${vectorLiteral}::vector) <= ${1 - SEMANTIC_SIMILARITY_FLOOR}`,
      ),
    )
    .orderBy(distance)
    .limit(SEMANTIC_TOP_K);

  if (rows.length === 0) return { candidates: [], query };

  // Similarity keyed by identity — resolveEntityLabels dedupes/normalizes its
  // input internally, so a look-up is safer than trusting positional alignment.
  const similarityByKey = new Map<string, number>(
    rows.map((r) => [`${r.entityType}:${r.entityId}`, r.similarity]),
  );

  // Resolve live labels for the hits. resolveEntityLabels marks a gone entity
  // `exists: false`, so a stale embedding pointing at a deleted entity is
  // filtered out here rather than shown as a dead row. It preserves the request
  // order, which is our similarity order.
  const resolved = await resolveEntityLabels(
    rows.map((r) => ({ type: r.entityType as EntityRefType, id: r.entityId })),
  );

  const candidates: EntityMentionCandidate[] = [];
  for (const label of resolved) {
    if (!label.exists) continue;
    candidates.push({
      kind: label.type,
      id: label.id,
      label: label.label,
      sublabel: label.sublabel,
      emoji: label.emoji,
      similarity: similarityByKey.get(`${label.type}:${label.id}`),
    });
  }

  return { candidates, query };
}
