// embed-entity — gte-small (384-dim) embeddings for the semantic reference rung.
//
// Runs on the Supabase Edge runtime and uses its BUILT-IN inference
// (`Supabase.ai.Session("gte-small")`) — no external vendor, no API key, no
// model download. Two modes over one endpoint:
//
//   1. WRITE  { userId, entityType, entityId, content }
//        Embed `content`, then upsert one entity_embeddings row keyed on
//        (entity_type, entity_id). `content` is ALREADY normalized by the web
//        side (lib/references/embedding-content.ts); this function does not
//        re-normalize — it hashes exactly what it embeds (sha256 of `content`),
//        so the stored content_hash matches the web side's short-circuit hash
//        by construction. userId comes from the authenticated web server's
//        payload, never from a browser.
//
//   2. QUERY  { query }
//        Embed `query` and return the vector without writing anything — the
//        semantic search action embeds the user's query this way.
//
// AUTH. Deployed with verify_jwt = true (see config.toml), so the gateway
// rejects anything without a valid Supabase JWT. On top of that this function
// asserts the caller's role is `service_role`: only the web server, invoking
// with the service-role key, may write another user's embeddings. An anon or
// authenticated caller is refused even though it cleared the gateway.
//
// This ships dormant: nothing deploys or invokes it until
// REFERENCES_SEMANTIC_ENABLED is turned on. Deploy with:
//   supabase functions deploy embed-entity

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The Edge runtime injects `Supabase` and `Deno`; declare them so this file is
// self-describing (it is excluded from the web tsconfig — different runtime).
declare const Supabase: {
  ai: { Session: new (model: string) => { run: (input: string, opts?: Record<string, unknown>) => Promise<number[]> } };
};

const MODEL = "gte-small";
const EMBED_DIMS = 384;

interface WritePayload {
  userId: string;
  entityType: string;
  entityId: string;
  content: string;
}
interface QueryPayload {
  query: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Decode a JWT payload without verifying — the gateway already verified it. */
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isWrite(body: unknown): body is WritePayload {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as WritePayload).userId === "string" &&
    typeof (body as WritePayload).entityType === "string" &&
    typeof (body as WritePayload).entityId === "string" &&
    typeof (body as WritePayload).content === "string"
  );
}
function isQuery(body: unknown): body is QueryPayload {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as QueryPayload).query === "string"
  );
}

const session = new Supabase.ai.Session(MODEL);

/** Embed with mean pooling + L2 normalization, so cosine distance is well-defined. */
async function embed(input: string): Promise<number[]> {
  const vec = await session.run(input, { mean_pool: true, normalize: true });
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`unexpected embedding shape: ${Array.isArray(vec) ? vec.length : typeof vec}`);
  }
  return vec;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Only the service role may write embeddings on a user's behalf.
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  try {
    if (isWrite(body)) {
      const content = body.content.trim();
      if (!content) return json({ error: "empty content" }, 400);

      const [embedding, contentHash] = await Promise.all([embed(content), sha256Hex(content)]);

      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
      const { error } = await admin
        .from("entity_embeddings")
        .upsert(
          {
            user_id: body.userId,
            entity_type: body.entityType,
            entity_id: body.entityId,
            content_hash: contentHash,
            embedding,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "entity_type,entity_id" },
        );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, contentHash });
    }

    if (isQuery(body)) {
      const query = body.query.trim();
      if (!query) return json({ error: "empty query" }, 400);
      return json({ embedding: await embed(query) });
    }

    return json({ error: "unrecognized payload" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "embed failed" }, 500);
  }
});
