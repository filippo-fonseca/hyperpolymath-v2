# Phase 07: JARVIS Voice + Ambient - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 07-jarvis-voice-ambient
**Areas discussed:** Mic indicator placement, Onboarding ritual, Default voice + greeting, Multi-action receipt narration, Wake-word default state, Voice register vs text register

---

## Mic Indicator Placement

| Option | Description | Selected |
|--------|-------------|----------|
| a — Small cyan dot at far-right, next to ThemeToggle | Quiet indicator, lives inside `.agent-mode-scope`; pulses cyan when armed | |
| b — Standalone mic glyph icon button left of JARVIS sidebar link | Bigger surface, doubles as click target for Discreet toggle on hover | |
| c — Both: small dot in header (status) + separate click target (action), separated by purpose | Two-element pattern: status read-only, action interactive | ✓ |

**User's choice:** c
**Notes:** Status (dot, read-only) and action (Discreet button) separated by purpose. Dot lives inside `.agent-mode-scope` cyan vocabulary; button lives outside it (diplomatic chrome, not agent surface).

---

## Voice-Enable Onboarding Ritual

| Option | Description | Selected |
|--------|-------------|----------|
| a — Lazy | Toggle flips immediately; permissions + audition happen on first "Hey Jarvis" | |
| b — Eager modal | One-step modal: grant mic → audition 2-3 British voices → pick → click Enable; this click is the AudioContext-unlock user gesture | ✓ |
| c — Hybrid | Toggle flips, one-time spoken "Hello, sir." plays inline with default voice (no audition) | |

**User's choice:** b
**Notes:** Eager modal handles permission + audition + AudioContext unlock in one ceremony. Solves the browser autoplay policy by anchoring unlock to the explicit Enable click.

---

## Default Voice + First-Enable Greeting

| Option | Description | Selected |
|--------|-------------|----------|
| George | Warm, articulate, professional British male (~176 WPM); researcher's recommended default | |
| Posh | More theatrical / butler register; leans Tony-Stark-JARVIS canon | (front-runner pending audition) |
| Pick at audition time | Defer final ID to Settings UI build | ✓ |

**User's choice:** "make it sound like jarvis from iron man"
**Notes:** Target the canonical Paul Bettany JARVIS register — refined British, butler-AI, clipped, ceremonial. Posh is the front-runner for canon-fit; final voice ID picked at Settings UI implementation time via in-modal audition.

**First-enable greeting (was secondary question, not explicitly answered):** Claude's discretion → defaulting to YES — a one-time spoken `"Hello, sir."` plays on first Enable. Doubles as autoplay-unlock confirmation and canon-aligned welcome.

---

## Multi-Action Receipt Narration

| Option | Description | Selected |
|--------|-------------|----------|
| a — Each receipt spoken in turn | "Task created. Capture filed." (sequential TTS chunks, ~2s for two actions) | ✓ |
| b — Single rolled-up summary | "Two actions filed." (terse, in canon) | |
| c — Only the LAST receipt spoken; visual stack carries the rest | Hybrid: voice covers latest, screen covers the rest | |

**User's choice:** a
**Notes:** Each `voice_summary` plays in turn through a single playback queue. Per-tool 20-word budget (VOICE-10) keeps total sequential time short.

---

## Wake-Word Default State (After Voice Enabled)

| Option | Description | Selected |
|--------|-------------|----------|
| a — Armed by default | Voice enabled = always-listening for wake-word. Discreet toggle is the silence path. Matches Tony Stark canon. | ✓ |
| b — Off by default | Voice enabled but wake-word off; user must explicitly arm. Forces "yes I want always-on listening" moment. | |

**User's choice:** a — "always listening for wake word"
**Notes:** On-device detection via `@picovoice/porcupine-react` is privacy-preserving (no audio leaves device until wake fires + VAD captures utterance). Discreet toggle remains always-available off-switch. `Cmd+Shift+J` press-to-talk still works in Discreet mode per VOICE-09.

---

## Voice Register vs Text Register

| Option | Description | Selected |
|--------|-------------|----------|
| a — Same register | Text and voice sound the same; just the channel differs | |
| b — Slightly more butler/theatrical when spoken | Leans Tony Stark canon (clipped, ceremonial); text register unchanged | ✓ |
| c — Slightly more conversational/warmer when spoken | Voice feels less "log entry" than text | |

**User's choice:** b
**Notes:** Phase 5's text register (British, formal, concise, dry, never sycophantic) is the baseline. Voice adds a butler/clipped/ceremonial pass on top — applies ONLY to `voice_summary` fields, NOT to Console prose. Example tone delta: text "Created task: buy milk" → voice "Task filed, sir." / "Noted."

---

## Claude's Discretion

- **Welcome greeting on first Enable:** Defaulting to YES, spoken `"Hello, sir."` (user did not address explicitly; canon-aligned default)
- **Mic indicator pixel/color details:** Slot into Phase 6.1 HUD vocabulary, cyan accents per state (idle = muted, listening = slow pulse, recording = fast pulse, thinking = continuous glow, speaking = amplitude-driven)
- **Mic device picker UI:** Standard select in Settings; persist `deviceId` to localStorage (single-user app)
- **Wake-word phrase customization:** Free-text input; only `"Hey Jarvis"` ships pre-trained, custom phrases require `.ppn` upload (note in Settings copy)
- **TTS provider fallback chain:** ElevenLabs primary → browser SpeechSynthesis fallback → Off (per VOICE-11)

## Deferred Ideas

- Voice-driven Read/Update/Delete (backlog 999.3 jarvis-read-layer)
- Voice memos as captures
- Multi-user voice support (single-user MVP constraint)
- In-browser audio recording history (privacy/storage)
- Always-on ambient overheard context (privacy)
- `/voice <name>` slash-command voice switcher
