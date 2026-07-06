# JARVIS integrations: Gmail, News, Weather, WhatsApp

JARVIS ships four data-briefing integrations that run as server-side tools inside
the agent turn: `read_gmail`, `get_news`, `get_weather`, and `read_whatsapp`. A
fifth tool, `send_message`, covers outbound WhatsApp (and iMessage) sends. Each
is a parameterized agent tool — the upcoming routines/triggers system will invoke
these same tools as automation blocks; no separate snippet plumbing is needed.

---

## Gmail

**What it does.** JARVIS can brief you on your inbox, surface unread mail, search
by sender or subject, and filter by date. Trigger it with phrases like "brief me
on my email", "any unread mail?", or "emails from Sam this week". The tool returns
subject, sender, date, and Gmail's own preview snippet for each message (never the
full body), then JARVIS narrates a compact summary in one butler paragraph.

**How it works.** The `read_gmail` tool runs fully server-side using the same
Google OAuth tokens the calendar integration already holds. When you connect
Google in Settings, the consent flow now requests the `gmail.readonly` scope
alongside Calendar and Drive. No separate OAuth step is needed. The executor calls
the Gmail API's `messages.list` (up to 25 messages, default 10) and fetches
metadata + snippet in parallel with `format: "metadata"`. The full message body
is never fetched.

**Setup.**

1. Go to Settings and click "Connect Google" (or "Reconnect Google" if you
   already connected before this scope was added). Because the flow uses
   `prompt=consent`, Google will re-display the permission screen and include
   the Gmail read permission in the grant.

2. The new scope takes effect immediately. Say "brief me on my email" to test.

**GCP Testing-mode caveat.** If your Google Cloud project is in "Testing" status
(not verified / published), Google issues refresh tokens that expire after 7 days.
After expiry, JARVIS will prompt you to reconnect. To fix this permanently,
publish the app in the Google Cloud Console (OAuth consent screen, Audience set to
"Production") or, if the GCP project is a Workspace internal app, switch it to
"Internal" so the 7-day limit does not apply.

---

## News

**What it does.** JARVIS fetches current headlines from The Guardian on demand.
Ask "what's happening in the world?", "any AI news today?", or "brief me on
climate news" and JARVIS narrates a crisp summary of the top stories (title,
section, publication time, trail text). Default is 8 articles; up to 15 can be
returned.

**How it works.** The `get_news` tool runs fully server-side against the Guardian
Open Platform Content API. The API key is resolved per-request: it checks the
user's BYOK "guardian" key first, then falls back to the `GUARDIAN_API_KEY`
environment variable (useful for owner-run deployments). If neither is present,
JARVIS responds with a friendly prompt to add a key.

**Setup.**

1. Get a free developer key from the Guardian Open Platform:
   https://open-platform.theguardian.com/access/

2. In Settings, find the "The Guardian (news)" row under API Keys and paste
   your key.

3. Test with "what's the news today".

Operators (self-hosted deployments) can skip the per-user key step by setting
`GUARDIAN_API_KEY` in the server environment instead.

---

## Weather

**What it does.** JARVIS reports the current temperature, condition, and wind
speed for any location. Ask "weather today", "what's it like outside?", or
"weather in London". JARVIS narrates one crisp butler sentence.

**How it works.** The `get_weather` tool runs fully server-side using Open-Meteo,
which is free and requires no API key. The executor geocodes the requested city
name via Open-Meteo's geocoding API, then fetches current conditions (temperature
at 2m, WMO weather code, wind speed at 10m). If no location is supplied, it falls
back to the `JARVIS_DEFAULT_LOCATION` environment variable, then "Boston" as a
hardcoded default.

**Setup.** Nothing required. Optionally set `JARVIS_DEFAULT_LOCATION` (e.g.
`"New York"`) in your server environment so location-free queries like "what's the
weather?" resolve to the right city automatically.

---

## WhatsApp

**What it does.** JARVIS can read your recent WhatsApp messages and send messages
via WhatsApp. Use it for "brief me on my WhatsApp", "what did Alan say?", "any
unreplied chats?", or "send Rohan a message on WhatsApp".

**How it works (read path).** The `read_whatsapp` tool is fully server-side. It
queries the `whatsapp_messages` Postgres table, which is kept current by a local
sync worker running on your Mac. The sync worker (`tools/whatsapp-sync/sync.mjs`)
reads new rows from the SQLite database maintained by the
[lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) Go bridge, then
POSTs them in batches to `POST /api/whatsapp/ingest` authenticated with a device
bearer token. Once a message lands in Postgres it is immediately available to
JARVIS — no mid-turn desktop round-trip. Messages are grouped by chat and returned
newest-first; if the table is empty, JARVIS narrates a setup hint rather than
returning an error.

**How it works (send path).** Outbound sends use the `send_message` tool with
`app: "whatsapp"`. The server validates the input and returns a structured action
to the desktop app. The desktop dispatcher holds the send until you confirm aloud,
then routes the message through the bridge's `POST http://localhost:8080/api/send`
endpoint. JARVIS always speaks a one-line readback naming the recipient and
quoting the message before the send fires — this confirmation gate is
non-negotiable.

### Full setup runbook

This condenses the runbook in [`tools/whatsapp-sync/README.md`](../tools/whatsapp-sync/README.md),
which is the canonical reference.

**Step 1: Install and pair the bridge.**

```bash
git clone https://github.com/lharries/whatsapp-mcp.git ~/whatsapp-mcp
cd ~/whatsapp-mcp/whatsapp-bridge
go run main.go
```

On first run, a QR code appears. Scan it with your phone under WhatsApp Settings,
Linked Devices. After pairing, the bridge auto-reconnects on restart. It writes
incoming messages to `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` and
listens on port 8080 for outbound sends.

**Step 2: Mint a device token.** In the Hyperpolymath web app, go to
`/settings/desktop` and mint a new device token (or reuse the Tauri desktop's
existing token). Copy the `hpd_...` value — the server stores only its hash.

**Step 3: Apply the migration.** The `whatsapp_messages` table is defined in
`apps/web/drizzle/0022_whatsapp_messages.sql`. Apply it idempotently to the
production Supabase pooler following the repo's migration convention in
`CLAUDE.md` ("Applying migrations to prod").

**Step 4: Test one-shot.**

```bash
export JARVIS_APP_URL="https://your-app.vercel.app"
export JARVIS_DEVICE_TOKEN="hpd_..."
node tools/whatsapp-sync/sync.mjs --once
```

A success line like `[whatsapp-sync] ... ingested 42/42 (cursor: 2026-07-02T...)` confirms the pipeline is working.

**Step 5: Run under launchd.** Keep both the bridge and the sync worker alive as
macOS background services. Create two plists in `~/Library/LaunchAgents/`. The
sync worker plist runs `node tools/whatsapp-sync/sync.mjs` with `JARVIS_APP_URL`
and `JARVIS_DEVICE_TOKEN` set. An equivalent plist keeps `go run main.go` (or a
compiled binary) for the bridge. See the README for the full plist templates, then
load both:

```bash
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-bridge.plist
launchctl load ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-sync.plist
```

**Step 6: Desktop setting.** In the desktop app settings, set `whatsappBridgeUrl`
to `http://127.0.0.1:8080` (or whichever host/port the bridge is listening on) so
the send path resolves correctly.

### Environment variables (sync worker)

| Variable | Required | Default |
|---|---|---|
| `JARVIS_APP_URL` | yes | |
| `JARVIS_DEVICE_TOKEN` | yes | |
| `WHATSAPP_DB_PATH` | no | `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` |
| `WHATSAPP_SYNC_CURSOR` | no | `~/.jarvis-whatsapp-sync.json` |
| `WHATSAPP_SYNC_INTERVAL_MS` | no | `15000` (15 s) |
| `WHATSAPP_SYNC_BATCH` | no | `200` |

### Ban-risk notice

`lharries/whatsapp-mcp` uses the reverse-engineered `whatsmeow` library. Running
it is against WhatsApp's Terms of Service, and Meta has historically banned
accounts for high-volume automated use of the linked-device API. Keep send volume
low, personal, and human-paced. This integration is designed for a personal
life-OS, not bulk automation. WhatsApp also expires linked-device sessions
approximately every 20 days; re-scan the QR code when the bridge loses connection.

---

## Snippets for routines

Each capability above is a parameterized agent tool (one TypeScript function in
`packages/jarvis-core/src/tools/`). The upcoming routines/triggers system will
compose these same tools as automation blocks — for example, a morning briefing
routine could chain `get_weather`, `read_gmail`, `get_news`, and `read_whatsapp`
in sequence. No separate snippet plumbing exists or is planned; routines reuse the
exact same tool implementations.
