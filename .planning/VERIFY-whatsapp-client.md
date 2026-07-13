# VERIFY — U5 whatsapp-client-widget

Branch `l3/whatsapp-client` off `bgsd/studio-native` tip `f21b6958`.

## Data-path decision

**Chosen: extend the web route** (`apps/web/app/api/studio/whatsapp/route.ts`)
with `?list=chats` and `?chat=<jid>` modes, reading the synced
`whatsapp_messages` Postgres table via Drizzle.

**Why (not the bridge HTTP API):** the whatsmeow bridge on :8080 exposes only
`/api/health`, `/api/qr`, `/api/send`, `/api/logout`. It has NO chats/messages
endpoint — verified against the live bridge: `GET /api/chats` and
`GET /api/messages` both returned **404** (health returned `loggedIn:true`).
The seed's preferred bridge-direct path therefore doesn't exist, so hitting it
would mean adding Go endpoints to the bridge binary (out of scope, and the
binary isn't built here). The Postgres table is the already-plumbed canonical
source the `read_whatsapp` tool uses, and the widget already fetched this exact
route — so extending it is the least-plumbing path. No desktop sqlite access, no
new bridge endpoint. (Read-only `sqlite3` inspection of the live
`whatsapp.db` was used only to confirm the `chats`/`messages` schema; no real
content, JIDs, or fixtures were committed.)

**Unread signal:** whatsmeow's marked-unread state is not synced into Postgres,
so the chat list uses a v1 heuristic: order by recency, and flag "attention"
(the "unreplied" badge) when the latest message is not from the owner.

## Commits (this unit, newest first)

- `092d548e` test(studio): focus props re-navigate an open singleton widget
- `daeab73b` feat(studio): focus WhatsApp widget to chat after a confirmed send
- `1c686357` feat(studio): WhatsApp widget becomes a two-level client
- `6406e83b` feat(studio): route focus props onto an open singleton widget
- `f5d7e2a1` feat(web): WhatsApp studio route — chat list + per-chat history modes

## Verification (exit codes)

- desktop `pnpm typecheck` → **0** (green)
- desktop `pnpm vitest run` → **0** (8 files, 37 tests passed; includes new
  router focus-props test)
- desktop `pnpm vite build` → **0** (green; WhatsAppWidget chunk built)
- web `pnpm typecheck` → **0** (green; route.ts touched)
- No cargo build (per rules). Not pushed.

## Architecture

- Chat list + history served from `whatsapp_messages` (userId-scoped) — modes
  `?list=chats` (default) and `?chat=<jid>`.
- Widget is two-level: `ChatList` (>=36px chat buttons, unreplied badge,
  previews) ↔ `Conversation` (DOM-native scroll container, me/them bubbles,
  timestamps, >=36px back button). Both reuse the visibility-aware 60s polling
  idiom (pause on hidden, refetch on focus).
- Send→focus: confirm-gate captures the bridge-resolved `jid` on a successful
  WhatsApp send and fires `onWhatsappSendConfirmed`; `bridge.ts` routes it
  through the existing studio-action router as an `open` action with focus
  props. The router pushes focus props onto an already-open whatsapp singleton
  (via new `findWidgetByKind` + `updateWidgetProps`) so it re-navigates; the
  widget opens that chat and cyan-pulses the just-sent bubble (matched by
  normalized body; `focusAt` nonce re-triggers). Send/confirm gate semantics
  untouched.
- `userId` is present on `emitStudioAction` payloads already (unchanged); the
  desktop-local send→focus echo is routed directly (no bus round-trip needed
  for local UI).

## Manual smoke (requires live stack: web :3000 + desktop + bridge :8080 + sync worker)

1. Open the WhatsApp widget → real recent chats list with previews +
   "unreplied" badge count.
2. Click (mouse) a chat → conversation history renders, scrolls; back button
   returns to the list.
3. Drive the same with the synthesized hand pointer: index-click a chat
   (targets >=36px), scroll the history with the scroll pose, index-click back.
4. "tell Rohan …" → confirm ("yes") → widget summons (if closed) / re-navigates
   to Rohan's chat with the sent message visible and briefly cyan-highlighted.
5. Re-focus the same chat via another send → pulse re-plays (focusAt nonce).

---

## Loop-2 fixes — contact names + send receipt (2026-07-11)

Two defects from user screenshots (WhatsApp widget header + JARVIS chat).

### Defect 1 — raw JID instead of contact name

**Name source used:** `whatsmeow_contacts` in the bridge sqlite, resolved with
the SAME priority the Go bridge's `bestName()` uses for send_whatsapp
(full_name → first_name → push_name → business_name). This keeps read (widget)
and write (send) symmetric on which name a contact carries. Groups (`@g.us`)
keep using the `chats.name` subject.

Root cause: the sync worker (`tools/whatsapp-sync/sync.mjs`) only joined
`chats.name` (empty for individual chats like Rohan), so `chatName`/`senderName`
landed null in Postgres and the web route fell through to the raw JID.

Fix, three layers:
- `tools/whatsapp-sync/sync.mjs` — LEFT JOIN `whatsmeow_contacts` on both the
  chat jid and the message sender; emit the resolved best-name.
- `apps/web/app/api/whatsapp/ingest/route.ts` — `onConflictDoNothing` →
  `onConflictDoUpdate` with `COALESCE(excluded.*, existing)` so a re-sync
  backfills names onto rows first ingested with nulls, never wiping a good name.
- `apps/web/app/api/studio/whatsapp/route.ts` — `resolveChatName()` NEVER returns
  a raw JID: synced name → group subject → generic "Group chat" → prettified
  number (`+1 203 606 8566`). Last line of defense even if Postgres has nulls.

**Live (server :3000, device bearer):**
- BEFORE re-sync: `?chat=12036068566@s.whatsapp.net` header = `+1 203 606 8566`
  (prettified number — no raw JID leak, the reported bug is gone regardless of
  sync state).
- AFTER a re-sync pass (worker enriched + ingest upserted): chat list + header
  both show `"Rohan"`; group shows `"Fonseca 👩‍👩‍👧‍👧 Family"`; other contacts
  resolve (`Emir`, `Ana Mari Pauly`, `matski`, …). No `@s.whatsapp.net` string
  anywhere in the JSON.

### Defect 2 — JARVIS didn't know whether a send happened

**Receipt shape:** an assistant-kind `jarvis_turns` row (NO schema migration —
`kind` is free text and `buildRecentHistory` maps `assistant`→assistant message).
`text_delta` =
`[system receipt] WhatsApp message to <name> (<jid>) delivered to transport at <ISO>: "<text>"`
(failure variant says `FAILED to send at <ISO> (not delivered)`).

- New route `POST /api/jarvis/voice/history/receipt` (auth mirrors
  `history/clear`: `validateDesktopBearerIdentity` + `isOwnerUser`; zod-validated
  body). Inserts the receipt row.
- Desktop `apps/desktop/src/api/client.ts::postWhatsappReceipt` +
  `apps/desktop/src/actions/confirm-gate.ts::dispatchAndReport` — fire-and-forget
  POST on BOTH the success path (beside `emitWhatsappSendConfirmed`) and the
  WhatsApp failure path. Never blocks the send.

**Live:** POSTed a synthetic success receipt, then fired an `ask` turn
"did you send the whatsapp to rohan?" via `/api/jarvis/voice/text`. The
persisted assistant reply:
> "It appears so, sir — the system receipt at the top of this conversation
> confirms a WhatsApp message reading "I don't like packing." was delivered to
> Rohan at 2:58 AM UTC."
Grounded truth referencing the receipt — vs the old waffle ("the desktop holds
the send until you confirm aloud… it will have gone through"). Failure-case
receipt also verified to render `FAILED to send … (not delivered)`.

### Verification (exit codes)

- desktop `pnpm typecheck` → **0**
- desktop `pnpm vitest run` → **0** (16 files, **92 tests** passed)
- desktop `pnpm vite build` → **0** (WhatsAppWidget chunk built)
- web `pnpm typecheck` → **0**
- Not pushed. No cargo build.
