/**
 * auto-tag.ts — background hashtag auto-tagging for captures.
 *
 * After a capture is created through ANY entry point, a lightweight Haiku call
 * infers a minimal set of genuinely-warranted hashtags, links them as real tag
 * entities (the same hashtags + captures_hashtags path used for typed tags),
 * and appends the #hashtags into the capture text when not already present.
 *
 * This runs via `after()` (next/server) so it executes AFTER the response is
 * sent and never delays capture creation, while still reliably completing in
 * the serverless runtime (un-awaited bare promises can be killed before they
 * finish; `after()` keeps the work alive for the duration of the request's
 * lifecycle). Everything here is fail-soft: a failure only means the capture
 * keeps the tags the user typed, nothing breaks the create path.
 */

import { upsertHashtag } from "@/app/actions/hashtags";
import { db } from "@/lib/db";
import { captures, capturesHashtags, hashtags } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { inferCaptureTags } from "./suggest-tags";

/**
 * Schedule background auto-tagging for a just-created capture. Returns
 * immediately; the inference + writes run after the response via `after()`.
 * Safe to call from server actions and route handlers.
 */
export function scheduleAutoTagging(captureId: string, userId: string, content: string): void {
  after(async () => {
    try {
      await runAutoTagging(captureId, userId, content);
    } catch (err) {
      console.error("[auto-tag] background tagging failed", err);
    }
  });
}

/**
 * Match a `#tag` token already present in the capture text. Word-boundary at the
 * end so `#fitness` does not count as already covering `#fit`.
 */
function textHasHashtag(content: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`#${escaped}(?![\\w])`, "i").test(content);
}

async function runAutoTagging(captureId: string, userId: string, content: string): Promise<void> {
  const vocabRows = await db
    .select({ displayName: hashtags.displayName })
    .from(hashtags)
    .where(eq(hashtags.userId, userId));

  const inferred = await inferCaptureTags(
    userId,
    content,
    vocabRows.map((r) => r.displayName)
  );
  if (inferred.length === 0) return;

  // Tags the capture is already linked to — never double-link or re-append.
  const linkedRows = await db
    .select({ name: hashtags.name })
    .from(capturesHashtags)
    .innerJoin(hashtags, eq(capturesHashtags.hashtagId, hashtags.id))
    .where(and(eq(capturesHashtags.captureId, captureId), eq(capturesHashtags.userId, userId)));
  const alreadyLinked = new Set(linkedRows.map((r) => r.name.toLowerCase()));

  const toApply = inferred.filter((t) => !alreadyLinked.has(t.name.toLowerCase()));
  if (toApply.length === 0) return;

  // Link the new tags (own transaction; the capture row already committed).
  await db.transaction(async (tx) => {
    for (const tag of toApply) {
      const upserted = await upsertHashtag(userId, tag.name, tx);
      await tx
        .insert(capturesHashtags)
        .values({ captureId, hashtagId: upserted.id, userId })
        .onConflictDoNothing();
    }
  });

  // Append #tokens for any tag not already present in the text, then UPDATE the
  // row so the captures Realtime subscription fires and the text shows them.
  const missingFromText = toApply
    .map((t) => t.name)
    .filter((name) => !textHasHashtag(content, name));
  if (missingFromText.length === 0) return;

  const appended = missingFromText.map((name) => `#${name}`).join(" ");
  const nextContent = `${content.replace(/\s+$/, "")} ${appended}`;

  await db
    .update(captures)
    .set({ content: nextContent, updatedAt: sql`now()` })
    .where(
      and(
        eq(captures.id, captureId),
        eq(captures.userId, userId),
        // Guard against clobbering a concurrent user edit: only append when the
        // stored content still equals what we tagged.
        eq(captures.content, content)
      )
    );
}
