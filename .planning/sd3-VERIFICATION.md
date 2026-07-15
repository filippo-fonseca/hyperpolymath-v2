# sd3 · unit-closeout — Verification note

Branch `sd3/unit-closeout`, base `38291bff` (bgsd/sd-all-features, all 15 build units merged). Atomic commits:

| commit | subject |
|---|---|
| `459e12fc` | migrate residual glass consumers to sd surfaces |
| `ec6f63ae` | excise dead glass/sidebar/lifeos CSS from globals |
| `6309b67a` | extend DESIGN-SYSTEM canon for sd3 systems |
| `76185300` | add sd3 sections to the /design living reference |
| `1f0d0b33` | verification note + PR dossier + both-theme evidence |
| `f2375678` | (reverted) mis-targeted JarvisInput keyframe for D1 |
| `f7536cb3` | Revert f2375678 |
| `198d785c` | strip banned glow from unified focus ring (Tester-r5 D1, correct target) |

---

## 1. Glass excision — grep proofs (before → after)

**Residual consumers fixed first** (commit `459e12fc`), so the CSS deletion left zero dangling references. Real consumers = className usages, excluding comments, `globals.css`, and `.planning`.

| class | consumers BEFORE | consumers AFTER | disposition |
|---|---|---|---|
| `.glass-tile` | 2 (`PageDetailClient` badge, `PageProperties`) | **0** | → sd surface (`--sd-box`/`--sd-line`/inset hairline) |
| `.glass-button` | 3 (`PageProcessingRunsMenu`, `PropertiesManagerModal`, `PageDetailClient`) | **0** | → sd control (`--sd-box`/`--sd-line`/`--sd-hover`) |
| `.glass-toast` | 1 (`app/(app)/layout.tsx`) | **0** | → `.sd-toast` (solid, blur-free) |
| `.glass-pressed` | 0 | **0** | dead — deleted |
| `.sidebar-row` (+`-active`/`-area`) | 0 | **0** | dead (sidebar rebuilt on sd rail) — deleted |
| `.sidebar-chip` | 0 | **0** | dead — deleted |
| `.sidebar-ghost-btn` | 0 | **0** | dead — deleted |
| `.sidebar-tree` / `.sidebar-branch` (CSS class) | 0 | **0** | dead (`#sidebar-tree` id + `["sidebar-tree"]` query-key are NOT the class) — deleted |
| `.lifeos-glass` (+`.dark`) | 0 | **0** | dead (LifeOS on sd widget grid) — deleted |

After-state proof (app-wide, real consumers): every class above → **0**.
Class selectors remaining in `globals.css` matching `^\.glass-|^\.sidebar-|^\.lifeos-`: **0**.

### `--glass-*` knobs — pruned vs. retained

The knobs are NOT the glass classes; they are soft-UI shadow primitives that live sd surfaces still compose directly. Usage counted app-wide as `var(--<knob>)`.

| knob | usages after class deletion | action |
|---|---|---|
| `--glass-glow-color` | 0 | **pruned** |
| `--glass-glow` | 0 | **pruned** |
| `--glass-glow-hover` | 0 | **pruned** |
| `--glass-bg-button` | 0 | **pruned** |
| `--glass-raise-sm` | 0 | **pruned** |
| `--glass-drop-sm` | 0 | **pruned** |
| `--glass-blur` | 0 (was only a `.glass-tile` fallback + `.lifeos-glass` override) | gone with classes; no `:root` def existed |
| `--glass-raise` | 4 | **kept** (LandingSideNav, receipts) |
| `--glass-drop` | 4 | **kept** |
| `--glass-hi` | 9 | **kept** (LandingSideNav, AreasTree, ProjectAutocomplete, PageProperties, receipts) |
| `--glass-lo` | 6 | **kept** (ProjectAutocomplete, PageProperties, receipts) |
| `--glass-border` | 1 | **kept** (ProjectAutocomplete) |
| `--glass-bg` | 2 | **kept** (LandingSideNav, receipts) |

Dead-knob refs remaining in `globals.css`: **0**. Braces balanced (275 `{` / 275 `}`).
`globals.css` net: **26 insertions, 179 deletions** (−153 lines).

---

## 2. Integration gates

| gate | result |
|---|---|
| `pnpm --filter web typecheck` | **PASS** (`tsc --noEmit`, exit 0) — run post-excision and again after /design + SfxPlayground additions |
| `pnpm --filter web build` | **PASS** (exit 0, full route table) — compiles CSS + TypeScript clean |
| dev/prod boot on `:3836` | **PASS** — `next start -p 3836`, `/` → 200, `/design` → 200 |
| console errors (public route) | **PASS** — zero application errors. The only 4 console errors are `/_vercel/insights` + `/_vercel/speed-insights` 404s, which exist only on Vercel prod infra, not local `next start` (infra artifact, not app code) |

**Env note (infra-blocked, not a code defect):** the worktree carries no `.env*` files (env propagation gap), so a bare `pnpm --filter web build` fails at *page-data collection* with `DATABASE_URL is not set` — after a clean `✓ Compiled successfully` + `Finished TypeScript`. Providing dummy `DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_*` (a static build never connects) yields a fully green build. The failure is purely the missing worktree env, identical to the known preview-build env gap.

---

## 3. Headless evidence (`:3836`, one browser, lock protocol honored)

Lock `/tmp/bgsd-browser.lock` acquired before and released immediately after capture; never held during builds. 1440×900. Theme driven via the real `hyperpolymath-theme` storageKey.

- `.planning/evidence/sd3-closeout-design-dark-1440x900.png` — /design dark viewport
- `.planning/evidence/sd3-closeout-design-dark-full.png` — /design dark full page (all §01–§15, incl. the four new sd3 sections)
- `.planning/evidence/sd3-closeout-design-light-1440x900.png` — /design light viewport
- `.planning/evidence/sd3-closeout-design-light-full.png` — /design light full page
- `.planning/evidence/sd3-closeout-landing-hero-dark-1440x900.png` — landing hero dark **no-regression sentinel** (Kiwi orb + cyan accents intact; excision did not touch it)

Both themes resolve; dark and light frames differ (distinct md5). New /design sections (§12 SFX, §13 Data-series, §14 JARVIS console, §15 scan-gap escape) render correctly in both.

---

## 4. Canon docs

- `docs/DESIGN-SYSTEM.md`: extended in place — §9 (WidgetCard v2 spread), §13 (shared dimensional-icon recipe consumption), plus new §20 (JARVIS console grammar), §21 (data-series color law), §22 (SFX core pack), §23 (inline-style token routing). Existing §1–§19 numbering and cross-refs untouched.
- `/design` route: added §12–§15 specimens, including a live `SfxPlayground` client island bound to the shipped `sfx` facade.

---

## 5. Tester-r5 D1 (Conductor-steered fence extension)

The Conductor delivered D1 through the control-file steering channel: *"FENCE EXTENSION — apps/web/components/captures/CaptureComposer.tsx. The focused composer's box-shadow stacks a third layer `rgba(34,211,238,0.18) 0 0 12px 0` — a banned glow. Remove ONLY that blur layer; keep the crisp accent focus ring (unified focus-ring law)."*

Root cause: the composer's focus box-shadow comes from the shared **`--ring-focus`** token (the unified focus-ring law — aliased by `--ring-doc`/`--ring-hud`, applied app-wide at the `:focus-visible` rule in `globals.css`). Its third layer was `0 0 12px var(--hud-cyan-glow)` (`--hud-cyan-glow` = `rgb(34 211 238 / 0.18)` = the steer's `rgba(34,211,238,0.18)`).

**Fix (commit `198d785c`):** stripped the glow layer from **both** `--ring-focus` definitions — light (`0 0 10px`) and dark (`0 0 12px`) — keeping the crisp cyan ring (`0 0 0 2px var(--canvas), 0 0 0 4px var(--hud-cyan)`). Verified per the steer by grepping the shadow literal: **0** `hud-cyan-glow` layers remain in either `--ring-focus`. This is a `globals.css`-only change (my sanctioned file) and de-glows the unified focus ring app-wide, consistent with §0's glow-ring ban.

**Correction note:** an earlier commit `f2375678` mis-targeted the `JarvisInput` `hud-focus-breathe` keyframe (a wrong guess before the steering arrived); it was reverted (`f7536cb3`), restoring that keyframe untouched, before the correct `--ring-focus` fix landed.

D2 (hashtag rail vs inline tags) was queued by the Conductor (item-b1703636 / GH #293), not this unit.
