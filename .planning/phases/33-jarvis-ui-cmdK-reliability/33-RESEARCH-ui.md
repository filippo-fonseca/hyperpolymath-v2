# Phase 33: JARVIS UI Redesign + cmd+K Reliability — UI Research

**Researched:** 2026-06-29
**Domain:** JARVIS tab UI — React/Next.js, Tailwind 4, Motion 12, CSS custom properties
**Confidence:** HIGH (all findings from direct source reading, no inference)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Bubble layout: iMessage-style (user right-aligned, JARVIS left-aligned)
- Color register: cyan accent on JARVIS bubbles, neutral/glass on user bubbles
- Surface system: extend existing `.glass-tile` / `.glass-button` tokens — do NOT introduce new design primitives
- Receipts: slim inline glass-inset card, no heavy outer border box
- Composer: neumorphic glass input, consistent with rest of app
- Streaming indicator: subtle, premium (not a generic spinner)
- Dark-first: the tab background is the app's dark surface
- cmd+K fix: the fetch/SSE request must survive navigation
- After submission from cmd+K, the turn must appear in the JARVIS tab conversation including in-flight streaming state
- 5s undo must work on cmd+K-initiated turns exactly like normal turns
- If a turn aborts, a retry affordance is visible on the failed bubble

### Claude's Discretion
- Whether to use a global React context/store (pending-turn queue) vs. service-worker/BroadcastChannel for navigation persistence
- Exact Motion animation curves and durations (maintain consistency with existing app motion budget)
- Whether the failed-turn retry triggers a new SSE stream or re-POSTs the same payload
- Exact color values for cyan glow — use `--hud-cyan` token family (no `--accent-cyan` exists)

### Deferred Ideas (OUT OF SCOPE)
- JARVIS voice surface (Phase 7)
- In-document @JARVIS (Phases 31–32)
- Mobile JARVIS UI
- Any routing/tool changes in jarvis-core
- No changes to cmd+K palette's non-JARVIS actions
</user_constraints>

---

## Summary

The JARVIS page is the `/today` route (`apps/web/app/(app)/today/page.tsx`). It is a Server Component that SSR-fetches projects, hashtags, user timezone, and the 10 most recent `jarvis_turns` rows, then renders a single `<JarvisConsole>` client component. The same `JarvisConsole` is also used in the sidebar split-screen panel (`JarvisSidePanel`).

The current layout is a full-height vertical column: scrollback (flex-1, overflow-auto) on top, and a fixed composer strip (`border-t bg-card px-6 py-3`) at the bottom. There are no message bubbles. User turns are rendered as `>` prefixed monospace text on a flat transparent background. JARVIS assistant turns are also flat, rendered inline in the same scroll column, with `font-mono italic font-medium` prose. The conversation is not chat-style — it reads like a terminal log, not iMessage.

Action receipts (`JarvisReceipt`) are already implemented with the Phase 6.1 glassy treatment — `backdrop-filter: blur(12px)`, `--glass-bg` background, `--glass-raise`/`--glass-drop` shadows, `--hud-cyan-glow-soft` ambient halo, `HudCornerCrops` L-bracket frame, and a leading 6px intent-colored dot. They already feel like glass cards, not heavy border boxes. The main issue is the prose and bubble surface, not receipts.

The cmd+K flow (`GlobalJarvisDialog` → `LiteJarvisComposer`) fires a `jarvis-voice-transcript` CustomEvent with the typed text. `GlobalJarvisHandler` picks it up on non-`/today` routes and runs the full SSE pipeline, persisting to `jarvis_turns` via `saveJarvisTurn`. When the user later navigates to `/today`, `JarvisConsole` loads recent turns via a Supabase Realtime channel merge. The bug: `GlobalJarvisHandler` holds an `AbortController` in a local `useEffect` ref, so any navigation that unmounts the component aborts the in-flight stream. The SSE fetch never completes, the assistant turn is persisted as `status: 'streaming'` (not `'done'`), and the `saveJarvisTurn` call on `onDone` never fires.

**Primary recommendation:** Redesign the conversation column to iMessage-style bubbles (user right, JARVIS left), apply cyan glow surface to JARVIS bubbles only, and move the GlobalJarvisHandler SSE stream to a module-level singleton that survives component unmount.

---

## Component Tree

### Entry Points

| Route / Mount point | File | Notes |
|---|---|---|
| `/today` page | `apps/web/app/(app)/today/page.tsx` | Server Component; SSR-fetches data, renders `<JarvisConsole>` |
| Split-screen side panel | `apps/web/components/shell/JarvisSidePanel.tsx` | Client wrapper; lazy-loads `JarvisInitPayload` via `loadJarvisInit()`, renders `<JarvisConsole>` |
| App shell | `apps/web/components/shell/AppShell.tsx` | Renders `<JarvisSidePanel>` in a `<aside>` when `splitOn && !onJarvis` |

### JarvisConsole Component Tree

```
JarvisConsole                          components/jarvis/JarvisConsole.tsx
  ├── HudCornerCrops (x1, size=12)     components/shared/HudCornerCrops.tsx
  ├── HudStatusPill (absolute top-right) components/shared/HudStatusPill.tsx
  ├── HudCoreBubble (absolute center bg) components/shared/HudCoreBubble.tsx
  ├── JarvisScrollback                  components/jarvis/JarvisScrollback.tsx
  │   ├── [per-turn] — user turn
  │   │   └── TurnTimestamp (inline)
  │   ├── [per-turn] — assistant turn
  │   │   ├── HudThinkingRing           components/shared/HudThinkingRing.tsx
  │   │   ├── [streaming prose + caret]
  │   │   ├── ScanRevealOverlay (internal)
  │   │   ├── JarvisClarification?      components/jarvis/JarvisClarification.tsx
  │   │   │   ├── HudCornerCrops
  │   │   │   ├── [question prose]
  │   │   │   ├── [chip options]
  │   │   │   └── Input + Button (shadcn)
  │   │   └── JarvisReceipt (one per action) components/jarvis/JarvisReceipt.tsx
  │   │       ├── HudCornerCrops (size=10, static)
  │   │       ├── [intent dot + icon + label]
  │   │       ├── UndoButton (if eligible)
  │   │       └── [body: title + meta rows]
  │   └── <div ref={bottomRef} /> (scroll anchor)
  └── [composer strip]
       └── JarvisInput                 components/jarvis/JarvisInput.tsx
           ├── TipTap EditorContent
           ├── [slash command chip when pinned]
           ├── AnimatePresence > typing dot
           ├── AnimatePresence > submit scan-drop line
           ├── [footer: hint text + ⌘K badge]
           └── SlashCommandPopover?    components/jarvis/SlashCommandPopover.tsx
```

### Global JARVIS Surface (not on /today)

```
GlobalJarvisDialog                     components/jarvis/GlobalJarvisDialog.tsx
  └── Dialog > motion.div
      ├── LiteJarvisComposer           components/jarvis/LiteJarvisComposer.tsx
      │   └── <textarea> (plain, serif font)
      └── SearchDropdown (below composer)

GlobalJarvisHandler                    components/jarvis/GlobalJarvisHandler.tsx
  (mounts in app layout; fires SSE when not on /today)
```

---

## Current Styling — Per-Component Detail

### JarvisConsole wrapper

```tsx
// File: components/jarvis/JarvisConsole.tsx line 1174
<div className="agent-mode-scope relative flex h-[calc(100vh-3rem)] flex-col">
```

- `agent-mode-scope` activates the layered ambient background (hex dot grid + 4-corner cyan radial glows via `::before`/`::after` in globals.css)
- `h-[calc(100vh-3rem)]` fills viewport minus the 40px TopTabBar
- No background color set — inherits `--canvas` from body

**Composer strip:**
```tsx
// line 1227
<div className="relative z-10 border-t bg-card px-6 py-3">
```
- `bg-card` resolves to `--surface` (oklch warm parchment light / cool dark)
- Separates from scrollback via `border-t` using `--edge`
- Not glassy — just `--surface`

### JarvisScrollback

```tsx
// File: components/jarvis/JarvisScrollback.tsx line 301-304
<div
  ref={containerRef}
  className="h-full overflow-y-auto overscroll-contain px-6 py-4 font-mono hud-scrollbar"
>
```

- `font-mono` sets the entire scrollback in JetBrains Mono by default
- `hud-scrollbar` — thin cyan scrollbar thumb (defined in globals.css: `scrollbar-color: color-mix(in oklch, var(--hud-cyan) 75%, transparent) transparent`)
- No background — transparent over `agent-mode-scope` ambient

**User turn row:**
```tsx
// lines 347-369
<div className="text-sm flex items-baseline gap-2">
  <span className="select-none mr-1.5 opacity-60 text-muted-foreground">{">"}</span>
  <span className="font-mono text-foreground/80 flex-1">
    {stripSystemTags(turn.text)}
  </span>
  <TurnTimestamp />
</div>
```
- Flat, no background
- `>` prompt character at 60% opacity
- `text-foreground/80` = `--ink` at 80% alpha
- No right-alignment, no bubble, no surface background
- `font-mono` throughout

**Assistant turn container:**
```tsx
// lines 377-381
<div className={`ml-3 relative overflow-hidden ${
  turn.status === "error" && !shouldReduce ? "hud-error-glitch" : ""
}`}>
```
- `ml-3` = 12px left indent (no bubble framing)
- Flat, transparent background
- Error: `hud-error-glitch` — 80ms `translateX(2px)` jitter keyframe

**JARVIS prose text (streaming/done):**
```tsx
// lines 411-415
<div
  className="font-mono text-base italic font-medium mb-2 leading-relaxed"
  style={{ color: "var(--ink)" }}
>
```
- `font-mono` = JetBrains Mono
- `text-base` = 1rem (16px)
- `italic font-medium` = 500 weight italic
- Color: `--ink` = `oklch(22% 0.01 60)` light / `oklch(92% 0.01 90)` dark
- No surface background, no padding, no border radius

**Streaming caret:**
```tsx
// inline style
backgroundColor: "var(--hud-cyan-bright)"   // oklch(78% 0.16 210)
boxShadow: "0 0 8px var(--hud-cyan-glow)"   // rgb(34 211 238 / 0.18)
// class when !shouldReduce:
"hud-streaming-caret"  // 1.1s opacity+glow pulse animation
```

**Light trail (behind caret):**
```tsx
background: "linear-gradient(90deg, transparent 0%, var(--hud-cyan-glow-soft) 50%, transparent 100%)"
// --hud-cyan-glow-soft = rgb(34 211 238 / 0.08)
```

**Date divider:**
```tsx
// lines 337-342
<span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] opacity-70">
```
- `--ink-muted` at 70% opacity, separated by 1px `--edge` hairlines

**Thinking indicator (pre-first-token):**
```tsx
// lines 392-398
<div className="flex items-center gap-3 mb-2">
  <HudThinkingRing size={32} />
  <span className="font-mono text-xs text-[var(--ink-muted)] uppercase tracking-[0.08em]">THINKING</span>
</div>
```
- `HudThinkingRing`: 32px SVG, 1px `--hud-cyan-dim` base ring + sweeping `--hud-cyan-bright` 30° arc at 1.4s/rotation
- `THINKING` label in mono 12px uppercase `--ink-muted`

**"Older messages" button:**
```tsx
className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] px-3 py-1.5 rounded
           text-[var(--ink-muted)] hover:text-[var(--hud-cyan-light)] transition-colors"
```
- No border, no background — pure text button

**Empty state hint:**
```tsx
className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)] opacity-70 select-none"
```
- Bottom-anchored, `pb-24`

### JarvisReceipt

Already has a Phase 6.1 glass treatment. Key styles:

**Container (done state):**
```tsx
className="relative rounded-lg my-1 overflow-hidden group/receipt
           transition-[border-color,box-shadow] duration-200 ease-out"
// variant="default": px-4 py-2
// variant="compact": px-2 py-1 opacity-95

style={{
  backgroundColor: "var(--glass-bg)",        // color-mix(in oklch, --surface 92%, transparent)
  backdropFilter: "blur(12px)",
  border: "1px solid color-mix(in oklch, var(--edge-hud) 55%, transparent)",
  boxShadow: glassyShadow + ", 0 0 24px var(--hud-cyan-glow-soft)",
}}
// glassyShadow = "--glass-raise, --glass-drop, inset 0 1px 0 --glass-hi, inset 0 -1px 0 --glass-lo,
//               inset 0 0 24px color-mix(in oklch, --glass-glow-color --glass-glow, transparent)"
```

**Error path:**
```tsx
borderLeftWidth: "3px",
borderLeftColor: "var(--ink-coral)",   // oklch(63% 0.16 25)
```

**Intent dot:** 6px filled circle, scale `1 → 1.4 → 1` on mount via Motion 12
- `create_task` → `--ink-amber` (oklch 70% 0.13 75)
- `create_capture` → `--ink-sage` (oklch 62% 0.09 145)
- `create_event` → `--ink-coral` (oklch 63% 0.16 25)
- `remember_fact`, `ask_clarification` → `--hud-cyan-light` (oklch 48% 0.13 210)
- `update_*` → `--ink-amber`
- `delete_*` → `--ink-coral`
- `find_*` → `--ink-muted`

**Title text:**
```tsx
className="font-serif"  // EB Garamond — receipt title is "content" register
```

**Metadata text (priority, date, project count):**
```tsx
className="font-mono text-xs text-[var(--ink-muted)]"
```

**Queued placeholder:**
```tsx
// SVG outline-trace + shimmer sweep (hud-receipt-outline-trace + hud-receipt-shimmer keyframes)
// Same glassy surface, no ambient glow halo
```

**HudCornerCrops on receipts:** size=10, `breathing={false}` — static L-brackets

**Motion animation:**
```tsx
initial={shouldReduce ? false : { opacity: 0, y: 4 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
```

### JarvisInput (composer)

**Outer wrapper (state-driven):**
```tsx
className="relative rounded-2xl transition-[box-shadow,border-color] duration-200 ease-out"
style={{
  backgroundColor: "var(--surface-raised)",  // oklch(99% 0.003 75) light / oklch(23% 0.007 240) dark
  border: isFocused
    ? "1px solid color-mix(in oklch, var(--hud-cyan) 70%, transparent)"
    : "1px solid color-mix(in oklch, var(--edge-hud) 70%, transparent)",
  boxShadow: isFocused
    ? "0 0 0 4px color-mix(in oklch, var(--hud-cyan) 10%, transparent), 0 1px 2px rgba(0,0,0,0.06)"
    : "0 1px 2px rgba(0,0,0,0.04)",
}}
// when igniting: class "hud-submit-ignite-border"
// when focusedIdle: class "hud-focus-breathe" (NOT currently applied — bug?)
```

Note: The code defines `focusedIdle`/`focusedActive` variables but the current JSX applies the same inline border for both focused-idle and focused-active. The `hud-focus-breathe` class is referenced in the Phase 6.1 spec comment but the className array above does NOT add it. The `hud-submit-ignite-border` class IS applied when `igniting && !shouldReduce`.

**TipTap editor content area:**
```tsx
// editorProps.attributes.class (passed to the contenteditable):
"jarvis-input-content focus:outline-none min-h-[44px] max-h-[200px]
 overflow-y-auto px-4 py-3 font-sans text-[15px] leading-relaxed text-[var(--ink)]"
```
- `font-sans` = Inter (not mono, not serif)
- `text-[15px]` for body typing

**Placeholder (CSS in globals.css):**
```css
.jarvis-input-content[data-placeholder] p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);  /* "Tell JARVIS what's on your mind…" */
  color: color-mix(in oklch, var(--ink-muted) 70%, transparent);
  font-style: italic;
  font-family: var(--font-serif);   /* EB Garamond italic */
  font-size: 1rem;
}
```
- Placeholder is serif italic, body is sans-serif — two different registers

**Footer strip (inside composer):**
```tsx
<div className="flex items-center justify-between px-4 pb-2.5 pt-2
     border-t border-[color-mix(in_oklch,var(--edge)_60%,transparent)]">
  <span className="font-sans text-[12px] text-[color-mix(in_oklch,var(--ink-muted)_85%,transparent)]">
    Enter to send · / commands · $ projects · # tags
  </span>
  <kbd className="hidden md:inline-flex ..."> ⌘K </kbd>
</div>
```

**Typing dot (every 8 keystrokes, 240ms):**
```tsx
<motion.span
  style={{ backgroundColor: "var(--hud-cyan)" }}
  className="absolute top-1 right-12 w-1 h-1 rounded-full pointer-events-none"
/>
// Motion 12: initial opacity/scale 0.5 → animate 1 → exit 0.5, 240ms
```

**Submit scan-drop line:**
```tsx
style={{ backgroundColor: "var(--hud-cyan-bright)", boxShadow: "0 0 8px var(--hud-cyan-glow)" }}
// Motion 12: y: 0→80, opacity: 1→0, 320ms ease-out-quart
```

**Pinned slash command chip:**
```tsx
<span className="inline-flex items-center gap-1.5 rounded bg-secondary px-2 py-0.5 text-foreground">
```
- `bg-secondary` = `--surface`

### JarvisClarification

```tsx
// Container
className="relative rounded-lg px-4 py-3 my-1 overflow-hidden
           transition-[border-color,box-shadow] duration-200 ease-out"
style={{
  backgroundColor: "var(--glass-bg)",
  backdropFilter: "blur(12px)",
  border: "1px solid color-mix(in oklch, var(--edge-hud) 55%, transparent)",
  boxShadow: "... glass stack ... 0 0 24px var(--hud-cyan-glow-soft)"
}}
```
- Same glass recipe as JarvisReceipt
- `HudCornerCrops` size=10 static
- Chrome label: `font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]` → "clarify"
- Question body: `font-serif text-base` color `--ink` (content register)
- Chip options: amber-tinted `rgb(217 119 6 / 0.16)` background, `font-mono text-xs`
- Answered state: `font-mono text-xs italic text-[var(--ink-muted)]` → "answered"

### HudStatusPill

```tsx
// Position in JarvisConsole: absolute top-4 right-4 z-10
className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm
           font-mono text-[11px] uppercase tracking-[0.08em]
           transition-colors duration-200 ease-out"
```

State → color mapping:
| State | Text | Border | Dot | Bg |
|---|---|---|---|---|
| READY | `--ink-muted` | `--edge-hud` | `--hud-cyan` | transparent |
| SENDING | `--hud-cyan` | `--hud-cyan` | `--hud-cyan-bright` | transparent |
| THINKING | `--hud-cyan` | `--hud-cyan` | `--ink-amber` | transparent |
| STREAMING | `--hud-cyan` | `--hud-cyan` | `--hud-cyan-bright` | `--hud-cyan-glow` |
| ERROR | `--ink-coral` | `--ink-coral` | `--ink-coral` | transparent |
| UNDO | `--ink-amber` | `--edge-hud` | `--ink-amber` | transparent |

Dot: 6px circle, `scale [1, 1.4, 1]` 240ms on every state change via Motion 12 `key={state}`.

### HudCoreBubble

280px SVG centered absolutely behind scrollback (`z-0`). Layers:
1. Outer radial glow disc (`url(#hud-core-glow)`)
2. Outer tick ring — 24 ticks, `hud-core-rotate-slow` (80s rotation)
3. Hairline circle r=104
4. Middle dashed ring r=84, `hud-core-rotate-fast` when `isActive` (6s rotation)
5. Inner hairline r=64
6. Inner glow disc r=56, `hud-core-breathe` (4s scale 1→1.04)
7. Dark halo backdrop circle r=34 (`#020617` at 45% opacity)
8. Kiwi-bird path (original agent icon, scaled 2.2×, centered)

`dimmed=true` (conversation in progress) → `opacity: 0.22`
`dimmed=false` (empty state) → `opacity: 0.88`

`state === "thinking" | "streaming" | "sending"` → sets `isActive=true` → middle ring rotates fast + arc-tip path visible.

### HudCornerCrops

Four SVG L-brackets, `--edge-hud` stroke, `1px` width. On the console viewport: `size=12`, `breathing=true` → `hud-corner-crop` class → 6s opacity 0.45↔0.6 breathe. On receipts/clarification: `size=10`, `breathing=false`.

### GlobalJarvisDialog (cmd+K)

```tsx
<Dialog>
  <DialogContent className="sm:max-w-[640px] overflow-visible
                            border-[var(--edge-hud)] bg-[var(--surface-raised)] p-0">
    <motion.div
      className="relative p-4"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
    >
```
- Dialog border: `--edge-hud`
- Dialog bg: `--surface-raised`
- Entry animation: scale 0.96→1 + opacity 0→1, 180ms

**LiteJarvisComposer** (inside dialog):
```tsx
className="agent-mode-scope group/composer rounded-xl border border-[var(--edge)]
           bg-[var(--surface-raised)] px-4 py-3
           hover:border-[var(--edge-hud)]
           focus-within:border-[var(--hud-cyan)]
           focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--hud-cyan)_10%,transparent)]"
```
- `<textarea>`: `font-serif text-[15px]`, placeholder `italic text-[var(--ink-muted)]`
- Hint footer: `font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]` → "⌘⏎ to send · ⎋ to cancel"

---

## Design Token Inventory

### Cyan accent family (agent-mode signature)

| Token | Value (light) | Value (dark) | Usage |
|---|---|---|---|
| `--hud-cyan` | `oklch(72% 0.13 210)` | `oklch(72% 0.13 210)` (same) | Primary cyan surface accent |
| `--hud-cyan-bright` | `oklch(78% 0.16 210)` | same | Caret, caret glow, dot on STREAMING/SENDING |
| `--hud-cyan-dim` | `oklch(58% 0.1 210)` | same | Thinking ring base ring |
| `--hud-cyan-light` | `oklch(48% 0.13 210)` | same | Intent dot for memory/clarification |
| `--hud-cyan-glow` | `rgb(34 211 238 / 0.18)` | same | Box shadow glow, caret halo |
| `--hud-cyan-glow-soft` | `rgb(34 211 238 / 0.08)` | same | Ambient ambient halo on receipts/clarification, light-trail behind caret |
| `--hud-cyan-rgb` | `34, 211, 238` | same | For `rgb(var(--hud-cyan-rgb) / alpha)` patterns |
| `--edge-hud` | `oklch(72% 0.05 210)` | `oklch(45% 0.06 210)` | Border for HUD surfaces |

### Glow intensity tokens

| Token | Value | Usage |
|---|---|---|
| `--glow-hud-subtle` | `0 0 20px rgb(var(--hud-cyan-rgb) / 0.1)` | Subtle glow |
| `--glow-hud-medium` | `0 0 28px rgb(var(--hud-cyan-rgb) / 0.16)` | Medium glow |
| `--glow-hud-strong` | `0 0 36px rgb(var(--hud-cyan-rgb) / 0.24)` | Strong glow |

### Glass surface tokens

| Token | Light | Dark |
|---|---|---|
| `--glass-raise` | `-6px -6px 16px oklch(100% 0 0 / 0.75)` | `-4px -4px 12px oklch(100% 0 0 / 0.025)` |
| `--glass-drop` | `7px 7px 18px oklch(45% 0.02 260 / 0.16)` | `8px 8px 22px oklch(0% 0 0 / 0.55)` |
| `--glass-hi` | `oklch(100% 0 0 / 0.6)` | `oklch(100% 0 0 / 0.05)` |
| `--glass-lo` | `oklch(30% 0.01 75 / 0.05)` | `oklch(0% 0 0 / 0.35)` |
| `--glass-glow-color` | `var(--hud-cyan)` | `var(--hud-cyan)` |
| `--glass-glow` | `3%` | `5%` |
| `--glass-glow-hover` | `8%` | `11%` |
| `--glass-border` | `color-mix(in oklch, --edge 45%, transparent)` | same |
| `--glass-bg` | `color-mix(in oklch, --surface 92%, transparent)` | `color-mix(in oklch, --surface 64%, transparent)` |
| `--glass-bg-button` | `color-mix(in oklch, --surface 85%, transparent)` | `color-mix(in oklch, --surface 56%, transparent)` |

### Surface / ink palette

| Token | Light | Dark |
|---|---|---|
| `--canvas` | `oklch(97% 0.005 75)` | `oklch(15% 0.005 240)` |
| `--surface` | `oklch(94% 0.008 75)` | `oklch(19% 0.006 240)` |
| `--surface-raised` | `oklch(99% 0.003 75)` | `oklch(23% 0.007 240)` |
| `--ink` | `oklch(22% 0.01 60)` | `oklch(92% 0.01 90)` |
| `--ink-muted` | `oklch(50% 0.01 60)` | `oklch(65% 0.01 90)` |
| `--edge` | `oklch(86% 0.008 75)` | `oklch(28% 0.008 240)` |

### Intent inks

| Token | Light | Usage |
|---|---|---|
| `--ink-amber` | `oklch(70% 0.13 75)` | tasks, updates |
| `--ink-sage` | `oklch(62% 0.09 145)` | captures, persons |
| `--ink-coral` | `oklch(63% 0.16 25)` | events, deletes, errors |

### HUD keyframe classes (in globals.css)

| Class | Animation | Duration | Usage |
|---|---|---|---|
| `.hud-corner-crop` | breathing opacity 0.45↔0.6 | 6s | Corner L-brackets (viewport level) |
| `.hud-focus-breathe` | box-shadow glow 8px↔14px | 2400ms | JARVIS input idle-focused ring |
| `.hud-thinking-sweep` | rotate 0→360° | 1.4s/loop | Thinking ring arc tip |
| `.hud-streaming-caret` | opacity+glow pulse | 1.1s/loop | Streaming text caret |
| `.hud-scan-line` | translateY(-100%)→(100%) | 420ms | Done transition reveal |
| `.hud-receipt-outline-trace` | stroke-dashoffset reveal | 360ms | Queued receipt SVG border |
| `.hud-receipt-shimmer` | background-position sweep | 1800ms/loop | Queued receipt body |
| `.hud-error-glitch` | translateX 0→2px→-1px→0 | 80ms | Error turn jitter |
| `.hud-submit-ignite-border` | border-color cyan→bright→cyan | 320ms | Submit flash |
| `.hud-core-rotate-slow` | rotate 0→360° | 80s/loop | Outer tick ring |
| `.hud-core-rotate-fast` | rotate 0→360° | 6s/loop | Middle ring (active state) |
| `.hud-core-breathe` | scale 1↔1.04 | 4s/loop | Inner glow + kiwi |

### `.glass-tile` utility class

```css
.glass-tile {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-raise), var(--glass-drop),
              inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo),
              inset 0 0 24px color-mix(in oklch, var(--glass-glow-color) var(--glass-glow), transparent);
  transition: border-color, box-shadow, background-color 200ms ease-out;
}
.glass-tile:hover {
  border-color: color-mix(in oklch, var(--hud-cyan) 30%, var(--glass-border));
  // deeper inner glow at --glass-glow-hover
}
```

Note: `JarvisReceipt` DOES NOT use `.glass-tile` — it hard-codes the same shadow stack inline via `style={{ boxShadow: glassyShadow }}`. This means receipt styles are not responsive to future `.glass-tile` tweaks. The redesign should consider switching receipts to `.glass-tile` class or keeping them inline (both are acceptable per the locked scope constraint of not introducing new tokens).

### `.agent-mode-scope` background

Applied to the `JarvisConsole` wrapper and `LiteJarvisComposer`. Produces:
- `::before`: hexagonal dot pattern (24px) + grid lines (48px), `--hud-cyan-rgb` at 3.5%/2.5% opacity, `opacity: 0.55`
- `::after`: 4 corner cyan radial glows (700/500/400/600px circles at 5%/10%/5%/7% opacity)

---

## Font Usage in JARVIS UI

| Surface | Font | CSS | Size |
|---|---|---|---|
| User turn text | JetBrains Mono | `font-mono` | 14px (`text-sm`) |
| JARVIS prose text | JetBrains Mono | `font-mono italic font-medium` | 16px (`text-base`) |
| Receipt title (e.g. task title) | EB Garamond | `font-serif` | inherits body (16px) |
| Receipt metadata (priority, date) | JetBrains Mono | `font-mono text-xs` | 12px |
| Status pill label | JetBrains Mono | `font-mono text-[11px] uppercase` | 11px |
| Thinking indicator label | JetBrains Mono | `font-mono text-xs uppercase` | 12px |
| Date dividers | JetBrains Mono | `font-mono text-[14px] uppercase` | 14px |
| Input body text | Inter | `font-sans text-[15px]` | 15px |
| Input placeholder | EB Garamond | CSS `font-family: var(--font-serif)` | 16px |
| Input footer hint | Inter | `font-sans text-[12px]` | 12px |
| Clarification chrome label | JetBrains Mono | `font-mono text-[11px] uppercase` | 11px |
| Clarification question | EB Garamond | `font-serif text-base` | 16px |
| LiteJarvisComposer body | EB Garamond | `font-serif text-[15px]` | 15px |

---

## Key Findings: What's Clunky, What Works, What's Missing

### What's clunky

1. **No chat bubble layout.** Every turn is a flat monospace log entry. User messages have a bare `>` prefix. JARVIS responses are inline italic mono text with `ml-3` left indent. There is zero visual distinction between a "this is me talking" surface and "JARVIS is talking" surface. The user's LOCKED decision (iMessage-style bubbles) requires a full rearchitecture of the turn rendering layout inside `JarvisScrollback`.

2. **User turn background is transparent / invisible.** User messages have no surface, no padding box, no alignment. They cannot be "right-aligned" in the current DOM structure — the entire row is `flex items-baseline gap-2` with the prompt char left-most.

3. **JARVIS prose is unstyled text.** `font-mono italic` text on a flat, transparent background with `ml-3`. The ambient `agent-mode-scope` background provides mood but the message body itself has no glass surface, no glow, no bubble.

4. **The composer strip is `bg-card` (flat `--surface`), not glassy.** It reads as a flat gray band. The LOCKED spec says "neumorphic glass input, consistent with rest of app."

5. **`hud-focus-breathe` class is defined but not applied.** The `JarvisInput` comments document the focused-idle breathing ring, but the `className` array that builds the wrapper's classes does not add `hud-focus-breathe` when `focusedIdle`. The `hud-submit-ignite-border` is correctly applied. This is a pre-existing minor bug.

6. **ThinkingWord component exists but is retired.** `components/jarvis/ThinkingWord.tsx` remains in the codebase but is no longer used. `JarvisScrollback` renders `HudThinkingRing` + "THINKING" label instead.

7. **cmd+K abort bug.** `GlobalJarvisHandler` holds its `AbortController` in a `useEffect` local variable. When the component unmounts on navigation, the cleanup function runs `abort?.abort()` on line 393 of `GlobalJarvisHandler.tsx`. The SSE stream is killed, the `onDone` callback never fires, and the assistant turn is persisted as `status: "streaming"` which `JarvisConsole` normalizes to `"done"` on reload — but the text content is whatever was accumulated before abort, often empty.

### What already works well

1. **JarvisReceipt glass treatment** is complete and matches the Phase 6.1 spec. Corner crops, glassy surface, ambient cyan halo, intent dots — all implemented. The redesign should not break this.

2. **HudThinkingRing** is premium and minimal — matches the "restrained, not generic spinner" requirement. The circle sweep is distinctive.

3. **HudStatusPill** works correctly as a per-state JARVIS status indicator.

4. **HudCoreBubble** centerpiece is dramatic and appropriate for the empty state. When `coreDimmed=true` it recedes to `opacity: 0.22`, so the bubble does not compete with conversation content.

5. **Streaming caret** with light trail is well-implemented.

6. **ScanRevealOverlay** (streaming→done transition) is correct.

7. **Persistence plumbing** works: turns are saved to `jarvis_turns` via `saveJarvisTurn`, and `JarvisConsole` merges externally-created turns via Supabase Realtime. The Realtime channel in `JarvisConsole` will pick up GlobalJarvisHandler's persisted turns IF they persist before abort.

8. **`agent-mode-scope` ambient background** is the right mood for the JARVIS surface.

### What's missing

1. **Bubble surfaces.** Need a new CSS class or inline style recipe for user bubbles (right-aligned, neutral glass) and JARVIS bubbles (left-aligned, cyan-glow glass).

2. **Right-alignment for user turns.** Current DOM structure needs to be restructured to `justify-end` for user turn rows and `justify-start` for assistant turns.

3. **Global SSE handler that survives navigation.** The `AbortController` must move out of the component lifecycle. The planner needs to decide whether to use a module-level singleton (like the existing `jarvis-stream-client.ts` pattern), a React context, or a BroadcastChannel.

4. **Retry affordance on failed bubbles.** Currently `turn.status === "error"` renders `errorMessage` in a small mono text. No retry button exists.

5. **The `hud-focus-breathe` class needs to be correctly applied to the JarvisInput wrapper** when `focusedIdle`.

---

## Recommended Scope for the Redesign

### Files that MUST change

| File | Change |
|---|---|
| `apps/web/components/jarvis/JarvisScrollback.tsx` | Full rearchitecture of turn rendering — bubble layout, right-align user turns, left-align JARVIS turns with glass+glow surface, retry button on error |
| `apps/web/components/jarvis/JarvisConsole.tsx` | Remove `border-t bg-card` from composer strip wrapper (line 1227), replace with glassy surface |
| `apps/web/components/jarvis/JarvisInput.tsx` | Fix `hud-focus-breathe` class not being applied in `focusedIdle` state; optionally improve wrapper glass treatment |
| `apps/web/components/jarvis/GlobalJarvisHandler.tsx` | Move AbortController to module-level singleton so navigation doesn't abort the stream |
| `apps/web/app/globals.css` | Add bubble CSS classes if needed (or implement inline — depends on planner decision) |

### Files that MAY change (optional polish)

| File | Optional Change |
|---|---|
| `apps/web/components/jarvis/JarvisReceipt.tsx` | Switch from inline `glassyShadow` string to `.glass-tile` class to DRY up the recipe; add retry pattern if appropriate here |
| `apps/web/components/jarvis/LiteJarvisComposer.tsx` | Additional polish on the cmd+K dialog composer if bubble style requires alignment changes |
| `apps/web/components/shell/AppShell.tsx` | The side panel `aside` container uses `bg-[var(--canvas)]` — may need `agent-mode-scope` added so the background ambient activates in split-screen mode (it's missing today) |

### Files that MUST NOT change (per locked scope)

- All of `packages/jarvis-core/` — tools, executor, system prompt
- `apps/web/app/api/jarvis/route.ts`
- `apps/web/components/voice/` — mobile/desktop voice surfaces
- `apps/web/components/jarvis/GlobalJarvisDialog.tsx` non-JARVIS paths
- `apps/mobile/` (mobile app)

---

## cmd+K Reliability — Technical Root Cause

**The bug (verified by reading source):**

`GlobalJarvisHandler.tsx` binds the `jarvis-voice-transcript` listener inside a `useEffect`. When the handler fires, it creates a new `AbortController` in a local variable (`abort`) and starts `streamJarvis(...)`. When the user navigates away, React unmounts `GlobalJarvisHandler`, the `useEffect` cleanup runs, and `abort?.abort()` is called. This kills the in-flight fetch.

Separately, `GlobalJarvisDialog` fires `new CustomEvent("jarvis-voice-transcript", { detail: { transcript: text } })` (line 79 of GlobalJarvisDialog.tsx). `GlobalJarvisHandler` picks this up. `JarvisConsole` ALSO has a `jarvis-voice-transcript` listener (lines 811-858 of JarvisConsole.tsx) — but `GlobalJarvisHandler` checks `isJarvisConsoleMounted()` first (line 120) and yields if the console is mounted. So on `/today` the console handles it; on other routes the handler does.

**The fix direction:**

The AbortController must be owned at a scope that outlives component mounting. Options:
1. **Module-level singleton** (simplest, consistent with existing patterns like `jarvis-stream-client.ts` and the `focus.ts` singleton): export a `submitJarvisTurn(text)` function from a new module that holds the AbortController at module scope. `GlobalJarvisHandler` calls it; `JarvisConsole` also calls it on `/today` (currently calls `handleSubmit` which uses `abortRef.current` — same pattern needed).
2. **React Context with ref** (heavier): a `JarvisPendingTurnContext` that holds the active AbortController in a ref — survives re-renders but not tab closes.
3. **BroadcastChannel / Service Worker** (overkill): for true background persistence. Adds significant complexity. The CONTEXT.md notes this is "Claude's Discretion."

The module-level singleton is the most consistent with how the codebase already handles cross-component state (`focus.ts`, `unread-bus.ts`, `mic-state-bus.ts`).

**The turn display on `/today`:**

When `GlobalJarvisHandler` persists the user turn via `persistTurn` before the SSE starts, and persists the assistant turn on `onDone`, the Supabase Realtime channel in `JarvisConsole` picks up the `INSERT`/`UPDATE` events and merges via `refreshAndMerge()`. If the stream aborts before `onDone`, the assistant turn row exists with `status: 'streaming'` — `JarvisConsole.mapTurnRow()` normalizes `streaming → done` on reload (line 111 of JarvisConsole.tsx). The in-flight streaming state visible if the user arrives mid-stream requires the SSE to still be running when they reach `/today`, which is impossible without the module-level singleton fix.

---

## Open Questions

1. **Should user message bubbles use the existing `.glass-tile` class or custom inline styles?** `.glass-tile` hover behavior deepens the cyan glow, which may not be wanted on neutral user bubbles. Inline styles with `--glass-bg` + `--glass-raise`/`--glass-drop` only (no cyan) could differentiate them from JARVIS bubbles (which add `--hud-cyan-glow-soft`). Planner should specify.

2. **The `JarvisSidePanel` aside in `AppShell.tsx` lacks `agent-mode-scope`** — the ambient grid background does not render in split-screen mode. Is this intentional or an oversight? The CONTEXT.md does not address split-screen specifically.

3. **Should the retry button on failed bubbles re-POST the same payload or open the composer pre-filled?** The CONTEXT.md says "user-triggerable from the failed bubble" but leaves implementation to Claude's discretion. The simplest approach is to call `handleSubmit` again with the failed turn's text from a button inside the assistant turn row.

4. **ThinkingWord is retired but still present** — worth deleting in a cleanup task? It imports Motion 12 and adds bundle weight with no usage.

---

## Sources

All findings are from direct reading of source files in this session — no external web research was required.

- `apps/web/app/(app)/today/page.tsx` — JARVIS page entry point
- `apps/web/components/shell/AppShell.tsx` — split-screen layout
- `apps/web/components/shell/JarvisSidePanel.tsx` — side panel wrapper
- `apps/web/components/jarvis/JarvisConsole.tsx` — orchestrator
- `apps/web/components/jarvis/JarvisScrollback.tsx` — turn list rendering
- `apps/web/components/jarvis/JarvisInput.tsx` — composer with TipTap
- `apps/web/components/jarvis/JarvisReceipt.tsx` — action receipt cards
- `apps/web/components/jarvis/JarvisClarification.tsx` — clarification widget
- `apps/web/components/jarvis/GlobalJarvisDialog.tsx` — cmd+K dialog
- `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — background SSE handler
- `apps/web/components/jarvis/LiteJarvisComposer.tsx` — dialog textarea
- `apps/web/components/jarvis/ThinkingWord.tsx` — retired component (still in codebase)
- `apps/web/components/shared/HudCornerCrops.tsx` — L-bracket chrome
- `apps/web/components/shared/HudStatusPill.tsx` — state indicator
- `apps/web/components/shared/HudThinkingRing.tsx` — sweep loader
- `apps/web/components/shared/HudCoreBubble.tsx` — centerpiece SVG
- `apps/web/app/globals.css` — all design tokens, `.glass-tile`, `.glass-button`, HUD keyframes, `.agent-mode-scope`
- `apps/web/components/shell/GlobalHotkeys.tsx` — Cmd+K focus binding
- `apps/web/components/shell/CommandMenu.tsx` — Cmd+Shift+K palette (distinct)
- `apps/web/components/shell/TopTabBar.tsx` — JARVIS tab pill styling
- `.planning/phases/33-jarvis-ui-cmdK-reliability/33-CONTEXT.md` — locked decisions
