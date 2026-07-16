# imessage-sync

Local sync worker that mirrors macOS iMessage rows from `~/Library/Messages/chat.db`
into Hyperpolymath Postgres so the JARVIS `read_imessage` tool + daily briefings
can query them server-side without a mid-turn desktop round-trip. Mirrors the
`tools/whatsapp-sync/` worker one-for-one.

## Architecture

```
  Messages.app  (macOS)
        │
   (native iCloud + SMS/RCS/iMessage sync)
        │
  ~/Library/Messages/chat.db  (SQLite, WAL, TCC-protected)
        │
  sync.mjs  (Node, local, launchd)
   ├── reads new rows via `sqlite3 -readonly -json` (cursor-persisted)
   ├── extracts body text from message.text OR the attributedBody blob
   │   (typedstream byte-scan; zero npm deps)
   ├── skips tapbacks/edits (associated_message_type != 0)
   └── POSTs to <APP_URL>/api/imessage/ingest with Bearer <device token>
                    │
                    ▼
              Postgres: imessage_messages
                    │
                    ▼
              read_imessage tool (server-side, in JARVIS turns)
```

The SEND path (agent → iMessage) already lives in the desktop app's
`send_message` confirm-gate (see `apps/desktop/`). This is the READ path.

## One-time setup

### 1. Grant Full Disk Access to `node` (required)

`chat.db` is under macOS TCC protection. The `node` binary that runs this
worker must be granted **Full Disk Access** in
System Settings → Privacy & Security → Full Disk Access.

```bash
which node
# e.g. /opt/homebrew/bin/node  (Apple Silicon Homebrew)
#      /usr/local/bin/node     (Intel Homebrew)
#      ~/.nvm/versions/node/vXX.YY.ZZ/bin/node  (nvm)
readlink -f "$(which node)"   # resolve symlinks — grant FDA to the real target
```

In the Full Disk Access pane click **+**, cmd-shift-G, paste the resolved
absolute path, add it, and make sure the toggle is on. Without this, every
`sqlite3` shell-out fails with `authorization denied` and the worker logs
that + retries forever.

### 2. Mint a device token

Open the Hyperpolymath web app, go to `/settings/desktop`, and mint a new
device token (or reuse the Tauri desktop's token — it's the same auth
surface). Copy the `hpd_...` value once — the server only stores its hash.

### 3. Apply the migration (once, at merge time)

The `imessage_messages` table lands in `apps/web/drizzle/0024_imessage_messages.sql`
and was authored on this branch's base. Apply it against the prod Supabase
pooler idempotently, per the repo's "Applying migrations to prod" convention
in `CLAUDE.md`.

### 4. Test one-shot

```bash
export JARVIS_APP_URL="https://<your-vercel-app>.vercel.app"
export JARVIS_DEVICE_TOKEN="hpd_..."
node tools/imessage-sync/sync.mjs --once
```

You should see a line like
`[imessage-sync] ... → ingested 42/42 (cursor: 743212345678900000)`.

If it prints `chat.db read denied — grant Full Disk Access …`, jump back to
step 1 — that's the FDA gate.

### 5. Run under launchd

A ready-to-install plist ships in this directory as
`com.hyperpolymath.imessage-sync.plist`. Copy it into `~/Library/LaunchAgents/`
and edit the placeholders inside — your `node` binary path, the absolute
path to `sync.mjs`, `JARVIS_APP_URL`, `JARVIS_DEVICE_TOKEN`, and
`IMESSAGE_DB_PATH`:

```bash
cp tools/imessage-sync/com.hyperpolymath.imessage-sync.plist \
   ~/Library/LaunchAgents/
which node   # grab this path for ProgramArguments[0]
# edit ~/Library/LaunchAgents/com.hyperpolymath.imessage-sync.plist
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.imessage-sync.plist
tail -f /tmp/imessage-sync.out.log
```

`RunAtLoad` + `KeepAlive` mean the daemon boots at login and gets
relaunched by launchd if it exits. `ThrottleInterval` (15s) prevents
relaunch storms while transient locks clear.

### 6. Or run it inline with the dev stack

`tools/hyperpolymath/hyperpolymath.mjs` registers `im-sync` as a service,
so `pnpm hyperpolymath` brings it up alongside the web + desktop stack. It
preflights out cleanly when `JARVIS_DEVICE_TOKEN` isn't set or `chat.db`
doesn't exist, so first-run isn't blocked. Pass `--no-im-sync` to skip it.

## Environment variables

| Var | Required | Default |
|---|---|---|
| `JARVIS_APP_URL` | yes | — |
| `JARVIS_DEVICE_TOKEN` | yes | — |
| `IMESSAGE_DB_PATH` | no | `~/Library/Messages/chat.db` |
| `IMESSAGE_SYNC_CURSOR` | no | `~/.jarvis-imessage-sync.json` |
| `IMESSAGE_SYNC_INTERVAL_MS` | no | `15000` |
| `IMESSAGE_SYNC_BATCH` | no | `200` (server caps at 500) |

## Risk / caveats

- **First run backfills full history.** The cursor starts at 0, so the first
  session ingests every message in `chat.db` in `IMESSAGE_SYNC_BATCH`-sized
  chunks (200 by default, `--once` then loop). Idempotent thanks to
  `onConflictDoNothing` on the ingest side, but for a large history bump
  `IMESSAGE_SYNC_BATCH=500` to catch up faster.
- **`attributedBody` extraction is lossy.** Emoji, links, mentions, and
  rich attachments come through the NSAttributedString typedstream in
  variable-length prefixes. The byte-scan handles common shapes but may
  produce mangled runs for exotic content. Rows with no extractable text
  are **skipped, not sent blank** — the ingest route enforces a body-string
  contract when body is present, but there's nothing worse than pushing
  empty rows into the tool's read surface.
- **Tapbacks / edits are skipped.** `associated_message_type != 0` gets
  filtered in SQL. This is intentional — the `read_imessage` surface wants
  the actual message text, not "Loved" reactions.
- **Locked chat.db.** Messages.app holds WAL locks periodically; the worker
  logs and swallows those per tick and picks up on the next interval.
- **Group chat display names.** `chat.display_name` is often empty for 1:1
  chats; the worker maps `'' → null` so the ingest payload stays clean.

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.hyperpolymath.imessage-sync.plist
rm ~/Library/LaunchAgents/com.hyperpolymath.imessage-sync.plist
rm ~/.jarvis-imessage-sync.json
# Optional: nuke ingested rows
psql "$DATABASE_URL" -c "TRUNCATE imessage_messages;"
```
