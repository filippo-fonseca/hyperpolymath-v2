# PLAN — JARVIS: Next-Level Personal Assistant

**Prepared for:** a fresh `bgsd` session (implementation). Planning only; no app code was changed.
**Repo / branch:** `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-routines-test` @ `next`
**Author:** Fable pre-planner (strategic).

---

## Executive summary

JARVIS is already a genuinely capable butler: a 34-tool agentic loop, prose-first British personality, a spoken-output contract, persistent facts memory, recent-history threading, a Tauri HUD with a canvas arc-reactor orb, an opt-in "daddy's home" wake probe, and a repeatable-blocks **routine engine** that can gather-then-synthesize a single cohesive brief. The gap between "good" and "Tony Stark" is now four things: **speed** (routines gather blocks strictly sequentially, so "I'm back home" takes >1 minute with no feedback), **presence** (the HUD is functional but doesn't feel *alive and loaded*), **conversational depth** (the prompt underuses the context window: no rich personal dossier, thin memory recall, no proactivity), and **reach** (Gmail is read-only; no Spotify-depth, Slack, Notion, smart home, reminders, or transit — the surfaces a live-in assistant needs).

**Top 5 highest-leverage moves, in order:**
1. **Parallelize routine gathering + stream progress to a HUD loader.** The single biggest felt win. Independent read blocks run concurrently; an instant "One moment, sir" plays; a progress ring fills as each source lands. Turns a 60s dead wait into a ~5–10s narrated gather. **(L, but transformative.)**
2. **Redesign the HUD into a "loaded, alive" Stark console.** Ambient layered background, a richer reactor with per-state depth, a real thinking/gathering loader, routine-progress checklist, polished pairing overlay. **(M.)**
3. **Deepen conversation via a personal dossier + memory recall + proactivity, cache-safe.** A stable "who Filippo is" block inside the 1h cache tier, better fact retrieval, and opt-in proactive nudges. **(M.)**
4. **MCP / integration expansion.** Gmail SEND (trivial — scope + tool), Spotify-depth, Reminders/Shortcuts, Home Assistant (the literal "walk into my room" payoff), Slack, Notion, transit. Each becomes a routine block. **(mixed S–L; prioritized table below.)**
5. **Path to genuinely always-on ambient.** On-device wake (Porcupine/openWakeWord) replacing the server probe, plus continuous-listen with barge-in and privacy controls. **(L; needs a privacy decision.)**

---

## Current-state grounding

**The agent turn** (`apps/web/lib/jarvis/run-turn.ts`): one turn = up to `LOOP_CAP = 5` Anthropic passes, streaming text deltas + tool actions, with a first-pass `toolChoice` that can force a tool. Prompt caching is engineered hard: `packages/jarvis-core/src/prompt-builder.ts` builds a 1h-TTL frozen system prefix (personality + spoken contract + tool rules + user-context + projects + facts) and a 5-min state snapshot appended at the route boundary (`render-user-state.ts`, XML-tagged, byte-deterministic). Two cache-critical files carry grep-gated "no clock reads" invariants.

**Personality / voice** (`packages/jarvis-core/src/personality.ts`): `JARVIS_PERSONALITY` (register, opener variety, calibration examples), `TOOL_USE_RULES` (routing, capture-verbatim, morning-dump, meta-questions, people tools, data-tool narration), `COMPUTER_MODE_ADDENDUM` (Mac control, tool hierarchy, send-message guardrail, preference memory), and the **`SPOKEN_OUTPUT_CONTRACT`** (plain prose, interpret-don't-recite, ≤2-3 sentences/source, one closing question) + `NARRATOR_CONTRACT` for routine synthesis.

**Memory:** `jarvis_facts` (persistent, injected into the cached prompt via `buildFactsBlock`) + `extract-facts.ts` (a fire-and-forget Haiku pass that upserts/deletes durable facts after each turn, including clarification answers). Conversation continuity is `recent-history.ts`: a 15-min / 12-turn recency window from `jarvis_turns` threaded ahead of the current utterance (no session_id).

**Tools (34):** create/find/update/delete for task/capture/event; people (create/find/link); `remember_fact`; `ask_clarification`; computer-control (`open_url`, `open_app`, `web_search`, `play_music` [Apple Music/Spotify], `system_control`, `send_message` [iMessage/WhatsApp], `type_text`, `press_key`, `take_screenshot`, `run_applescript`, `run_shortcut`, `computer_use`); server-side data reads (`read_gmail`, `get_news`, `get_weather`, `read_whatsapp`).

**Google auth** (`apps/web/app/api/gcal/auth/route.ts`): scopes = `calendar` (FULL read+write — `create/update/delete_event` already insert/patch via `googleapis`), `drive.file`, **`gmail.readonly`**. So **Calendar write already exists**; Gmail is read-only by scope, not by architecture.

**Routines** (`packages/jarvis-core/src/routines/*`, `apps/web/lib/jarvis/routine-runner.ts` + `routine-fire.ts`): a routine = triggers (`wake` | `utterance` | `time` | `hotkey`) → ordered `blocks` (each: a tool + open params + optional `nlDirective`). `runRoutine` executes blocks **strictly sequentially**, each a full `runJarvisTurnStream` turn, threading a compact summary forward. `synthesize: true` gathers silently then runs ONE narrator turn (single cohesive brief). Fired over the physical SSE bus (`routine-fire.ts` → `emitJarvisResponse*`), which the desktop consumes in `jarvis-response.ts` (buffers per turnId, sentence-splits into `TtsPlayer`).

**Desktop** (`apps/desktop/`): `index.html` (single HUD: orb header + status line + ack-strip + scrolling transcript + footer invoke button + receipts + settings drawer + WhatsApp QR overlay; locked palette `--bg:#050608`, `--accent:#00d4ff`, mono chrome + EB Garamond transcript). `hud/orb.ts` (canvas arc-reactor: idle/listening/thinking/speaking). `conversation/state-machine.ts` (FSM: half-duplex gate, continue-window, barge-in on press-while-speaking, hard safety caps). `wake/wake-probe.ts` (idle cpal mic loop, ~2.2s server STT probe for "daddy's home" / routine phrases — NOT on-device).

**The measured pain:** the sequential runner is the latency culprit. A "daddy's home" routine of, say, weather + gmail + whatsapp + news + calendar + tasks = 6 blocks × (a full multi-pass agent turn each) run back to back → the >1 minute wait. Even with `synthesize`, gathering is serial; the opener plays but nothing shows progress.

---

## Prioritized roadmap

Ordered by leverage × tractability. Effort: **S** ≈ ½–1 day, **M** ≈ 2–4 days, **L** ≈ 1–2 weeks.

### R1 — Parallel routine gather + progress loader (pain point #1) — **L, highest leverage**

**Problem.** `runRoutine` awaits each block before the next; each block is a full 1–5-pass agent turn. Independent READ blocks (weather, gmail, news, whatsapp, calendar, tasks) have no data dependency yet run one-after-another, so a 6-source home briefing is a minute of silence. The opener exists but there's no visible/audible progress, and `synthesize` already proves the "gather then speak once" model — it's just serial.

**Approach.**
- **Concurrency in the gather phase.** Add a `parallel?: boolean` (or an inferred "all gather blocks are independent reads") mode to `RoutineSpec`. When on (and `synthesize` on), run the gather blocks with `Promise.all` / a small bounded pool (concurrency 4–6) instead of the sequential `for`. Cross-block threading (`summarizeBlockForThread`) only matters when a later block *depends* on an earlier one; for a pure-read briefing it doesn't, so parallel is safe. Keep a **sequential fallback** for action routines and any routine that declares block dependencies (`dependsOn`) so "open Spotify then set focus" still ordered.
  - Each block already isolates errors and streams through its own handlers; parallel just means N in-flight `runJarvisTurnStream` promises. Anthropic prompt caching *helps* here — every parallel block shares the same 1h system prefix, so concurrent calls all hit the cache read.
- **Progress events on the bus.** Add a new bus event type `jarvis-routine-progress` (mirroring `emitJarvisResponse*` in `lib/voice/physical-extension/bus.ts`): `{ runId, phase: "gathering"|"synthesizing"|"done", completed, total, lastSource }`. `routine-fire.ts` emits it from the runner's existing `onBlockStart`/`onBlockDone` handlers. This is additive — no protocol break.
- **Instant acknowledgement is already there** (`onOpener` → "Welcome home, sir — one moment."). Make it fire *before* the first block starts (it does) and ensure the opener's TTS plays immediately (it does, own turnId).
- **HUD loader** (ties to R2): the desktop subscribes to `jarvis-routine-progress` and renders a gather loader — a progress ring around the orb + a live checklist ("weather ✓ · mail ✓ · calendar …"). When phase flips to `synthesizing`, orb → thinking; then the single brief streams and speaks.

**Implementation units (for the bgsd sesh):**
1. `routine-runner.ts`: extract the per-block body into `runBlock(block, ctx, handlers): Promise<BlockRunResult>`; add `runGatherParallel(blocks, ctx, handlers, concurrency)` used when `parallel && synthesize`; keep the sequential path for dependency/action routines.
2. `routines/types.ts` + `schema.ts`: `parallel?: boolean` and optional per-block `dependsOn?: string[]` on `RoutineSpec`/`RoutineBlock`.
3. `bus.ts` + `physical-extender/sse-client.ts` + `sse` route: add `jarvis-routine-progress` event (server emit + desktop listener).
4. `routine-fire.ts`: emit progress from `onBlockStart`/`onBlockDone`, threading `runId`.
5. Desktop `hud/`: `routine-progress.ts` renders the ring + checklist; `main.ts` wires it.
6. Telemetry: log gather wall-clock before/after to prove the win.

**Dependencies:** none blocking. Pairs with R2 for the visible loader.
**Effort:** L (engine change + new bus event + HUD). The single most visceral improvement.

---

### R2 — HUD redesign: "loaded, alive" Stark console (pain point #2) — **M, design-forward**

**Problem.** "It sucks… needs to be much better and just kind of be loaded." Today's HUD is *correct and restrained* (good bones — the three-region grid, custom scrollbar, mono/serif split, orb) but reads as a utility panel, not a living HUD. It lacks depth, ambient life, a real loading state, and routine-progress display.

**Design direction (honoring the locked palette: near-black `#050608`, cyan `#00d4ff` signature, amber for guarded-confirm, mono chrome + EB Garamond transcript).** Reference: Iron-Man/Stark HUD translated through Linear/Vercel discipline — not literal density.

- **Ambient layered background.** Behind everything: a slow-drifting radial + faint concentric HUD rings / reticle, a barely-moving noise/scanline texture, and a subtle vignette. Currently it's a single static radial-gradient. Add 2–3 parallax-free ambient layers at very low opacity so the console reads as *powered on* even at idle. (Steal the `intentionality.io` layered-ambient pattern noted in memory.)
- **Reactor orb, deepened** (`hud/orb.ts`). Keep the canvas orb; add: (a) an inner rotating tick/segment ring at idle (slow, calm), (b) crisper glow bloom with a second additive pass, (c) a distinct **thinking/gathering** visual (the current rotating arc is thin — make it a determinate/indeterminate ring that reads as "working"), (d) subtle chromatic depth (a hint of the accent-hi highlight). Keep it calm; restraint is still the brief.
- **A real loading/thinking state.** Today thinking = orb shimmer + a status word. Add a proper loader affordance: while gathering a routine, the orb wears a **progress ring** (R1's data) and a compact **source checklist** appears under the ack-strip ("· weather · mail · calendar"), each ticking cyan as it lands. While a normal turn thinks, a slim indeterminate sweep. This is the "one moment, sir → clear indicator" the user asked for.
- **Transcript polish.** Turn-in animation (gentle fade+rise, Motion-in-vanilla via CSS), a hairline timeline rail down the left of JARVIS turns, better empty state, and streaming-cursor caret on the in-flight JARVIS line.
- **Routine-progress display.** A dedicated, dismissible card (or the checklist above) that shows the running routine's name + block states, so a multi-block run *feels* like JARVIS marshalling systems, not a hang.
- **Pairing / QR overlay + connection.** The WhatsApp QR overlay is decent; give it the same ambient treatment and a "scanning…/linked ✓" state transition. Make the disconnect banner less alarming and more Stark ("LINK LOST — RECONNECT").
- **General "loaded" feel.** A one-time **boot sequence** on app open (reactor spins up, rings resolve, "JARVIS ONLINE" mono flash → settle to standing-by) so it feels alive from the first frame. Micro-interactions on the invoke button. Respect `prefers-reduced-motion`.

**Implementation units:**
1. `index.html`: ambient background layers (CSS + one canvas or SVG rings), boot-sequence markup/state, transcript timeline rail + streaming caret, routine-progress card, refined banner/overlay copy + states.
2. `hud/orb.ts`: idle tick-ring, deeper glow, determinate progress-ring mode (driven by R1), stronger thinking visual.
3. `hud/boot-sequence.ts` (new): the online-spinup animation, gated once per launch.
4. `hud/routine-progress.ts` (new, shared with R1): checklist + ring binding.
5. Reduced-motion + performance pass (rAF budget; the orb already eases).

**Recommendation:** use the `frontend-design` skill and/or Figma MCP to spike 2–3 directions as throwaway HTML first, pick one with Filippo, then build. This is subjective; sketch before committing.
**Effort:** M (mostly HTML/CSS/canvas; no backend). Pairs tightly with R1's data.

---

### R3 — Conversational depth: personal dossier + recall + proactivity (pain point #3) — **M**

**Problem.** The prompt is lean and cache-optimized but underuses the context window. There's a `USER CONTEXT` block with only the preferred name; facts are a flat list; recent-history is a 15-min window; there's no rich "who Filippo is" dossier, no proactive behavior, limited multi-turn coherence, and no interruption/disfluency naturalness beyond the opener-variety rule.

**Approach (all cache-safe — respect the CACHE-CRITICAL invariants; new stable blocks go in the 1h tier, volatile ones after the breakpoint).**

- **Rich personal dossier block.** Add a `buildDossierBlock(...)` to `prompt-builder.ts`: a stable, hand-curated-plus-derived paragraph set covering who Filippo is, his areas/roles (Yale, Harris Ortho Lab, founder work), standing preferences, people who matter, communication style, and current focus. It sits in the **1h cache tier** (rarely changes), giving JARVIS the context to be genuinely conversational ("How's the marathon prep coming, sir?") rather than transactional. Source it from a new `jarvis_dossier` singleton (editable in web settings) + a periodic Haiku roll-up of high-signal facts. Keep it byte-stable across turns (no clock reads).
- **Better memory recall.** Today all facts dump flat. Add: (a) fact **salience/recency** ordering and light grouping by type in `buildFactsBlock` (already grouped-ish), (b) an optional **retrieval step** for large fact sets (single-user won't need it soon, but design the seam), (c) surface *people* the user talks about into the dossier so pronoun/relationship resolution is instant.
- **Proactivity (opt-in).** A `PROACTIVITY` addendum: when a briefing or idle-return turn runs, JARVIS may surface ONE unprompted, genuinely useful nudge (an overdue P1, a calendar conflict, a capture that's aged into a decision) — never more than one, never nagging, always in-register. Gate it behind a setting; it must earn its interruption. Extend the existing "daddy's home" briefing mode with this.
- **Multi-turn coherence.** Move `recent-history` from a blunt 15-min window toward a soft **session** notion: extend the window when turns are close together (rolling), cap tokens, and mark the current utterance clearly. Consider persisting a lightweight per-session id so a long conversation doesn't drop context at minute 16.
- **Naturalness / disfluency / interruption.** Extend the spoken contract with: sparing natural connective tissue ("Right —", "Let's see…") *only* where it reads human, never filler; graceful mid-thought handling when the user barges in (the FSM already supports barge-in — the prompt should acknowledge being cut off naturally on the *next* turn: "You were saying, sir?"). Keep the ≤2-3 sentence discipline.
- **Cache hygiene.** Log `cache_read_input_tokens` per turn to confirm the dossier doesn't tank the hit rate; keep every new static block above the breakpoint and every volatile one below it (the codebase already models this precisely).

**Implementation units:**
1. `prompt-builder.ts`: `buildDossierBlock`, wire into `buildSystemPrompt` in the 1h tier; keep cache-critical invariants.
2. `jarvis_dossier` table + migration (idempotent, per the migration rules) + web settings editor.
3. `personality.ts`: `PROACTIVITY` addendum + naturalness/interruption additions to the spoken/tool-use contracts.
4. `recent-history.ts`: rolling-window / soft-session upgrade + optional session id on `jarvis_turns`.
5. `extract-facts.ts`: feed a periodic dossier roll-up; salience ordering in `buildFactsBlock`.
6. Add cache-hit telemetry to the route.

**Dependencies:** independent of R1/R2. Touches cache-critical files — respect the grep gate.
**Effort:** M.

---

### R4 — MCP / integration expansion (pain point #4, the headline) — **mixed S–L**

**Architecture principle.** JARVIS already has a clean tool abstraction (`packages/jarvis-core/src/tools/*` → executed in `run-turn.ts`/`executor.ts`, or returned as a `DesktopAction` for local ops). Two integration patterns fit:
- **Server-side tools** (like `read_gmail`, `get_news`): the tool runs fully in the web app, data lands in the receipt. Best for cloud APIs with OAuth/token you already hold or can add (Gmail send, Spotify Web API, Notion, Slack, transit).
- **Local desktop bridges** (like `send_message`, `run_shortcut`, WhatsApp's whatsmeow sidecar): the tool returns a `DesktopAction` the Tauri app executes locally. Best for macOS/Apple-ecosystem (Reminders, Shortcuts, Home/HomeKit via Shortcuts, contacts).

Every new tool **automatically becomes a routine block** (blocks are just `{tool, params, nlDirective}`), so each integration slots into the repeatable-blocks system for free — e.g. a "Focus" routine block that sets a Spotify playlist + Home Assistant lights + a Slack status. Prefer **direct tools over generic MCP client** for the highest-value few (tighter grammar, no extra hop); consider a **Composio-style aggregator MCP** only for the long tail (250+ apps) once the core is in.

**Prioritized MCP / integration table** (leverage for a live-in, single-user assistant):

| # | Integration | Value for Filippo | R/W | Auth model | Pattern | Becomes a block? | Effort |
|---|---|---|---|---|---|---|---|
| 1 | **Gmail SEND** | Close the read-only gap; "reply to Sam yes", "email the lab I'll be late" | W | Add `gmail.send` scope to existing Google OAuth | Server tool `send_email` (draft+confirm, mirror send_message guardrail) | Yes (draft/notify block) | **S** |
| 2 | **Spotify depth** | `play_music` exists (playback). Add search/queue/playlist/device-transfer/now-playing so "put on my focus playlist in the studio" works | R/W | Spotify Web API OAuth (new) | Server tool(s) `spotify_*`; or deepen `play_music` | Yes (ambient/focus routines) | **M** |
| 3 | **Apple Reminders / Shortcuts** | Native reminders + trigger any Shortcut (huge — Shortcuts is the bridge to HomeKit, Focus modes, Music, etc.) | R/W | Local (AppleScript / `x-callback` / Shortcuts CLI) | Desktop bridge (`run_shortcut` exists — add `create_reminder`, `list_shortcuts`) | Yes | **S–M** |
| 4 | **Home Assistant / HomeKit** | The literal "walk into my room" payoff — lights, temp, scenes on wake | R/W | Home Assistant long-lived token (LAN) **or** HomeKit-via-Shortcuts | HA: server or local tool `home_control`; HomeKit: via `run_shortcut` | **Yes — the marquee routine block** | **M–L** |
| 5 | **Slack** | Read DMs/mentions for briefings; send/set-status/set-DND for focus | R/W | Slack OAuth (bot/user token) | Server tools `slack_read`, `slack_send`, `slack_status` | Yes (briefing + focus) | **M** |
| 6 | **Notion** | Read/search + create pages; sync captures/notes both ways | R/W | Notion OAuth | Server tools `notion_search`, `notion_create` | Yes | **M** |
| 7 | **Maps / Transit / directions** | `web_search engine:maps` exists; add live transit/ETA/commute for "when do I leave for the lab?" | R | Google Maps/Directions API key | Server tool `get_directions`/`get_commute` | Yes (morning routine) | **S–M** |
| 8 | **Contacts** | Resolve "text Rohan" without disambiguation; enrich People | R | Local (macOS Contacts via AppleScript/Shortcut) | Desktop bridge `find_contact` | Yes | **S** |
| 9 | **Computer-use deepening** | `computer_use` catch-all exists; add reliability, more named fast-paths before the catch-all | R/W | Existing | Existing + new named tools | Yes | **M** (ongoing) |
| 10 | **Health (Apple Health)** | "How'd I sleep?", steps, workout for the fitness area | R | Local (Shortcuts export / HealthKit bridge) | Desktop bridge `read_health` | Yes (morning brief) | **M–L** |
| 11 | **Finances** | Balances/spend for a money briefing | R | Plaid or read-only export | Server tool | Yes | **L** (defer) |
| 12 | **Long-tail via Composio/aggregator MCP** | 250+ apps behind one MCP for everything not worth a bespoke tool | R/W | Composio OAuth | Generic MCP client bridge in `run-turn` | Yes | **M** (one-time plumbing) |

**Recommended sequencing:** **1 (Gmail send, S)** and **3 (Reminders/Shortcuts, S–M)** first — cheapest, highest daily use, and Shortcuts unlocks HomeKit/Focus/Health without bespoke bridges. Then **4 (Home Assistant / HomeKit, M–L)** — the emotional core of the "walk into my room" vision and the flagship routine block. Then **2 (Spotify depth)**, **5 (Slack)**, **7 (transit)**. Defer 11/12 until the core lands.

**Cross-cutting implementation notes for any new tool:**
- Follow the existing tool file shape (`tools/<name>.ts`: Zod input, `toJsonSchema`, tool def), register in `tool-names.ts` + `tools/index.ts`, execute in `executor.ts` (server) or return a `DesktopAction` + handle in `apps/desktop/src/actions/dispatcher.ts` (local).
- **Any write/destructive tool inherits the send-message readback-and-confirm guardrail** (name the consequence, wait for spoken "confirm").
- Add narration guidance to the relevant contract in `personality.ts` (e.g. "data reads → go straight to the READ; surface-changing actions → BUTLER ANNOUNCE-BEFORE-ACT").
- Mind Anthropic **strict-mode grammar limits** (per memory: the tool count already stresses the grammar) — batch new tools thoughtfully; consider whether some belong behind a single parameterized tool.

**Effort:** the table is the roadmap; each row is its own bgsd unit.

---

### R5 — Always-on ambient mic, the "Tony Stark" path (pain point #5) — **L, needs a decision**

**Problem.** Wake today is an *idle server probe*: `wake-probe.ts` keeps a cpal mic loop while idle and POSTs ~5s tails every 2.2s to the server for STT to match "daddy's home"/routine phrases. That's opt-in, latency-y, network-dependent, privacy-heavy (audio leaves the device), and not "genuinely always-on."

**Approach (staged).**
- **Stage A — on-device wake word.** Replace the server STT probe with a real on-device wake engine: **Picovoice Porcupine** (97%+ accuracy, <1 false-alarm/10h, Node/Web/Rust SDKs, custom "daddy's home" phrase — but commercial licensing) *or* **openWakeWord** (open-source, free, self-trained). This removes the network hop, kills the privacy concern (no audio leaves the device until *after* wake), and slashes wake latency. Wire it into the existing `wake-probe.ts` injection seams (`setWakeTriggerHandler`, `phraseMatcher`) so the FSM handoff is unchanged. (Memory notes Porcupine was previously deferred in favor of the probe — this is the graduation.)
- **Stage B — continuous listen + barge-in.** Once wake is on-device and cheap, offer a **continuous "presence" mode**: mic stays open, on-device wake gates *when* audio is streamed to STT, and JARVIS can be interrupted mid-sentence (the FSM already has barge-in-on-press; extend to barge-in-on-speech with proper AEC so JARVIS doesn't hear itself — today it's zero-AEC half-duplex). This needs **acoustic echo cancellation** (currently avoided via strict half-duplex) so the user can talk over JARVIS naturally — the biggest technical lift.
- **Stage C — evolving triggers for an always-present agent.** With always-on, routines gain **contextual/smart triggers** (time + presence + calendar state), and passive vs active listening distinction. This aligns with the memory-noted "NL routines with rich triggers" initiative.
- **Privacy / battery / false-trigger:** on-device wake means audio only leaves after wake (privacy win); expose a hard mic-kill and a visible always-listening indicator (macOS green dot is already surfaced); tune false-accept vs false-reject; document clearly (the settings copy already warns about the continuous green mic).

**Implementation units:**
1. Evaluate Porcupine vs openWakeWord (license vs accuracy vs effort); spike both against "daddy's home".
2. Rust/Tauri or Node binding for the chosen engine in `src-tauri` / `wake/`; swap the probe for on-device detection behind the same injection seams.
3. Continuous-listen mode + presence state in the FSM; visible indicator + hard kill.
4. AEC investigation for true barge-in (biggest unknown — spike first).
5. Contextual routine triggers (`schema.ts` — the `days?/cron?` forward-hook already exists) once presence is real.

**Dependencies:** independent, but **Stage B/C need a privacy decision from Filippo** (see risks). Stage A is safe to build now.
**Effort:** L (native audio + a licensing/privacy call).

---

## Risks / open questions (need Filippo's decision)

- **Always-on privacy.** How always-on? On-device wake (audio never leaves until wake) is the safe default; full continuous streaming to cloud STT is not. Recommend: build Stage A (on-device wake) first; decide on continuous-listen after feeling it.
- **Wake-engine licensing.** Porcupine is best-in-class but commercial; openWakeWord is free but you train/tune it. Which tradeoff?
- **Integration priority.** The table recommends Gmail-send + Shortcuts + Home Assistant first. Confirm the "walk into my room" smart-home target: **Home Assistant** (LAN token, powerful) vs **HomeKit via Shortcuts** (native, simpler, less flexible)?
- **WhatsApp / unofficial APIs.** WhatsApp already rides an unofficial whatsmeow bridge (ban risk on the linked number). Any *new* unofficial integrations (e.g. non-API social) carry the same risk — prefer official APIs.
- **Cost.** Parallel routine gather fires N concurrent agent turns; prompt caching mitigates but watch token spend on big briefings. Slack/Notion/Spotify add API surface + OAuth maintenance.
- **Grammar budget.** Anthropic strict-mode tool grammar is already stressed by 34 tools (per memory). Adding ~8 more needs care — batch, parameterize, or split contexts.
- **Cache regressions.** R3's dossier touches cache-critical files; the grep gate must stay green and `cache_read_input_tokens` must not fall.

---

## Handoff block — for the new bgsd session

Suggested first three phases (framed as `/bgsd-sesh` inputs), sequenced for fastest felt payoff:

1. **`/bgsd-sesh "Make JARVIS home routines fast and visible: run independent gather blocks in parallel (bounded pool) when a routine is synthesize+parallel, emit a new jarvis-routine-progress bus event from the runner, and render a gather loader in the desktop HUD — an instant 'one moment, sir' opener, a progress ring around the orb, and a live source checklist that ticks as weather/mail/calendar/etc land. Keep the sequential path for action/dependency routines. Ground in routine-runner.ts, routine-fire.ts, bus.ts, jarvis-response.ts, state-machine.ts, hud/orb.ts."`** — pain #1, ships the biggest win. (Pairs with #2.)

2. **`/bgsd-sesh "Redesign the JARVIS desktop HUD to feel loaded and alive, honoring the locked Stark palette (near-black, cyan #00d4ff, EB Garamond transcript): layered ambient background with faint HUD rings, a one-time boot/online spin-up sequence, a deepened reactor orb (idle tick-ring, richer thinking/gathering state, determinate progress-ring mode), transcript turn-in animation + streaming caret + timeline rail, a routine-progress card, and polished pairing/disconnect states. Sketch 2-3 directions as throwaway HTML first (frontend-design skill / Figma MCP), pick one, then build. Respect prefers-reduced-motion. Ground in apps/desktop/index.html and src/hud/*."`** — pain #2.

3. **`/bgsd-sesh "Give JARVIS Gmail send and native Shortcuts/Reminders: add the gmail.send scope to the existing Google OAuth and a server-side send_email tool with a draft-and-confirm guardrail (mirror send_message), plus desktop-bridge tools create_reminder and run/list Shortcuts (Shortcuts unlocks HomeKit/Focus/Health). Register in tool-names/tools/index, execute in executor.ts (server) or dispatcher.ts (local), add narration rules to personality.ts, and expose each as a routine block. Ground in app/api/gcal/auth/route.ts, tools/send-message.ts, tools/run-shortcut.ts, executor.ts, actions/dispatcher.ts."`** — pain #4, cheapest high-value integrations; sets up the Home Assistant / "walk into my room" flagship next.

**Then:** R3 (conversational dossier + proactivity, cache-safe), R4 items 4/2/5 (Home Assistant, Spotify depth, Slack), and R5 Stage A (on-device wake) — after the privacy/licensing/smart-home decisions above.

---

Sources:
- [Prompt caching — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [How to Cache Multi-Turn Claude Conversations](https://startdebugging.net/2026/05/how-to-cache-multi-turn-claude-conversations-across-api-calls/)
- [Best MCP Servers 2026 — Skyvia](https://skyvia.com/blog/best-mcp-servers/)
- [Best MCP Servers for Business Users 2026 — Octoparse](https://www.octoparse.com/blog/best-mcp-servers)
- [Porcupine Wake Word — Picovoice](https://picovoice.ai/platform/porcupine/)
- [openWakeWord (open-source wake word framework)](https://github.com/dscripka/openWakeWord)
- [Wake Word Detection Guide 2026 — Picovoice](https://picovoice.ai/blog/complete-guide-to-wake-word/)
