import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { upsertHashtag } from "@/app/actions/hashtags";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { captures, capturesHashtags } from "@/lib/db/schema";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { scheduleLinkPreviews } from "@/lib/link-preview/schedule";
import { scheduleEntityPeopleDerivation } from "@/lib/people/derive";
import {
  deleteReferencesForEntity,
  reconcileEntityReferencesFromText,
} from "@/lib/references/reconcile";
import { mergeContentUrls } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: CORS });
}

function cleanHashtags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.slice(0, 20)) {
    const name = String(raw).trim().replace(/^#/, "").slice(0, 50);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Paired-device CRUD for captures — bearer-auth twin of
 * app/actions/captures.ts. Provenance: sourceDevice denormalizes the token
 * name, sourceInput is "text" (the mobile composer types these).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) return new Response("Unauthorized", { status: 401, headers: CORS });
  const rows = await getCapturesForUser(identity.userId, { limit: 100 });
  return Response.json({ captures: rows }, { headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) return new Response("Unauthorized", { status: 401, headers: CORS });
  const { userId, deviceName } = identity;

  let body: { content?: string; hashtagNames?: string[] };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 20000) : "";
  if (!content) return bad("Content required");
  const hashtagNames = cleanHashtags(body.hashtagNames);

  const id = crypto.randomUUID();
  // Auto-derive the URL property from links in the body (parity with the web
  // + JARVIS create paths).
  const derivedUrls = mergeContentUrls(content, {});
  await db.transaction(async (tx) => {
    await tx.insert(captures).values({
      id,
      userId,
      content,
      url: derivedUrls.url,
      urls: derivedUrls.urls,
      sourceDevice: deviceName,
      sourceInput: "text",
    });
    for (const name of hashtagNames) {
      const upserted = await upsertHashtag(userId, name, tx);
      await tx
        .insert(capturesHashtags)
        .values({ captureId: id, hashtagId: upserted.id, userId })
        .onConflictDoNothing();
    }
    // Index reference tokens in the body (parity with the web create path):
    // a capture synced from the desktop app carries the same text, so it has
    // to land the same rows.
    await reconcileEntityReferencesFromText(tx, {
      userId,
      sourceType: "capture",
      sourceId: id,
      text: content,
    });
  });
  // Issue #221: fetch rich link previews for URLs in the capture. Fail-soft.
  scheduleLinkPreviews(userId, content);
  // Auto-derive linked people from the body (parity with the web + JARVIS
  // create paths). Background Haiku match; fail-soft.
  scheduleEntityPeopleDerivation("capture", id, userId, content);
  return Response.json({ id }, { headers: CORS });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) return new Response("Unauthorized", { status: 401, headers: CORS });
  const userId = identity.userId;

  let body: { id?: string; content?: string; hashtagNames?: string[] };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (typeof body.id !== "string") return bad("id required");

  const existing = await db
    .select({ id: captures.id, url: captures.url, urls: captures.urls })
    .from(captures)
    .where(and(eq(captures.id, body.id), eq(captures.userId, userId)))
    .limit(1);
  if (!existing[0]) return bad("Not found");

  await db.transaction(async (tx) => {
    if (typeof body.content === "string" && body.content.trim()) {
      const nextContent = body.content.trim().slice(0, 20000);
      // Re-derive the URL property from the new body, additively.
      const merged = mergeContentUrls(nextContent, {
        url: existing[0]!.url,
        urls: existing[0]!.urls,
      });
      await tx
        .update(captures)
        .set({
          content: nextContent,
          url: merged.url,
          urls: merged.urls,
          updatedAt: new Date(),
        })
        .where(and(eq(captures.id, body.id as string), eq(captures.userId, userId)));
      // Re-index against the text actually stored — the truncated nextContent,
      // not the raw body: a token straddling the 20k cut is no longer a token.
      await reconcileEntityReferencesFromText(tx, {
        userId,
        sourceType: "capture",
        sourceId: body.id as string,
        text: nextContent,
      });
    }
    if (Array.isArray(body.hashtagNames)) {
      await tx
        .delete(capturesHashtags)
        .where(
          and(
            eq(capturesHashtags.captureId, body.id as string),
            eq(capturesHashtags.userId, userId),
          ),
        );
      for (const name of cleanHashtags(body.hashtagNames)) {
        const upserted = await upsertHashtag(userId, name, tx);
        await tx
          .insert(capturesHashtags)
          .values({ captureId: body.id as string, hashtagId: upserted.id, userId })
          .onConflictDoNothing();
      }
    }
  });
  // Issue #221: refresh link previews when the content changed. Fail-soft.
  if (typeof body.content === "string" && body.content.trim()) {
    scheduleLinkPreviews(userId, body.content.trim());
    // Re-derive linked people over the new body. Background; fail-soft.
    scheduleEntityPeopleDerivation("capture", body.id, userId, body.content.trim());
  }
  return Response.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) return new Response("Unauthorized", { status: 401, headers: CORS });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  await db.transaction(async (tx) => {
    // No FK to cascade through; drop both directions by hand (parity with
    // deleteCapture).
    await deleteReferencesForEntity(tx, { userId: identity.userId, type: "capture", id });
    await tx.delete(captures).where(and(eq(captures.id, id), eq(captures.userId, identity.userId)));
  });
  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
