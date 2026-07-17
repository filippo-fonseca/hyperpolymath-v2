#!/usr/bin/env node
/**
 * Dormant, one-off backfill for the semantic reference rung (U7).
 *
 * Turning `REFERENCES_SEMANTIC_ENABLED` on only makes NEW writes embed
 * themselves (see lib/references/embedding-enqueue.ts). Everything that already
 * existed when the flag flips has no vector until it is next saved. This script
 * embeds that backlog: for every capture / task / page / project / area / person
 * it normalizes the entity's text exactly the way the runtime does, skips rows
 * whose content_hash already matches (so re-runs are cheap and idempotent), and
 * invokes the same `embed-entity` edge function the write path uses. It writes
 * NOTHING to Postgres itself — the edge function owns the upsert.
 *
 * It ships DORMANT: it is never run by the build agent. Run it by hand ONCE,
 * after the edge function is deployed and the flag is on, following the repo
 * convention for prod maintenance (CLAUDE.md): the live DATABASE_URL and keys
 * live in the Vercel env, not .env.local.
 *
 *   cd apps/web
 *   vercel env pull .env.prod.local
 *   set -a; . ./.env.prod.local; set +a
 *   # DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set
 *   # Node >= 23.6 strips TypeScript types natively (this machine is on 24), so
 *   # plain `node` runs the .ts directly; on 22.6-23.5 add --experimental-strip-types.
 *   node scripts/backfill-embeddings.ts --dry-run          # preview counts
 *   node scripts/backfill-embeddings.ts                    # embed everything
 *   node scripts/backfill-embeddings.ts --type page        # one type only
 *   node scripts/backfill-embeddings.ts --type page --since 2026-01-01T00:00:00Z
 *
 * RESUMABLE. Rows are processed one entity_type at a time, ordered by
 * (updated_at, id) ascending, so a run interrupted partway can be resumed with
 * `--type <t> --since <last-updated_at>` — the script prints that resume hint as
 * it goes and on exit. `--batch` bounds the page size (default 200); `--limit`
 * caps total edge-function invocations for a run.
 *
 * The normalization + hashing below is a verbatim port of
 * lib/references/embedding-content.ts, kept in lockstep the same way
 * backfill-capture-urls.mjs mirrors lib/url.ts — the short-circuit hash here has
 * to agree with the runtime's, byte for byte.
 */

import { createHash } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

// --- verbatim port of lib/references/embedding-content.ts -------------------

const EMBEDDING_INPUT_MAX_CHARS = 2000;

function normalizeEmbeddingInput(
  title: string | null | undefined,
  body: string | null | undefined,
): string {
  const joined = [title, body]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ");
  const collapsed = joined.replace(/\s+/g, " ").trim().toLowerCase();
  return collapsed.slice(0, EMBEDDING_INPUT_MAX_CHARS);
}

function embeddingContentHash(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

// --- per-type source definitions --------------------------------------------

type EntityType = "capture" | "task" | "page" | "project" | "area" | "person";

interface TypeSource {
  type: EntityType;
  table: string;
  /** SQL expression yielding the title part of the embed input (or NULL). */
  titleExpr: string;
  /** SQL expression yielding the body part of the embed input (or NULL). */
  bodyExpr: string;
}

// Order is fixed so a bare run is deterministic and resume hints are stable.
const SOURCES: TypeSource[] = [
  { type: "capture", table: "captures", titleExpr: "NULL", bodyExpr: "content" },
  { type: "task", table: "tasks", titleExpr: "title", bodyExpr: "notes" },
  { type: "page", table: "pages", titleExpr: "title", bodyExpr: "content" },
  { type: "project", table: "projects", titleExpr: "name", bodyExpr: "description" },
  { type: "area", table: "areas", titleExpr: "name", bodyExpr: "NULL" },
  { type: "person", table: "people", titleExpr: "name", bodyExpr: "bio" },
];

interface Args {
  dryRun: boolean;
  type: EntityType | null;
  since: string | null;
  batch: number;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes("--dry-run");
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const typeArg = get("--type");
  if (typeArg && !SOURCES.some((s) => s.type === typeArg)) {
    throw new Error(`--type must be one of ${SOURCES.map((s) => s.type).join(", ")}`);
  }
  return {
    dryRun,
    type: (typeArg as EntityType | null) ?? null,
    since: get("--since"),
    batch: Math.max(1, Number(get("--batch") ?? "200")),
    limit: Number(get("--limit") ?? String(Number.POSITIVE_INFINITY)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. See the header comment for how to run this.");
    process.exit(1);
  }
  if (!args.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke embed-entity (omit them only with --dry-run).",
    );
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1 });
  // Service-role client → JWT role=service_role, which embed-entity requires.
  const supabase =
    args.dryRun || !supabaseUrl || !serviceRoleKey
      ? null
      : createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const sources = args.type ? SOURCES.filter((s) => s.type === args.type) : SOURCES;
  let scanned = 0;
  let embedded = 0;
  let skipped = 0;
  let invocations = 0;

  try {
    for (const src of sources) {
      // Cursor over (updated_at, id) so paging is stable and resumable. `--since`
      // only applies to the first type when a specific --type is given.
      let cursorTs: string | null = args.type ? args.since : null;
      let cursorId: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (invocations >= args.limit) break;

        // entity_embeddings carries the current content_hash (or NULL if absent),
        // so we can short-circuit rows that already match without a round trip.
        const rows = await sql.unsafe(
          `SELECT e.id,
                  e.user_id       AS "userId",
                  ${src.titleExpr} AS title,
                  ${src.bodyExpr}  AS body,
                  e.updated_at    AS "updatedAt",
                  em.content_hash AS "existingHash"
             FROM ${src.table} e
             LEFT JOIN entity_embeddings em
               ON em.entity_type = $1 AND em.entity_id = e.id
            WHERE ($2::timestamptz IS NULL OR e.updated_at > $2::timestamptz
                   OR (e.updated_at = $2::timestamptz AND e.id > $3::uuid))
            ORDER BY e.updated_at ASC, e.id ASC
            LIMIT $4`,
          [src.type, cursorTs, cursorId, args.batch],
        );

        if (rows.length === 0) break;

        for (const row of rows as Array<Record<string, unknown>>) {
          scanned++;
          cursorTs = (row.updatedAt as Date).toISOString();
          cursorId = row.id as string;

          const normalized = normalizeEmbeddingInput(
            row.title as string | null,
            row.body as string | null,
          );
          if (!normalized) {
            skipped++;
            continue;
          }
          const contentHash = embeddingContentHash(normalized);
          if (row.existingHash === contentHash) {
            skipped++;
            continue;
          }

          if (args.dryRun) {
            embedded++;
            continue;
          }

          invocations++;
          const { error } = await supabase!.functions.invoke("embed-entity", {
            body: {
              userId: row.userId as string,
              entityType: src.type,
              entityId: row.id as string,
              content: normalized,
            },
          });
          if (error) {
            console.error(`[backfill] ${src.type} ${row.id as string} failed:`, error.message);
            continue;
          }
          embedded++;
          if (invocations >= args.limit) break;
        }

        // Advance the resume hint each page so an interruption is recoverable.
        console.log(
          `[backfill] ${src.type}: scanned ${scanned}, embedded ${embedded}, skipped ${skipped}` +
            ` — resume with --type ${src.type} --since ${cursorTs}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `${args.dryRun ? "[dry-run] " : ""}done. scanned ${scanned}, ` +
      `${args.dryRun ? "would embed" : "embedded"} ${embedded}, skipped ${skipped}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
