# whatsapp-sync

Local sync worker that mirrors WhatsApp messages from the
[lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) Go bridge
into the Hyperpolymath Postgres so the JARVIS `read_whatsapp` tool + daily
briefings can query them without a mid-turn desktop round-trip.

## Architecture

```
  WhatsApp phone
        │
   (linked device, whatsmeow protocol)
        │
  whatsapp-bridge (Go, local)
   ├── mirrors messages into SQLite at
   │   ~/whatsapp-mcp/whatsapp-bridge/store/messages.db
   └── exposes POST http://localhost:8080/api/send
                                    ▲
                                    │  (SEND path — desktop dispatcher)
                                    │
  sync.mjs (Node, local, launchd)
   ├── reads new rows from SQLite (cursor-persisted)
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

## One-time setup

### 1. Install and pair the bridge

```bash
git clone https://github.com/lharries/whatsapp-mcp.git ~/whatsapp-mcp
cd ~/whatsapp-mcp/whatsapp-bridge
go run main.go
```

The first run prints a QR code — scan it with your WhatsApp phone under
Settings → Linked Devices. After that, the bridge auto-reconnects on
restart. Note WhatsApp forces re-auth roughly every 20 days.

Leave the bridge running; it writes messages to
`~/whatsapp-mcp/whatsapp-bridge/store/messages.db` and listens on port 8080
for sends.

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

Save this as `~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist`
(edit the paths + env vars for your setup):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hyperpolymath.whatsapp-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/Developer/Projects/hyperpolymath-v2/tools/whatsapp-sync/sync.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>JARVIS_APP_URL</key><string>https://YOUR-APP.vercel.app</string>
    <key>JARVIS_DEVICE_TOKEN</key><string>hpd_YOUR_TOKEN</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/whatsapp-sync.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/whatsapp-sync.err.log</string>
</dict>
</plist>
```

Also keep the bridge alive under launchd (equivalent plist, `ProgramArguments`
pointing at `/usr/local/bin/go` + `run` + `main.go` inside
`~/whatsapp-mcp/whatsapp-bridge`, or `go build` the bridge once and point at
the compiled binary — simpler).

Load both:

```bash
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-bridge.plist
```

Tail the logs to confirm:

```bash
tail -f /tmp/whatsapp-sync.out.log
```

## Environment variables

| Var | Required | Default |
|---|---|---|
| `JARVIS_APP_URL` | yes | — |
| `JARVIS_DEVICE_TOKEN` | yes | — |
| `WHATSAPP_DB_PATH` | no | `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` |
| `WHATSAPP_SYNC_CURSOR` | no | `~/.jarvis-whatsapp-sync.json` |
| `WHATSAPP_SYNC_INTERVAL_MS` | no | `15000` |
| `WHATSAPP_SYNC_BATCH` | no | `200` (server caps at 500) |

## Risk / caveats

* `lharries/whatsapp-mcp` is an unofficial community bridge using the
  reverse-engineered `whatsmeow` library. It is not endorsed by Meta and,
  strictly, running it on your account is against WhatsApp ToS. Meta has
  historically banned accounts for high-volume automated use of the linked-
  device API. **Keep send volume low, personal, and human-paced.** This is a
  personal life-OS integration — do not use it to blast marketing or
  automation.
* Roughly every 20 days you'll need to re-pair the bridge (WhatsApp expires
  linked-device sessions). Re-run `go run main.go` and re-scan the QR.
* If your SQLite mirror gets out of sync with the phone, `rm messages.db
  whatsapp.db` inside the bridge's store dir and re-pair.
* The bridge listens on `0.0.0.0:8080` by default — bind it to `127.0.0.1`
  or firewall port 8080 if you're on a shared network.

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
launchctl unload ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-bridge.plist
rm ~/.jarvis-whatsapp-sync.json
# Optional: nuke ingested rows
psql "$DATABASE_URL" -c "TRUNCATE whatsapp_messages;"
```
