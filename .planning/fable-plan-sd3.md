# Unit: unit-landing — landing body sections to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md and docs/DESIGN-SYSTEM.md.

## Mission
The landing hero (ThesisSection: near-black plate, AmbientGlow bold, FocalOrb, cyan accent) and LandingHeader are DONE — do not rebuild them. The ~14 body sections are still composed on the old editorial register (78 font-serif remnants, zero sd tokens, no dimensional icons). Migrate them section-by-section onto the sd register so the public page reads as the same product as the app: Spacedrive-clean, dimensional icons, cyan-on-near-black.

## Fence
- apps/web/components/landing/** (EXCEPT ThesisSection.tsx — touch-ups only if a seam with restyled sections demands it, log as assumption)
- apps/web/app/page.tsx (light wiring only)
- NOTHING else. No ui/ primitives, no globals.css deletions (additive classes OK).

## Work
1. Sections in scope: BioSection, MeetKiwiSection, JarvisDemo (+JarvisDemoButton, VoiceInputCard, HeroJarvisLine), PrimitivesTable, EngineSection, ChoiceSection, BuildLog, SurfaceSection, MCPSection, FrameworkSection, DiagramBannerCard, SectionDivider/Eyebrow, LifeosCanvasPreview, WaitlistForm, LandingFooter, LandingSideNav, CursorSpotlight (keep if it fits the register — cyan, subtle).
2. Per section: keep ALL copy verbatim; recompose visuals onto sd grammar — card v2 plates for feature cards, chip/pill grammar for tags, 11px uppercase tracking eyebrows, mono for stats, dimensional icons (components/ui/icons) wherever a feature/primitive is named (PrimitivesTable and SurfaceSection especially — icon-led rows), sd-line hairlines instead of decorative borders. Landing stays dark-plate (the hero's near-black world) — carry the hero's `--sd-accent: var(--hud-cyan)` world down the page coherently; sections should feel like one continuous dark canvas, not stacked cards of different registers.
3. Motion: scroll-reveal fade-ups already patterned in ThesisSection (motion + useReducedMotion) — extend consistently, 140-160ms/opacity+translate only, staggered subtly. No parallax, no hover scales.
4. WaitlistForm + JarvisDemo inputs/buttons: style to sd input/button grammar with local classes (do NOT edit ui/ primitives).
5. Delete dead old-register CSS/props within the fence as you go.

## Verification
typecheck + build green. Headless (lock protocol) on your port: full-page landing capture (logged-out) at 1440 width — dark is the native state; verify light does not break (page forces .dark on the hero; ensure body sections stay coherent if the system is light). Per-section crops for the 3 biggest recompositions. Commit frames under .planning/. status=awaiting_review, WAIT.
