# unit-captures — verification report (sesh-sd3-allfeatures)

Branch `sd3/unit-captures`. GH #286 (Wave A). Fence: `apps/web/components/captures/**`.

## Gates
- `pnpm --filter web typecheck` → **green** (`tsc --noEmit`, no errors).
- `pnpm --filter web build` → **green**. One environmental note: `next/font/google` EB Garamond in `app/layout.tsx` (OUTSIDE this fence, untouched) requires network at build time; in the sandboxed worktree the first attempt failed only on that font fetch, and the build compiles cleanly once the font CDN is reachable. No error originates in the captures fence.
- Boot: `next start -p 3830` → `✓ Ready`, serves 200. `/captures` → 307 → `/sign-in` (authed surface).

## Authed-impossible fallback (per UI-CONTRACT §1)
`/captures` requires a Google session; the dev port has none, so the surface cannot be reached headless. Captured the unauthenticated fallback both themes (1440×900) — proves the app boots clean and sd tokens resolve globally:
- `sd3-captures-signin-fallback-dark.png`
- `sd3-captures-signin-fallback-light.png`

The Conductor pixel-verifies the authed `/captures` surfaces on :3000 post-merge.

## Compiled-CSS proof (§0 Tailwind scan-gap)
Every arbitrary `--sd-*` utility used inside the captures fence was confirmed EMITTED in the compiled CSS under `apps/web/.next/static/chunks/*.css`. 14/14 distinct utilities present, including the three `color-mix` compounds (Tailwind normalizes `in_oklch`→`in oklch`; verbatim normalized forms located):

| utility | emitted |
|---|---|
| `bg-[var(--sd-box)]` | ✓ |
| `bg-[var(--sd-hover)]` | ✓ |
| `bg-[var(--sd-input)]` | ✓ |
| `bg-[var(--sd-selected)]` | ✓ |
| `bg-[color-mix(in_oklch,var(--sd-accent)_6%,var(--sd-box))]` | ✓ |
| `border-[var(--sd-accent)]` | ✓ |
| `border-[var(--sd-line)]` | ✓ |
| `border-[color-mix(in_oklch,var(--sd-accent)_28%,var(--sd-line))]` | ✓ |
| `text-[var(--sd-accent)]` | ✓ |
| `text-[var(--sd-ink)]` | ✓ |
| `text-[var(--sd-ink-dull)]` | ✓ |
| `text-[var(--sd-ink-faint)]` | ✓ |
| `decoration-[var(--sd-accent)]` | ✓ |
| `decoration-[color-mix(in_oklch,var(--sd-accent)_50%,transparent)]` | ✓ |

No scan-gap misses. Utilities resolve in both themes via the `--sd-*` token ladder.

## Legacy-token audit (fence clean)
`grep -rEn "glass-tile|glow|backdrop-blur|hud-cyan|--ink-"` over the fence returns only:
- `--ink-amber` — functional favorite state (kept per plan).
- `--ink-coral` — functional overdue state (kept per plan).
- `--ink-sage` / `--ink-amber` in `HashtagChip.tsx` / `PersonChip.tsx` — the shared chips, deliberately out of scope (shared with tasks/jarvis units; flattening the sage/amber alpha ladder is a cross-unit call).
- `glass`/`glow`/`blur` — appear ONLY inside "no glass, no glow, no blur" descriptive comments.

No `.glass-tile`, `.glass-button`, `backdrop-blur`, glow ring, hover-scale, orb>40px, or `font-serif` remains in the fence.

## SFX
`sfx.play("captureSent")` fires once on successful capture dispatch in `CaptureComposer.tsx` (after the `toast("Captured.")`). No pre-existing `playSend` in the fence → no double-chime. The remaining `playSend` call sites are in `components/jarvis/*` (out of fence).

## Commits (8)
LinkPreviewCard, CaptureCard, CaptureComposer (+sfx), HashtagSidebar, ResurfacingSection, feed empty-state/search/mentions, CaptureDetailPanel, ConvertCaptureToTaskDialog (font-serif drop).
