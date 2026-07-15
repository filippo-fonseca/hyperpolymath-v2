# Unit: unit-captures — /captures to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, live sd exemplars: components/lifeos/RecentCapturesWidget.tsx (captures row grammar already sd there), components/tasks/*, /design.

NOTE: any .planning/fable-plan-sd3.md here is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
/captures is OLD register and high-traffic (Scout A: CaptureCard.tsx 557 lines glass-tile :249; CaptureComposer.tsx 516 glow :445; LinkPreviewCard.tsx 5x glass :74-126; HashtagSidebar.tsx :94; CaptureDetailPanel, ResurfacingSection; 46 legacy --ink refs). This is GH issue #286 (Wave A) territory. Full pass to sd: same features (composer, feed, hashtags, link previews, resurfacing, detail panel), new skin.

## Fence
- apps/web/components/captures/** and apps/web/app/(app)/captures/**
- globals.css ADDITIVE only. ui/ primitives OUT (already sd — consume).
- SFX: lib/ui/sfx.ts exists on your branch — fire `captureSent` on successful capture send (see .planning/SFX-WIRING.md). Note: the send path may already play playSend; per wiring notes REPLACE that call with the sfx cue in your fence (no double-chime).

## Register requirements
- Feed: capture cards as WidgetCard-v2-derived mini plates or clean sd list rows — hairline separators, chip strip for hashtags/meta (h-10 footer strip grammar), mono timestamps, single cyan accent.
- CaptureComposer: `--sd-input` writing surface, no glow ring; send button = primary accent; attach/voice verbs as ghost icon row; 140ms send micro-motion + sfx.captureSent.
- LinkPreviewCard: solid sd plate, image thumb 1px hairline, no blur/glass; domain as 11px mono chip.
- HashtagSidebar: sidebar row grammar (rounded px-2 py-1, active bg tint only), 11px uppercase section header, count badges per sidebar grammar.
- ResurfacingSection + CaptureDetailPanel: sd plates, functional pills; detail panel matches tasks' inspector grammar where reusable.
- Motion zero-jank; reduced-motion collapses. Tailwind scan gap (§0) applies.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3830: /captures dark+light 1440x900, composer focused, link-preview crop, hashtag rail crop. Authed-impossible fallback per §1 (token audit + compiled-CSS proof; Conductor pixel-verifies on :3000). Evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
