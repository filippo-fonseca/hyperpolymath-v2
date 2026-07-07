# World SFX

## Current status: synthesize via WebAudio (recommended default)

U-18 (`audio/chimes.ts`) synthesizes all three sounds via raw WebAudio
oscillators + envelopes — **no files required**. This is the recommended
MVP path: zero binary assets, no licensing concerns, no HTTP fetch on boot.

The clips below are **optional** — if you drop real audio files here,
`chimes.ts` should detect their existence and prefer them over synthesis
(check by responding to a `HEAD /world/sfx/<filename>` 200 vs 404).

## Sound design intent

| Event | Sound | Character |
|-------|-------|-----------|
| Task completed (`lesno` transition) | `glass-bell.mp3` | Warm, resonant bell tone — single strike, ~0.8 s decay |
| Capture created (firefly spring-in) | `cork-pop.mp3` | Soft, airy pop — light and pleasant, no harshness |
| Firefly lands (Jarvis routing done) | `two-note.mp3` | Two ascending notes, pentatonic — affirming, brief |

## Optional CC0 sources

All clips must be ≤ 30 KB, CC0 / public domain licensed.

### Freesound (CC0 filter)

Search at [https://freesound.org/search/?q=…&license=Creative+Commons+0](https://freesound.org/search/?q=glass+bell&license=Creative+Commons+0)

Suggested searches:
- `glass bell` → target ~440 Hz fundamental, short attack, medium decay
- `cork pop` → soft pop, not champagne-forceful
- `chime ascending two` → two notes, ~perfect 4th or 5th interval

### Synthesis spec for U-18 (WebAudio fallback)

If no files are present, U-18 synthesizes:

**glass-bell**: OscillatorNode (sine, 880 Hz) + GainNode envelope
(attack 5 ms, decay 600 ms, sustain 0, release 200 ms); light
WaveShaperNode for warmth; master gain 0.4.

**cork-pop**: OscillatorNode (sine, sweeps 400→80 Hz over 80 ms) +
BufferSourceNode white-noise burst (20 ms, gain 0.15); the pop transient
is all in the frequency sweep.

**two-note**: Two sequential OscillatorNodes (sine, 523 Hz + 698 Hz,
each 150 ms, 50 ms gap, attack 10 ms, release 120 ms, gain 0.35) —
C5 → F5 (perfect fourth).

> **Note for U-18 executor:** synthesize these by default; treat file
> presence as an optional override, not a requirement.

## ring-toll.mp3 — License & synthesis record

| Field | Value |
|-------|-------|
| **File** | `ring-toll.mp3` |
| **License** | CC0 1.0 Universal (Public Domain Dedication) — original synthesis, no third-party samples |
| **Author** | Synthesized via FFmpeg 8.1.2 `aevalsrc` additive synthesis |
| **Fundamental** | **220 Hz (A3)** — two octaves below the glass-bell (880 Hz / A5); same A-pentatonic family |
| **Partials** | 220 Hz (1×, amp 0.55) · 303 Hz (~1.38×, amp 0.28) · 440 Hz (2×, amp 0.18) · 582 Hz (~2.65×, amp 0.09) · 874 Hz (~3.97×, amp 0.05) — inharmonic ratios for bell timbre |
| **Envelope** | Per-partial exponential decay (τ = 0.9–4.5 s); fade-out at 2.8 s; total duration 3.2 s |
| **Format** | MP3 · mono · 44.1 kHz · 32 kbps · 13 184 bytes |
| **Synthesis command** | `ffmpeg -f lavfi -i "aevalsrc=0.55*exp(-t*1.1)*sin(2*PI*220*t)+0.28*exp(-t*1.8)*sin(2*PI*303*t)+0.18*exp(-t*2.4)*sin(2*PI*440*t)+0.09*exp(-t*3.2)*sin(2*PI*582*t)+0.05*exp(-t*4.5)*sin(2*PI*874*t):s=44100:d=3.2" -af "afade=t=out:st=2.8:d=0.4,volume=0.85" -ar 44100 -ac 1 -codec:a libmp3lame -b:a 32k ring-toll.mp3` |
| **Pentatonic note** | A3 is the root of the A-pentatonic scale (A–B–C♯–E–F♯); a fifth below D5 (the natural pentatonic fifth above A) and an octave below the glass-bell's A5 fundamental. The toll sits a major third above F♯ / two-note chime's C5–F5 pair, resolving warmly within the same pentatonic family. |
