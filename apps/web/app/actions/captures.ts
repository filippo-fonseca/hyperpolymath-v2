"use server";

import { scheduleAutoTagging } from "@/lib/captures/auto-tag";
import { type SuggestedTag, suggestCaptureTags } from "@/lib/captures/suggest-tags";
import { scheduleLinkPreviews } from "@/lib/link-preview/schedule";
import { db } from "@/lib/db";
import {
  type CaptureWithLinks,
  getCapturesForUser,
  getResurfacingCapturesForUser,
} from "@/lib/db/queries/captures";
import { captures, capturesHashtags, capturesProjects, projects, users } from "@/lib/db/schema";
import { TZDate } from "@date-fns/tz";
import { endOfDay } from "date-fns";
import { hashtags } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { mergeContentUrls } from "@/lib/url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { upsertHashtag } from "./hashtags";
import { reconcilePersonReferencesForUser, resolveOrCreatePersonForUser } from "./people";

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

/**
 * CLAUDE.md Critical Pattern 1: validate the user via getClaims() — never
 * getSession() in server code. getClaims validates the JWT signature against
 * Supabase's published public keys; getSession reads cookies without
 * revalidation and is spoofable.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const CreateCaptureSchema = z.object({
  // RT-05 dedupe: caller may supply a client-generated UUID so the Realtime
  // echo carrying the same id is a no-op for the optimistic reducer.
  id: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(20000),
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  // Phase C: @-mentioned people, carried as NAMES. resolve-or-created server
  // side so the editor never needs an id round-trip mid-typing.
  personNames: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
  projectIds: z.array(z.string().uuid()).max(20).default([]),
  // Issue #101 — Notion-style URL property. Stored verbatim (normalized
  // client-side); null/absent = unset.
  url: z.string().trim().max(2048).nullable().optional(),
});

export async function createCapture(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateCaptureSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Auto-derive the URL property from the body: any link in the content is
  // added to `urls` (and seeds the primary `url` when the caller didn't set one).
  const derivedUrls = mergeContentUrls(parsed.data.content, { url: parsed.data.url ?? null });

  const result = await db.transaction(async (tx) => {
    const [cap] = await tx
      .insert(captures)
      .values({
        // RT-05: respect caller-supplied id when present so the optimistic
        // row + the Realtime echo share the same primary key.
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        userId,
        content: parsed.data.content,
        url: derivedUrls.url,
        urls: derivedUrls.urls,
        sourceDevice: "Web",
        sourceInput: "text",
      })
      .returning({ id: captures.id });

    // Upsert each hashtag (atomic, race-safe per Pitfall 9 — passing tx per Warning 10)
    if (parsed.data.hashtagNames.length > 0) {
      // Dedupe (case-insensitive)
      const seen = new Set<string>();
      const uniqueRaw = parsed.data.hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const upserted: { id: string }[] = [];
      for (const raw of uniqueRaw) {
        // Warning 10 fix: pass tx so hashtag upsert is part of the same transaction.
        // If the captures_hashtags insert below fails, the hashtag inserts roll back too.
        const tag = await upsertHashtag(userId, raw, tx);
        upserted.push({ id: tag.id });
      }
      if (upserted.length > 0) {
        await tx.insert(capturesHashtags).values(
          upserted.map((t) => ({
            captureId: cap.id,
            hashtagId: t.id,
            userId,
          }))
        );
      }
    }

    // Link projects (verify ownership)
    if (parsed.data.projectIds.length > 0) {
      const owned = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), inArray(projects.id, parsed.data.projectIds)));
      const ownedIds = new Set(owned.map((p) => p.id));
      const validIds = parsed.data.projectIds.filter((pid) => ownedIds.has(pid));
      if (validIds.length > 0) {
        await tx.insert(capturesProjects).values(
          validIds.map((projectId) => ({
            captureId: cap.id,
            projectId,
            userId,
          }))
        );
      }
    }

    return cap.id;
  });

  // Phase C: resolve each @-mentioned name to a person (creating any new ones),
  // then reconcile people_references for this capture. Runs after the capture
  // exists; reconcile diffs against the (empty, on create) stored set.
  if (parsed.data.personNames.length > 0) {
    const personIds: string[] = [];
    for (const name of parsed.data.personNames) {
      const person = await resolveOrCreatePersonForUser(userId, name);
      if (person) personIds.push(person.id);
    }
    await reconcilePersonReferencesForUser(userId, "capture", result, personIds);
  }

  // Background auto-tagging: a Haiku call infers a minimal set of warranted
  // hashtags, links them, and appends the #tokens to the text. Scheduled via
  // after() inside the helper so it never delays this response; the captures +
  // captures_hashtags Realtime subscriptions surface the result live.
  scheduleAutoTagging(result, userId, parsed.data.content);

  // Issue #221: fetch rich link previews for any URLs in the content (+ the
  // canonical url property). Also scheduled via after(); fail-soft.
  scheduleLinkPreviews(userId, parsed.data.content, parsed.data.url);

  // Phase 3 D-12: no manual cache busting here — Supabase Realtime echo +
  // TanStack Query invalidation own cross-window propagation now.
  return { success: true, data: { id: result } };
}

const UpdateCaptureSchema = z.object({
  id: z.string().uuid(),
  content: z.string().trim().min(1).max(20000).optional(),
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  personNames: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
  // Issue #101 — set, change, or clear (null) the primary URL property.
  url: z.string().trim().max(2048).nullable().optional(),
  // Multi-URL property — the authoritative manual list (from the detail panel).
  // Body-derived links are still merged in additively on top of this.
  urls: z.array(z.string().trim().max(2048)).max(50).optional(),
  // Resurfacing (remind-me) date. ISO datetime string to set/change, null to
  // clear, or absent to leave unchanged. Persisted verbatim as a timestamptz.
  resurfaceAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const SetCaptureFavoriteSchema = z.object({
  id: z.string().uuid(),
  favorite: z.boolean(),
});

export async function setCaptureFavorite(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetCaptureFavoriteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await db
    .update(captures)
    .set({ favorite: parsed.data.favorite, updatedAt: sql`now()` })
    .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)));

  // Realtime invalidates the captures feed; optimistic UI owns the immediate echo.
  return { success: true, data: null };
}

export async function updateCapture(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateCaptureSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    // Coalesce the scalar column writes (content + url + urls) into one UPDATE so
    // a url-only edit doesn't depend on content being present. An empty/whitespace
    // url is treated as a clear (null). Whenever content, url, or the manual urls
    // list changes, re-derive the multi-URL property: body links are merged
    // additively into the existing/updated set (never removing or overwriting a
    // manually-set link).
    const scalarSet: Record<string, unknown> = {};
    if (parsed.data.content !== undefined) scalarSet.content = parsed.data.content;
    // Resurfacing date: set/change (ISO → Date), clear (null), or leave
    // untouched (absent). Independent of the URL derivation below.
    if (parsed.data.resurfaceAt !== undefined) {
      scalarSet.resurfaceAt = parsed.data.resurfaceAt
        ? new Date(parsed.data.resurfaceAt)
        : null;
    }

    if (
      parsed.data.content !== undefined ||
      parsed.data.url !== undefined ||
      parsed.data.urls !== undefined
    ) {
      const [current] = await tx
        .select({ content: captures.content, url: captures.url, urls: captures.urls })
        .from(captures)
        .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)))
        .limit(1);
      if (current) {
        const nextContent =
          parsed.data.content !== undefined ? parsed.data.content : current.content;
        // Explicit url edit seeds the primary; else keep the current primary.
        const nextPrimary =
          parsed.data.url !== undefined
            ? parsed.data.url
              ? parsed.data.url
              : null
            : current.url;
        // Explicit manual list (from the UI) is authoritative; else keep stored.
        const baseUrls = parsed.data.urls !== undefined ? parsed.data.urls : current.urls;
        const merged = mergeContentUrls(nextContent, { url: nextPrimary, urls: baseUrls });
        scalarSet.url = merged.url;
        scalarSet.urls = merged.urls;
      }
    }

    if (Object.keys(scalarSet).length > 0) {
      await tx
        .update(captures)
        .set({ ...scalarSet, updatedAt: sql`now()` })
        .where(and(eq(captures.id, parsed.data.id), eq(captures.userId, userId)));
    }

    if (parsed.data.hashtagNames !== undefined) {
      await tx
        .delete(capturesHashtags)
        .where(
          and(eq(capturesHashtags.captureId, parsed.data.id), eq(capturesHashtags.userId, userId))
        );
      const seen = new Set<string>();
      const uniqueRaw = parsed.data.hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      for (const raw of uniqueRaw) {
        // Warning 10 fix: pass tx (atomic with surrounding deletes/inserts)
        const tag = await upsertHashtag(userId, raw, tx);
        await tx.insert(capturesHashtags).values({
          captureId: parsed.data.id,
          hashtagId: tag.id,
          userId,
        });
      }
    }

    if (parsed.data.projectIds !== undefined) {
      await tx
        .delete(capturesProjects)
        .where(
          and(eq(capturesProjects.captureId, parsed.data.id), eq(capturesProjects.userId, userId))
        );
      if (parsed.data.projectIds.length > 0) {
        const owned = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.userId, userId), inArray(projects.id, parsed.data.projectIds)));
        const ownedIds = new Set(owned.map((p) => p.id));
        const validIds = parsed.data.projectIds.filter((pid) => ownedIds.has(pid));
        if (validIds.length > 0) {
          await tx.insert(capturesProjects).values(
            validIds.map((projectId) => ({
              captureId: parsed.data.id,
              projectId,
              userId,
            }))
          );
        }
      }
    }
  });

  // Phase C: reconcile @-mentioned people for this capture. Only when the field
  // is present, so a content/hashtag-only update never clears existing links.
  // Runs after the tx (resolve-or-create matches createCapture's pattern).
  if (parsed.data.personNames !== undefined) {
    const personIds: string[] = [];
    for (const name of parsed.data.personNames) {
      const person = await resolveOrCreatePersonForUser(userId, name);
      if (person) personIds.push(person.id);
    }
    await reconcilePersonReferencesForUser(userId, "capture", parsed.data.id, personIds);
  }

  // Issue #221: refresh link previews when the content or url property changed.
  // ensurePendingPreviews only fetches URLs without an existing row, so this
  // never re-fetches already-cached links.
  if (parsed.data.content !== undefined || parsed.data.url !== undefined) {
    scheduleLinkPreviews(userId, parsed.data.content ?? "", parsed.data.url);
  }

  // Phase 3 D-12: no manual cache busting — Realtime + TanStack Query own refresh.
  return { success: true, data: null };
}

/**
 * Lazy retroactive backfill for the multi-URL property. Called when a capture
 * is opened: if its body contains link(s) not yet recorded in `urls` (e.g. a
 * capture created before this feature shipped, or one whose backfill script
 * hasn't run), derive and persist them. Additive + idempotent — a no-op DB
 * write is skipped, and a manually-set primary `url` is never overwritten.
 *
 * Returns the (possibly unchanged) URL state so the caller can reconcile its
 * optimistic feed copy without a full refetch.
 */
export async function ensureCaptureUrls(
  id: unknown
): Promise<ActionResult<{ url: string | null; urls: string[]; changed: boolean }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  const captureId = id as string;

  const [current] = await db
    .select({ content: captures.content, url: captures.url, urls: captures.urls })
    .from(captures)
    .where(and(eq(captures.id, captureId), eq(captures.userId, userId)))
    .limit(1);
  if (!current) return { success: false, error: "Not found" };

  const merged = mergeContentUrls(current.content, { url: current.url, urls: current.urls });
  const changed =
    merged.url !== (current.url ?? null) ||
    merged.urls.length !== current.urls.length ||
    merged.urls.some((u, i) => u !== current.urls[i]);

  if (changed) {
    await db
      .update(captures)
      .set({ url: merged.url, urls: merged.urls, updatedAt: sql`now()` })
      .where(and(eq(captures.id, captureId), eq(captures.userId, userId)));
  }

  return { success: true, data: { url: merged.url, urls: merged.urls, changed } };
}

export async function deleteCapture(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  await db.delete(captures).where(and(eq(captures.id, id), eq(captures.userId, userId)));
  // Phase 3 D-12: no manual cache busting — Realtime + TanStack Query own refresh.
  return { success: true, data: null };
}

/**
 * CAPT-06: full-text search via tsvector @@ to_tsquery.
 * Splits user query on whitespace, joins with & (AND match).
 * Returns top 50 by ts_rank DESC.
 */
const SearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  hashtagId: z.string().uuid().optional(),
});

export async function searchCaptures(input: unknown): Promise<ActionResult<string[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SearchSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Sanitize query: split on whitespace, filter empties, escape non-word chars, join with &
  const tokens = parsed.data.query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ""))
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`); // prefix match
  if (tokens.length === 0) return { success: true, data: [] };
  const tsQuery = tokens.join(" & ");

  // Optional: filter by linked hashtag ID via subquery
  if (parsed.data.hashtagId) {
    const rows = await db
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(
        capturesHashtags,
        and(
          eq(capturesHashtags.captureId, captures.id),
          eq(capturesHashtags.hashtagId, parsed.data.hashtagId),
          eq(capturesHashtags.userId, userId)
        )
      )
      .where(
        and(
          eq(captures.userId, userId),
          sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`
        )
      )
      .orderBy(sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) DESC`)
      .limit(50);
    return { success: true, data: rows.map((r) => r.id) };
  }

  const rows = await db
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.userId, userId),
        sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`
      )
    )
    .orderBy(sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) DESC`)
    .limit(50);
  return { success: true, data: rows.map((r) => r.id) };
}

/**
 * Auth-gated SELECT for the signed-in user's captures (with hashtag + project
 * joins inlined). queryFn target for `useQuery({ queryKey: tableKey("captures",
 * userId) })` in CapturesClient.
 *
 * CLAUDE.md Critical Pattern 1: getClaims, NOT getSession.
 *
 * @param options.tag - Optional hashtag ID to filter the feed (nuqs `?tag=`
 *   URL state on /captures).
 */
export async function getCapturesForCurrentUser(
  options: { tag?: string } = {}
): Promise<CaptureWithLinks[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getCapturesForUser(data.claims.sub, { hashtagId: options.tag });
}

/**
 * Captures due to resurface today — queryFn for the /captures "Resurfacing
 * today" collapsible section. Computes the "end of today" boundary in the
 * user's timezone (falls back to UTC) so the section rolls over per calendar
 * day rather than at UTC midnight.
 *
 * CLAUDE.md Critical Pattern 1: getClaims, NOT getSession.
 */
export async function getResurfacingCapturesForCurrentUser(): Promise<CaptureWithLinks[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  const userId = data.claims.sub;

  const [u] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = u?.timezone ?? "UTC";
  // end of today, anchored to the user's tz; .getTime() is the correct UTC
  // instant to compare against the timestamptz column.
  const before = new Date(endOfDay(new TZDate(new Date(), tz)).getTime());

  return getResurfacingCapturesForUser(userId, { before });
}

/**
 * Smart (AI-assisted) tag suggestions for the capture composer (#36 / #40).
 *
 * Takes the draft text, loads the user's existing tag vocabulary, and runs one
 * claude-sonnet-4-6 call (lib/captures/suggest-tags.ts) that prefers reusing
 * existing tags over coining near-duplicates. The user accepts or dismisses the
 * results in the composer — nothing is applied automatically.
 *
 * Fail-soft: an unauthenticated or invalid call returns an empty list rather
 * than throwing, so the composer's suggest affordance never breaks the editor.
 */
const SuggestTagsSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export async function suggestTagsForCapture(input: unknown): Promise<ActionResult<SuggestedTag[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SuggestTagsSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const vocab = await db
    .select({ displayName: hashtags.displayName })
    .from(hashtags)
    .where(eq(hashtags.userId, userId));

  const suggestions = await suggestCaptureTags(
    userId,
    parsed.data.content,
    vocab.map((h) => h.displayName)
  );
  return { success: true, data: suggestions };
}
