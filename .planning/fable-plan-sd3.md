# Unit: unit-orb-sfx — kiwi in both orbs + subtle SFX core pack + motion polish [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md and docs/DESIGN-SYSTEM.md.

## Mission
Brand + delight layer. Sealed decisions: the kiwi bird goes in BOTH orbs; SFX = subtle core pack (~8 cues) with a global mute; space-travel clean, never noisy.

Scout facts: `public/icons/kiwi-bird.svg` + `components/shared/KiwiIcon.tsx` (lucide-compatible, currentColor) exist, drop-in ready. Orb 1 = `components/voice/FloatingJarvisStatus.tsx` (fixed bottom-right cyan pill, lucide Mic/Radio/Loader2/Volume2 by state, jarvis-pulse + wake-burst). Orb 2 = `components/ui/ambient/FocalOrb.tsx` (pure CSS/SVG glossy cyan sphere, 8s bob, reduced-motion + tab-hidden guards; used at 36px in LifeOsHero:241 and large on landing hero). Audio: `lib/ui/play-send/reply/pop.ts` singleton Audio players + mp3s in public/; shared gesture-unlockable AudioContext at `lib/voice/audio-context.ts`.

## Fence
- apps/web/components/voice/FloatingJarvisStatus.tsx
- apps/web/components/ui/ambient/FocalOrb.tsx
- apps/web/components/shared/KiwiIcon.tsx (only if a size/stroke prop tweak is needed)
- NEW: apps/web/lib/ui/sfx.ts (+ optional tiny helper files under lib/ui/)
- apps/web/public/ (new tiny audio assets if you go the file route)
- globals.css ADDITIVE only (keyframes for the bird/orb micro-motion)
- Call-site one-liners to fire cues ONLY in: components/shell/Sidebar.tsx (collapse), components/lifeos (view toggle — coordinate via assumption note; that file may be owned by unit-lifeos-rework, so if it's being rewritten, expose the cue from sfx.ts and note the handoff instead of editing), tasks complete + capture send + habit check + dialog open/close: if those files are outside your fence or owned elsewhere, DO NOT edit them — ship sfx.ts with named cues and a wiring doc in notes; the Conductor routes wiring to the owning units.

## Work
1. Kiwi in the HUD pill: the bird is the permanent brand mark in the pill — KiwiIcon as the base glyph; express state (listening/thinking/speaking) via the existing pulse/ring + a compact secondary indicator (color shift, 3-dot thinking, tiny waveform) rather than replacing the bird. Keep it small, sharp, currentColor cyan-on-dark.
2. Kiwi in the presence sphere: centered KiwiIcon layer inside FocalOrb above the specular layers (white/near-white over cyan, aria-hidden, pointer-events-none), scaled to orb size (readable at 36px, elegant at 176px on landing). Subtle: the bird sits IN the glass, no glow ring. Keep bob + reduced-motion guards intact.
3. SFX core pack (lib/ui/sfx.ts): 8 named cues — sidebarCollapse, sidebarExpand, viewToggle, taskComplete, captureSent, habitCheck, dialogOpen, error. Implementation choice is yours: runtime-synthesized micro-tones through the shared gesture-unlocked AudioContext (preferred: zero assets, precise, tiny) or tiny generated audio files following the play-*.ts singleton pattern. Constraints: every cue < 180ms, quiet (≈ -18 LUFS feel, well below the existing chimes), pitch-coherent family (one tonal center, cues are intervals of it — "space-console" feel), NEVER stacks (throttle per-cue), silent when AudioContext locked, global mute persisted at localStorage `ui:sfx` (default ON) exposed as `sfx.enabled`/`setSfxEnabled` for a settings toggle another unit wires. Fire cues where the fence allows (sidebar collapse via the one-liner); everything else ships as exported cues + wiring notes.
4. Motion polish on the two components: HUD pill enter/exit (opacity+4px translate 150ms), bird micro-blink or 2° tilt on state change (transform-only), wake-burst kept. Zero-jank law absolute.

## Verification
typecheck + build green. Headless (lock protocol) on your port: LifeOS greeting orb close-crop dark+light with the bird visible at 36px; landing hero orb with bird; HUD pill screenshot (force each state via its props/hook in a test harness page or storybook-style route if one exists — else document the forced-state method). SFX: assert cue durations + mute flag in a small unit test or logged evidence. Commit frames under .planning/. status=awaiting_review, WAIT.
