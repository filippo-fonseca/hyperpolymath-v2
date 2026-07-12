# VERIFY — L4-B `whatsapp-freshness`

Branch `l4/whatsapp-u`. Owns `apps/desktop/src/studio/widgets/WhatsApp*` and the
web whatsapp route. Did NOT touch gesture/input files, Drawer, or WidgetWindow.

## Which lag source was the real one

Three candidate lag sources were on the table:

1. **Route cache** — `apps/web/app/api/studio/whatsapp/route.ts` is
   `export const dynamic = "force-dynamic"` (no `revalidate`, no `unstable_cache`).
   Live check: `GET ?list=chats` returns **no** `cache-control` / `age` /
   `x-vercel-cache` header. NOT the lag.
2. **Sync worker cadence** — `tools/whatsapp-sync/sync.mjs` polls the bridge
   sqlite every `WHATSAPP_SYNC_INTERVAL_MS` (default **15s**) and POSTs new rows
   to `/api/whatsapp/ingest`. So a just-sent message reaches Postgres up to ~15s
   after it lands in sqlite. A contributor, but bounded at 15s — not the ~60s the
   user saw.
3. **Widget poll — THE REAL LAG.** Both views used `refetchInterval = 60_000`
   with no out-of-band refetch on a send. Even after the worker had copied the
   just-sent message into Postgres, the conversation view didn't refetch until
   the next 60s tick. That is the reported "took ~1 minute to refresh."

**Verdict: the dominant lag was the 60s widget poll, with the 15s sync worker a
secondary contributor.** Fixed both without changing the poll baseline (kept for
background efficiency) or the worker cadence.

## Fix — instant freshness (WhatsAppWidget.tsx)

On a confirmed JARVIS send, the existing send→focus flow already pushes
`focusChatJid` + `focusMessageBody` + `focusAt` (a bumping nonce) into the open
widget's props. That is the freshness hook:

- **Out-of-band refetch.** When a focused send targets the open chat (`focusAt`
  bumps), the Conversation `useEffect` fires
  `queryClient.invalidateQueries({ queryKey: ['studio','whatsapp','chat',jid] })`
  — an immediate refetch, poll-independent.
- **Optimistic pending append.** If the fetched history doesn't yet contain the
  just-sent line (worker not caught up), a `pending: true` bubble is appended
  immediately (dimmed, timestamp reads "sending…"), so the message is visible
  within ~2s of the send. It's reconciled away automatically once a fetched row
  with the same normalized body from-me appears. This makes the 15s worker
  cadence invisible for the just-sent message.
- Mount already fetches immediately (TanStack `useQuery`), and `refetchOnWindowFocus`
  covers back-at-desk; the 60s interval + hidden-pause stays for background.

## Fix — segmentation (whatsapp-conversation.ts, pure + tested)

New dependency-free module `buildConversationRows(messages, now)`:

- **Day separators** ("Today" / "Yesterday" / else "Fri, Jul 11"; year appended
  cross-year) inserted before the first message of each new **local** calendar
  day — yesterday and today no longer run together.
- **Bubble clustering**: consecutive same-sender messages within a 3-min window
  AND the same day cluster tighter (`clusterStart`/`clusterEnd` flags → smaller
  gaps, tail-corner only on the run's last bubble, sender name only on the first).
- Every bubble keeps its own HH:MM.

Rendered by the Conversation view via `DaySeparator` + updated `MessageBubble`
(now takes a `MessageRow`). Unit-tested in `whatsapp-conversation.test.ts` (13
tests) with a fixed `now` and timezone-independent local-time fixtures.

## Verification (exit codes)

- desktop `pnpm typecheck` → **0**
- desktop `pnpm vitest run` → **0** (**17 files, 105 tests** passed; +13 new
  segmentation tests)
- desktop `pnpm vite build` → **0** (WhatsAppWidget chunk built)
- web route not touched → no web typecheck needed.
- Not pushed. No cargo build.

## Live smoke (server :3000, device bearer)

- `GET /api/studio/whatsapp?list=chats` → 200, 12 real chats with resolved names
  (`Bianca Maria`, `Ana Mari Pauly`, …), no cache headers (dynamic confirmed).
- `GET /api/studio/whatsapp?chat=112923296923665@lid` → 200, 50-message history
  spanning **2026-07-09 → 2026-07-12** (multiple calendar days), so the day
  separators + clustering render against real multi-day data.

## Manual UI steps (live stack: web :3000 + desktop + bridge + sync worker)

1. Open the WhatsApp widget → chat list. Open a multi-day chat → day separator
   pills ("Today"/"Yesterday"/dated) sit between day groups; same-sender runs
   hug tighter with one tail bubble.
2. "tell Rohan …" → confirm → widget navigates to Rohan; the just-sent line
   appears immediately as a dimmed "sending…" bubble, then firms up (real HH:MM)
   within a beat as the refetch/sync lands — no 60s wait.
