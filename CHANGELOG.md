# Changelog

All notable changes to Hyperpolymath are recorded here. The newest release
sits at the top.

Dates are ship dates, not authoring dates. The web app has no version number
of its own, so releases are identified by the day they reached production.
The desktop app carries its own `desktop-vX.Y.Z` tags and is noted inline
where a change is desktop-only.

---

## 2026-07-16

The release where Hyperpolymath stopped being a web app with an agent and
became a desktop-native ambient computer. JARVIS moved out of the browser
tab and onto the desktop as a floating HUD you can drive with your hands,
learned to read and send real messages, and the entire web surface was
repainted.

946 commits, 880 files, spanning 2026-07-03 to 2026-07-16.

### Removed and breaking

- **The 3D web `/studio` route is gone.** It was built, evaluated, and
  deliberately stripped in the same cycle: the three.js/R3F amphitheater
  proved to be the wrong container for the idea. Studio now exists only as
  the desktop HUD. Visiting `/studio` on the web will no longer find a page.
- **Widget pinch-pull resize was dropped** from the studio input contract,
  along with the `pull*` gesture phases and the scale axis. Open-hand resize
  and pinch-corner resize later returned as different mechanisms, so the
  capability survives; the old gesture does not.

### Added

**Studio HUD (desktop)**

- A full-window heads-up display that floats widgets over the desktop:
  weather, news, browser, camera, clock, WhatsApp, and a persistent JARVIS
  orb.
- Widgets are draggable, stowable into a drawer, restorable from a catalog,
  and summonable by name. A right-edge hover rail expands into a picker.
- Browser widgets render real sites through a native webview bridge rather
  than an iframe, and popups reopen as managed widgets instead of escaping.
- Throw a widget at a screen edge and it bursts away to dismiss.
- Layouts persist across sessions. A cross-window registry with heartbeats
  syncs ownership so widgets hand off cleanly between windows.
- Ambient detail: constellation background, glass-depth chrome with hover
  lift, a settings widget, and a synthesized sound layer with a mute toggle.

**Hand tracking and gesture control (desktop)**

- Drive the HUD with your hands through the webcam, gated behind a consent
  flow and a persistent kill switch.
- Quick-pinch is the primary click. Palm-close-open is a secondary click
  with aim freeze and velocity hardening. Fist-drag scrolls, open-hand and
  pinch-corner resize, and pinch depth drives camera dolly.
- Gestures synthesize real DOM pointer events, so they drive ordinary UI and
  not just bespoke targets.
- Robustness: a 1-euro filter, pre-pinch cursor anchoring so aim is set
  before onset, release grace for transient blips, and soft reacquire so a
  brief hand-loss mid-pinch keeps the drag alive.
- A thumb-confirm gesture gates outgoing messages: you approve a send with
  your hand.

**Messaging**

- **WhatsApp**: a Go bridge shipped as a bundled sidecar and supervised at
  runtime, with QR pairing in the HUD, a status pill, and reconnect. The
  widget became a two-level client (chat list plus per-chat history) with day
  rows, message clusters, and focus-to-chat after a confirmed send. Chat
  names resolve from macOS Contacts, so a raw JID never surfaces as a name.
- **iMessage**: a new message store, an ingest route, and a launchd worker
  mirroring `chat.db` into the app. SMS fallback and chat-id targeting on
  send.
- **Notifications**: a watcher polls recent incoming messages, collapses
  storms against a watermark, raises a toast near the orb, opens the relevant
  widget, and speaks the message.
- Send safety throughout: contact resolution with alias cross-validation,
  reachability verification before send, and a shared error classifier.

**JARVIS**

- A new `/jarvis` tab consolidating routines, a personality editor (preset,
  formality/verbosity/wit dials, custom instructions), and a startup and
  briefing editor.
- New tools: `read_imessage`, `open_workspace`, and steering for `open_app`
  so it opens a Studio widget when one exists.
- Quick web questions answered via Browserbase, with answers paired to a
  widget.
- Voice-tolerant phrase matching lets routines fire mid-conversation from a
  spoken utterance.
- Conversation memory can be cleared from the HUD, and the prompt cache is
  pre-warmed at boot and on wake.

**Wiki and pages**

- The explorer was rebuilt at Spacedrive fidelity: grid and list views, a
  selection engine with keyboard nav, context menus, an inspector panel,
  rubber-band drag, cross-wiki search with path captions, and drag-to-reorder
  with optimistic moves.
- A journal rail with a today card, a trail of recent days, a calendar
  popover, and persisted collapse state.
- Notion-style link embeds: bookmark cards plus YouTube, tweet, and generic
  embeds.
- Fractional position keys back page and folder ordering.
- Page rename, create, and delete propagate to the wiki home in realtime.

**LifeOS**

- A one-screen command deck: a view toggle plus a fixed two-row bento
  layout, with widgets that shrink to fit via internal scroll caps.
- Dynamic widget resize with a drag handle, dashed projection, snap and
  clamp, backed by a unit grid with dense packing and persistence.

### Changed

**Design system (the "sd register" repaint)**

- Glass and backdrop-blur were retired app-wide in favor of solid plates,
  hairlines, and a single cyan accent.
- **New typography**: Space Grotesk is now the app-wide sans. EB Garamond is
  reserved solely for the logotype.
- Repainted: tasks, captures, calendar, nutrition, habits, training,
  journaling, people, settings, onboarding, the product tour, graph explorer,
  the DEV console, and the full landing page.
- A dimensional icon family replaced flat glyphs, and a `/design` route
  documents the system.
- Light and dark are both first-class: dark primary with a mirrored light
  ladder.
- A synthesized SFX pack with a global mute wires sound to task completion,
  view toggles, drag drops, and capture sends.

**Shell**

- Sidebar overhaul: workspace pill, split MAIN and SYSTEM rails with SYSTEM
  pinned to the footer, a utility strip, and hover-reveal row actions that
  also appear on keyboard focus.
- The collapsed rail reveals the full wordmark on hover.
- The top tab bar became a full-width segmented pill bar.

### Fixed

- **iMessage double-send eliminated**: the request no longer self-confirms,
  with normalized dedupe plus a dispatch latch.
- **iMessage contacts resolve via JXA**, fixing an "app not running" failure.
- **SSRF hardening on link previews**, plus bounds on response body reads.
- **A multi-user leak seam was closed**: `userId` is now threaded through
  studio action emission and filtered at the SSE boundary.
- **Tool-switch latency stalls** fixed via environment-aware DB pool sizing
  and fast reconnect.
- An orphaned WhatsApp bridge squatting on port 8080 is reaped before spawn,
  and ambiguous daemon probes now fail closed.
- SSR safety on the landing hero and demo cards under reduced motion, plus a
  stable DndContext id to kill a wiki hydration mismatch.
- The WhatsApp widget pauses polling when the HUD is hidden.
- An explicit CSP was set on the desktop main window, and `withGlobalTauri`
  was disabled.
- Duplicate migration `0045` was renumbered to `0048`.

### Database

Three additive migrations, all non-destructive:

- `0024_imessage_messages` (iMessage store)
- `0025_jarvis_config` (`jarvis_personality_config`, `jarvis_startup_config`)
- `0031_wiki_position_keys` (fractional ordering for pages and folders)

### Security

- **Row level security was enabled on nine tables that never had it.** They
  were created without RLS while Supabase's default privileges granted `anon`
  SELECT, and the anon key ships in the client bundle, so every row was
  readable by anyone who loaded the site and queried PostgREST directly. The
  affected tables were `whatsapp_messages`, `imessage_messages`,
  `link_previews`, `page_field_definitions`, `page_field_values`,
  `tasks_hashtags`, `agentmail_ingest_events`, `cron_runs`, and
  `kiwi_dev_runs`. The two message tables were empty when this was found, so
  no message content was exposed. They would not have stayed empty: this same
  release ships desktop iMessage and WhatsApp sync, and the first sync would
  have written message bodies into a publicly readable table. Owner-scoped
  tables now carry owner-only policies; internal tables are deny-by-default.

### Fixed (post-ship, same day)

- **A fresh local `supabase start` no longer builds a broken database.**
  Thirteen migrations existed only in `drizzle/` and were never mirrored into
  `supabase/migrations/`, so a from-scratch local database came up missing 12
  tables and 6 columns, and `/lifeos` 500'd on
  `column captures.source_channel does not exist`. Production was never
  affected, since it is fed from `drizzle/`. Verified by rebuilding from
  scratch: 43 tables and 408 columns before, 55 and 526 after, matching the
  known-good schema exactly.
- **`/api/health` no longer reports `supabase: down` on a fresh stack.** No
  migration granted the API roles any DML. The cloud project hides this
  because its default privileges auto-grant new objects; the local stack's
  `postgres` role grants only TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN to
  `anon`, which is why a blanket `GRANT ALL` appeared to do nothing. The
  grants are now explicit, and cover future tables.

### Known issues

- The web test suite has 17 failing files, concentrated in the JARVIS and
  voice suites. These are mock and fixture problems rather than product
  defects, and they predate this release.
- The two migration directories still exist and must be kept in sync by hand:
  a new migration in `drizzle/` has to be mirrored into
  `supabase/migrations/` in the same commit. The drift is also bidirectional,
  since `page_folders` and `folder_projects` live only in
  `supabase/migrations/`. Collapsing the two into a single source is the real
  fix and has not been done.
- `gos_reflections` and `gos_sessions` carry policies granting `anon`
  unrestricted access via `USING (true)`. These tables are not part of
  `schema.ts` and were left alone pending a decision on whether that is
  intentional.
