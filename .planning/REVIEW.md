# Code review — wa-bridge-capture

Scope: `tools/whatsapp-bridge/main.go` (+87/+19/+32 across tasks 2–4, +73 for
task 1) and the rebundled sidecar binary. `go.sum`/`go.mod` untouched (all new
imports — `database/sql`, `errors`, `go.mau.fi/whatsmeow/types/events` — come
from existing dependencies or stdlib).

## Verdict: PASS

Verified against the unit's five acceptance criteria and the standard defect
classes (correctness, concurrency, security, resource leaks, style).

## Criteria check

1. **Live capture into schema-compatible tables** — Schema exactly matches the
   columns `sync.mjs:79-91` SELECTs (`m.{id,chat_jid,sender,content,timestamp,
   is_from_me}` + `c.name`). Timestamps written UTC RFC3339 in the single choke
   point `storeMessage`; `sync.mjs`'s string `>` cursor sorts chronologically.
   `INSERT OR REPLACE` on `(id, chat_jid)` keeps capture idempotent under
   whatsmeow redelivery. Chat upsert precedes message insert in every path,
   satisfying the enabled FK.
2. **`/api/logout`** — Clears `Store.ID` via `client.Logout(ctx)`; tolerates
   `whatsmeow.ErrNotLoggedIn` race; 300ms goroutine-delayed `os.Exit(0)` lets
   the response flush before the supervisor sees `Terminated` and respawns into
   the QR branch. Smoke-tested unpaired path returns `{ok:true, note:"already
   logged out"}` without exiting.
3. **`/api/send`, `/api/qr`, `/api/health` unchanged** — Request/response shapes,
   status codes, and method gating identical. `{"event":"qr","code":…}` /
   `{"event":"ready"}` stdout paths byte-for-byte identical (`setQR`/`setReady`
   untouched). QR stdout confirmed live in smoke test.
4. **Build + rebundle** — `go vet ./...` + `go build .` green after every
   commit; `apps/desktop/src-tauri/binaries/whatsapp-bridge-aarch64-apple-darwin`
   rebuilt (arm64 Mach-O, ~30.5 MB, new mtime).
5. **No semantic drift** — DSN string, `--store`/`--port` flags, `WA_STORE_DIR`/
   `WA_PORT` env, default port `8080`, and every existing handler body are
   unchanged. Handler registration block extended additively.

## Concurrency review

- `groupNames` map is guarded by `groupMu`; released before the network call to
  `GetGroupInfo` so concurrent lookups for *different* groups don't serialize.
  Simultaneous first-time lookups for the *same* group may issue duplicate
  calls; harmless (idempotent, small blast radius, single-user app).
- `handleSend`'s mirror goroutine uses `context.Background()` — deliberate:
  the request context would already be cancelled once the outer function
  returns, and we don't want that to abort the mirror insert.
- `b.client.Store.ID` is nil-checked in the send-mirror goroutine so a
  concurrent `/api/logout` between the response and the mirror insert can't
  panic.
- Two SQLite connections (whatsmeow's sqlstore + our capture handle) share the
  file via `busy_timeout(5000)`. Fable open-q #1 (WAL) intentionally deferred.

## Security / correctness details

- Every SQL parameter is bound (`?` placeholders); no string interpolation.
- Only bound on `:port` per existing pattern (no interface exposure change).
- `handleLogout` is method-gated (405 otherwise) — matches `handleSend` style
  and blocks `GET /api/logout` from CSRF-lite drive-by.
- Media-only messages are stored with `content=""` and a `media_type`; pure
  protocol messages (empty on both axes) are dropped so the capture table isn't
  flooded with receipts/reactions/system noise.

## Notes / follow-ups (not blockers)

- **`sync.mjs` env flip required at deployment time.** `WHATSAPP_DB_PATH`
  defaults to the old lharries path (`~/whatsapp-mcp/whatsapp-bridge/store/
  messages.db`). Point it at the desktop app-data store, e.g.
  `~/Library/Application Support/com.hyperpolymath.jarvis/whatsapp/whatsapp.db`
  (or wherever Tauri resolves `app_data_dir` for the current bundle id).
  Outside this unit's `touched[]`.
- **WAL journal mode** (Fable open q #1) deferred — enable only if the
  three-actor read/write pattern shows `database is locked` under real load.
- **Group name freshness** — cache lives for the lifetime of the process; a
  rename during a session won't propagate until the sidecar restarts. Fine for
  MVP; downstream sync tolerates stale names via LEFT JOIN.
