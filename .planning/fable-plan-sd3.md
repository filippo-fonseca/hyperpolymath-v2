# Unit: unit-primitives — shared UI primitives to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md and docs/DESIGN-SYSTEM.md + /design route code (the canonical grammar).

## Mission
Highest-leverage unit of the session: every modal, menu, and secondary button app-wide still inherits the BANNED glass register from a handful of shared primitives. Convert them to sd so the whole app snaps toward the register. Scout evidence: button.tsx:44-45 (`outline`/`secondary` = glass-button), dialog.tsx:56 (glass-tile panel + backdrop-blur-md overlay), insights/tile-style.ts:14 (`NEUMORPHIC_TILE = "rounded-xl glass-tile"` + glow stack :22-23).

## Fence
- apps/web/components/ui/: button.tsx, dialog.tsx, alert-dialog.tsx, command.tsx, dropdown-menu.tsx, select.tsx, sheet.tsx, popover.tsx, card.tsx, input.tsx, textarea.tsx, tooltip if glassy
- apps/web/components/insights/tile-style.ts
- apps/web/app/globals.css ADDITIVE only (sd utility classes). Do NOT delete the .glass-* definitions — other surfaces still consume them until the feature waves land; a closeout unit excises them.
- NOTHING else. No call-site edits: public APIs, exported names, variant names, and prop contracts stay IDENTICAL so zero consumers change.

## Register (from /design + DESIGN-SYSTEM)
- Buttons: solid sd grammar — default = accent (cyan) solid; outline/secondary = `--sd-input`/`--sd-box` surface + `--sd-line` border, ink-dull text, no blur/glow; ghost = transparent + hover bg tint; destructive = functional red. 120ms color-only transitions.
- Dialog/AlertDialog/Sheet: panel = solid `--sd-box`, rounded-[14px], `--sd-line` border, inset top hairline (card v2 grammar); overlay = plain rgba dim, NO blur; enter/exit opacity+2-4px translate, ~150ms, reduced-motion collapses.
- Command menu / dropdown / select / popover: solid `--sd-darker-box` or `--sd-box` panels, 1px `--sd-line`, row grammar like the sidebar (rounded px-2 py-1 text-sm, active = bg tint only), 11px uppercase group headers.
- Inputs/textarea: `--sd-input` bg, `--sd-line` border, cyan focus ring 1px (no glow spread).
- tile-style.ts: NEUMORPHIC_TILE → WidgetCard v2 plate grammar; kill the glow stack; keep the exported names so all insights consumers restyle for free.
- Both themes via tokens. Beware the Tailwind scan gap (§0): prefer already-emitted utilities or real CSS classes; verify new arbitrary utilities are actually in compiled CSS.

## Verification
typecheck + build green. Headless captures (lock protocol) on your port of /design (both themes) plus one dialog open (e.g. /design if it has one, else any reachable page's dialog — the command menu ⌘K is a good target) dark+light. Commit frames under .planning/. status=awaiting_review, WAIT.
