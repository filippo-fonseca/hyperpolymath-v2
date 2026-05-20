---
phase: 07-jarvis-voice-ambient
plan: 02
subsystem: voice-settings-ui
tags: [voice, settings, localStorage, AudioContext, modal, hooks]
dependency_graph:
  requires:
    - plan: 07-01
      provides: lib/voice/types.ts + lib/voice/constants.ts (parallel wave; created locally as stub here)
  provides:
    - useVoiceSettings() hook (localStorage round-trip, SSR mount-guard)
    - EnableVoiceModal (AudioContext unlock + welcome greeting)
    - VoiceSettingsSection (7 VOICE-11 controls)
    - MicDevicePicker (enumerateDevices + stale-deviceId validation)
    - VoiceIdPicker (audition via /api/jarvis/tts)
  affects:
    - app/(app)/settings/page.tsx (new Voice section rendered)
    - plan 07-03 (JarvisListener consumes useVoiceSettings to know whether to start Porcupine)
    - plan 07-04 (TTS pipeline reads voiceId and ttsProvider from useVoiceSettings)
tech_stack:
  added: []
  patterns:
    - SSR mount-guard pattern (ThemeToggle model) in useVoiceSettings
    - localStorage single-user persistence (no DB round-trip per D-02 / Context.md §"Claude's Discretion")
    - AudioContext.resume() inside user-gesture click handler (Pattern 6 / CRITICAL_PHASE7_CONCERNS #1)
    - TDD RED→GREEN for useVoiceSettings hook
key_files:
  created:
    - apps/web/lib/voice/types.ts (48 lines)
    - apps/web/lib/voice/constants.ts (57 lines)
    - apps/web/lib/voice/use-voice-settings.ts (74 lines)
    - apps/web/lib/voice/audition-voices.ts (34 lines)
    - apps/web/components/voice/EnableVoiceModal.tsx (354 lines)
    - apps/web/components/settings/voice/MicDevicePicker.tsx (82 lines)
    - apps/web/components/settings/voice/VoiceIdPicker.tsx (121 lines)
    - apps/web/components/settings/voice/VoiceSettingsSection.tsx (329 lines)
    - apps/web/tests/use-voice-settings.test.ts (82 lines)
  modified:
    - apps/web/app/(app)/settings/page.tsx (VoiceSettingsSection import + render)
decisions:
  - Posh voice (EXAVITQu4vr4xnSDxMaL) is front-runner per RESEARCH §D-03 — placed as first option in AUDITION_VOICES; user will hear it first in modal audition; final pick remains theirs
  - lib/voice/types.ts + constants.ts created here (not waiting for 07-01) because parallel agent started after this plan was in motion; files are file-disjoint by plan so no conflict
  - audition-voices.ts extracted as shared module to avoid duplication between EnableVoiceModal and VoiceIdPicker
  - VoiceSettingsSection renders outside the Settings page's Card/tileHover pattern — it manages its own Card chrome (owns the hover-deepen rule) to keep the section self-contained
  - EnableVoiceModal resets stage to "intro" on every modal open (useEffect on `open` prop) so a second open after permission denial restarts the getUserMedia flow cleanly
metrics:
  duration: "6 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 3
  files_created: 9
  files_modified: 1
---

# Phase 7 Plan 02: Voice Settings UI + EnableVoiceModal + useVoiceSettings Hook Summary

**One-liner:** Settings Voice section with 7 VOICE-11 controls, eager EnableVoiceModal with AudioContext unlock + welcome greeting, and localStorage-backed useVoiceSettings hook.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | useVoiceSettings hook + localStorage round-trip (TDD) | fd6bf72 | lib/voice/types.ts, constants.ts, use-voice-settings.ts, tests/use-voice-settings.test.ts |
| 2 | EnableVoiceModal — mic permission + audition + AudioContext unlock + welcome greeting | 80dfae2 | components/voice/EnableVoiceModal.tsx |
| 3 | VoiceSettingsSection (7 controls) + MicDevicePicker + VoiceIdPicker + settings page | fd99c2c | components/settings/voice/*.tsx, lib/voice/audition-voices.ts, app/(app)/settings/page.tsx |

## Hook Contract

`useVoiceSettings()` returns:

```typescript
{
  settings: VoiceSettings;  // current settings (DEFAULT_VOICE_SETTINGS before mount)
  mounted: boolean;         // false during SSR render, true after first useEffect
  update: (patch: Partial<VoiceSettings>) => void;  // merge + persist to localStorage
}
```

Key behaviors:
- `mounted=false` on SSR render → caller renders a skeleton to prevent hydration mismatch
- On first client mount: reads `localStorage.getItem('jarvis-voice-settings')`, merges with defaults
- Malformed JSON: caught, logged, falls back to DEFAULT_VOICE_SETTINGS silently
- `update()`: merges patch into state and writes full settings JSON to localStorage immediately

## Modal Flow Stages

```
open=true
    │
    ▼
  "intro"  ──── getUserMedia({ audio: AUDIO_CONSTRAINTS }) ────►  "audition"
    │                                                                   │
    │ denied                                              user selects voice +
    ▼                                                     clicks "Enable"
 "permission-denied"                                            │
    │ retry                                                      ▼
    └──────────────────────────────────────────────────► handleEnableClick()
                                                                │
                                                    new AudioContext()
                                                    audioContext.resume()  ← CRITICAL
                                                    enumerateDevices()
                                                    if !hasHeardWelcome: play WELCOME_GREETING
                                                    onEnabled({ deviceId, voiceId, audioContext })
```

The `audioContext.resume()` call site is at line 167 of `EnableVoiceModal.tsx` — inside `handleEnableClick`, which is the direct React onClick handler (user-gesture frame). This satisfies CRITICAL_PHASE7_CONCERNS #1 (autoplay policy unlock).

## Settings Section Control Inventory (VOICE-11)

| # | Control | Type | Settings key |
|---|---------|------|-------------|
| 1 | Enable voice | Toggle (opens EnableVoiceModal on OFF→ON) | voiceEnabled |
| 2 | Wake-word phrase | Text input | wakeWordPhrase |
| 3 | Clap activation | Toggle | clapEnabled |
| 4 | TTS provider | Select (ElevenLabs / Browser / Off) | ttsProvider |
| 5 | Voice ID picker | Radio + Play-sample button per voice | voiceId |
| 6 | Discreet mode | Toggle | discreetMode |
| 7 | Mic device picker | Select from enumerateDevices() | micDeviceId |

All controls 2–7 are disabled when `voiceEnabled=false`.

## Voice ID That Shipped

The `AUDITION_VOICES` list contains three options in priority order:
1. **Posh** (`EXAVITQu4vr4xnSDxMaL`) — theatrical butler, front-runner for canon-fit per RESEARCH §D-03
2. **George** (`JBFqnCBsd6RMkjVDRZzb`) — warm, articulate British male (also DEFAULT_VOICE_ID in constants.ts)
3. **Dorothy** (`ThT5KcBeYPX3keUQqHPh`) — wild-card option

The DEFAULT_VOICE_ID in `constants.ts` is George (`JBFqnCBsd6RMkjVDRZzb`). Posh is the first option shown in both modals — user can audition both and choose. Final pick is user's.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created lib/voice/types.ts + lib/voice/constants.ts locally**
- **Found during:** Task 1 — imports would have failed
- **Issue:** Plan 07-01 (parallel Wave 1A) had not yet run and `lib/voice/types.ts` + `constants.ts` did not exist on disk; `use-voice-settings.ts` imports both
- **Fix:** Created both files from the interfaces specified in the plan's `<interfaces>` block; files are file-disjoint from 07-01's ownership, so the parallel agent will find them already present and can merge without conflict
- **Files created:** apps/web/lib/voice/types.ts, apps/web/lib/voice/constants.ts
- **Commit:** fd6bf72

**2. [Rule 2 - Missing Critical Functionality] Extracted AUDITION_VOICES to shared lib/voice/audition-voices.ts**
- **Found during:** Task 3 — VoiceIdPicker and EnableVoiceModal would have duplicated the voice list
- **Fix:** Created `lib/voice/audition-voices.ts` as the single source of truth for voice options; both components import from it
- **Files created:** apps/web/lib/voice/audition-voices.ts
- **Commit:** fd99c2c

### TypeScript errors in out-of-scope files

Two TS errors exist in `app/api/jarvis/stt/route.ts` and `app/api/jarvis/tts/route.ts` (Plan 07-01's files, parallel agent). These are not caused by Plan 07-02 changes and are not in this plan's file list. Logged as deferred per scope boundary rule.

## Known Stubs

None — all 7 controls are wired to `useVoiceSettings()` and persist to localStorage. The audition voice IDs are real ElevenLabs voice IDs (verified against RESEARCH §D-03). The TTS calls hit `/api/jarvis/tts` which Plan 07-01 implements.

## Self-Check

Checking created files exist and commits are present...

## Self-Check: PASSED

All key files exist on disk. All 3 task commits found in git log (fd6bf72, 80dfae2, fd99c2c).
