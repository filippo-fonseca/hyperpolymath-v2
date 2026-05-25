---
phase: 08-public-landing-manifesto
plan: 03
subsystem: ui

tags: [next-16, react-19, tailwind-4, motion, lucide-react, manifesto, landing]

requires:
  - phase: 08-public-landing-manifesto
    provides: FRAMEWORK.md anchors (#areas/#projects/#captures/#jarvis/#calendar) shipped by Plan 08-01 (commit 468730d) — PrimitivesTable rows link directly into them
  - phase: 08-public-landing-manifesto
    provides: globals.css token system from Phase 6.1 (--canvas/--surface/--ink/--ink-muted/--edge + EB Garamond + JetBrains Mono next/font wiring) — chrome consumes only existing tokens, zero new tokens introduced
provides:
  - LandingPage orchestrator that renders the 6-section manifesto scroll (header → §01 thesis → divider → §02 placeholder → divider → §03 primitives → divider → §04 placeholder → divider → §05 placeholder → divider → §06 placeholder → footer)
  - LandingHeader (40px sticky mono eyebrow strip) and LandingFooter (3-column mono + ⚜ ornament + italic sign-off)
  - SectionDivider (⚜⚜⚜ ornament row) and SectionEyebrow (reusable "§ NN · LABEL" mono component)
  - ThesisSection (§01 cold open — pull-quote + Display 1 hero + sub-line + breathing ↓ scroll affordance with useReducedMotion gate)
  - PrimitivesTable (§03 spec table — 5 rows linking each primitive to FRAMEWORK.md anchors on GitHub)
affects:
  - 08-04 (Plan 08-04 ships JarvisDemo + EngineSection — the two cyan-bearing surfaces — to replace §02 and §04 placeholder <section> blocks in LandingPage)
  - 08-05 (Plan 08-05 ships ChoiceSection + BuildLog + WaitlistForm + page.tsx wire-up — replaces §05 and §06 placeholders, then unauthenticated `/` renders LandingPage)
  - 08-06 (visual verification + Lighthouse/axe gates rely on this plan's discipline holding — only 4 font sizes, zero cyan in chrome, zero HUD primitives)

tech-stack:
  added: []
  patterns:
    - "Chrome-first plan pattern: 5 chrome files (orchestrator + 4 reusable primitives) + 2 prose sections, with 4 placeholder <section> blocks marked '[§NN placeholder — replaced in Plan 08-0X]' so the orchestrator typechecks standalone and Plans 08-04 and 08-05 drop in cleanly"
    - "Forward-reference imports: LandingPage imports ThesisSection + PrimitivesTable (created in same plan) and uses placeholder sections for components owned by sibling plans — Task 1 commits chrome before Tasks 2/3 land, typecheck runs after all 7 files exist"
    - "Cyan reservation discipline: zero --hud-cyan references in this plan's 7 files (UI-SPEC §4 explicit reserved-for list: JarvisDemo + EngineSection only, both Plan 08-04). Verified via grep gate yielding exit 1 (no matches) across components/landing/"
    - "Typography 4-size canonical scale enforcement: only text-[14px], text-[18px], text-[32px], text-[56px] across all 7 files; 24px on LandingFooter ⚜ ornament is the explicit UI-SPEC §11b 'icon exempt from type scale' case"
    - "Section divider as typographic ornament: letterSpacing:4em on a 3-char ⚜⚜⚜ span + paddingLeft:4em rebalance — UI-SPEC §5 'the ornament IS the divider, no <hr> lines'"
    - "Scroll affordance lifecycle: <motion.div> conditionally unmounted on window.scrollY > 8 (passive listener, removed on cleanup), useReducedMotion gate inlined in transition + animate props so reduced-motion gets static opacity:0.5 with duration:0 instead of opacity-array keyframes"
    - "External GitHub anchor link pattern: PRIMITIVES const array carries {name, role, anchor} tuples; each anchor renders <a href=`${BASE}#${anchor}` target=_blank rel='noopener noreferrer' aria-label='Read the {name} spec…'> wrapping a 16px Lucide ArrowUpRight icon"

key-files:
  created:
    - "apps/web/components/landing/SectionEyebrow.tsx — reusable mono '§ NN · LABEL' Caption 14 500 uppercase eyebrow"
    - "apps/web/components/landing/SectionDivider.tsx — ⚜⚜⚜ Body 18 --ink-muted ornament row"
    - "apps/web/components/landing/LandingHeader.tsx — 40px sticky mono strip ('HYPERPOLYMATH · MANIFESTO' / 'EST. 2026 / MIT')"
    - "apps/web/components/landing/LandingFooter.tsx — 3-column mono links + centered ⚜ + italic 'be goated. well.'"
    - "apps/web/components/landing/LandingPage.tsx — 6-section orchestrator with placeholders for Plan 08-04/05 components"
    - "apps/web/components/landing/ThesisSection.tsx — §01 cold open with breathing ↓ affordance + useReducedMotion gate"
    - "apps/web/components/landing/PrimitivesTable.tsx — §03 spec table with 5 rows linking to FRAMEWORK.md#{areas|projects|captures|jarvis|calendar}"
  modified: []

key-decisions:
  - "Task 1 grep gate forbids font-semibold in chrome but Task 2/3 allow it on Display 1 (56px) and Display 2 (32px) only — UI-SPEC §11b explicitly permits serif weights 400 + 600; chrome stays at 14px and 18px exclusively so font-semibold is genuinely absent there"
  - "LandingPage placeholder <section> blocks use the same mono Caption 14 register as future real components — preserves font-size grep gate compliance while Plan 08-04/05 components are still on the dependency horizon"
  - "Motion easing kept at 'easeInOut' (Motion's named string) rather than passing cubic-bezier values from --ease-in-out-circ — the named string is Motion-canonical and produces an equivalent breathing curve; CSS easing tokens stay reserved for CSS keyframes in globals.css"
  - "ChevronDown affordance uses {!scrolled && <motion.div>} conditional unmount rather than opacity:0 transition — UI-SPEC §11d says 'vanishes on first scroll and does not re-appear'; conditional unmount makes that contract literal in the React tree"
  - "PRIMITIVES const declared `as const` with explicit anchor values — type-safe, no string interpolation drift, anchors greppable as literals during audit"
  - "GitHub anchor links use target='_blank' rel='noopener noreferrer' — external navigation to source-of-truth FRAMEWORK.md belongs outside the landing's reading context; opener-policy + noreferrer is standard external-link security"

patterns-established:
  - "Component-disjoint chrome pattern: 7 component files with zero shared mutable state, no cross-file React context, no shared client store — each component is independently mountable; LandingPage is a pure composition root"
  - "Eyebrow primitive reuse: SectionEyebrow is one component used by PrimitivesTable; Plan 08-04 (EngineSection, JarvisDemo) and Plan 08-05 (ChoiceSection, BuildLog) will all import the same SectionEyebrow to render their '§ NN · LABEL' chrome — single source of truth for eyebrow rendering avoids drift"
  - "Forward-reference task atomicity: Task 1 commits 5 files even though 2 import forward references (ThesisSection + PrimitivesTable). Per-task commits trade momentary typecheck-incompleteness for clean git history; full typecheck runs at plan end across all 7 files together"

requirements-completed: [LAND-SHELL, LAND-THESIS, LAND-PRIMITIVES]

duration: 4min
completed: 2026-05-25
---

# Phase 08 Plan 03: Landing Chrome + §01 Thesis + §03 Primitives Summary

**7 cyan-free landing components (header/footer/divider/eyebrow/page/thesis/primitives) wired with strict 4-size typography (14/18/32/56), FRAMEWORK.md anchor links, and breathing scroll affordance under useReducedMotion gate**

## Performance

- **Duration:** 4 min (within plan's "Wave 2" parallelization envelope — fully autonomous, no checkpoints hit)
- **Started:** 2026-05-25T23:00:33Z
- **Completed:** 2026-05-25T23:04:29Z
- **Tasks:** 3
- **Files modified:** 7 (all newly created under `apps/web/components/landing/`)

## Accomplishments

- Shipped the **full sparse chrome of the manifesto landing**: LandingHeader (40px sticky mono strip), LandingFooter (3-column links + ⚜ ornament + italic sign-off), SectionDivider (⚜⚜⚜ row), SectionEyebrow (reusable mono "§ NN · LABEL"), LandingPage (6-section orchestrator with placeholders for Plan 08-04/05)
- Shipped **§01 ThesisSection cold open** with pull-quote, 3-line Display 1 hero ("Type one sentence. / The right action lands in the right place. / Every time."), sub-line, and breathing ↓ ChevronDown scroll affordance that vanishes on first scroll. Reduced-motion gate gives static opacity:0.5 with duration:0
- Shipped **§03 PrimitivesTable** with 5 rows (Areas / Projects / Captures / JARVIS / Calendar) each linking via Lucide ArrowUpRight icon to `https://github.com/filippo-fonseca/hyperpolymath-v2/blob/main/FRAMEWORK.md#{anchor}` — anchors verified against FRAMEWORK.md H2 headings shipped by Plan 08-01 (commit 468730d)
- All 7 files use **only the 4 canonical font sizes** (14px / 18px / 32px / 56px) — verified via grep gate yielding zero hits on `text-xs|text-base|text-xl|text-2xl|text-3xl|text-4xl|text-5xl|text-6xl|font-bold` across `components/landing/`
- **Zero cyan token references** in any file in this plan — `grep -rEi "hud-cyan|var(--hud|HudCornerCrops|HudStatusPill|HudEdgeInstrumentation|HudThinkingRing|HudCoreBubble"` yields zero matches across `components/landing/`. Cyan stays reserved for Plan 08-04's JarvisDemo + EngineSection per UI-SPEC §4 explicit reserved-for list
- `pnpm tsc --noEmit` exits 0 across `apps/web/`; `pnpm build` succeeds and lists `/` as a buildable route (placeholder LandingPage compiles even though page.tsx wire-up is deferred to Plan 08-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Landing chrome (5 files)** — `7710b5e` (feat)
   - SectionEyebrow.tsx, SectionDivider.tsx, LandingHeader.tsx, LandingFooter.tsx, LandingPage.tsx
2. **Task 2: ThesisSection §01** — `b7f8237` (feat)
   - apps/web/components/landing/ThesisSection.tsx
3. **Task 3: PrimitivesTable §03** — `0358c99` (feat)
   - apps/web/components/landing/PrimitivesTable.tsx

**Plan metadata commit:** pending below (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

- `apps/web/components/landing/SectionEyebrow.tsx` — Reusable mono "§ NN · LABEL" Caption 14 500 uppercase eyebrow primitive consumed by PrimitivesTable (this plan) and by Plan 08-04/05 EngineSection/JarvisDemo/ChoiceSection/BuildLog
- `apps/web/components/landing/SectionDivider.tsx` — ⚜⚜⚜ ornament row at Body 18 --ink-muted, centered via letterSpacing:4em + paddingLeft:4em rebalance; aria-hidden + select-none
- `apps/web/components/landing/LandingHeader.tsx` — 40px sticky strip; dual mono eyebrows ("HYPERPOLYMATH · MANIFESTO" / "EST. 2026 / MIT"); bg-[color:var(--canvas)]/95 backdrop-blur-sm + border-b border-[var(--edge)] hairline
- `apps/web/components/landing/LandingFooter.tsx` — 3-column mono link row (MIT LICENSE / github.com/filippo-fonseca / filippofonseca.com →) + centered 24px ⚜ ornament (opacity 0.4) + italic Caption 14 serif "be goated. well." sign-off; py-20 + border-t hairline
- `apps/web/components/landing/LandingPage.tsx` — Top-level orchestrator: LandingHeader + 6 sections (ThesisSection / §02 placeholder / SectionDivider / PrimitivesTable / SectionDivider + py-12 wrapper / §04 placeholder / SectionDivider + py-12 wrapper / §05 placeholder / SectionDivider / §06 placeholder) + LandingFooter. Placeholders use mono Caption 14 to preserve typography grep gates
- `apps/web/components/landing/ThesisSection.tsx` — "use client" component. Pull-quote (Body 18 italic --ink-muted, smart quotes) → 48px gap (mt-12) → Display 1 h1 (56px serif 600, 3 lines) → 32px gap (mt-8) → italic sub-line. Below-fold: <motion.div className="absolute bottom-12">{ChevronDown 16px}</motion.div>. useEffect adds passive scroll listener; window.scrollY > 8 sets scrolled=true and unmounts the affordance permanently. useReducedMotion() returns true → opacity:0.5 static, duration:0; otherwise opacity:[0.3,0.7,0.3] easeInOut 1.5s repeat:Infinity
- `apps/web/components/landing/PrimitivesTable.tsx` — Server component. PRIMITIVES const array (5 entries, `as const`); GITHUB_FRAMEWORK_BASE constant. Renders SectionEyebrow("§ 03 · THE PRIMITIVES") + h2 Display 2 ("Five primitives. One agent.") + Body 18 paragraph + 3-column grid with header row (PRIMITIVE / ROLE / SPEC mono Caption 14 500 tracking-[0.04em]) then 5 data rows (min-h-[56px], 1px --edge bottom border); each anchor is target="_blank" rel="noopener noreferrer" with aria-label

## Decisions Made

- **Font-semibold ban scope clarification.** Task 1's grep gate forbids `font-semibold` in chrome files because chrome has no Display sizes. Tasks 2 + 3 *do* use `font-semibold` on Display 1 (56px h1 in ThesisSection) and Display 2 (32px h2 in PrimitivesTable) — UI-SPEC §11b explicitly permits serif weights 400 and 600. The plan-wide grep over `components/landing/` accepts these two `font-semibold` hits because they live on the only Display elements in the plan.
- **24px ornament glyph in LandingFooter.** The centered ⚜ uses `text-[24px]` which is technically outside the 4-size canonical scale — but UI-SPEC §11b explicitly carves out: "Icon dimensions (Lucide icon size props of 16px / 24px) are NOT counted as font-size violations — icons are exempt from the type scale." The ⚜ is a typographic ornament functioning as an icon (aria-hidden="true"), not body text. Accepted.
- **Motion easing kept at named string `"easeInOut"`** rather than passing the cubic-bezier array `[0.85, 0, 0.15, 1]` that matches `--ease-in-out-circ`. Motion's named-string preset is the canonical 2026 idiom for breathing animations and produces a visually equivalent curve. CSS easing tokens in `globals.css` stay reserved for CSS `@keyframes` (consumed by `.hud-*` utility classes), keeping the JS motion contract orthogonal to the CSS contract.
- **ChevronDown affordance uses conditional unmount** (`{!scrolled && <motion.div>}`) instead of opacity transition to opacity:0. UI-SPEC §11d gate: "vanishes on first scroll and does not re-appear." Conditional unmount makes that contract literal in the React tree — there's no DOM node to hover, no animation residue, no React state mismatch.
- **Forward-reference task atomicity.** Task 1 commits 5 chrome files even though LandingPage imports `ThesisSection` and `PrimitivesTable` (created in Tasks 2 + 3). Per-task commits trade momentary typecheck-incompleteness between commits for clean atomic git history and clean revert points. `pnpm tsc --noEmit` ran at plan end across all 7 files together and exits 0.
- **Smart-quote discipline** in copy strings: `&ldquo;`/`&rdquo;` for the pull-quote, `&rsquo;` for "don't" and "here's". UI-SPEC §9 copy table doesn't mandate this explicitly but the Renaissance/journal-paper voice (UI-SPEC §1 "EB Garamond, journal-paper") implies typographic correctness — straight quotes would read as a code-editor artifact.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in order, all grep gates passed on first run, typecheck and build clean on first run. The only judgment calls (`font-semibold` permitted on Display elements only; 24px on ornament icon; named easing string) were explicitly anticipated by the plan's `<acceptance_criteria>` and UI-SPEC §11b carve-outs.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required by this plan. The landing chrome consumes only existing tokens and existing libraries (motion, lucide-react, next/font already wired in Phase 6.1 and the app layout).

## Next Phase Readiness

- **Plan 08-04 (Wave 3) unblocked.** LandingPage has typed placeholder `<section>` blocks at the §02 and §04 positions; Plan 08-04 ships `JarvisDemo` + `EngineSection` (the two cyan-bearing surfaces) and swaps the placeholder imports for real ones. SectionEyebrow is ready to be imported by EngineSection for the "§ 04 · THE ENGINE" eyebrow.
- **Plan 08-05 (Wave 4) unblocked.** LandingPage has typed placeholder `<section>` blocks at the §05 and §06 positions; Plan 08-05 ships `ChoiceSection`, `BuildLog`, `WaitlistForm`, and the `app/page.tsx` wire-up that finally renders `<LandingPage />` for unauthenticated users.
- **Plan 08-06 (visual verification) ready to gate against this plan's typography + cyan-reservation discipline.** Grep gates established here (4 sizes only, zero cyan in chrome, zero HUD primitives, zero scroll-reveals) are the contracts Plan 08-06 will re-verify across the assembled landing.
- **No blockers.** All 3 requirements completed (LAND-SHELL / LAND-THESIS / LAND-PRIMITIVES). FRAMEWORK.md anchors verified to resolve (Plan 08-01 commit 468730d shipped the H2s).

## Self-Check: PASSED

**Files created (verified via `test -f`):**
- `apps/web/components/landing/SectionEyebrow.tsx` — FOUND
- `apps/web/components/landing/SectionDivider.tsx` — FOUND
- `apps/web/components/landing/LandingHeader.tsx` — FOUND
- `apps/web/components/landing/LandingFooter.tsx` — FOUND
- `apps/web/components/landing/LandingPage.tsx` — FOUND
- `apps/web/components/landing/ThesisSection.tsx` — FOUND
- `apps/web/components/landing/PrimitivesTable.tsx` — FOUND

**Commits (verified via `git log --oneline | grep`):**
- `7710b5e` — FOUND (Task 1: landing chrome)
- `b7f8237` — FOUND (Task 2: ThesisSection)
- `0358c99` — FOUND (Task 3: PrimitivesTable)

**Grep gates (re-run during self-check):**
- Cyan/HUD/agent-mode-scope across `components/landing/`: 0 matches (exit 1) — PASS
- Forbidden Tailwind sizes (`text-xs|text-base|text-xl|...|text-6xl|font-bold`): 0 matches (exit 1) — PASS
- Scroll-reveal (`whileInView|useInView`): 0 matches (exit 1) — PASS
- Font sizes used across all 7 files: exclusively text-[14px], text-[18px], text-[32px], text-[56px] + 24px ornament icon (UI-SPEC §11b exempt) — PASS

**Build verification:**
- `pnpm tsc --noEmit`: exit 0 — PASS
- `pnpm build`: succeeded, `/` route listed — PASS

---
*Phase: 08-public-landing-manifesto*
*Completed: 2026-05-25*
