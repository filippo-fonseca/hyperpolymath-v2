# Batch 2 — Wiki polish: full-height canvas, Journal restyle, link embeds, slash menu, sound/animation, list-view fix

**Author:** Fable (Conductor). **Executor:** Codex `gpt-5.6-sol`, high reasoning.
**Branch:** `bgsd/wiki-drive-fidelity` (continue on it; PR #255 already open). Atomic commits, one per slice, explicit pathspecs. Obey `.planning/UI-BRIEF.md` (the canonical register) and `.planning/SPACEDRIVE-TOKENS.md` everywhere. No file > ~400 LOC (split new work; PageBlockEditor.tsx at 725 and PageDetailClient.tsx at 1033 are pre-existing — do not grow them, extract new code into new files). No drizzle migration changes unless stated (Slice C adds none — reuse existing tables).

---

## Slice A — List-view column alignment + Projects column (DEFECT, do first)

User screenshot: in list view, header row shows `Name | Kind | Updated | Projects` at fixed positions, but row cells render flex-flowing after the name, so "Page" / "about 1 hour ago" drift leftward under no particular header, and the **Projects column never renders any values**.

- A1. Header and rows MUST share one grid template (e.g. `grid-cols-[minmax(0,1fr)_110px_160px_minmax(0,220px)]` on both, or a real `<table>`): every value sits exactly under its header in every row, folders and pages alike.
- A2. Folders show Kind = "Folder", Updated = folder's updated timestamp if available (else "—"), Projects = linked projects.
- A3. Projects column: render linked project names as small chips (`--sd-box` bg, 1px `--sd-line`, rounded-full, 0.7rem), max 2 + "+N" overflow chip; empty = muted "—". The data exists (folder_projects / page-project links — same sources the old ProjectPagesSection used); if a lookup isn't already in the explorer item model, join it in the existing query/hook layer without new server actions.
- A4. Verify in BOTH themes; keep row height compact (~40px), band headers ("Folders" / "Files") spanning full width.

## Slice B — Full-height wiki canvas

- B1. `/wiki` main content must occupy the full viewport height downward: `PagesListClient.tsx` root becomes a `flex h-full min-h-0 flex-col`; `WikiExplorer` gets `flex-1 min-h-0` and owns its own scroll (canvas scrolls, top bar stays put). Check the parent app-shell wrapper passes height down (`h-full` chain); fix any `h-auto` link in the chain.
- B2. The Explorer canvas background (`--sd-app`) extends to the bottom edge — no strip of page background showing beneath. Right-click on the lowest region still opens the canvas context menu.

## Slice C — Notion-style link embeds in pages

Research reference (how Notion behaves): pasting a URL over empty space pops a small menu — **Dismiss (paste as plain link) / Create bookmark / Create embed**. YouTube and Twitter/X create rich iframe embeds; ordinary sites get a **bookmark card**: title, 2-line description, favicon + domain, og:image thumbnail on the right, whole card clickable (new tab). Slash menu also offers "Bookmark" and "Embed" blocks that prompt for a URL.

Reuse what exists: `lib/link-preview/fetch.ts` (og/oEmbed/YouTube/Twitter classification), `lib/link-preview/types.ts`, the captures link-preview route as the pattern.

- C1. **New API route** `app/api/wiki/link-embed/route.ts`: POST `{url}` → auth via getClaims, validate http(s) URL, call the existing link-preview fetcher, return `LinkPreviewResult`. Cache like the captures route does. Reject non-http(s) schemes.
- C2. **New BlockNote block** `linkEmbed` via `createReactBlockSpec` (pattern: the `callout` block, PageBlockEditor.tsx L61–77). Props: `{ url, variant: "bookmark" | "embed", title, description, imageUrl, faviconUrl, mediaType }` (metadata denormalized into props so render never refetches). Register in the schema + persistence flows untouched (contentJson jsonb already stores arbitrary blocks).
- C3. **Renderers** (new file `components/pages/blocks/LinkEmbedBlock.tsx` + supporting css or tailwind):
  - `bookmark`: Notion-style card — 1px `--sd-line` border, 8px radius, `--sd-darker-box` bg, title (13px, ink), description (0.78rem, muted, 2-line clamp), favicon 14px + domain caption, og:image right block ~180px (hidden if none). Hover: `--sd-hover`. Click → open in new tab.
  - `embed` with `mediaType: "youtube"`: responsive 16:9 iframe (`youtube-nocookie.com/embed/<id>`, lazy-loaded).
  - `embed` with `mediaType: "twitter"`: Twitter widget embed (twitframe or platform.twitter.com widgets.js) inside a max-w-[550px] container; fallback to bookmark card if it fails to load.
  - `embed` generic: iframe of the URL in a 4:3 bordered container with a "open ↗" caption; if the site refuses framing (load error), fall back to the bookmark card.
  - Loading state: skeleton card. Fetch-failed: plain link block fallback (never a broken card).
- C4. **Paste interception**: onPaste in the editor container — if clipboard is exactly one URL and selection is on an empty paragraph, insert a small anchored popover menu (register per UI-BRIEF §7): "Paste as link / Create bookmark / Create embed". Default Enter = bookmark. Choosing bookmark/embed inserts the `linkEmbed` block and fetches metadata via C1 (optimistic skeleton). Pasting into non-empty text keeps default behavior (plain link).
- C5. **Slash items**: "Bookmark" and "Embed" entries (with aliases `/bookmark`, `/embed`, `/yt`) that insert an empty `linkEmbed` block showing an inline URL input; on submit, fetch + render.
- C6. Vitest: unit-test the URL classification / paste-detection helpers (pure functions in a new `lib/pages/link-embed.ts`). Keep PageBlockEditor.tsx growth minimal — put the paste handler + menu in new files.

## Slice D — Slash "/" menu restyle (Spacedrive-clean)

Current `.bn-suggestion-menu` (page-block-editor.css L126–201) uses the old glass register. Restyle per UI-BRIEF §7:
- D1. Container: `--sd-box` bg, 1px `--sd-line`, 8px radius, floating shadow `0 10px 28px hsl(235 15% 0% / 0.4)`, subtle 1px inner light ring; max-height ~320px, tidy scrollbar.
- D2. Items: 6px radius, 13px title, 11px muted subtext (consider hiding subtext for a denser menu — single-line items with icon 16px + title + muted alias hint right-aligned), highlight = `--sd-hover` fill + accent left rail or ring (NOT cyan color-mix).
- D3. Group headers: uppercase `text-tiny` (0.65rem) muted micro-labels with hairline separators between groups.
- D4. Same treatment applies to the `@` and `[` suggestion menus (they share the CSS). Both themes verified.
- D5. Scope: this menu lives inside page content, which is not wrapped by `.wiki-explorer`; add the sd-tokens via a dedicated class on the menu (they're globally defined) — do not regress the editor's editorial text styling.

## Slice E — Journal rail restyle (match the register)

The rail currently reads editorial glass. Filippo wants it matched to the new UI. Restyle `components/wiki/journal/JournalRail.tsx`:
- E1. Rail chrome onto the sd ladder: section header = uppercase micro-label ("JOURNAL"), cards = `--sd-box` + 1px `--sd-line` + 8px radius, hover `--sd-hover`; today card distinguished by the accent (1px accent border or accent chip "Today"), not by glass.
- E2. Keep the Garamond date heading INSIDE the today card (editorial content nod), everything else app sans at 13px/0.78rem.
- E3. Trail = compact horizontal row of 7 day cards (~120px wide): Garamond day number or dd MMM, muted weekday caption, tiny preview line. Calendar popover restyled per UI-BRIEF §7 menus.
- E4. Collapse toggle stays (localStorage key unchanged); collapsed state = a single slim bar with micro-label + expand chevron.
- E5. Both themes; reduced-motion respected; no behavior changes (auto-create-today hook, query keys, dailyDayClickAction untouched).
- E6. Update `.planning/UI-BRIEF.md` §8: the Journal rail is no longer an exception — editorial serif survives only as content typography inside cards.

## Slice F — Drop-zone animation + sound (Spacedrive-imagined, tasteful)

- F1. New `lib/sound/ui-sfx.ts`: tiny WebAudio-synthesized cues (no audio assets): `pickup` (short soft tick ~1.2kHz, 30ms), `dropSuccess` (low soft thock, two-tone down, ~80ms), `dropDenied` (muted low buzz, ~100ms). Master gain ≤ 0.15. Lazy AudioContext (created on first user gesture). Exposed as `playSfx(name)`. Silent when: `prefers-reduced-motion`, document hidden, or localStorage `"ui:sfx" === "off"`.
- F2. Wire into explorer DnD (`useExplorerDnd.ts`): drag start → pickup; valid drop → dropSuccess; invalid/cycle-denied/no-target → dropDenied (paired with the existing shake).
- F3. Animations: hovered drop target gets accent ring + bg tint **plus a 1.02 scale pulse** (140ms ease-out, once); on successful drop, target folder icon does a brief "swallow" pulse (scale 1 → 1.05 → 1, 160ms); denial keeps the shake. All gated by `useReducedMotion`.
- F4. Mute toggle: small speaker icon button in the Explorer top-bar cluster toggling `"ui:sfx"`, with tooltip. Persisted.
- F5. Nothing on hover/navigation. No sound louder than a whisper — Spacedrive is calm.

## Verification (all slices)

- `pnpm --filter web exec tsc --noEmit` clean; `pnpm --filter web build` green.
- `vitest run tests/wiki-explorer-helpers.test.ts lib/pages/` green (extend with C6 helpers).
- Manual checklist to leave in the final report: A1–A3 (screenshot-comparable), B1–B2, C3 render matrix (bookmark/yt/tweet/generic/fallbacks), D1–D4, E1–E4, F1–F4 — each in dark AND light.
- If sandbox blocks git commits, leave changes staged-ready and print the exact proposed commit commands per slice.
