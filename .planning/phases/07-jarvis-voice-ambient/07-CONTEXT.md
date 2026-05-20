# Phase 07: JARVIS Voice + Ambient - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 makes JARVIS interactable like Tony Stark's JARVIS — voice in via "Hey Jarvis" wake-word OR two-clap activation OR `Cmd+Shift+J` press-to-talk, voice out in a British accent (Paul-Bettany-JARVIS register) via ElevenLabs Flash WebSocket. One-click Discreet toggle in the header silences TTS + disables the wake-word while leaving the text Console fully functional. Mic-state indicator with 5 states (`idle` / `listening` / `recording` / `thinking` / `speaking`) reflects pipeline state in real time.

The text Console (shipped in Phase 5) is the canonical fallback — voice is additive, never the only path.

**Scope anchor:** This phase delivers the 14 VOICE-* requirements. New capabilities (multi-user voice, voice-driven Read/Update/Delete tools, in-browser audio recording history, voice memos as captures) are out of scope and belong in future phases.

</domain>

<decisions>
## Implementation Decisions

### Mic Indicator + Discreet Toggle Placement (D-01)
- **D-01:** **Two-element pattern** in `components/shell/PersistentNav.tsx`. A small cyan status DOT lives at the far-right of the header (next to `ThemeToggle`) reflecting all 5 mic states — purely indicator, non-interactive. A separate, larger mic-glyph BUTTON acts as the click target for toggling Discreet mode (and, on long-press / right-click, opens a quick popover for mic device + voice picker). Separation by purpose: dot = status (read-only), button = action.
- The status dot lives **inside** `.agent-mode-scope` (cyan vocabulary). The Discreet button lives **outside** the cyan vocabulary — it's diplomatic chrome, not agent surface.

### Voice-Enable Onboarding (D-02)
- **D-02:** **Eager modal flow** when user first flips `Enable voice` in Settings → Voice. The modal is a single-step sequence:
  1. Request microphone permission (`getUserMedia({ audio: {...} })` with `echoCancellation: true, noiseSuppression: true, autoGainControl: true`)
  2. Audition 2–3 British voices inline (play sample lines via ElevenLabs HTTP, NOT the WebSocket — sampling doesn't need streaming)
  3. User picks default voice → click "Enable"
- The "Enable" click is the **AudioContext-unlock user gesture** (solves browser autoplay policy). At this moment we also `resume()` the AudioContext, persist mic `deviceId` from `enumerateDevices()`, and start the Porcupine wake-word worker.
- If user denies mic permission: surface a clear in-modal error with a re-request affordance + link to browser permission settings. Do NOT silently fail.

### Default Voice Persona (D-03)
- **D-03:** Target the **canonical Tony Stark / Paul Bettany JARVIS register** — refined British, butler-AI, slightly clipped, ceremonial without being cold. The exact ElevenLabs voice ID will be picked at Settings UI implementation time by Filippo via in-modal audition. Researcher's two finalists to compare against canon: **Posh** (more theatrical/butler — leans canon) and **George** (`JBFqnCBsd6RMkjVDRZzb`, warm/professional). **Posh is the front-runner for canon-fit; final pick deferred to audition.**
- **First-enable greeting (Claude's discretion → default YES):** When the eager modal completes and user clicks "Enable", a one-time spoken `"Hello, sir."` plays through the just-unlocked AudioContext. Doubles as the autoplay-unlock confirmation and welcome moment. Stored as a flag (`hasHeardWelcome`) so it never plays again.

### Multi-Action Receipt Narration (D-04)
- **D-04:** **Each receipt spoken in turn.** For a "create task buy milk and capture this idea" turn, JARVIS files both actions, then TTS plays each `voice_summary` field sequentially: "Task created. Capture filed." Total spoken time ≤ 4s for two actions; sequential WebSocket chunks queued through a single playback queue.
- Each tool schema's `voice_summary` field stays ≤ 20 words (per VOICE-10) — this constraint is the natural budget that keeps the sequential narration short.
- Visual receipt stack continues to render every receipt as today (Phase 5/6 behavior unchanged).

### Wake-Word Default State (D-05)
- **D-05:** **Always-listening by default.** Once voice is enabled in Settings, the Porcupine wake-word worker arms automatically on every page load. Discreet toggle is the way to silence it. This matches the Tony Stark canon ("Jarvis, are you there?" answered without ritual) and is the user's explicit preference.
- Privacy-preserving fact (per VOICE-02): wake-word detection is fully **on-device** via `@picovoice/porcupine-react`. No audio leaves the device until the wake-word fires AND the user starts speaking AND VAD captures the utterance.
- Discreet toggle remains the always-available off-switch. `Cmd+Shift+J` press-to-talk still works in Discreet mode (per VOICE-09) — that's the explicit "I want voice right now without leaving Discreet" path.

### Voice Register vs Text Register (D-06)
- **D-06:** **Slightly more butler/theatrical when spoken.** Phase 5's text register (British, formal, concise, dry, never sycophantic) carries forward as the baseline; voice adds a clipped/ceremonial pass on top — leans Paul-Bettany-JARVIS canon. Practical realization: when generating `voice_summary` fields, the personality system prompt instructs Claude to use butler-register vocabulary ("Filed.", "Noted, sir.", "Two items added.") rather than text-register vocabulary ("Done.", "OK.", "Created two tasks.").
- This applies ONLY to spoken text (`voice_summary` fields). The text Console's prose output remains the Phase 5 register unchanged.

### Architectural Decisions (Locked by RESEARCH.md — Not Re-Discussed)
- Wake-word: `@picovoice/porcupine-react@4.0.0` (Apache-2.0), pre-trained "Hey Jarvis" keyword, customizable phrase via Settings
- VAD: `@ricky0123/vad-react@0.0.36` (ISC) `onSpeechEnd` for end-of-turn
- STT: Groq Whisper large-v3-turbo via `/api/jarvis/stt` Node proxy route (HTTP-only — Groq still has no WebSocket as of 2026-05; round-trip ~80ms for a 5s clip)
- TTS: ElevenLabs Flash v2.5 WebSocket via `/api/jarvis/tts` Node proxy route; British voice with audition
- State machine: plain `useReducer` (40 lines) — CLAUDE.md bans global stores
- Clap-onset: AudioWorklet in `public/worklets/` (NOT deprecated ScriptProcessorNode); 250-650ms inter-clap window
- Barge-in: VOICE-12 says pause + new recording turn. Implementation: `AudioContext.suspend()` on user speech detected → flush remaining TTS chunks → re-enter `recording` state
- Latency budget p50: 100ms VAD + 50ms encoding + 80ms Groq + 800ms Claude (warm) + 75ms TTS first-chunk = ~1.1s (target <3s, well inside)
- Cost: ElevenLabs Creator $22/mo = 100k chars/mo — single-user MVP fits with summarized receipts (≤20 words)

### Claude's Discretion
- Exact pixel sizes / colors of the mic indicator dot + button (slot into Phase 6.1 HUD vocabulary; cyan dot at idle = `--ink-muted` opacity, listening = `--hud-cyan` slow pulse, recording = `--hud-cyan` fast pulse, thinking = `--hud-cyan` continuous glow, speaking = `--hud-cyan` audio-amplitude-driven pulse)
- Mic device picker UI: standard select / radio in Settings; persist `deviceId` to `localStorage` (single-user app — no DB round-trip needed)
- Wake-word phrase customization: free-text input in Settings; only `"Hey Jarvis"` ships pre-trained, so custom phrases require Picovoice Console-generated `.ppn` file upload (note this in Settings copy — most users will leave default)
- Welcome greeting copy: `"Hello, sir."` (locked in D-03 above)
- TTS provider fallback chain: ElevenLabs primary → browser `SpeechSynthesis` API fallback if ElevenLabs network fails → "Off" if user disables in Settings (per VOICE-11)
- Echo cancellation params: VOICE-12 specifies the three flags (echoCancellation, noiseSuppression, autoGainControl) — pass them through `getUserMedia` constraints without further tuning

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 source-of-truth (read these in this order)
- `.planning/ROADMAP.md` §"Phase 7: JARVIS Voice + Ambient" — goal + success criteria
- `.planning/REQUIREMENTS.md` §VOICE-01 through §VOICE-14 — the 14 locked requirement contracts (lines 121-134)
- `.planning/research/jarvis-voice-layer.md` — 785-line grounding doc (Tony Stark canon, 10 JARVIS-clone case studies, stack matrix, personality drafts)
- `.planning/phases/07-jarvis-voice-ambient/07-RESEARCH.md` — phase-specific research (npm versions, latency budget, code skeletons, common pitfalls)

### Inherited from Phase 5 (JARVIS structural defenses)
- `.planning/phases/05-jarvis/05-CONTEXT.md` §D-16 — JARVIS personality contract (British, formal, concise, dry, never sycophantic) — Phase 7 extends, does NOT redefine
- `.planning/phases/05-jarvis/05-CONTEXT.md` §JARVIS-06 + §JARVIS-14 — capture-first defense for adversarial inputs; voice transcript inherits this contract (VOICE-14)
- `.planning/phases/05.1-jarvis-agentic-refactor/05.1-CONTEXT.md` — agentic patterns + tool-use refinements relevant to `voice_summary` field addition

### Project-level constraints
- `CLAUDE.md` (project root) — stack non-negotiables: Next.js 16, `@anthropic-ai/sdk` 0.94.x, `@supabase/ssr`, claude-sonnet-4-6, NO global stores for single-user MVP (rules out Zustand/XState for the voice state machine)
- `.planning/PROJECT.md` — core value statement, voice scope confirmation
- `.planning/STATE.md` — current execution state (Phase 6.2 reverted 2026-05-20; visual surface locked to Phase 6.1 HUD-heavy state — Phase 7 UI inherits this vocabulary)

### Code surface (read before touching these files)
- `apps/web/app/api/jarvis/route.ts` — JARVIS pipeline entry point; already has `X-Voice-Active: true` header check + `zCreate*For({ voiceActive })` factory (pre-wired in Phase 5; voice transcript flows through unchanged)
- `apps/web/components/shell/PersistentNav.tsx` — header host for new mic indicator dot + Discreet button
- `apps/web/components/shell/ThemeToggle.tsx` — reference pattern for a header-level click-target with tooltip
- `apps/web/components/jarvis/JarvisConsole.tsx` — Console root; voice transcript appends here as if typed
- `apps/web/components/jarvis/JarvisInput.tsx` — composer; voice flows IN through this entry point
- `apps/web/components/jarvis/JarvisReceipt.tsx` — receipt card; reads `voice_summary` field when present
- `apps/web/app/(app)/settings/page.tsx` — host for new Settings → Voice section

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **JARVIS pipeline (Phase 5):** `/api/jarvis/route.ts` already accepts `X-Voice-Active: true` header and exposes `voice_summary` field on every tool schema. Voice transcript flows IN identically to typed input — zero changes to the route required.
- **Header pattern (ThemeToggle):** `components/shell/ThemeToggle.tsx` is the canonical pattern for header-level click targets with tooltip + state-driven icon. Mic indicator dot and Discreet button follow the same pattern.
- **Settings page (`/settings`):** existing settings architecture supports section-based composition; Voice section slots in alongside existing sections without structural changes.
- **AudioContext-friendly chrome:** `.agent-mode-scope` already exists with cyan accent tokens (`--hud-cyan`, `--hud-cyan-glow-soft`, etc.). Mic indicator inherits these.

### Established Patterns
- **JARVIS-06/14 capture-first defense:** Adversarial input is structurally captured, never executed as instructions. Voice transcript = user content. Voice mode introduces ZERO new attack surface.
- **CREATE-only tools:** Phase 5 locked JARVIS to creation actions (no DELETE/UPDATE). Voice cannot escalate this — even adversarial transcripts can only produce captures/tasks/events.
- **`pointer-fine` Tailwind variant:** Phase 6.1 added — hover-reveal patterns gate on fine pointer; mic indicator hover affordances should respect this.
- **`useReducer` for state machines:** CLAUDE.md mandates no global stores. The 5-state mic FSM uses `useReducer` co-located with the `JarvisListener` component.

### Integration Points
- `PersistentNav.tsx` — header gets two new children: `<MicIndicatorDot />` + `<DiscreetToggleButton />`
- `AppShell.tsx` (or equivalent root client wrapper) — host for `<JarvisListener />` (always-mounted on `/` and other agent routes when voice is enabled in Settings)
- `app/api/jarvis/stt/route.ts` — NEW Node API route, proxies to Groq Whisper
- `app/api/jarvis/tts/route.ts` — NEW Node API route, proxies to ElevenLabs Flash WebSocket
- `app/(app)/settings/page.tsx` — NEW `<VoiceSettingsSection />` insertion point
- `public/worklets/clap-detector.js` — NEW static asset (AudioWorklet processor module)
- `lib/voice/` (or equivalent) — NEW namespace for voice-specific hooks (`useJarvisListener`, `useMicState`, `useTtsQueue`, `useClapDetector`)

</code_context>

<specifics>
## Specific Ideas

- **Welcome line:** `"Hello, sir."` — exact spoken copy for the first-enable greeting. Locked.
- **Tone calibration target for `voice_summary`:** Paul-Bettany-JARVIS canon. Examples:
  - Text receipt: `"Created task: buy milk"` → Voice: `"Task filed, sir."` or `"Noted."`
  - Text receipt: `"Captured: idea about agent UX"` → Voice: `"Captured."` or `"Filed under captures."`
  - Text receipt: `"Two tasks created, one capture filed"` → Voice: `"Three items in, sir."` or `"Done."`
- **Reference register source:** Tony Stark + JARVIS scene transcripts (Iron Man 1-3 + Age of Ultron pre-Vision). Researcher's grounding doc has personality draft alignment.
- **Default voice candidates (audition shortlist):** Posh (front-runner for canon-fit), George, plus one wild-card the user picks at Settings build time.
- **Mic indicator state-to-cyan mapping (Claude's discretion → starting proposal):**
  - `idle`: `--ink-muted` opacity 0.4, no motion
  - `listening` (wake-word armed): `--hud-cyan` opacity 0.6, slow pulse (1.2s cycle, ease-in-out)
  - `recording` (VAD open): `--hud-cyan` opacity 1.0, fast pulse (0.5s cycle)
  - `thinking` (Claude latency): `--hud-cyan` opacity 0.8, continuous glow (no pulse)
  - `speaking` (TTS playing): `--hud-cyan` opacity 1.0, audio-amplitude-driven pulse (analyser node tap)

</specifics>

<deferred>
## Deferred Ideas

These came up in discussion or were already in scope-adjacent backlog. Captured here so they're not lost.

- **Voice-driven Read/Update/Delete tools** — JARVIS speaking back query results ("Your tasks for today are…"). Backlog 999.3 (`jarvis-read-layer`) covers this. Voice would consume that surface when shipped.
- **Voice memos as captures** — recording an audio clip and saving the transcript + audio URL as a capture. Out of scope; potential future phase.
- **Multi-user voice** — voice mode is single-user-coded today. Multi-user (per-user voice settings, per-user wake-word phrase) is post-MVP per PROJECT.md single-user-architecturally constraint.
- **In-browser audio recording history** — replay-able log of past voice utterances. Privacy + storage cost concerns; deferred.
- **Always-on ambient context** — JARVIS overhearing background conversation and inferring captures without wake-word. Privacy red flag for single-user MVP; deferred.
- **Voice ID switcher in JARVIS Console** — quick voice swap during a session via `/voice posh` slash-command. Possible future addition to slash-command vocabulary; not in Phase 7 scope.

</deferred>

---

*Phase: 07-jarvis-voice-ambient*
*Context gathered: 2026-05-20*
