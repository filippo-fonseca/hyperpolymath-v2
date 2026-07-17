import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  areas,
  captures,
  entityEmbeddings,
  pages,
  people,
  projects,
  tasks,
} from "@/lib/db/schema";
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
 * The call site passes only the entity's identity — this helper reads the
 * entity's CURRENT canonical text itself. That's deliberate: a partial update
 * (a task whose due date changed but whose title didn't) doesn't carry the full
 * title + notes, and embedding only the changed field would produce a vector of
 * half the entity. Reading the row here means the embed input is always the
 * whole entity, and the content-hash short-circuit stays honest.
 */
export function scheduleEntityEmbedding(input: {
  userId: string;
  entityType: EntityRefType;
  entityId: string;
}): void {
  // Flag gate FIRST — the whole point of staging. Off by default → no cost, and
  // in particular no extra read on the write path.
  if (!isReferencesSemanticEnabled()) return;

  after(async () => {
    try {
      const text = await loadEntityText(input.entityType, input.entityId, input.userId);
      if (text === null) return; // entity gone (raced with a delete) — nothing to embed

      const normalized = normalizeEmbeddingInput(text.title, text.body);
      // Nothing meaning-bearing to embed (e.g. an untitled, empty entity). Leave
      // any existing row alone rather than overwrite it with a vector of empty text.
      if (!normalized) return;

      const contentHash = embeddingContentHash(normalized);

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
        console.error(
          "[embedding-enqueue] embed-entity invoke failed",
          input.entityType,
          input.entityId,
          error,
        );
      }
    } catch (err) {
      console.error("[embedding-enqueue] failed", input.entityType, input.entityId, err);
    }
  });
}

/**
 * The (title, body) an entity is embedded from, read from its current row.
 *
 * Every query is userId-scoped: the app connects as `postgres` (BYPASSRLS), so
 * scoping is the app's job even for a background read. Returns null when the row
 * is gone — a write immediately followed by a delete can race the after() hook.
 */
async function loadEntityText(
  entityType: EntityRefType,
  entityId: string,
  userId: string,
): Promise<{ title: string | null; body: string | null } | null> {
  switch (entityType) {
    case "capture": {
      const [row] = await db
        .select({ content: captures.content })
        .from(captures)
        .where(and(eq(captures.id, entityId), eq(captures.userId, userId)))
        .limit(1);
      return row ? { title: null, body: row.content } : null;
    }
    case "task": {
      const [row] = await db
        .select({ title: tasks.title, notes: tasks.notes })
        .from(tasks)
        .where(and(eq(tasks.id, entityId), eq(tasks.userId, userId)))
        .limit(1);
      return row ? { title: row.title, body: row.notes } : null;
    }
    case "page": {
      const [row] = await db
        .select({ title: pages.title, content: pages.content })
        .from(pages)
        .where(and(eq(pages.id, entityId), eq(pages.userId, userId)))
        .limit(1);
      return row ? { title: row.title, body: row.content } : null;
    }
    case "project": {
      const [row] = await db
        .select({ name: projects.name, description: projects.description })
        .from(projects)
        .where(and(eq(projects.id, entityId), eq(projects.userId, userId)))
        .limit(1);
      return row ? { title: row.name, body: row.description } : null;
    }
    case "area": {
      const [row] = await db
        .select({ name: areas.name })
        .from(areas)
        .where(and(eq(areas.id, entityId), eq(areas.userId, userId)))
        .limit(1);
      return row ? { title: row.name, body: null } : null;
    }
    case "person": {
      const [row] = await db
        .select({ name: people.name, bio: people.bio })
        .from(people)
        .where(and(eq(people.id, entityId), eq(people.userId, userId)))
        .limit(1);
      return row ? { title: row.name, body: row.bio } : null;
    }
    default:
      return null;
  }
}
