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
