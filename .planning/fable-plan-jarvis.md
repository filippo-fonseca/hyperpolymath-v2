# Unit: unit-jarvis — /jarvis console + routines/editors to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, live sd exemplars on this branch: components/habits/* + components/journaling/* (fresh full-page reskins), components/voice/FloatingJarvisStatus.tsx (the new kiwi HUD grammar), /design.

NOTE: any .planning/fable-plan-sd3.md here is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
The JARVIS console + routines editors are OLD register (Scout A: JarvisClient.tsx glass-tile shell :128; JarvisScrollback, JarvisReceipt, JarvisClarification backdrop-blur :56; routines: StartupEditor glass :119/:137/:194, PersonalityEditor 4x glass :11/:113/:164/:196, RoutineEditor, RoutinesClient, BlockEditor, TriggerBuilder, BlockCard; ~15 glass hits, 88 legacy --ink refs). This is JARVIS's own home — it should feel the MOST space-console of everything: cyan-on-dark precision, mono readouts, kiwi brand presence.

## Fence
- apps/web/components/jarvis/** and apps/web/app/(app)/jarvis/**
- apps/web/components/routines/** (if routines components live elsewhere, locate them; routes under (app)/jarvis/routines or (app)/routines are in fence)
- globals.css ADDITIVE only. ui/ primitives OUT. components/voice/* OUT (another unit shipped it — consume its grammar as reference only).

## Register requirements
- Console (JarvisClient/Scrollback/Receipt/Clarification): solid `--sd-darker-box` console plate, mono timestamps + receipts, cyan streaming/typing indicators reusing existing hud-* keyframes, KiwiIcon 16px as JARVIS's message avatar/mark, user vs JARVIS turns separated by hairlines or subtle bg tint (no bubbles-with-glow), functional pills for tool receipts (ran/failed = cyan/coral). No backdrop-blur anywhere — clarification overlay = plain rgba dim.
- Routines/Startup/Personality editors: sd form grammar — section plates (WidgetCard v2), 11px uppercase section headers, `--sd-input` fields, chip pickers, BlockCard as mini entity-card with dimensional/lucide icon chip + drag affordance (no hover scale), TriggerBuilder rows per sidebar row grammar.
- Single cyan accent; JARVIS may use slightly denser cyan presence than other pages (it's the HUD heart) but NO glow rings/gradients — density via mono readouts, hairlines, state dots.
- Motion: streaming caret/thinking sweeps from existing hud-* keyframes; 140ms transitions; reduced-motion collapses.
- Tailwind scan gap (§0). Server hygiene §3: kill only tcp:3832.

## Verification
typecheck + build green. Headless (lock protocol) on port 3832: console dark+light 1440x900 (mock a short scrollback via a throwaway preview route if auth blocks — delete it after, verify clean tree), routines list, one editor open (Personality or Startup), BlockCard crop. Evidence under .planning/ sd3- prefix. status=awaiting_review, WAIT.
