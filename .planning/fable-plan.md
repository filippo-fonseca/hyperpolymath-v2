# Fable Plan — wa-bridge-capture

- **Unit:** `wa-bridge-capture` — Re-enable WhatsApp message capture + `/api/logout` in the Go bridge, rebundle sidecar
- **Run:** `sesh-1783185088662`
- **Worktree:** `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-bgsd-wa-bridge-capture`

## Goal & scope

Make the desktop-embedded Go bridge (`tools/whatsapp-bridge/main.go`) the canonical WhatsApp mirror (Option A). Today it is send + QR + health only (main.go:14, handlers at main.go:232-235). This unit adds:

1. Live message capture (incoming AND outgoing) into `messages` + `chats` tables in the SAME sqlite file the whatsmeow session store uses (`<store>/whatsapp.db`, DSN built at main.go:183), with a schema that satisfies the exact SELECT in `tools/whatsapp-sync/sync.mjs:79-91` with zero SQL changes there.
2. `POST /api/logout` that clears the paired device so the QR pairing flow re-fires.
3. Rebuild + rebundle the aarch64-apple-darwin sidecar binary.

Success criteria (from the brief):

- Live capture into `messages(id, chat_jid, sender, content, timestamp, is_from_me, …)` + `chats(jid, name, …)` in `app_data_dir/whatsapp/whatsapp.db`; sync.mjs runs unchanged.
- `POST /api/logout` clears `Store.ID` and the QR stdout/event flow re-fires for re-pairing.
- `/api/send`, `/api/qr`, `/api/health` unchanged; `{"event":"qr"}` / `{"event":"ready"}` stdout events unchanged.
- `go build` clean; `apps/desktop/src-tauri/binaries/whatsapp-bridge-aarch64-apple-darwin` rebuilt from new source.
- No change to store path, port (8080), or send/QR semantics.

## Ground truth read

- `tools/whatsapp-bridge/main.go` (245 lines): single-file bridge. `bridge` struct holds `client` + QR state. QR channel is pulled before `Connect()` only when `client.Store.ID == nil` (main.go:199-223); otherwise it just connects and emits `ready`. Handlers registered at main.go:232-235. Pure-Go `modernc.org/sqlite` driver (registered as `"sqlite"`), so cross-compile stays CGO-free.
- `tools/whatsapp-sync/sync.mjs:77-103`: shells out to `/usr/bin/sqlite3 -json` and runs:
  `SELECT m.id, m.chat_jid, c.name AS chat_name, m.sender, m.content, m.timestamp, m.is_from_me FROM messages m LEFT JOIN chats c ON c.jid = m.chat_jid WHERE m.timestamp > '<cursor>' ORDER BY m.timestamp ASC LIMIT N`.
  Note the cursor comparison is **string comparison on `timestamp`**, and `toIso()` (sync.mjs:105-112) expects `new Date(ts)` to parse it. So `timestamp` must be stored as a lexicographically-sortable, `Date()`-parsable string → **UTC RFC3339 text** (`2026-07-04T18:05:00Z`).
- `apps/desktop/src-tauri/src/whatsapp.rs`: supervisor spawns the sidecar with `--store <app_data>/whatsapp --port 8080`, forwards `qr`/`ready` stdout events, and **respawns the child on `Terminated`** with capped linear backoff (whatsapp.rs:113-134, `MAX_RESTARTS = 8`, counter reset on healthy spawn at whatsapp.rs:92). This gives us a clean logout path: exit the process after logout and the supervisor restarts it; the fresh process sees `Store.ID == nil` and enters the QR branch.
- `apps/desktop/package.json:9`: `"build:bridge": "cd ../../tools/whatsapp-bridge && GOOS=darwin GOARCH=arm64 go build -o ../../apps/desktop/src-tauri/binaries/whatsapp-bridge-aarch64-apple-darwin ."` — the rebundle command already exists.
- `tools/whatsapp-bridge/go.mod`: whatsmeow `v0.0.0-20260630180629-b572e5bcb92b`, protobuf, modernc sqlite already present. **No new module deps needed** (`events` and `database/sql` come from existing modules / stdlib), so `go.sum` should not change.

## Design decisions

1. **Second `*sql.DB` handle into the same `whatsapp.db`, not reuse of the sqlstore container.** `sqlstore.Container` hides its DB behind dbutil; reaching in is version-fragile. Open our own `sql.Open("sqlite", dsn)` with the same DSN string built at main.go:183 (path unchanged → the "no change to store path/DSN" criterion holds; we merely open a second connection to it). `busy_timeout(5000)` is already in the DSN and handles cross-connection locking.
   - *Rejected:* separate `messages.db` file (the lharries layout). The brief explicitly says same store file; sync.mjs takes the path via `WHATSAPP_DB_PATH` anyway.
   - *Optional (flag for Opus):* add `&_pragma=journal_mode(WAL)` on the capture connection so sync.mjs's external `sqlite3` CLI reads never block writers. WAL is a persistent per-file property and is safe with whatsmeow, but it is a behavior change to the shared store file. Default: **skip it**; busy_timeout suffices. Adopt only if lock contention shows up in verification.
2. **Schema mirrors lharries/whatsapp-mcp so sync.mjs needs zero changes:**
   ```sql
   CREATE TABLE IF NOT EXISTS chats (
     jid TEXT PRIMARY KEY,
     name TEXT,
     last_message_time TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS messages (
     id TEXT,
     chat_jid TEXT,
     sender TEXT,
     content TEXT,
     timestamp TIMESTAMP,
     is_from_me BOOLEAN,
     media_type TEXT,
     PRIMARY KEY (id, chat_jid),
     FOREIGN KEY (chat_jid) REFERENCES chats(jid)
   );
   ```
   FK enforcement is ON (DSN pragma `foreign_keys(1)`), so **always upsert the chat row before inserting the message**. Use `INSERT OR REPLACE` for messages (whatsmeow can redeliver; PK makes capture idempotent).
3. **`timestamp` stored as explicit UTC RFC3339 string** via `msg.Info.Timestamp.UTC().Format(time.RFC3339)`. Do NOT pass a raw `time.Time` and trust driver serialization; sync.mjs's string-comparison cursor (`m.timestamp > '<bound>'`) requires a stable, lexicographically sortable text format that `new Date()` parses.
4. **Event handler registered right after `whatsmeow.NewClient` (main.go:196), before either `Connect()` branch**, so no messages are missed in the already-paired path. Handle only `*events.Message`; explicitly do NOT handle `*events.HistorySync` ("start fresh from now" — no backfill, and HistorySync would flood).
5. **Row mapping from `*events.Message`** (lharries/whatsapp-mcp main.go is the reference):
   - `id` = `msg.Info.ID`
   - `chat_jid` = `msg.Info.Chat.String()`
   - `sender` = `msg.Info.Sender.User` (bare user part; sync.mjs treats it as opaque)
   - `content` = first non-empty of `msg.Message.GetConversation()`, `msg.Message.GetExtendedTextMessage().GetText()`; for media-only messages set `content` empty and `media_type` to `"image"|"video"|"audio"|"document"` per which media field is non-nil. Skip rows where both content and media_type are empty (protocol/receipt/reaction noise).
   - `timestamp` = RFC3339 UTC per decision 3
   - `is_from_me` = `msg.Info.IsFromMe` stored as 1/0 (sync.mjs:144 accepts `1` or `true`)
6. **Chat name:** on each captured message, upsert `chats` with `last_message_time` and a best-effort name: for group JIDs (server `g.us`), `client.GetGroupInfo(chat)` `.Name` behind a small in-memory `map[types.JID]string` cache (one network hit per group per process lifetime, tolerate failure → NULL name); for DMs, `msg.Info.PushName` when incoming. Upsert with `ON CONFLICT(jid) DO UPDATE SET name = COALESCE(NULLIF(excluded.name, ''), chats.name), last_message_time = excluded.last_message_time` so a blank name never clobbers a good one. sync.mjs only LEFT JOINs the name, so NULL early on is acceptable.
7. **Outgoing sends via `/api/send` recorded directly in `handleSend`.** `client.SendMessage` does NOT fire `events.Message` on the sending client, so after a successful send (main.go:135-142) insert a row using the returned `whatsmeow.SendResponse` (`resp.ID`, `resp.Timestamp`), `is_from_me = 1`, `sender` = `client.Store.ID.User`, `chat_jid` = resolved JID `.String()`. Recording failure must NOT fail the send response (log only). Messages Filippo sends from his phone arrive as `events.Message` with `IsFromMe = true`, covered by decision 5.
8. **`/api/logout` = logout, respond, exit; the supervisor restarts into the QR flow.** Handler: POST-only (405 otherwise, matching `handleSend` style); if `client.Store.ID == nil` reply `{"ok":true,"note":"already logged out"}` and do nothing else; otherwise call `client.Logout(ctx)` (clears the device row → `Store.ID`), reply `{"ok":true}`, then in a goroutine `time.Sleep(300 * time.Millisecond)` (let the response flush) and `os.Exit(0)`. whatsapp.rs respawns on `Terminated` (~2s backoff); the fresh process hits the `client.Store.ID == nil` branch at main.go:199 and re-fires the exact existing `{"event":"qr"}` stdout flow. Tolerate `whatsmeow.ErrNotLoggedIn` from `Logout` (treat as success) — don't 500 on a race.
   - *Rejected:* in-process re-pair (new device store + new client + new QR channel after logout). whatsmeow requires a fresh client on a fresh device row post-logout; rebuilding client/handler/QR-goroutine in place is strictly more code and more failure modes than the restart path the supervisor already implements and tests.
   - *Note:* exit(0) consumes one restart tick, but the counter resets on each healthy respawn (whatsapp.rs:92), so logouts never exhaust the budget in practice.

## Task breakdown (ordered, atomically committable)

1. **Capture store: schema + writer helpers** — `tools/whatsapp-bridge/main.go`
   - Add `msgDB *sql.DB` to the `bridge` struct (or a small `messageStore` type). In `main()`, after the sqlstore opens (main.go:186-189), `sql.Open("sqlite", dsn)` against the same DSN, `Ping`, and execute the decision-2 DDL; `log.Fatalf` on failure (matching existing style).
   - Add `(b *bridge) upsertChat(jid, name string, ts time.Time)` and `(b *bridge) storeMessage(id, chatJID, sender, content, mediaType string, ts time.Time, fromMe bool)` implementing decisions 2, 3, 6 (chat upsert always before message insert, timestamps formatted once here).
   - New imports: `database/sql` (stdlib). Update the stale package doc comment at main.go:14 ("No message reading/mirroring" is no longer true).
   - Commit: `feat(whatsapp-bridge): add messages/chats capture store in whatsapp.db`
2. **Live capture event handler** — `tools/whatsapp-bridge/main.go`
   - After `b := &bridge{client: client}` (main.go:197), register `client.AddEventHandler(b.handleEvent)` BEFORE either connect branch. `handleEvent(evt interface{})` switches on `*events.Message`, applies the decision-5 mapping (+ decision-6 chat name), and calls the step-1 helpers; log (never fatal) on insert errors. Import `go.mau.fi/whatsmeow/types/events`.
   - Commit: `feat(whatsapp-bridge): capture live incoming/outgoing messages via events.Message`
3. **Mirror outgoing `/api/send` messages** — `tools/whatsapp-bridge/main.go`
   - In `handleSend`, capture `resp, err := b.client.SendMessage(...)` (currently the response is discarded at main.go:135) and on success best-effort `upsertChat` + `storeMessage` per decision 7. No change to request/response shapes or status codes.
   - Commit: `feat(whatsapp-bridge): mirror /api/send messages into the capture store`
4. **`POST /api/logout`** — `tools/whatsapp-bridge/main.go`
   - `handleLogout` per decision 8; register `mux.HandleFunc("/api/logout", b.handleLogout)` in the existing block (main.go:232-235). Import `os` (already imported).
   - Commit: `feat(whatsapp-bridge): add POST /api/logout (exit-and-respawn re-pairing)`
5. **Build + rebundle the sidecar**
   - `cd tools/whatsapp-bridge && go build ./...` (sanity; also `go vet ./...`). Then from `apps/desktop`: `pnpm run build:bridge` (the package.json:9 script). Confirm `file apps/desktop/src-tauri/binaries/whatsapp-bridge-aarch64-apple-darwin` reports arm64 Mach-O with a fresh mtime. `go.sum` should be untouched; only commit it if `go mod tidy` actually changed it.
   - Commit: `build(desktop): rebundle whatsapp-bridge sidecar with capture + logout`

## Sequencing & dependencies

Strictly 1 → 2 → 3 → 4 → 5. Steps 2 and 3 depend on step 1's helpers; step 4 is logically independent but touches the same handler-registration block, so land it after 3 to avoid churn; step 5 must be last (the bundled binary must embody all source changes).

## Risks & edge cases

- **SQLite locking, three actors** (whatsmeow sqlstore conn, capture conn, external `sqlite3` CLI from sync.mjs): `busy_timeout(5000)` is in the DSN for both Go connections. If verification shows contention, the WAL option (decision 1) removes reader/writer blocking; do not enable it preemptively.
- **Timestamp cursor correctness**: RFC3339 UTC text sorts lexicographically == chronologically. Any drift into local-zone or driver-default formats silently breaks sync.mjs's string `>` cursor. Step 1's `storeMessage` is the single formatting choke point — format there and nowhere else.
- **FK violations**: `foreign_keys(1)` is enforced; the chat upsert MUST precede the message insert in both the event handler and `handleSend`.
- **Duplicate deliveries**: `PRIMARY KEY (id, chat_jid)` + `INSERT OR REPLACE` makes capture idempotent.
- **HistorySync flood**: intentionally unhandled (start-fresh). Do not add an `*events.HistorySync` case.
- **Logout races**: already-logged-out → ok-without-exit; `ErrNotLoggedIn` from `Logout` → treat as success. Response must flush before `os.Exit(0)` (the 300ms goroutine delay).
- **GetGroupInfo network call**: only on first message per group (in-memory cache); tolerate failure, name stays NULL, sync's LEFT JOIN is fine.
- **QR/ready semantics**: untouched — the capture handler is additive; `GetQRChannel` continues to be pulled before `Connect` in the unpaired branch; `AddEventHandler` does not interfere with the QR channel.

## Verification hooks (per criterion)

1. **Live capture, sync-compatible schema**: run the built binary (`./whatsapp-bridge --store /tmp/wa-test --port 8091`); tables are created at startup even unpaired, so at minimum run sync.mjs's exact SELECT via `sqlite3 -json /tmp/wa-test/whatsapp.db "SELECT m.id, m.chat_jid, c.name AS chat_name, m.sender, m.content, m.timestamp, m.is_from_me FROM messages m LEFT JOIN chats c ON c.jid = m.chat_jid ORDER BY m.timestamp ASC LIMIT 5;"` — must execute with no missing-column errors. If a paired session is available (real app-data store, desktop app closed), send a message from the phone and confirm a row lands with a `Date()`-parsable timestamp. If only the schema-level check is possible in the build environment, SAY SO in the report — don't claim live capture was observed.
2. **Logout**: `curl -X POST localhost:8091/api/logout` → `{"ok":true}` and the process exits 0; restarting the binary by hand shows `{"event":"qr","code":…}` on stdout (the supervisor-respawn leg needs the desktop app; process-exit + QR-on-restart is the provable core).
3. **Unchanged endpoints**: `curl localhost:8091/api/health` → `{connected, loggedIn}`; `/api/qr` → 204 or the code; diff review confirms `handleSend`'s request/response shapes and all `emitEvent` call sites are untouched.
4. **Build + bundle**: `go build ./...` exits 0; `pnpm run build:bridge` succeeds; `file` shows arm64 Mach-O; `git status` shows the binary modified.
5. **No semantic drift**: diff shows the DSN construction (main.go:183), `--store`/`--port` flags, port default `8080`, and the QR/ready emit paths byte-identical.

## Open questions (flagged, not guessed)

1. **WAL journal mode** (decision 1): recommended default is to skip; adopt only if verification hits `database is locked` despite busy_timeout. Whoever enables it should note it persists in the file.
2. **sync.mjs deployment env**: sync.mjs's default `WHATSAPP_DB_PATH` still points at the old `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` (sync.mjs:41-43). Flipping it to the desktop app-data `whatsapp/whatsapp.db` is launchd/env config, outside this unit's `touched[]`, and sync.mjs itself must NOT be edited (criterion: runs unchanged). The Opus agent should note the required env flip in its final report.
3. **Exact whatsmeow API surfaces at `v0.0.0-20260630180629…`**: verify field/method names in the module cache before writing code — `SendResponse.ID` / `.Timestamp`, `events.Message.Info.{ID,Chat,Sender,IsFromMe,PushName,Timestamp}`, `client.Logout(ctx)` signature, and `types.JID.Server == types.GroupServer` for the group check. These are stable in recent whatsmeow but 30 seconds in `$GOMODCACHE/go.mau.fi/whatsmeow@…` removes the guess.
