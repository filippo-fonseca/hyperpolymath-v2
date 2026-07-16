# Unit: unit-fix-people-sidebar — person modal to sd + collapsed-rail hover wordmark [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, /design. The branch carries the full sd3 register: components/settings/sd-primitives.tsx, ui/dialog, components/people/* (roster already sd — unit-settings-misc shipped it, but the PERSON DETAIL MODAL was missed).

NOTE: inherited .planning/fable-plan-*.md files are other units' history — ignore them. THIS file is your seed.

## Mission (user-ordered pre-merge fixes, PR #294)
Two items, each its own atomic commit(s):

1. PERSON MODAL — Opening a person in /people surfaces a modal that is still OLD register ("the modal is not good and wasn't taken care of" — user). Bring it fully to sd: ui/dialog shell (already sd), content as sd plates — identity header (avatar chip + name + mono email), 11px uppercase section headers (tags, references, notes — whatever it has today), chip grammar for tags, mono counts, --sd-input fields for any editing, functional pills only. Match the jarvis/settings form grammar. Same features/data, new skin. If the modal's information design is genuinely poor (cramped, unordered), you may reorganize sections within the modal — no new features.

2. HOVER WORDMARK — When the sidebar is COLLAPSED (56px rail) and the pointer hovers the rail, the full-size "Hyperpolymath" wordmark (EB Garamond, the Logotype component) must show. Design (Conductor-sealed): the rail's top logo zone reveals the full wordmark as a floating flyout plate anchored at the rail's top-left — solid --sd-box plate, hairline border, 140ms opacity/4px translate; it must NOT expand the rail or shift layout, must respect pointer-fine (no touch hover artifacts), disappears on mouseleave, reduced-motion collapses to instant. Use the existing Logotype component (inline font-family fix per Sidebar.tsx history — beware the Tailwind scan gap §0).

## Fence
- apps/web/components/people/** (modal files), apps/web/components/shell/Sidebar*.tsx + the Logotype component if it needs a size prop. globals.css ADDITIVE only. ui/ primitives OUT (consume). Server hygiene §3: kill only tcp:3834.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on :3834: person modal open dark+light, collapsed rail WITH hover flyout visible dark (synthesize hover via mouse.move headlessly). §1 fallback if auth blocks (preview route, delete after). Evidence under .planning/ sd3- prefix. status=awaiting_review, WAIT.
