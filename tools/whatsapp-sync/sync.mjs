#!/usr/bin/env node
// tools/whatsapp-sync/sync.mjs
//
// Standalone Node script (NO npm deps) that reads new WhatsApp messages out
// of the JARVIS Desktop bridge's SQLite store (app_data_dir/whatsapp/whatsapp.db)
// and POSTs them in batches to /api/whatsapp/ingest. Persists a cursor so
// restarts pick up where they left off.
//
// The desktop bridge (tools/whatsapp-bridge/main.go) writes captured messages
// into `messages` + `chats` tables in the same file whatsmeow uses for its
// session store. The lharries/whatsapp-mcp standalone bridge is retired —
// point WHATSAPP_DB_PATH at it only if you're still running that setup.
//
// SQLite is read via `sqlite3 -json` (shells out to the sqlite3 CLI that
// ships with macOS). No native modules, no build step.
//
// Env vars (both required for real runs):
//   JARVIS_APP_URL         Base URL of the Vercel deployment, e.g.
//                          https://hyperpolymath-v2.vercel.app
//   JARVIS_DEVICE_TOKEN    A paired device token (hpd_...) minted from
//                          /settings/desktop. Same token the Tauri desktop
//                          uses; safe to share OR mint a dedicated one.
//
// Optional:
//   WHATSAPP_DB_PATH       Path to the bridge's messages SQLite file.
//                          Default: ~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db
//   WHATSAPP_SYNC_CURSOR   Path to the persisted cursor file.
//                          Default: ~/.jarvis-whatsapp-sync.json
//   WHATSAPP_SYNC_INTERVAL_MS   Poll interval in loop mode (default 15000)
//   WHATSAPP_SYNC_BATCH    Max messages per POST (default 200; server caps at 500)
//
// Modes:
//   node sync.mjs           Loop forever, sleeping WHATSAPP_SYNC_INTERVAL_MS
//   node sync.mjs --once    Single pass then exit (useful for launchd-triggered runs)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const APP_URL = process.env.JARVIS_APP_URL?.replace(/\/$/, "");
const TOKEN = process.env.JARVIS_DEVICE_TOKEN;
const DB_PATH =
  process.env.WHATSAPP_DB_PATH ??
  path.join(
    os.homedir(),
    "Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db",
  );
const CURSOR_PATH =
  process.env.WHATSAPP_SYNC_CURSOR ?? path.join(os.homedir(), ".jarvis-whatsapp-sync.json");
const INTERVAL_MS = Number(process.env.WHATSAPP_SYNC_INTERVAL_MS ?? 15_000);
const BATCH = Math.min(Number(process.env.WHATSAPP_SYNC_BATCH ?? 200), 500);

if (!APP_URL || !TOKEN) {
  console.error(
    "[whatsapp-sync] JARVIS_APP_URL and JARVIS_DEVICE_TOKEN must be set. See tools/whatsapp-sync/README.md.",
  );
  process.exit(2);
}

async function loadCursor() {
  try {
    const raw = await fs.readFile(CURSOR_PATH, "utf8");
    const j = JSON.parse(raw);
    return typeof j.lastTimestamp === "string" ? j.lastTimestamp : null;
  } catch {
    return null;
  }
}

async function saveCursor(lastTimestamp) {
  const tmp = `${CURSOR_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ lastTimestamp, updatedAt: new Date().toISOString() }), "utf8");
  await fs.rename(tmp, CURSOR_PATH);
}

// Query the bridge's SQLite mirror for messages strictly newer than the cursor.
// Joins in chat_name AND a contact-resolved name so the ingest payload carries
// a human display name — otherwise an individual chat whose `chats.name` is
// empty (the common case) leaks its raw JID into the UI.
//
// Schema (from tools/whatsapp-bridge/main.go `captureSchema` + whatsmeow):
//   messages(id, chat_jid, sender, content, timestamp, is_from_me, media_type)
//   chats(jid, name, last_message_time)
//   whatsmeow_contacts(their_jid, full_name, first_name, push_name, business_name, ...)
// Name priority mirrors the Go bridge's `bestName()` (full_name → first_name →
// push_name → business_name) so read (this) and write (send_whatsapp) agree on
// which name a contact carries. Groups (`@g.us`) have no contacts row, so they
// fall back to the chat subject.
// Timestamps are stored as UTC RFC3339 text, so the string-comparison cursor
// (`m.timestamp > '<bound>'`) sorts chronologically.
async function readNewRows(sinceIso) {
  const bound = sinceIso ?? "1970-01-01T00:00:00Z";
  // COALESCE with NULLIF('') so an empty-string name never shadows a later,
  // populated tier. `chat_contact` resolves the CHAT jid (individual chats);
  // `sender_contact` resolves the SENDER jid (group messages).
  const bestName = (alias) =>
    `COALESCE(NULLIF(${alias}.full_name,''), NULLIF(${alias}.first_name,''), NULLIF(${alias}.push_name,''), NULLIF(${alias}.business_name,''))`;
  const sql = `
SELECT m.id AS id,
       m.chat_jid AS chat_jid,
       c.name AS chat_name,
       ${bestName("cc")} AS chat_contact_name,
       m.sender AS sender,
       ${bestName("sc")} AS sender_contact_name,
       m.content AS content,
       m.timestamp AS timestamp,
       m.is_from_me AS is_from_me
FROM messages m
LEFT JOIN chats c ON c.jid = m.chat_jid
LEFT JOIN whatsmeow_contacts cc ON cc.their_jid = m.chat_jid
LEFT JOIN whatsmeow_contacts sc ON sc.their_jid = m.sender
WHERE m.timestamp > '${bound.replace(/'/g, "''")}'
ORDER BY m.timestamp ASC
LIMIT ${BATCH};`;
  const { stdout } = await execFileAsync("/usr/bin/sqlite3", ["-json", DB_PATH, sql], {
    maxBuffer: 32 * 1024 * 1024,
  });
  const text = stdout.trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("[whatsapp-sync] failed to parse sqlite3 output", err);
    return [];
  }
}

function toIso(ts) {
  // sqlite stores TIMESTAMP as ISO-ish text or a whatsmeow-formatted datetime.
  // Trust anything Date() can parse; otherwise fall back to now to avoid
  // dropping the row (the ingest route validates and rejects unparseables).
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

async function postBatch(messages) {
  const res = await fetch(`${APP_URL}/api/whatsapp/ingest`, {
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

  const messages = rows.map((r) => {
    const clean = (v) => {
      const s = typeof v === "string" ? v.trim() : v;
      return s ? s : null;
    };
    const isGroup = String(r.chat_jid).endsWith("@g.us");
    // chatName: group subject, else the chat contact's resolved name. Never the
    // raw sender/jid — the web route prettifies a number when this is null.
    const chatName = clean(r.chat_name) ?? (isGroup ? null : clean(r.chat_contact_name));
    // senderName: who actually authored THIS message. In an individual chat the
    // sender is the chat peer, so the chat contact name applies; in a group the
    // per-sender contact name is the useful signal.
    const senderName = isGroup
      ? clean(r.sender_contact_name)
      : (clean(r.chat_contact_name) ?? clean(r.chat_name));
    return {
      externalId: String(r.id),
      chatJid: String(r.chat_jid),
      chatName,
      sender: clean(r.sender),
      senderName,
      fromMe: r.is_from_me === 1 || r.is_from_me === true,
      body: r.content ?? null,
      sentAt: toIso(r.timestamp),
    };
  });

  const result = await postBatch(messages);
  const newCursor = rows[rows.length - 1].timestamp;
  await saveCursor(newCursor);
  console.log(
    `[whatsapp-sync] ${new Date().toISOString()} → ingested ${result.inserted}/${result.received} (cursor: ${newCursor})`,
  );
  return { inserted: result.inserted, cursor: newCursor };
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(
    `[whatsapp-sync] starting — db=${DB_PATH} → ${APP_URL}/api/whatsapp/ingest ${once ? "(once)" : `(loop ${INTERVAL_MS}ms)`}`,
  );

  if (once) {
    await tick();
    return;
  }

  // Simple polling loop. Any per-tick error is logged and swallowed so the
  // worker keeps trying — a transient network or SQLite lock shouldn't kill
  // the daemon.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error("[whatsapp-sync] tick failed", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[whatsapp-sync] fatal", err);
  process.exit(1);
});
