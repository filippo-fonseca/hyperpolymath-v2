# PLAN — wa-bridge-capture

Authoritative basis: `.planning/fable-plan.md` (Fable pre-plan, reviewed against
the live codebase + whatsmeow v0.0.0-20260630180629 module cache — API surfaces
confirmed: `SendResponse{ID, Timestamp}`, `MessageInfo{MessageSource, ID,
PushName, Timestamp}`, `client.Logout(ctx) error`, `types.GroupServer`,
`whatsmeow.ErrNotLoggedIn`, `client.GetGroupInfo(ctx, jid)`).

## Sequence (each row = one atomic commit)

1. **Capture store** — extend `bridge{}` with `msgDB *sql.DB`; open second
   `sql.Open("sqlite", dsn)` handle onto the SAME `whatsapp.db` after `sqlstore.New`
   succeeds; create `chats`/`messages` tables (schema mirrors lharries/whatsapp-mcp
   so `sync.mjs` runs unchanged). Add `upsertChat()` + `storeMessage()` helpers;
   timestamps formatted **once** here as `t.UTC().Format(time.RFC3339)` (lex-sortable
   for `sync.mjs`'s string `>` cursor). Update stale package doc.
2. **Live capture** — register `client.AddEventHandler(b.handleEvent)` before
   either connect branch; switch on `*events.Message`; extract content from
   `Conversation` / `ExtendedTextMessage.Text` (else classify `media_type` from
   image/video/audio/document fields; skip empty rows); upsert chat first (group
   name via `GetGroupInfo` with a per-process cache; DM PushName), then insert
   the message. Log-only on error.
3. **Mirror `/api/send`** — capture `resp` from `SendMessage`; on success
   best-effort `upsertChat` + `storeMessage` with `is_from_me=1`, `sender =
   client.Store.ID.User`; response shape/status codes unchanged.
4. **`POST /api/logout`** — method-gated 405; if `client.Store.ID == nil` reply
   `{"ok":true,"note":"already logged out"}`; else `client.Logout(ctx)` (tolerate
   `ErrNotLoggedIn`), reply `{"ok":true}`, then goroutine sleep 300ms +
   `os.Exit(0)` so the Rust supervisor respawns into the QR branch. Register in
   the existing `mux.HandleFunc` block.
5. **Rebundle sidecar** — `go vet ./... && go build ./...` in
   `tools/whatsapp-bridge`, then `pnpm --dir apps/desktop run build:bridge`; confirm
   `apps/desktop/src-tauri/binaries/whatsapp-bridge-aarch64-apple-darwin` is arm64
   Mach-O with fresh mtime. `go.sum` untouched (no new modules).

## Invariants preserved

- DSN string at main.go:183 (path + pragmas): unchanged.
- `--store` / `--port` defaults, `WA_STORE_DIR` / `WA_PORT` env: unchanged.
- QR branch (`GetQRChannel` before `Connect` when `Store.ID == nil`) + `qr`/`ready`
  stdout events: unchanged.
- `/api/send`, `/api/qr`, `/api/health` request/response shapes + status codes:
  unchanged.

## Notes for report

- Historical backfill: intentionally NOT implemented ("start fresh from now"
  per brief). `*events.HistorySync` explicitly not handled.
- `sync.mjs` still defaults `WHATSAPP_DB_PATH` to
  `~/whatsapp-mcp/whatsapp-bridge/store/messages.db`. Flipping it to
  `app_data_dir/whatsapp/whatsapp.db` is launchd/env config, outside this unit's
  `touched[]`; report will surface the required env flip.
- WAL journal mode deferred (Fable open q #1); adopt only if verification hits
  `database is locked` under the three-actor read/write pattern.
