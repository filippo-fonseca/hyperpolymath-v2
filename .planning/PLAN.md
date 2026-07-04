# PLAN — wa-sync-launchd

Point the WhatsApp sync worker at the desktop bridge's SQLite store and run it
persistently under launchd + in the local dev stack orchestrator.

The brief in `.planning/bgsd-unit.json` is fully self-contained; this plan is
the small execution checklist for it. Difficulty 0.35, four touched files,
one hard dependency: the bridge-side schema landed on the parent unit
`wa-bridge-capture` (verified `messages(id, chat_jid, sender, content,
timestamp, is_from_me, media_type)` + `chats(jid, name, last_message_time)`
in `tools/whatsapp-bridge/main.go` `captureSchema`).

## Tasks (atomic commits, one per unit of work)

### T1 — sync.mjs: default to the desktop bridge store
- Change `WHATSAPP_DB_PATH` default from
  `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` to
  `~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db`.
- Keep `WHATSAPP_DB_PATH` env override.
- Refresh header docstring + schema comment on `readNewRows` to point at
  `tools/whatsapp-bridge/main.go captureSchema` (not lharries).
- Verify SELECT (`id, chat_jid, sender, content, timestamp, is_from_me` +
  `chats.name`) matches capture schema. **It does — no query change needed.**

### T2 — Add launchd plist
- Path: `tools/whatsapp-sync/com.hyperpolymath.whatsapp-sync.plist`.
- `RunAtLoad` + `KeepAlive` both true.
- `EnvironmentVariables`: `JARVIS_APP_URL` (dev default `http://localhost:3000`),
  `JARVIS_DEVICE_TOKEN` (placeholder `hpd_YOUR_TOKEN`).
- `ProgramArguments`: `/usr/local/bin/node` + absolute path to sync.mjs (with
  a `YOU` placeholder for the home-dir portion; README explains editing it).
- Standard out/err → `/tmp/whatsapp-sync.{out,err}.log` to match the existing
  README template.
- README documents `launchctl load ~/Library/LaunchAgents/…` step.

### T3 — Register in hyperpolymath.mjs SERVICES
- Add a `whatsapp-sync` entry following the existing shape:
  `{ name, color, preflight?, start, keepAlive: true, ready }`.
- **Preflight**: skip cleanly if `JARVIS_DEVICE_TOKEN` unset (warn, return
  `{ skip: true }` — same shape used by `bridge`/`desktop` today). Also skip
  if the desktop store DB doesn't exist yet (first-run scenario — the bridge
  hasn't captured anything).
- **Start**: `spawn("node", ["tools/whatsapp-sync/sync.mjs"], { cwd: REPO_ROOT })`,
  passing `JARVIS_APP_URL` default (`http://localhost:3000`) if unset.
- **Ready**: `waitForLog(proc, /\[whatsapp-sync\] starting/, 15_000)` — the
  worker's first log line comes out synchronously at boot.
- Add `--no-whatsapp-sync` docs + `printUsage` line.

### T4 — README update
- Header: swap "lharries/whatsapp-mcp" callouts for "desktop app's embedded
  whatsapp-bridge (canonical)".
- Add a "Retired" note pointing anyone still on lharries at `WHATSAPP_DB_PATH`
  override for backwards use.
- Update Architecture diagram: bridge = desktop-embedded Go sidecar.
- Update env-var table default for `WHATSAPP_DB_PATH`.
- Update setup steps: remove "clone lharries" / QR pair via CLI; note pairing
  now happens through the desktop app.
- Reference the checked-in `com.hyperpolymath.whatsapp-sync.plist` rather
  than the inline template.

## Verification (Loop-1 verify + T5 code-review will do the rigorous pass)

- `node tools/whatsapp-sync/sync.mjs --once` runs against the desktop DB and
  either ingests rows or exits cleanly on empty. (Runtime verification is a
  Loop-1 concern — this unit is code-only.)
- `pnpm --filter web tsc --noEmit` — but sync.mjs is JS w/ no import graph
  into web, and hyperpolymath.mjs is standalone: no type-check needed.
- `node tools/hyperpolymath/hyperpolymath.mjs --only=whatsapp-sync` should
  skip cleanly when no token is set (proves preflight gate).

## Out of scope
- `/api/whatsapp/ingest` route and `whatsapp_messages` schema — untouched.
- Backfill — Option A (fresh from now).
- Making the standalone lharries bridge continue to work; env override left
  as escape hatch but not exercised.
