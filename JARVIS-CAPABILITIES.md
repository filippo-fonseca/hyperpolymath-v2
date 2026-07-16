# What JARVIS Can Do Right Now

JARVIS is the voice/agent layer of Hyperpolymath v2, your personal life-OS. It runs in two places:

- **Web app** (Next.js) — type to JARVIS, browse your data across tabs, author routines and settings.
- **Desktop app** (Tauri, macOS) — hands-free voice, wake word, and computer control. This is the only surface that can actually drive your Mac.

This is the single source of truth for everything JARVIS can do today. Each capability is tagged **[both]**, **[web]**, or **[desktop]** and, where relevant, carries a **Say this to JARVIS →** line so it doubles as a voice cheat-sheet.

JARVIS currently ships **33 agent tools**. It runs an agentic loop (up to 5 passes per turn), so one sentence can read something and then act on it. It streams a spoken "butler" narration and announces desktop actions before it takes them.

---

## Life-OS CRUD — tasks, captures, calendar

The core "one sentence → the right place" loop. All of these work in **[both]** web-text and desktop-voice.

| Tool | What it does | Say this to JARVIS → |
|---|---|---|
| `create_task` | Files an action item, with priority (P∞/P1/P2/P3) and optional due date. No date = Inbox. | "add a task to email the registrar by friday, p1" |
| `create_capture` | Saves a freeform note, verbatim. The default fallback for anything ambiguous. | "capture: idea for the thesis intro about feedback loops" |
| `create_event` | Creates a Google Calendar event (primary calendar by default). | "put lunch with sam on my calendar thursday 1pm" |
| `find_tasks` / `find_captures` / `find_events` | Searches your existing items. | "what tasks are due this week?" / "find my note about the antibiotic paper" |
| `update_task` / `update_capture` / `update_event` | Edits an existing item (reschedule, re-prioritize, rename). | "bump the registrar task to p∞ and move it to monday" |
| `delete_task` / `delete_capture` / `delete_event` | Removes an item. | "delete that lunch event" |

A 5-second universal undo covers these actions.

---

## People (relationship graph) — [both]

| Tool | What it does | Say this to JARVIS → |
|---|---|---|
| `create_person` | Adds someone new to your roster (name required; email/phone/bio/tags optional; tags like friend, professor, investor). | "remember my new labmate priya, she's a colleague" |
| `find_people` | Searches your roster by name. | "who do I have tagged as investors?" |
| `link_people` | Attaches people to a task/capture/page/event/fact you're touching this turn. | "add a task to review the grant and link it to professor harris" |

---

## Memory / personal context

- **`remember_fact`** — **[both]** persists a durable fact about you across every future session: preferences ("be concise"), workflow rules ("default events to my Yale calendar"), or aliases ("Brian = my coworker"). JARVIS also proposes facts when it notices a pattern repeat.
  - **Say this to JARVIS →** "from now on, keep your answers short"
- **Conversation memory** — within a turn, JARVIS threads prior tool results forward (session entities) so it can act on what it just found.
- **Memory management** — **[web]** review, edit, and delete stored facts at `settings/memory`.
- **Personal context graph** — **[web]** the `graph` tab renders a "spider web" of your entities (tasks, captures, people, pages) and their links. The same snapshot is exported to external AI agents over **MCP** (bearer-token endpoint at `/api/mcp/...`; manage tokens at `settings/mcp-tokens`).

---

## Server-side data reads (briefing sources)

These fetch real data and JARVIS narrates it back in one crisp butler paragraph. All **[both]**.

| Tool | Source / auth | Read or write | Say this to JARVIS → |
|---|---|---|---|
| `read_gmail` | Gmail via Google OAuth, `gmail.readonly` scope. Subject/from/date/snippet only, never full bodies. | Read only | "brief me on my inbox — anything from sam today?" |
| `read_whatsapp` | Your recent WhatsApp messages, synced from a local bridge into Postgres. | Read only | "did anyone message me on whatsapp last night?" |
| `get_news` | The Guardian API (your key, or owner env fallback). | Read only | "what's happening in the world? any AI news?" |
| `get_weather` | Open-Meteo, current conditions for your default city or a named place. | Read only | "what's the weather like today?" |

---

## Computer control (desktop only)

These return a desktop action that the Tauri app executes on your Mac. **All [desktop]** — they do nothing in the web app. JARVIS announces each one before acting.

| Tool | What it does | Say this to JARVIS → |
|---|---|---|
| `open_url` | Opens a link in your default browser. | "open the arxiv homepage" |
| `open_app` | Launches a macOS app by name. | "open Spotify" |
| `web_search` | Searches Google, or Google Maps for places/directions. | "search maps for coffee near me" |
| `play_music` | Plays a song/artist/playlist on Apple Music (default) or Spotify, or resumes. | "play some lo-fi on spotify" |
| `system_control` | Sets volume, brightness, Focus mode, or sleeps the Mac. | "set volume to 20 and turn on do not disturb" |
| `type_text` | Types into the focused field (does not press Enter). | "type out my email address" |
| `press_key` | Presses a key or shortcut (Return, Escape, cmd+w). | "hit enter" / "close this tab" |
| `take_screenshot` | Captures the screen; auto-describes what's on it. | "what's on my screen right now?" |
| `send_message` | Sends an iMessage or WhatsApp message. **Destructive — requires a spoken confirmation.** JARVIS reads back recipient + message and holds until you say yes. | "text mom I'll be home by seven" |
| `run_shortcut` | Runs a named macOS Shortcut, optional text input. | "run my 'Start Focus' shortcut" |
| `run_applescript` | Catch-all macOS automation when no named tool fits. | "close all my finder windows" |
| `computer_use` | Last-resort visual driver — screenshots + mouse + keyboard, step by step, for tasks no other tool covers. | "book the cheapest flight to boston on this site" |

`ask_clarification` is an internal tool: instead of guessing, JARVIS can ask you one question with tappable options, then act on your reply.

---

## Routines + triggers

A **routine** is one-or-more **triggers → an ordered list of blocks**. Each block is a JARVIS tool plus an optional natural-language directive that makes it agentic (read then act). You author them in the web app at **`settings/routines`** (with starter templates like "Morning Brief" and "Wind Down"); they fire on the **[desktop]** app.

**Trigger types:**

| Trigger | Fires when | Surface |
|---|---|---|
| **Wake phrase** | You say a phrase like "Daddy's Home". | desktop |
| **When I say** (utterance) | JARVIS hears a phrase mid-conversation and intercepts it server-side. | both (voice) |
| **Daily at** (time) | A set wall-clock time each day. | desktop scheduler |
| **Hotkey** | You press a key combo (e.g. ⌘⇧J) on your paired Mac. | desktop |

**How they run:** blocks execute strictly in order; each block's output threads into the next, so a "brief me" routine can read weather, then news, then email, then WhatsApp in sequence. A block error is isolated — the routine keeps going.

**Synthesize (cohesive-brief) mode:** flip `synthesize` on and JARVIS gathers every block's data silently, then speaks **one** cohesive butler brief under a single utterance (instead of a choppy per-block readout). Ideal for a "Daddy's Home" morning briefing. Leave it off for action routines (e.g. "open Spotify + set Focus") so they keep announce-before-act immediacy.

**Say this to JARVIS →** the wake phrase, hotkey, or utterance you configured. The starter "Morning Brief" template: daily 07:00 → weather → news → Gmail → WhatsApp.

---

## Voice & conversation (desktop)

All **[desktop]**.

- **Wake word** — while idle, an opt-in mic loop listens for **"Daddy's home"** and kicks off a proactive spoken briefing ("Welcome home, sir — one moment.").
- **Utterance triggers** — configured phrases fire routines mid-conversation.
- **Barge-in / override** — you can talk over JARVIS to interrupt or redirect.
- **Butler contract** — JARVIS speaks concisely, announces before acting, and reads back destructive actions (like sends) for confirmation.
- **Guarded-confirm cue** — the orb shows an amber ring while a `send_message` is pending your spoken yes/no.
- **TTS** — spoken output uses **ElevenLabs Flash** (streamed PCM), with the browser's built-in speech synthesis as a fallback if the ElevenLabs call fails.

The web app is text-first; voice, wake, hotkeys, TTS, and all computer control live on the desktop app.

---

## Integrations / MCPs

| Integration | Access | Auth |
|---|---|---|
| **Google Calendar** | Read + write (create/update/delete events) | Google OAuth, full `calendar` scope |
| **Gmail** | **Read only** (metadata + snippet, no bodies, no send) | Google OAuth, `gmail.readonly` scope |
| **Google Drive** | Write (markdown export/backup) | Google OAuth, `drive.file` scope (reconnect Google if you consented before this scope existed) |
| **WhatsApp** | Read (synced local bridge → Postgres) + **send** (via the bundled local bridge) | Local bridge running + QR-paired; ingest at `/api/whatsapp/ingest` |
| **iMessage** | Send (via AppleScript on your Mac) | macOS Messages.app, desktop only |
| **News** | Read (The Guardian) | Your Guardian API key, or owner env fallback |
| **Weather** | Read (Open-Meteo) | None |
| **Personal context (MCP server)** | Exposes your context snapshot to external AI agents | Bearer token (`settings/mcp-tokens`) |

---

## Web app surfaces

The main tabs of the life-OS **[web]**:

- **today** — your daily agenda at a glance
- **tasks** — all tasks, list/tree views, priority + property sorting
- **captures** — freeform notes archive
- **calendar** — Google Calendar events
- **projects** & **areas** — the organizing hierarchy (projects include classes)
- **people** — relationship roster
- **wiki** — markdown pages with entity references
- **graph** — the personal context "spider web"
- **journaling** — daily entries and prompts
- **habits**, **health**, **nutrition**, **training** — tracking surfaces
- **insights** — derived views
- **search** — global search
- **settings** — routines, memory, context snapshot, desktop devices, MCP tokens, nutrition, Google integration, and general config

---

## Known gaps / not yet wired

Verified against the current code on branch `next`:

- **Email is read-only.** `read_gmail` returns metadata + snippet only. There is **no email-send tool** — you cannot ask JARVIS to send or reply to an email. (Google send scope is not requested.)
- **WhatsApp read needs the sync worker running.** `read_whatsapp` reads a table fed by a local bridge/sync worker; if it isn't running/paired, JARVIS narrates a friendly setup hint instead of data.
- **WhatsApp send needs the local bridge paired.** `send_message` to WhatsApp POSTs to the local bridge's `/api/send`; without the bridge running and QR-paired, sends won't go through. iMessage send works via AppleScript on the Mac with no bridge.
- **TTS can 401 / fall back.** ElevenLabs is the primary voice; if the call fails or the key/auth is missing, the desktop returns a 502 and falls back to the browser's built-in speech synthesis. Watch for auth (401/BYOK-key) errors in logs.
- **Computer control is desktop-only.** Every `open_*`, `type_text`, `press_key`, `run_*`, `system_control`, `take_screenshot`, `play_music`, `send_message`, and `computer_use` action does nothing from the web app — it needs the paired desktop client.
- **Routine triggers are deliberately limited to v1 types.** Only wake / utterance / daily-time / hotkey are built. Smart/contextual and event-detection triggers, and non-daily time schedules (specific weekdays, cron), are scaffolded in the types but **not yet implemented**.
- **Some non-strict tools rely on server-side validation.** Many newer tools run in non-strict mode (grammar-size limit), so occasional malformed calls are caught and corrected server-side rather than blocked at generation.
