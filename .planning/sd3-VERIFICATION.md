# sd3 · unit-closeout — Verification note

Branch `sd3/unit-closeout`, base `38291bff` (bgsd/sd-all-features, all 15 build units merged). Five atomic commits:

| commit | subject |
|---|---|
| `459e12fc` | migrate residual glass consumers to sd surfaces |
| `ec6f63ae` | excise dead glass/sidebar/lifeos CSS from globals |
| `6309b67a` | extend DESIGN-SYSTEM canon for sd3 systems |
| `76185300` | add sd3 sections to the /design living reference |
| `f2375678` | strip JARVIS composer glow layer (Tester-r5 D1) |

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

RUN.md (2026-07-15) steered Tester-r5 defect **D1 (composer glow layer)** into this unit: "strip 12px blur layer, keep 2px ring." Implemented in commit `f2375678` by stripping the breathing `8→14px var(--hud-cyan-glow)` blur from the `hud-focus-breathe` keyframe (glow rings are banned, §0), leaving the flat 2px cyan ring. Kept as a keyframe with identical stops so the `JarvisInput` class binding needs no feature-component edit. The separate typing-dot micro-indicator glow is left intact (it is a functional cue, not the flagged composer ring). D2 (hashtag rail) was queued by the Conductor (item-b1703636 / GH #293), not this unit.
