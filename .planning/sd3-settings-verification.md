# sd3 — unit-settings-misc verification note

**Unit:** settings + long-tail surfaces → the Spacedrive (sd) register
**Branch:** `sd3/unit-settings-misc`  ·  **Port:** 3833  ·  **Status:** awaiting_review

## Scope delivered
Full sd-register pass over the last OLD-register real estate. Same features and
data flow, new skin. Surfaces touched:

- **Settings** — hub (`app/(app)/settings/page.tsx`), `SettingsSectionNav`, all
  subpage clients (mcp-tokens, desktop, context, memory) + the settings
  component family (Profile, ApiKeys, DangerZone, Gcal, PagesBackup, voice/*,
  memory/*). New shared `components/settings/sd-primitives.tsx`
  (SettingsCard / SectionEyebrow / CardTitle / CardDescription) mirroring the
  Jarvis Personality-editor form grammar.
- **People** — roster (`PeopleClient`), `PersonCard` (glass-tile → sd mini
  entity card), `PersonDetailPanel`, `PersonEditDialog`, `PersonAvatar`.
- **Graph** — `GraphExplorer` chrome + `graph/page.tsx` empty state. Canvas
  rendering + node color palette (data-viz) left untouched per fence.
- **Onboarding** — `onboarding-flow.tsx`: violet/blue dual-accent collapsed to
  the single cyan; glass card + ambient gradient blobs → sd plate.
- **Product tour** — `shell/ProductTour.tsx` coachmark.
- **Long-tail** — `/manifesto`, `/branding` (+`AssetTile`), `/health`.

## Register compliance
- Fence-wide sweep for `glass-tile` / `glass-button` / `lifeos-glass` /
  `backdrop-blur` / `bg-gradient` / `shadow-glow` / `hover:scale` / `font-serif`:
  **CLEAN** (zero hits).
- Single cyan accent everywhere; violet/blue purged. Functional amber/coral/sage
  kept only as status dots/chips. Two-tier selection (neutral `--sd-selected`
  backplate, no accent rings) on nav rail + people tag filters.
- Legacy neutral tokens (`--ink`/`--edge`/`--surface`/`--canvas`/`--hud-cyan`)
  mapped to `--sd-*` across the whole area; cyan focus ring.
- Motion: gradients/glow shadows removed; transitions are opacity/transform/color
  120–150ms. No new arbitrary Tailwind utilities introduced (consumed existing
  `.sd-*` classes, real classes, or inline `style` var lookups — §0 scan gap).

## Gates
- `pnpm --filter web typecheck` → **PASS** (tsc --noEmit, clean).
- `pnpm --filter web build` → **PASS** (exit 0; all fence routes compiled:
  /settings/*, /people, /graph, /onboarding, /manifesto, /branding, /health).
  (First build attempt failed only on missing `DATABASE_URL`; env files were not
  auto-propagated into this worktree — copied from repo root, gitignored, tree
  stays clean. Re-run green.)

## Evidence (1440×900, headless, both themes)
Under `.planning/sd3-settings-evidence/`:
- `sd3-settings-dark.png`, `sd3-settings-light.png` — settings hub form grammar
  (section nav rail, WidgetCard-v2 plates, CardTitle icon chips, segmented theme
  toggle, amber "needs key" status dot) in both themes.
- `sd3-people-dark.png` — roster of sd mini entity cards + neutral tag-filter
  pills + cyan reference counts.
- `sd3-onboarding-dark.png` — welcome step: single cyan accent, sd plate, kiwi
  hero, calm (no violet/blue, no gradient wash).

### Auth fallback (§1)
Settings, people, graph, health, onboarding are auth-gated (page-level
`requireOnboarded()` → 307 /sign-in; middleware only refreshes the session).
Evidence was captured via a **sanctioned throwaway preview route**
(`app/zzpreview`, mock data, next-themes `setTheme` to force each theme). It was
**deleted after capture**; `git status` is clean (only the seed plan + this
evidence dir are untracked). The Conductor pixel-verifies the authed surfaces on
:3000 post-merge. `/manifesto` and `/branding` are public (HTTP 200) and were
additionally reachable directly.

## Assumptions / notes for the Conductor
- **HudCoreBubble hero on onboarding welcome (150px):** kept as-is. It is the
  blessed brand presence sphere (`components/shared/HudCoreBubble.tsx`, OUT of
  this unit's fence, also on the shipped landing hero). The §0 ">40px orb" /
  "no glow" lines read as content-surface rules; this is the deliberate hero
  brand moment. Flagging in case you want it shrunk/removed — it is a one-line
  size change at the callsite.
- `font-serif` removed on sight where files were touched; it is a no-op alias for
  Space Grotesk (renders identically), so those strips are zero visual change.
- Graph node color palette (area/project/task/… hues) is data-viz for the force
  graph and was intentionally left; only the surrounding chrome went sd.
