# bgsd session — `studio-1783439356`

**Request:** "the new studiolo" — build **Studio**, an opt-in, hand-gesture-controlled 3D holographic dashboard for hyperpolymath v2, as a ground-up replacement for the scrapped over-engineered 3D "world" attempt. North star: **simplicity over spectacle**.

**Scale:** project · **Harness:** driven from Cursor (Opus builders + Fable pre-planners) because the Anthropic/Claude-Code quota was hit mid-session. Model equivalents: planners = `claude-fable-5-thinking-high`, builders = `claude-opus-4-8-thinking-high`.

**Outcome:** ✅ Waves 1–4 COMPLETE and **merged into `next`** at `d934726` (merge commit `ae9140d` + one flake-fix commit). Loop-2 green on the integrated tree: typecheck clean, **155/155 studio tests** (stable across 8 consecutive runs), **production build compiles** with `/studio` as a dynamic route. Nothing pushed to origin (awaiting explicit go-ahead). Live UAT of the animations/bloom still pending (jsdom can't assert them).

---

## What Studio is (as shipped)
`/studio` — an opt-in route behind a WebGL2 capability gate. Additive over the mouse; the whole 3D bundle is code-split so non-`/studio` routes ship zero 3D bytes.

- **Ambient widget cloud** — five glowing billboard tiles (Tasks, Captures, Agenda, Habits, Journal) on a fibonacci sphere, gently drifting; raycast hover.
- **DOM focus/expand overlay** — expanding a tile renders the REAL app widget as a crisp DOM panel above the `<Canvas>` (text stays sharp, fully interactive).
- **MediaPipe HandLandmarker hand driver** — implements the same `StudioInputDriver` contract as the mouse: open hand = move cursor (index fingertip), quick fist-pulse = expand (air-click), fist-hold ≥0.5s = collapse, fist + lateral motion = swipe.
- **Camera-consent onboarding** — driver constructed only after explicit opt-in; persisted pref in localStorage.
- **Hand reticle** (Wave 3) — always-on brass cursor visible in hand mode; snaps/glows over tiles, pulses on intents.
- **Swipe paging** (Wave 3) — swipe left/right while a widget is expanded to page through the five widgets (wrap-around carousel).
- **Warm candlelit postprocessing** (Wave 3) — bloom tuned to warm brass (not neon), candleflame rims, demand-frame rendering preserved.

## Wave / unit ledger
- **Wave 1** (foundation): `input-core`, `scaffold`, `data-adapter` — merged.
- **Wave 2** (experience): `widget-cloud`, `focus-overlay`, `hand-driver` — merged (Conductor pre-seam: `active-widget.ts` store + `StudioLoader` + `StudioInputProvider`).
- **Wave 4** (pulled forward): `onboarding-permissions` — merged (camera consent + hand-control hook).
- **Wave 3** (polish): `hand-reticle`, `split-screen`, `aesthetic-perf` — merged. (Waves 3 and 4 were done out of numeric order: hand control was pulled forward to unblock live testing.)

## Key decisions / seams (so the next Conductor doesn't relitigate)
- **`active-widget.ts`** is an ordered-list external store; `StudioFocusOverlay` is its **SINGLE WRITER** (translates `expand`/`collapse`/`swipeLeft`/`swipeRight` intents → store). Everything else only reads. Do not add a second store-writing intent subscription.
- **Intent contract** (`lib/studio/input/types.ts`) is `expand | collapse | swipeLeft | swipeRight` ONLY — there are no vertical/up-down swipes (the recognizer rejects vertical motion). Two Fable planners independently rediscovered this.
- **`hand-status.ts`** external store: single writer is `useHandControl`; the reticle reads it. Reticle visibility = `handStatus==="running" && cursor.active` (never duplicates the mouse cursor).
- **`StudioDebugCursor`** (`?studioDebug=1`) is a separate dev tool with `data-studio-*` attributes Playwright depends on — do NOT remove/merge it into the production reticle.
- **PostFX invariant:** `<PostFX/>` MUST stay the last child of `StudioScene`; bloom must not break demand-frame (`frameloop="demand"`) rendering. Bloom params live in `env/postfx.params.ts` with an invariant test (`luminanceThreshold===1.0`).
- **Camera fix:** `apps/web/next.config.ts` Permissions-Policy is `camera=(self), microphone=(self), geolocation=()`. It shipped as `camera=()` (empty = blocked origin-wide) which silently suppressed the getUserMedia prompt. **Arc suppresses the prompt regardless** (collapsed toolbar); Safari + Chrome prompt fine — pre-allow via `arc://settings/content/camera` if using Arc.

## Verification (integrated `next`)
- `pnpm --filter web typecheck` → clean.
- `pnpm --filter web test -- --run studio active-widget postfx hand-status` → 155/155 (17 files), stable 8/8 runs.
- `pnpm --filter web build` → green, `/studio` dynamic route emitted.
- The only merge conflict was `pnpm-lock.yaml` (auto-resolved; validated with `pnpm install` → "Lockfile is up to date"). One flaky Wave-2 test (`studio-focus-overlay.test.tsx`) was hardened (await the AnimatePresence swap unmount) — commit `d934726`.

## OPEN ITEMS (for the next session)
1. **Push `next`** — NOT done. Local `next` is ahead of `origin/next` by (175 pre-existing + 58 studio) commits. Push only on explicit user approval.
2. **Live UAT** — the reticle pulse/flick/hover feel, swipe-paging animation, and bloom taste need one human visual pass in hand mode (jsdom can't verify). Bloom intensity may want ±0.15 nudging on-device.
3. **Prune worktrees/branches** — after merge is confirmed, prune the unit worktrees (`hpv2-studio-{input-core,scaffold,data-adapter,widget-cloud,focus-overlay,hand-driver,onboarding,hand-reticle,split-screen,aesthetic-perf}`) and their `bgsd/studio-*` branches. Kept for now pending user OK.
4. **`studio` integration branch** (`bdb1c35`) is now subsumed by `next` (`d934726`); safe to delete after push.
5. Dev server was running from the `hyperpolymath-v2-studio` worktree on :3001 during the session; the `next` worktree (`routines-test`) has unrelated uncommitted work (`.gitignore`, `CLAUDE.md`, `Cargo.lock`) and needs its own `pnpm install` before running `/studio` (3D deps added).

## Where the work lives
- Integrated branch: **`next` @ d934726** (worktree `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-routines-test`).
- Studio source: `apps/web/components/studio/**`, `apps/web/lib/studio/**`, `apps/web/app/(app)/studio/page.tsx`, tests `apps/web/tests/studio-*`.
- Fable plans + Conductor reconciliations per unit: `.planning/fable-plan.md` + `.planning/RECONCILE.md` in each `hpv2-studio-*` worktree.
- Run control state: `.bgsd/runs/studio-1783439356/`.
