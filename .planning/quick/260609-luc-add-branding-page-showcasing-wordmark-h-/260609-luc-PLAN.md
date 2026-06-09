---
phase: quick/260609-luc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/(app)/branding/page.tsx
autonomous: true
requirements:
  - BRAND-PAGE-01
must_haves:
  truths:
    - "Authenticated user navigating to /branding sees a document-register brand page inside the (app) shell"
    - "Page shows the Hyperpolymath wordmark (EB Garamond serif, -0.03em) in 5 swatch variations with token-named captions"
    - "Page shows the standalone 'H' monogram in at least 2 sizes (48px + 96px)"
    - "Page shows the Kiwi-bird mark (inline SVG, source: /public/icons/kiwi-bird.svg) in 5 matching color variations labeled 'Kiwi by Hyperpolymath'"
    - "Page shows a JARVIS lockup with HudCoreBubble inside a .agent-mode-scope tile labeled 'JARVIS by Hyperpolymath' (only section with cyan glow)"
    - "Page typechecks under the repo's TS config and the route is reachable"
  artifacts:
    - path: "apps/web/app/(app)/branding/page.tsx"
      provides: "Branding page route + co-located BrandChip / WordmarkVariant / KiwiVariant subcomponents"
      contains: "default export"
  key_links:
    - from: "apps/web/app/(app)/branding/page.tsx"
      to: "apps/web/components/shared/HudCoreBubble"
      via: "named import for JARVIS lockup tile"
      pattern: "HudCoreBubble"
    - from: "apps/web/app/(app)/branding/page.tsx"
      to: "apps/web/components/landing/SectionEyebrow"
      via: "named import for section labels"
      pattern: "SectionEyebrow"
    - from: "apps/web/app/(app)/branding/page.tsx"
      to: ".agent-mode-scope CSS"
      via: "wrapper div on JARVIS tile only"
      pattern: "agent-mode-scope"
---

<objective>
Add a `/branding` page that documents the Hyperpolymath visual identity: wordmark, monogram, Kiwi mark, and JARVIS lockup, each rendered in token-named swatch variations. Document register throughout — Notion-document discipline, no theatrics — with the JARVIS section being the only surface that activates the cyan HUD glow (via `.agent-mode-scope`).

Purpose: Provide a single reference page for the brand system so future surfaces can pull canonical mark renderings without re-deriving them.
Output: One new file — `apps/web/app/(app)/branding/page.tsx` — co-locating small presentational subcomponents.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@apps/web/components/shell/Wordmark.tsx
@apps/web/components/shared/HudCoreBubble.tsx
@apps/web/components/landing/SectionEyebrow.tsx
@apps/web/app/(app)/layout.tsx
@apps/web/public/icons/kiwi-bird.svg
@apps/web/app/globals.css

<interfaces>
<!-- Canonical wordmark rendering — match these exact settings -->
From apps/web/components/shell/Wordmark.tsx:
```tsx
// EB Garamond serif at 600, letter-spacing: -0.03em, color var(--ink)
// className="font-serif font-semibold text-base text-[var(--ink)] select-none overflow-hidden"
// style={{ letterSpacing: "-0.03em" }}
// renders "Hyperpolymath" (or "H" when collapsed)
```

From apps/web/components/shared/HudCoreBubble.tsx:
```tsx
"use client";
export type HudCoreBubbleState = "idle" | "thinking" | "streaming" | "error";
interface Props {
  state?: HudCoreBubbleState;   // default "idle"
  dimmed?: boolean;             // default false
  className?: string;
}
export function HudCoreBubble(props: Props): JSX.Element;
// Renders a 280×280 SVG. Cyan stroke = var(--hud-cyan). Pointer-events: none.
// MUST be wrapped in an ancestor with className containing "agent-mode-scope"
// so the cyan glow background layers activate.
```

From apps/web/components/landing/SectionEyebrow.tsx:
```tsx
export function SectionEyebrow({ label }: { label: string }): JSX.Element;
// Renders "<p className='font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]'>{label}</p>"
```

Kiwi-bird SVG path (inline this `d=` — do NOT import the file as a component):
```
viewBox="0 0 24 24"
d="m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z"
```

Token reference (read-only — do NOT modify globals.css):
  --canvas, --surface, --surface-raised, --ink, --ink-muted, --edge, --edge-hud, --hud-cyan
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /branding page with all four sections</name>
  <files>apps/web/app/(app)/branding/page.tsx</files>
  <action>
Create `apps/web/app/(app)/branding/page.tsx` as a Server Component (no `'use client'` at the top — HudCoreBubble already declares it). The (app) layout already provides auth + AppShell, so this page only needs its own content. Default export is `BrandingPage`.

Layout shell:
- Root: `<main className="mx-auto w-full max-w-[960px] px-8 py-16 space-y-20">` (document register — generous vertical rhythm, no theatrics)
- Page header: a small SectionEyebrow with label `"§ 00 · BRAND"` followed by a serif H1 — `<h1 className="mt-4 font-serif font-semibold text-[32px] text-[var(--ink)]" style={{ letterSpacing: "-0.02em" }}>Brand</h1>` and a paragraph caption: `<p className="mt-2 font-serif text-[15px] text-[var(--ink-muted)] max-w-[640px]">Canonical marks, lockups, and color treatments for Hyperpolymath, Kiwi, and JARVIS. Reference only — do not improvise from this page.</p>`

Define ONCE near the top of the file, co-located (do NOT create new component files):

```tsx
type SwatchKey = "ink-on-canvas" | "canvas-on-ink" | "black-on-white" | "white-on-black" | "cyan-on-black";

const SWATCHES: { key: SwatchKey; bg: string; fg: string; caption: string; edgeToken: string }[] = [
  { key: "ink-on-canvas",  bg: "var(--canvas)",  fg: "var(--ink)",      caption: "INK ON CANVAS · --ink / --canvas",                edgeToken: "var(--edge)" },
  { key: "canvas-on-ink",  bg: "var(--ink)",     fg: "var(--canvas)",   caption: "CANVAS ON INK · --canvas / --ink",                edgeToken: "var(--edge)" },
  { key: "black-on-white", bg: "#ffffff",        fg: "#000000",         caption: "PURE BLACK ON WHITE · #000 / #fff",               edgeToken: "var(--edge)" },
  { key: "white-on-black", bg: "#000000",        fg: "#ffffff",         caption: "PURE WHITE ON BLACK · #fff / #000",               edgeToken: "var(--edge)" },
  { key: "cyan-on-black",  bg: "#000000",        fg: "var(--hud-cyan)", caption: "HUD CYAN ON BLACK · --hud-cyan / #000",           edgeToken: "var(--edge-hud)" },
];

function BrandChip({ bg, edgeToken, caption, children }: { bg: string; edgeToken: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-center rounded-[12px]"
        style={{ background: bg, border: `1px solid ${edgeToken}`, width: 220, height: 140 }}
      >
        {children}
      </div>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        {caption}
      </p>
    </div>
  );
}

function WordmarkGlyph({ color, text = "Hyperpolymath", size = 28 }: { color: string; text?: string; size?: number }) {
  return (
    <span
      className="font-serif font-semibold select-none"
      style={{ color, letterSpacing: "-0.03em", fontSize: size, lineHeight: 1 }}
    >
      {text}
    </span>
  );
}

function KiwiGlyph({ color, size = 64 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z"
        fill={color}
      />
    </svg>
  );
}
```

Section helper (also co-located):
```tsx
function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <div>
        <SectionEyebrow label={label} />
        <h2 className="mt-3 font-serif font-semibold text-[24px] text-[var(--ink)]" style={{ letterSpacing: "-0.02em" }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
```

Now render the four sections inside `<main>`:

1. **§ 01 · WORDMARK** — grid of BrandChips, one per SWATCHES entry, each containing `<WordmarkGlyph color={fg} text="Hyperpolymath" size={28} />`. Use `<div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8">`.

2. **§ 02 · MONOGRAM** — two side-by-side BrandChips (ink-on-canvas swatch only), one with `<WordmarkGlyph color="var(--ink)" text="H" size={48} />`, one with `<WordmarkGlyph color="var(--ink)" text="H" size={96} />`. Caption the chips `"H · 48PX SERIF"` and `"H · 96PX SERIF"` respectively (override the SWATCHES caption with these size-specific ones). Use `<div className="flex flex-wrap gap-x-6 gap-y-8">`.

3. **§ 03 · KIWI** — heading title `"Kiwi by Hyperpolymath"`. Grid of BrandChips (same SWATCHES set), each containing `<KiwiGlyph color={fg} size={64} />`. Below the grid, a single-line caption: `<p className="font-serif text-[14px] text-[var(--ink-muted)] mt-4">Standalone agent mark — Kiwi by Hyperpolymath.</p>`.

4. **§ 04 · JARVIS** — heading title `"JARVIS by Hyperpolymath"`. Single centered lockup tile (NOT a grid). Render:
```tsx
<div className="agent-mode-scope relative overflow-hidden rounded-[12px]"
     style={{ width: 240, height: 240, background: "var(--surface-raised)", border: "1px solid var(--edge-hud)" }}>
  <div className="absolute inset-0 flex items-center justify-center">
    <div style={{ transform: "scale(0.7)", transformOrigin: "center" }}>
      <HudCoreBubble state="idle" dimmed={false} />
    </div>
  </div>
</div>
```
Above the tile: `<WordmarkGlyph color="var(--ink)" text="JARVIS" size={32} />` (centered, mb-3). Below the tile: `<p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">JARVIS BY HYPERPOLYMATH · agent-mode-scope · --hud-cyan</p>`. Wrap heading + tile + caption in a `<div className="flex flex-col items-center">` so the lockup centers within the 960px column.

CRITICAL guardrails (apply throughout):
- The `.agent-mode-scope` wrapper appears ONLY on the JARVIS tile. Nowhere else. (Per CLAUDE.md MEMORY: restraint over theatrics; document register everywhere else.)
- Do NOT introduce new CSS custom properties; consume only the tokens listed in <interfaces>.
- Do NOT add `'use client'` to the file. The page is a Server Component; HudCoreBubble's own `"use client"` is enough.
- Do NOT extract subcomponents into new files. Keep BrandChip, WordmarkGlyph, KiwiGlyph, Section co-located in this page file.
- Add a top-of-file doc comment that briefly explains the page purpose and references this plan (`Quick 260609-luc`).

File ends with `export default function BrandingPage() { ... }`. No metadata export required, but you MAY add `export const metadata = { title: "Brand · Hyperpolymath" };` immediately above the default export — it's a free win.
  </action>
  <verify>
    <automated>cd /Users/filippofonseca/Developer/Projects/hyperpolymath-v2 && pnpm --filter web exec tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>
File `apps/web/app/(app)/branding/page.tsx` exists with a default-exported Server Component. TypeScript check passes (no new errors introduced by this file). The route `/branding` resolves under the (app) shell (auth gate inherited). All four sections render: wordmark grid (5 chips), monogram (2 sizes), Kiwi grid (5 chips), JARVIS centered lockup with `.agent-mode-scope` wrapper. No new CSS tokens, no new component files, no `'use client'` directive on the page itself.
  </done>
</task>

</tasks>

<verification>
- `pnpm --filter web exec tsc --noEmit` passes (no new TS errors attributable to this file).
- Manual: `pnpm --filter web dev`, sign in, visit `/branding` — page renders with sidebar shell intact.
- Visual spot-check: only the JARVIS tile shows the cyan glow background; all other chips read as document-register swatches.
- Captions match token names exactly (caller can read the swatch tokens off the page without inspecting source).
</verification>

<success_criteria>
- [ ] `apps/web/app/(app)/branding/page.tsx` exists and default-exports a Server Component
- [ ] Route `/branding` is reachable (no 404) inside the authenticated (app) shell
- [ ] Wordmark section renders 5 variations matching the SWATCHES set
- [ ] Monogram section renders the "H" at 48px and 96px in EB Garamond serif
- [ ] Kiwi section renders 5 variations of the inline kiwi-bird SVG, captioned "Kiwi by Hyperpolymath"
- [ ] JARVIS section renders HudCoreBubble inside a 240×240 surface-raised tile WRAPPED in `.agent-mode-scope`, labeled "JARVIS by Hyperpolymath"
- [ ] No new CSS tokens introduced; only existing tokens (--canvas, --surface, --surface-raised, --ink, --ink-muted, --edge, --edge-hud, --hud-cyan) are consumed
- [ ] No new component files created (BrandChip/WordmarkGlyph/KiwiGlyph/Section live co-located in page.tsx)
- [ ] TypeScript compiles
</success_criteria>

<output>
After completion, create `.planning/quick/260609-luc-add-branding-page-showcasing-wordmark-h-/260609-luc-SUMMARY.md`.
</output>
