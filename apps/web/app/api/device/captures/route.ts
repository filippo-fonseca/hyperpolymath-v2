import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { upsertHashtag } from "@/app/actions/hashtags";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { captures, capturesHashtags } from "@/lib/db/schema";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { scheduleLinkPreviews } from "@/lib/link-preview/schedule";

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
  await db.transaction(async (tx) => {
    await tx.insert(captures).values({
      id,
      userId,
      content,
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
  });
  // Issue #221: fetch rich link previews for URLs in the capture. Fail-soft.
  scheduleLinkPreviews(userId, content);
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
    .select({ id: captures.id })
    .from(captures)
    .where(and(eq(captures.id, body.id), eq(captures.userId, userId)))
    .limit(1);
  if (!existing[0]) return bad("Not found");

  await db.transaction(async (tx) => {
    if (typeof body.content === "string" && body.content.trim()) {
      await tx
        .update(captures)
        .set({ content: body.content.trim().slice(0, 20000), updatedAt: new Date() })
        .where(and(eq(captures.id, body.id as string), eq(captures.userId, userId)));
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
  }
  return Response.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) return new Response("Unauthorized", { status: 401, headers: CORS });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  await db.delete(captures).where(and(eq(captures.id, id), eq(captures.userId, identity.userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
