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
