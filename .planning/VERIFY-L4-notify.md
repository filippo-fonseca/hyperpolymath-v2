# VERIFY — L4-E `notification-announcer`

Branch `l4/notify-u`. JARVIS watches for new incoming WhatsApp + iMessage
messages and announces them: a toast near the orb, the relevant chat widget
opened, and (when auto-read is on) the message spoken in the butler register.

## Data-source decision (and why)

Both channels read the already-plumbed **web Postgres routes** (synced-source),
not a direct sqlite read. Two reasons:

1. **Disk-constrained build (advisor steer):** the freshest WhatsApp path would
   be the bridge sqlite (`~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db`)
   read from a Rust command. But `rusqlite` is NOT a Cargo dependency
   (`src-tauri/Cargo.toml` has only `serde_json`), so that path means adding a
   crate + a full `cargo build` (~3GB) on a disk with <3GB free — disallowed —
   and it would be unverifiable here. The web routes need zero Rust.
2. **iMessage has no fresh local path anyway:** `~/Library/Messages/chat.db` is
   TCC-protected and the Tauri app lacks Full Disk Access, so the synced
   `imessage_messages` table (filled by `tools/imessage-sync`) is the safe
   source regardless. Using the same synced-source approach for both channels
   keeps the watcher symmetric.

**Freshness / lag:** each channel lags its sync worker's poll interval
(whatsapp-sync + imessage-sync, ~15s default for iMessage). The watcher polls
every ~5s and moves a per-channel watermark forward, so once the sync lands a
message it is announced on the next tick. Sibling unit L4-B improving sync
freshness directly reduces this lag with no change here.

**Chosen READ endpoints:**
- WhatsApp: `GET /api/studio/whatsapp?recent[&since=<iso>]` (new mode added to
  the existing studio route; excludes `fromMe` server-side).
- iMessage: `GET /api/imessage/recent[?since=<iso>]` (new route mirroring
  `/api/imessage/resolve`'s device-bearer + owner auth; excludes `fromMe`).

## Design as built

- **Watcher (pure, tested):** `src/hud/notification-watcher.ts` —
  `selectFresh` applies the per-channel watermark AND a session-start floor
  (`startFloorIso`, set to now on start) so a relaunch never replays history and
  the first poll announces nothing pre-existing. `planAnnouncements` collapses a
  group-spam storm (>3 messages from one chat within 10s) into a single summary,
  else emits per-message; ordered chronologically. `toastLine` / `spokenLine`
  build the compact panel + butler utterance. 15 unit tests.
- **Orchestrator:** `src/hud/notification-announcer.ts` — polls both channels
  every 5s, plans, and per announcement: shows a toast (always, when the master
  toggle is on), opens/focuses the WhatsApp widget via `routeStudioAction`
  (the SAME send-receipt focus path; iMessage has no widget so it is
  toast/speech only), and speaks it when auto-read is on. TTS is **FSM-idle-
  gated** (`getJarvisState() === "idle" && ttsPlayer.getState() !== "playing"`)
  so it never talks over a turn; busy-time announcements defer speech (toast
  still shows immediately) and stale queued speech (>30s) is dropped, not spoken
  late. Barge-in is inherited: the FSM's `ttsPlayer.stop()` on a hotkey press
  silences an in-flight announcement like any TTS.
- **Toast:** `src/hud/notification-toast.ts` + CSS in `index.html`
  (`#notification-toasts` / `.noti-toast`) — a compact glass panel near the orb,
  same near-black / cyan / mono chrome as the background-task chips; lazy
  container, self-timed fade, untrusted content escaped.
- **Settings:** two toggles in the `hud-settings` store + Settings widget:
  `messageNotificationsEnabled` (master, default ON) and
  `messageAutoReadEnabled` (default OFF).
- **Boot:** `startNotificationAnnouncer()` wired beside the other HUD monitors
  in `main.ts`.

Widget open goes ONLY through the studio-action router / summon API — no
Drawer / WidgetWindow / gesture / WhatsApp-widget-internal files touched (owned
by siblings).

## Verification (exit codes)

- web `pnpm --filter web typecheck` → **0** (both new routes)
- desktop `pnpm --filter desktop typecheck` → **0**
- desktop `pnpm --filter desktop exec vitest run` → **0** (17 files,
  **107 tests**; +15 new in notification-watcher.test.ts)
- desktop `pnpm --filter desktop exec vite build` → **0** (green; pre-existing
  index chunk-size note only)
- **No cargo build** — no Rust added (see data-source decision). Nothing to
  verify Rust-side for this unit.
- Not pushed.

## Manual smoke (requires live stack: web :3000 + desktop + bridge :8080 +
whatsapp-sync + imessage-sync workers)

1. With "Message notifications" ON and "Auto-read aloud" OFF: have someone send
   you a WhatsApp → within ~5s a toast appears near the orb
   ("WhatsApp · <Name>: <preview…>") and the WhatsApp widget opens/focuses to
   that chat. No speech.
2. Flip "Auto-read aloud" ON, send another → toast + widget as above AND JARVIS
   speaks "Sir, <Name> on WhatsApp says: …".
3. Send an iMessage (imessage-sync running, FDA granted to its node) → toast
   ("iMessage · <Name>: …") + optional speech; no widget (none exists yet).
4. Relaunch the desktop, then send a message → only the NEW message announces;
   pre-launch history is NOT replayed (start-floor).
5. Storm test: fire 5 rapid messages from one chat within ~10s → ONE summary
   toast/utterance ("5 new messages from <Name>"), not five.
6. Mid-turn defer: start talking to JARVIS (hotkey), and while listening/
   speaking have a message land → the toast shows immediately but speech waits
   until the FSM returns to idle; a message that arrived >30s before idle is not
   spoken late.
7. Own-message check: send a message YOURSELF from the phone → it is NOT
   announced (fromMe excluded server-side).

No camera / live-vision items in this unit.
