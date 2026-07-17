import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { entityEmbeddings } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EntityRefType } from "./token";
import { embeddingContentHash, normalizeEmbeddingInput } from "./embedding-content";
import { isReferencesSemanticEnabled } from "./semantic-flag";

/**
 * Fire-and-forget embedding refresh after an entity write (U7).
 *
 * The semantic rung's write half. It's wired into every entity save path
 * (captures, tasks, pages, projects, areas, people), and its first act is to
 * check the flag: when the rung is off — the default — this returns before
 * doing anything, so the existing write paths pay a single boolean and nothing
 * else. Semantic being staged means it must never slow the path it rides on.
 *
 * When the rung IS on, the work is scheduled via `after()` (like auto-tagging
 * and link previews) so it runs AFTER the response is sent and never delays the
 * write, and it is entirely fail-soft: an embed failure just means that entity
 * has no fresh vector until its next save or a backfill, nothing user-visible
 * breaks.
 *
 * The content-hash short-circuit is what keeps re-saves cheap. The normalized
 * (title + body) is hashed and compared to the stored row's content_hash; an
 * unchanged hash skips the edge-function round trip entirely, so editing a
 * task's due date or re-saving an untouched page embeds nothing.
 */
export function scheduleEntityEmbedding(input: {
  userId: string;
  entityType: EntityRefType;
  entityId: string;
  title?: string | null;
  body?: string | null;
}): void {
  // Flag gate FIRST — the whole point of staging. Off by default → no cost.
  if (!isReferencesSemanticEnabled()) return;

  const normalized = normalizeEmbeddingInput(input.title, input.body);
  // Nothing meaning-bearing to embed (e.g. an untitled, empty entity). Leave any
  // existing row alone rather than overwrite it with a vector of empty text.
  if (!normalized) return;

  const contentHash = embeddingContentHash(normalized);

  after(async () => {
    try {
      const existing = await db
        .select({ contentHash: entityEmbeddings.contentHash })
        .from(entityEmbeddings)
        .where(
          and(
            eq(entityEmbeddings.entityType, input.entityType),
            eq(entityEmbeddings.entityId, input.entityId),
          ),
        )
        .limit(1);

      // Unchanged since last embed — skip the round trip.
      if (existing[0]?.contentHash === contentHash) return;

      const admin = createAdminClient();
      const { error } = await admin.functions.invoke("embed-entity", {
        body: {
          userId: input.userId,
          entityType: input.entityType,
          entityId: input.entityId,
          content: normalized,
        },
      });
      if (error) {
        console.error("[embedding-enqueue] embed-entity invoke failed", input.entityType, input.entityId, error);
      }
    } catch (err) {
      console.error("[embedding-enqueue] failed", input.entityType, input.entityId, err);
    }
  });
}
