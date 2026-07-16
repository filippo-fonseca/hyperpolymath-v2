# VERIFY — unit-lifeos-rework

**Verdict:** code-complete, automated gates green; authed pixel-capture blocked by
environment (see §Screenshots). Recommend Conductor authed pixel-verify on :3000.

## What shipped (commits)

| hash | subject |
|------|---------|
| 37b0baa4 | feat(lifeos): one-screen command deck — view toggle + fixed 2-row bento |
| 3d9e58ce | feat(lifeos): widgets shrink to fit — internal scroll caps + compact cells |
| bc7b6f70 | feat(projects): Notion-style click-to-edit project icon + sd restyle |

Fence honoured: only `app/(app)/lifeos/**`, `components/lifeos/**`,
`components/projects/ProjectHeader.tsx`, `components/projects/IconPicker.tsx`.
`components/ui/**` primitives consumed as-is (popover restyled via IconPicker's
own `className` overrides only). AreasTree internals untouched.

## Gates

- `pnpm --filter web typecheck` — **PASS** (exit 0; re-run after each unit incl. icon edit).
- `pnpm --filter web build` — **PASS** (exit 0; Next.js 16.2.6, full route compile).
- Boot clean — **PASS**: `next start -p 3823` → `✓ Ready in 149ms`; `/sign-in` → 200.
- Auth gate intact — **PASS**: `/lifeos` → 307 → `/sign-in` when unauthenticated.

## One-viewport design (how it holds at 1440×900 / 1512×982)

The AppShell scroll container for `/lifeos` is
`div.@container/main.min-h-0.flex-1.overflow-auto` — its height is
`viewport − TopTabBar (h-11 = 44px) − mb-1 (4px)`. Rather than a brittle
`100dvh − <hardcoded chrome>` calc, the page main is now `h-full` and
`LifeOsCanvas` is `flex h-full flex-col overflow-hidden`, so the deck is exactly
the container height and **clips** — the page can never scroll regardless of the
real topbar height. Inside the canvas:

- Hero + quick-send are `shrink-0` (trimmed margins: hero `mb-4`/stat strip
  `mb-5`, quick-send margin removed).
- The toggle row is `shrink-0` (`mt-4 mb-4`).
- The swapped region is `flex-1 min-h-0` → it absorbs the remainder (~560px at
  1440×900, matching the scout's bento estimate).

Widgets view: a fixed `grid-rows-[minmax(0,1fr)_minmax(0,1fr)]` × 12-col grid,
every cell `min-h-0`, every `WidgetCard` already `h-full overflow-hidden`. Task /
Habits / Training / Captures lists get `min-h-0 overflow-y-auto sd-scroll-hover`
so a long list **shrinks and scrolls internally** instead of pushing the page.
Insights is folded in as a compact headline+chip cell. Because both the region
and the cards clip, `document.scrollingElement.scrollHeight` cannot exceed the
container — no page scroll by construction.

Areas view: the tree keeps its own `overflow-y-auto` inside the same fixed region
(a full tree can't be forced to one screen — seed §3).

## Both-theme token audit (changed files)

- Banned classes (`glass-tile`/`glass-button`/`lifeos-glass`/`backdrop-blur`/
  `shadow-glow`/`bg-gradient`/`font-serif`/`hover:scale`): **0 occurrences**.
- Legacy chrome tokens (`--surface`/`--edge`/`--ink-muted`/`--canvas`/
  `--surface-raised`/`--edge-hud`): **0 occurrences** — ProjectHeader + IconPicker
  fully migrated to `--sd-*`.
- Residual shadcn tokens in IconPicker (`bg-secondary`/`text-muted-foreground`/
  `border-input`/`ring-ring`/`text-foreground`/`border-border`): **0**.
- Every surface I touched resolves through `--sd-*` (app/box/input/line/hover/
  selected/ink ladder) which is defined in both `:root` (light parchment) and
  `.dark` (indigo ladder) in globals.css, so both themes resolve. Functional hues
  kept as small dots/urgency only (`--ink-coral`, `--ink-amber`, `--sd-accent`),
  per §0.
- New toggle uses only already-emitted utilities + inline `var(--sd-*)` lookups
  (no new one-off arbitrary utility that could hit the Tailwind scan gap).

## Screenshots — BLOCKED (environmental)

Authed capture of `/lifeos` (both themes × 1440×900 / 1512×982, areas view,
toggle mid-flip) and the project-header icon-edit popover is **not possible in
this headless run**:

- Auth is Google-OAuth-only (no password path); OAuth can't complete headless.
- The local Supabase stack (`127.0.0.1:54321`) is **down** and the Docker daemon
  is unavailable (`docker ps` hangs), so it can't be started and the app can't
  render authed routes or fetch widget data even with an injected session.
- The global browser lock (`/tmp/bgsd-browser.lock`) is held with **live parallel
  Playwright-MCP processes from other bgsd sessions**; reclaiming to shoot a
  low-value public page would risk violating the single-browser mutex.

Per UI-CONTRACT-SD3 §1 (Auth), this is the sanctioned fallback: the Conductor
pixel-verifies authed surfaces on :3000 post-merge. Requesting that authed
pixel-verify for: (1) no page scroll at both sizes both themes, (2) the segmented
toggle + flip, (3) Captures/Insights compact cells, (4) project-icon click-to-edit
popover in sd grammar.

## Assumptions / deviations

1. One-viewport uses `h-full` vs the seed's `100dvh − <measured chrome>` — more
   robust (no hardcoded topbar offset), same guarantee. **Deviation, intentional.**
2. Areas lazy-mounts on first switch (server-materialized prop rendered on demand).
3. IconPicker gained a backwards-compatible optional `renderTrigger` prop;
   ProjectCreateDialog's default trigger is unchanged.
4. Area-badge → area-move control (seed §4 optional) **deferred** to keep scope
   tight; badge remains a link to the area page.
5. ProjectHeader chrome fully migrated to sd + §0 (serif→Space Grotesk, tokens,
   backdrop-blur removed); the rest of the project detail *body*
   (ProjectTasksSection etc.) is out of fence and stays legacy until its own wave.
