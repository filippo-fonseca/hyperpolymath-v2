# Issue #43 recap — hashtag chip colors + text-field outline polish

**Status:** resolved (closes #43)
**Branch:** `kiwi/auto/2026-06-16-issue-43`
**Pipeline:** `/gsd:quick` (worktrees disabled for this run via `workflow.use_worktrees=false`; committed directly on the current branch; nothing pushed)
**Commits:**
- `21fb795` fix(captures): harmonize hashtag chip bg with --ink-sage brand token
- `29f724b` fix(ui): align Input/Textarea focus border with calm global ring

## The complaint

Two adjacent polish items on the Jarvis surface:

1. The `#hashtag` chip in capture/Jarvis inputs reads as a fluorescent yellow-green that feels off-brand against the parchment palette.
2. Some text fields show an inconsistent outline/focus state.

## Root cause

Both were token-level drift, not architectural problems.

1. **Hashtag chip:** `.hashtag-chip-inline` / `.hashtag-chip-live` in `globals.css` and `HashtagChip.tsx` were using raw Tailwind `rgb(101 163 13 / X)` (lime-600) as the chip background, even though the design-system token for hashtags is `--ink-sage` (a muted forest-green `oklch(62% 0.09 145)`). The comment claimed "Sage alpha register" but the value was pure lime. Lime + sage text together is the yellow-green clash the issue flagged.

2. **Input/Textarea focus border:** The global `input:focus-visible` / `textarea:focus-visible` rule in `globals.css` already paints both `border-color` and the focus ring as the calm neutral `--edge-hud` (intentional — the inline comment notes "Text-entry fields get a calm, neutral focus ring — NOT the amber doc ring"). But the `Input` and `Textarea` primitives were independently overriding focus border to `--ink-amber`, producing an amber-border-inside-cyan-ring focus state on every non-Jarvis input — visually noisy and inconsistent with itself.

## The fix

Two atomic commits, both scoped to design-token alignment. No new tokens, no architectural changes.

### Commit 1 — `21fb795` (captures hashtag chip)

Replace `rgb(101 163 13 / X)` with `color-mix(in oklch, var(--ink-sage) Y%, transparent)` so the chip background is derived from the actual brand sage ink. Same alpha ladder (idle 12% / hover 22% / selected 32%) preserves the visual hierarchy. Selected-state text bumped from `--ink-sage` to `--ink` for legibility on the deeper tint (sage-on-sage was too low contrast). Inline editor chips (`.hashtag-chip-inline`, `.hashtag-chip-live`) also switched to `--ink` text for the same reason.

Files:
- `apps/web/app/globals.css`
- `apps/web/components/captures/HashtagChip.tsx`

### Commit 2 — `29f724b` (Input/Textarea focus border) — `Closes #43`

Remove `focus-visible:border-[var(--ink-amber)]` from `Input.tsx` and `Textarea.tsx`. The global rule already paints both border and ring as `--edge-hud`; the per-component override was fighting it. Comments updated to reflect that focus chrome lives in `globals.css`, not on the primitive. `aria-invalid` coral border preserved.

Files:
- `apps/web/components/ui/input.tsx`
- `apps/web/components/ui/textarea.tsx`

## What did NOT change (scope discipline)

- **`.project-chip-inline`** — amber `$project` chip, not in the complaint, intentional warm counterpart to sage. Left as-is.
- **Jarvis input cyan border + ring** — agent-mode signature, intentionally distinct from journal inputs. The inline styles in `JarvisInput.tsx` are untouched.
- **No new design tokens** introduced; everything reuses `--ink-sage`, `--edge-hud`, `--ink`, `--ink-coral`.
- **No refactor** of the focus-ring system itself — these were per-component overrides fighting an already-correct global rule.

## Verification

- `git grep -n 'rgb(101 163 13'` against `apps/web/app/globals.css` and `apps/web/components/captures/HashtagChip.tsx` → no live values, only the explanatory comment at `globals.css:750`.
- `git grep -n 'focus-visible:border-\[var(--ink-amber)\]' apps/web/components/ui` → no matches.
- "Closes #43" present in commit `29f724b` body.
- Typecheck wasn't reliably runnable in the worktree (node_modules not installed); errors observed are all `Cannot find module` unrelated to the edits. CSS + className-string edits don't change types.

## Files touched (scope kept tight)

Code:
- `apps/web/app/globals.css` — 2 CSS rules updated, 1 explanatory comment refreshed
- `apps/web/components/captures/HashtagChip.tsx` — 4 className branches + docstring
- `apps/web/components/ui/input.tsx` — 1 class removed + docstring
- `apps/web/components/ui/textarea.tsx` — 1 class removed + docstring

Docs:
- `.planning/quick/260616-3h3-improve-syntax-highlighting-colors-and-t/260616-3h3-PLAN.md`
- `.planning/quick/260616-3h3-improve-syntax-highlighting-colors-and-t/260616-3h3-SUMMARY.md`
- `.planning/STATE.md` — last-activity line + Quick Tasks Completed row appended
- `.kiwi-auto/ISSUE-43-recap.md` — this file

## How to eyeball the fix

1. Open `/captures` or any surface with a Capture/Jarvis input.
2. Type `#test`. The chip background should read as a soft parchment-friendly green that sits inside the palette — not a fluorescent lime block.
3. Click into any non-Jarvis text input (capture title, project name, area name, etc.). The focus border should be the calm `--edge-hud` neutral with a matching ring — no amber outline.
4. Open the Jarvis console input (agent surface). Cyan border + ring on focus stays untouched (agent-mode signature).
5. Trigger an `aria-invalid` state on a regular input. Border still goes coral.
