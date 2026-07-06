#!/usr/bin/env node
/**
 * Retroactive backfill for the captures multi-URL property (see migration
 * 0028 / 0045).
 *
 * For every existing capture whose body contains link(s), this populates the
 * `urls` set (and seeds the primary `url` when it was unset) using the EXACT
 * same extraction logic the app runs at create/edit time — the functions below
 * are a verbatim port of `apps/web/lib/url.ts` so the backfill can never diverge
 * from runtime derivation. Additive + idempotent: links already recorded are
 * never duplicated, existing entries and a manually-set primary `url` are never
 * touched, and re-running only writes rows that actually gain a link.
 *
 * Follows the repo convention for one-off prod maintenance (CLAUDE.md): the live
 * DATABASE_URL is in the Vercel env, not .env.local. Run it like:
 *
 *   cd apps/web
 *   vercel env pull .env.prod.local            # get the live DATABASE_URL
 *   DATABASE_URL="$(grep '^DATABASE_URL=' .env.prod.local | cut -d= -f2-)" \
 *     node scripts/backfill-capture-urls.mjs --dry-run   # preview
 *   DATABASE_URL=... node scripts/backfill-capture-urls.mjs   # apply
 *
 * The `--dry-run` flag reports what would change without writing.
 */

import postgres from "postgres";

// ---------------------------------------------------------------------------
// URL extraction — kept in sync with apps/web/lib/url.ts (verbatim logic).
// ---------------------------------------------------------------------------

const URL_IN_TEXT_RE = /(\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+)/gi;
const TRAILING_PUNCT_RE = /[.,;:!?'")\]}>]+$/;

function normalizeUrl(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function extractUrlsFromContent(content) {
  if (!content) return [];
  const out = [];
  const seen = new Set();
  for (const match of content.matchAll(URL_IN_TEXT_RE)) {
    const raw = match[0];
    const trailing = TRAILING_PUNCT_RE.exec(raw);
    const display = trailing ? raw.slice(0, raw.length - trailing[0].length) : raw;
    const normalized = normalizeUrl(display);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function mergeContentUrls(content, existing = {}) {
  const merged = [];
  const seen = new Set();
  const push = (candidate) => {
    const normalized = normalizeUrl(candidate ?? "");
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  };
  push(existing.url);
  for (const u of existing.urls ?? []) push(u);
  for (const u of extractUrlsFromContent(content)) push(u);
  const primary = normalizeUrl(existing.url ?? "") ?? merged[0] ?? null;
  return { url: primary, urls: merged };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. See the header comment for how to run this.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1 });
  let scanned = 0;
  let changed = 0;

  try {
    const rows = await sql`
      SELECT id, content, url, urls FROM captures ORDER BY created_at ASC
    `;
    for (const row of rows) {
      scanned++;
      const existingUrls = Array.isArray(row.urls) ? row.urls : [];
      const merged = mergeContentUrls(row.content, { url: row.url, urls: existingUrls });
      const urlChanged = (merged.url ?? null) !== (row.url ?? null);
      const urlsChanged = !arraysEqual(merged.urls, existingUrls);
      if (!urlChanged && !urlsChanged) continue;

      changed++;
      if (dryRun) {
        console.log(
          `[dry-run] ${row.id}: url ${JSON.stringify(row.url)} -> ${JSON.stringify(merged.url)}; ` +
            `urls ${JSON.stringify(existingUrls)} -> ${JSON.stringify(merged.urls)}`,
        );
        continue;
      }
      await sql`
        UPDATE captures
        SET url = ${merged.url}, urls = ${sql.array(merged.urls)}, updated_at = now()
        WHERE id = ${row.id}
      `;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}captures scanned: ${scanned}, ${dryRun ? "would update" : "updated"}: ${changed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
