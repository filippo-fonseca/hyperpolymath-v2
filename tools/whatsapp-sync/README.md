# whatsapp-sync

Local sync worker that mirrors WhatsApp messages from the desktop app's
embedded Go bridge into Hyperpolymath Postgres so the JARVIS `read_whatsapp`
tool + daily briefings can query them without a mid-turn desktop round-trip.

## Architecture

```
  WhatsApp phone
        │
   (linked device, whatsmeow protocol)
        │
  whatsapp-bridge  (Go, tools/whatsapp-bridge/main.go)
   ├── embedded as a Tauri sidecar in the desktop app
   ├── captures every incoming/outgoing message into SQLite at
   │   ~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db
   │   (`messages` + `chats` tables written by captureSchema)
   └── exposes POST http://localhost:8080/api/send
                                    ▲
                                    │  (SEND path — desktop dispatcher)
                                    │
  sync.mjs (Node, local, launchd)
   ├── reads new rows from that SQLite file (cursor-persisted)
   └── POSTs to <APP_URL>/api/whatsapp/ingest with Bearer <device token>
                    │
                    ▼
              Postgres: whatsapp_messages
                    │
                    ▼
              read_whatsapp tool (server-side, in JARVIS turns)
```

The SEND path (agent → WhatsApp) uses the same bridge's `POST /api/send` and
runs through the desktop app's `send_message` confirm-gate. The READ path is
this worker.

> **The standalone `lharries/whatsapp-mcp` bridge is retired.** The desktop
> app's embedded bridge is now canonical — it captures messages into its own
> whatsmeow session DB, so there's only one process to keep alive. If you're
> still on the old lharries setup, point `WHATSAPP_DB_PATH` at
> `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` to keep running it, but
> the schema this worker expects is what `tools/whatsapp-bridge/main.go`
> writes.

## One-time setup

### 1. Pair the desktop bridge

Launch the Hyperpolymath desktop app. On first run the embedded bridge emits
a QR code (surfaced in the desktop UI); scan it under WhatsApp → Settings →
Linked Devices. After that the bridge auto-reconnects on relaunch. WhatsApp
forces re-auth roughly every 20 days — hit the app's WhatsApp settings to
kick a re-pair (POST `/api/logout` on the bridge clears the session).

The desktop app writes the SQLite store at
`~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db`
— sync.mjs defaults to that path, so no configuration is needed once the
bridge has captured its first message.

### 2. Mint a device token

Open the Hyperpolymath web app, go to `/settings/desktop`, and mint a new
device token (or reuse the Tauri desktop's token — it's the same auth
surface). Copy the `hpd_...` value once — the server only stores its hash.

### 3. Apply the migration (once, at merge time)

The `whatsapp_messages` table lands in `apps/web/drizzle/0022_whatsapp_messages.sql`.
Apply it against the prod Supabase pooler idempotently, per the repo's
"Applying migrations to prod" convention in `CLAUDE.md`.

### 4. Test one-shot

```bash
export JARVIS_APP_URL="https://<your-vercel-app>.vercel.app"
export JARVIS_DEVICE_TOKEN="hpd_..."
node tools/whatsapp-sync/sync.mjs --once
```

You should see a line like
`[whatsapp-sync] ... → ingested 42/42 (cursor: 2026-07-02T...)`.

### 5. Run under launchd

A ready-to-install plist ships in this directory as
`com.hyperpolymath.whatsapp-sync.plist`. Copy it into `~/Library/LaunchAgents/`
and edit the two placeholders inside (absolute path to `sync.mjs` in your
checkout, and `JARVIS_DEVICE_TOKEN`; also flip `JARVIS_APP_URL` to your
Vercel URL if you're not pointing at local dev):

```bash
cp tools/whatsapp-sync/com.hyperpolymath.whatsapp-sync.plist \
   ~/Library/LaunchAgents/
# edit ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
tail -f /tmp/whatsapp-sync.out.log
```

`RunAtLoad` + `KeepAlive` mean the daemon boots at login and gets
relaunched by launchd if it exits. `ThrottleInterval` (15s) prevents relaunch
storms while transient network / SQLite locks clear.

The desktop app itself keeps the bridge alive, so there's no separate
"whatsapp-bridge" launchd agent to install anymore — just start the desktop
app on login (System Settings → General → Login Items) and this worker on
top of it.

### 6. Or run it inline with the dev stack

For local development, `tools/hyperpolymath/hyperpolymath.mjs` now registers
`wa-sync` as a service, so `pnpm hyperpolymath` brings it up alongside the
web + desktop stack. It preflights out cleanly when `JARVIS_DEVICE_TOKEN`
isn't set or the capture DB doesn't exist yet, so first-run isn't blocked.
Pass `--no-wa-sync` to skip it.

## Environment variables

| Var | Required | Default |
|---|---|---|
| `JARVIS_APP_URL` | yes | — |
| `JARVIS_DEVICE_TOKEN` | yes | — |
| `WHATSAPP_DB_PATH` | no | `~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db` |
| `WHATSAPP_SYNC_CURSOR` | no | `~/.jarvis-whatsapp-sync.json` |
| `WHATSAPP_SYNC_INTERVAL_MS` | no | `15000` |
| `WHATSAPP_SYNC_BATCH` | no | `200` (server caps at 500) |

## Risk / caveats

* The `whatsmeow` library is a community reverse-engineering of WhatsApp's
  linked-device protocol. It is not endorsed by Meta and, strictly, running
  it on your account is against WhatsApp ToS. Meta has historically banned
  accounts for high-volume automated use of the linked-device API. **Keep
  send volume low, personal, and human-paced.** This is a personal life-OS
  integration — do not use it to blast marketing or automation.
* Roughly every 20 days you'll need to re-pair the bridge (WhatsApp expires
  linked-device sessions). Trigger `POST /api/logout` on the bridge (or use
  the desktop app's WhatsApp settings pane) and re-scan the QR.
* If the SQLite mirror ever drifts from the phone, quit the desktop app,
  `rm ~/Library/Application\ Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db`
  and re-pair. Option A "fresh from now" — there's no historical backfill,
  so the cursor picks up whatever's captured next.
* The bridge listens on `127.0.0.1:8080` by default (same-machine only); the
  desktop app spawns it that way and doesn't expose it externally.

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
rm ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
rm ~/.jarvis-whatsapp-sync.json
# Optional: nuke ingested rows
psql "$DATABASE_URL" -c "TRUNCATE whatsapp_messages;"
```
