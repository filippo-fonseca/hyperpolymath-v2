#!/usr/bin/env node
// tools/imessage-sync/sync.mjs
//
// Standalone Node script (NO npm deps) that tails macOS Messages' chat.db and
// POSTs new messages in batches to /api/imessage/ingest. Mirrors the shape and
// runtime discipline of tools/whatsapp-sync/sync.mjs — same env-var contract,
// same cursor-file idiom, same `--once` mode, same loop-swallows-errors habit.
//
// Source of truth: ~/Library/Messages/chat.db (WAL-mode SQLite, TCC-protected).
// The `node` binary this runs under MUST have Full Disk Access — otherwise
// every read comes back `authorization denied` and the worker sits idle.
// See tools/imessage-sync/README.md for the FDA + launchd setup.
//
// chat.db notes baked in below:
//   - message.date is nanoseconds-since-2001-01-01 on modern macOS
//     (magnitude guard falls back to seconds for legacy rows).
//   - message.text is often NULL on modern macOS; the real text lives in
//     the attributedBody blob (serialized NSAttributedString / typedstream).
//     We hex-encode it in SQL and byte-scan it in JS (zero-dep). Emoji /
//     links / mentions may render imperfectly — a lossy-but-legible
//     extraction that never sends blank rows to the ingest route.
//   - associated_message_type != 0 means tapback/edit/etc; skipped in SQL.
//
// Env vars (both required for real runs):
//   JARVIS_APP_URL         Base URL of the Vercel deployment
//   JARVIS_DEVICE_TOKEN    A paired device token (hpd_...) minted from
//                          /settings/desktop.
//
// Optional:
//   IMESSAGE_DB_PATH             Path to chat.db.
//                                Default: ~/Library/Messages/chat.db
//   IMESSAGE_SYNC_CURSOR         Path to persisted cursor file.
//                                Default: ~/.jarvis-imessage-sync.json
//   IMESSAGE_SYNC_INTERVAL_MS    Poll interval in loop mode (default 15000)
//   IMESSAGE_SYNC_BATCH          Max messages per POST (default 200; server caps at 500)
//
// Modes:
//   node sync.mjs           Loop forever, sleeping IMESSAGE_SYNC_INTERVAL_MS
//   node sync.mjs --once    Single pass then exit

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const APP_URL = process.env.JARVIS_APP_URL?.replace(/\/$/, "");
const TOKEN = process.env.JARVIS_DEVICE_TOKEN;
const DB_PATH =
  process.env.IMESSAGE_DB_PATH ?? path.join(os.homedir(), "Library/Messages/chat.db");
const CURSOR_PATH =
  process.env.IMESSAGE_SYNC_CURSOR ?? path.join(os.homedir(), ".jarvis-imessage-sync.json");
const INTERVAL_MS = Number(process.env.IMESSAGE_SYNC_INTERVAL_MS ?? 15_000);
const BATCH = Math.min(Number(process.env.IMESSAGE_SYNC_BATCH ?? 200), 500);

if (!APP_URL || !TOKEN) {
  console.error(
    "[imessage-sync] JARVIS_APP_URL and JARVIS_DEVICE_TOKEN must be set. See tools/imessage-sync/README.md.",
  );
  process.exit(2);
}

// Cursor is the raw message.date INTEGER (ns-since-2001) stored as a string
// so JSON round-trips don't lossily coerce it through a float. We compare in
// SQL as INTEGER, so precision is preserved end-to-end.
async function loadCursor() {
  try {
    const raw = await fs.readFile(CURSOR_PATH, "utf8");
    const j = JSON.parse(raw);
    return typeof j.lastDate === "string" && /^\d+$/.test(j.lastDate) ? j.lastDate : null;
  } catch {
    return null;
  }
}

async function saveCursor(lastDate) {
  const tmp = `${CURSOR_PATH}.tmp`;
  await fs.writeFile(
    tmp,
    JSON.stringify({ lastDate, updatedAt: new Date().toISOString() }),
    "utf8",
  );
  await fs.rename(tmp, CURSOR_PATH);
}

// Pull the next batch of new rows via `sqlite3 -readonly -json`.
//   -readonly: chat.db is owned by Messages.app; opening RO avoids creating
//              -wal/-shm side effects and reduces lock contention.
//   -json:     the same easy-parse shape whatsapp-sync uses.
// `bound` is our own cursor value, sanitized to digits before interpolation.
async function readNewRows(sinceRaw) {
  const raw = sinceRaw && /^\d+$/.test(sinceRaw) ? sinceRaw : "0";
  const bound = raw; // digits-only, safe to interpolate
  const sql = `
SELECT m.guid AS guid,
       CAST(m.date AS TEXT) AS date_raw,
       m.date AS date_num,
       m.is_from_me AS is_from_me,
       m.text AS text,
       CASE WHEN (m.text IS NULL OR m.text = '') THEN hex(m.attributedBody) ELSE NULL END AS attributed_hex,
       h.id AS sender,
       COALESCE(c.guid, c.chat_identifier) AS chat_jid,
       c.display_name AS chat_name
FROM message m
LEFT JOIN handle h ON h.ROWID = m.handle_id
LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN chat c ON c.ROWID = cmj.chat_id
WHERE (m.associated_message_type = 0 OR m.associated_message_type IS NULL)
  AND m.date > ${bound}
ORDER BY m.date ASC
LIMIT ${BATCH};`;
  const { stdout } = await execFileAsync(
    "/usr/bin/sqlite3",
    ["-readonly", "-json", DB_PATH, sql],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const text = stdout.trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("[imessage-sync] failed to parse sqlite3 output", err);
    return [];
  }
}

// Apple epoch → unix seconds → ISO. Magnitude guard covers legacy rows that
// stored seconds instead of nanoseconds (pre-High-Sierra).
function appleDateToIso(dateNum) {
  const n = Number(dateNum);
  if (!Number.isFinite(n) || n <= 0) return null;
  const seconds = n > 1e12 ? n / 1e9 : n; // ns → s, or already s
  const unix = seconds + 978307200; // 2001-01-01 → 1970-01-01
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Extract plaintext from a hex-encoded `attributedBody` typedstream blob.
// The typedstream is a serialized NSAttributedString; the plaintext sits
// after an `NSString` / `NSMutableString` class marker, prefixed with:
//   0x2B ('+'), then a length prefix:
//     single byte n < 0x80 → length = n
//     0x81 → next 2 bytes LE uint16
//     0x82 → next 4 bytes LE uint32
// Then that many UTF-8 bytes = the text.
//
// If the marker layout is different (macOS versions vary), fall back to
// the longest printable-UTF-8 run after the marker as a legibility-only
// heuristic. Returns null when nothing usable is found; the caller drops
// the row rather than sending an empty body.
function extractFromAttributedBody(buf) {
  if (!buf || buf.length === 0) return null;

  const markers = ["NSString", "NSMutableString"];
  let markerEnd = -1;
  for (const m of markers) {
    const idx = buf.indexOf(Buffer.from(m, "ascii"));
    if (idx !== -1) {
      markerEnd = idx + m.length;
      break;
    }
  }
  if (markerEnd === -1) return null;

  // Find the 0x2B ('+') sentinel after the marker.
  const plus = buf.indexOf(0x2b, markerEnd);
  if (plus === -1 || plus + 1 >= buf.length) return null;

  let cursor = plus + 1;
  let len = -1;
  const first = buf[cursor];
  if (first === undefined) return null;
  if (first < 0x80) {
    len = first;
    cursor += 1;
  } else if (first === 0x81 && cursor + 2 < buf.length) {
    len = buf.readUInt16LE(cursor + 1);
    cursor += 3;
  } else if (first === 0x82 && cursor + 4 < buf.length) {
    len = buf.readUInt32LE(cursor + 1);
    cursor += 5;
  }

  if (len > 0 && len < 1_000_000 && cursor + len <= buf.length) {
    const slice = buf.subarray(cursor, cursor + len);
    const text = slice.toString("utf8");
    if (text.trim().length > 0) return text;
  }

  // Fallback: longest printable-UTF-8 run after the marker, min length 2.
  const tail = buf.subarray(markerEnd, Math.min(buf.length, markerEnd + 32_000));
  let best = "";
  let current = "";
  for (const byte of tail) {
    // Accept printable ASCII + common whitespace + high bytes (UTF-8 continuation).
    if ((byte >= 0x20 && byte < 0x7f) || byte === 0x0a || byte === 0x0d || byte >= 0x80) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length > best.length) best = current;
      current = "";
    }
  }
  if (current.length > best.length) best = current;
  best = best.trim();
  if (best.length < 2) return null;
  // Best-effort UTF-8 decode of the run (String.fromCharCode above was byte-wise).
  try {
    // Re-decode via Buffer so multi-byte UTF-8 lands as real codepoints.
    const runStart = tail.indexOf(best.charCodeAt(0));
    if (runStart !== -1) {
      const runBuf = tail.subarray(runStart, runStart + best.length);
      const decoded = runBuf.toString("utf8").trim();
      if (decoded.length >= 2) return decoded;
    }
  } catch {}
  return best;
}

function extractBody(row) {
  if (typeof row.text === "string" && row.text.length > 0) return row.text;
  if (typeof row.attributed_hex === "string" && row.attributed_hex.length > 0) {
    try {
      const buf = Buffer.from(row.attributed_hex, "hex");
      const extracted = extractFromAttributedBody(buf);
      if (extracted && extracted.length > 0) return extracted;
    } catch {
      // Fall through to null; a garbage blob shouldn't crash the worker.
    }
  }
  return null;
}

async function postBatch(messages) {
  const res = await fetch(`${APP_URL}/api/imessage/ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ingest ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function tick() {
  const cursor = await loadCursor();
  const rows = await readNewRows(cursor);
  if (rows.length === 0) return { inserted: 0, cursor };

  // Advance the cursor to the LAST fetched row's date_raw regardless of
  // whether we end up posting it — otherwise a tail of skipped rows
  // (tapbacks-only, empty-body) would wedge the worker forever.
  const lastDateRaw = String(rows[rows.length - 1].date_raw ?? "");

  const messages = [];
  for (const r of rows) {
    const chatJid = r.chat_jid ? String(r.chat_jid) : null;
    if (!chatJid) continue;
    const body = extractBody(r);
    if (!body) continue;
    const sentAt = appleDateToIso(r.date_num ?? r.date_raw);
    if (!sentAt) continue;
    const sender = r.sender ? String(r.sender) : null;
    const chatName =
      typeof r.chat_name === "string" && r.chat_name.length > 0 ? r.chat_name : null;
    messages.push({
      externalId: String(r.guid),
      chatJid,
      chatName,
      sender,
      senderName: chatName ?? sender ?? null,
      fromMe: r.is_from_me === 1 || r.is_from_me === true,
      body,
      sentAt,
    });
  }

  if (messages.length === 0) {
    if (lastDateRaw) await saveCursor(lastDateRaw);
    console.log(
      `[imessage-sync] ${new Date().toISOString()} → 0 postable in ${rows.length} scanned (cursor: ${lastDateRaw})`,
    );
    return { inserted: 0, cursor: lastDateRaw };
  }

  const result = await postBatch(messages);
  if (lastDateRaw) await saveCursor(lastDateRaw);
  console.log(
    `[imessage-sync] ${new Date().toISOString()} → ingested ${result.inserted}/${result.received} (cursor: ${lastDateRaw})`,
  );
  return { inserted: result.inserted, cursor: lastDateRaw };
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(
    `[imessage-sync] starting — db=${DB_PATH} → ${APP_URL}/api/imessage/ingest ${once ? "(once)" : `(loop ${INTERVAL_MS}ms)`}`,
  );

  if (once) {
    await tick();
    return;
  }

  // Simple polling loop. Any per-tick error is logged and swallowed so the
  // worker keeps trying — a transient network or SQLite lock shouldn't kill
  // the daemon. Point out the FDA case explicitly since it's the #1 gotcha.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/authorization denied/i.test(msg)) {
        console.error(
          "[imessage-sync] chat.db read denied — grant Full Disk Access to this `node` binary (System Settings → Privacy & Security → Full Disk Access). See README.",
        );
      } else if (/database is locked/i.test(msg)) {
        console.error("[imessage-sync] chat.db locked (Messages.app busy) — retrying next tick");
      } else {
        console.error("[imessage-sync] tick failed", err);
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[imessage-sync] fatal", err);
  process.exit(1);
});
