# unit-jarvis — sd3 verification note

Branch `sd3/unit-jarvis`. JARVIS console + routines/editors brought to the
Spacedrive register per `.planning/fable-plan-jarvis.md` + UI-CONTRACT-SD3.md.

## Gates
- `pnpm --filter web typecheck` → **green** (tsc --noEmit, clean).
- `pnpm --filter web build` → **green** (exit 0); `/jarvis` and `/today` compile.
- Compiled-CSS scan-gap check (§0): confirmed the new arbitrary utilities emit —
  `transition-duration:.14s` (duration-[140ms]), `var(--sd-hover)` ×4,
  `var(--sd-input)`, `var(--sd-accent)` ×4, `sd-menu-surface`, `sd-btn-solid`,
  `sd-btn-outline` all present in `.next/static/chunks/*.css`. Risky color-mix
  values were authored as inline `style={{}}` (not arbitrary utilities), so they
  never depend on the Tailwind scan.
- Headless (global lock protocol) on port 3832, 1440×900, BOTH themes.

## Evidence (`.planning/evidence/`)
- `sd3-jarvis-console-dark.png` / `sd3-jarvis-console-light.png` — console
  viewport: user turn (solid --sd-input plate), JARVIS turn (KiwiIcon mark +
  cyan mono label, recessed --sd-darker-box plate), clarification receipt, task
  receipt (cyan intent chip), --sd-darker-box composer strip; routines list.
- `sd3-jarvis-dark.png` / `sd3-jarvis-light.png` — full page: also the routine
  editor (cyan-focus fields, recessed trigger rows w/ cyan icon chips + hairline,
  BlockCards w/ drag handle + neutral tool chip + CHATTER pill, dashed add
  buttons) and the Personality editor (cyan-tint preset cards + segmented dials,
  sd-btn-solid saves).

Captured via a throwaway top-level preview route (`app/sd3jarvispreview`) that
mounted the real components with mock data to bypass the `(app)` auth gate. The
route + all playwright debris were deleted after capture; `git status` shows only
`.planning/` additions (no source or route residue). Console had **0 errors**.

## Register conformance
- No `.glass-tile` / `.glass-button` / `backdrop-blur` / `bg-gradient` / glow
  rings / `font-serif` anywhere in the fence (grep-clean).
- Single cyan accent throughout; functional red (`--ink-coral`) kept only for
  errors/deletes; decorative amber/sage/blue intent inks collapsed to cyan.
- Sanctioned cyan streaming indicators retained (streaming caret, thinking ring,
  scan-reveal, submit-ignite) reusing the existing `hud-*` keyframes per seed.
- globals.css touched ADDITIVELY only: appended sd overrides for the
  `.receipt-*` classes (consumed solely by JarvisReceipt, in-fence).
- Server hygiene: killed only `tcp:3832`; never pkill'd broad patterns.

Status → **awaiting_review**.
