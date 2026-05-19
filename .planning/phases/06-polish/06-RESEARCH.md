# Phase 6: Polish - Research

**Researched:** 2026-05-18
**Domain:** Aesthetic quality pass — typography, dark mode, resilience, telemetry, accessibility
**Confidence:** HIGH (most findings verified against official docs or existing codebase)

## Summary

Phase 6 is a deliberate quality pass on a feature-complete app. The biggest implementation risk is dark mode: globals.css already stubs a `.dark` class with CSS variable overrides, but neither `next-themes` nor a Tailwind 4 `@variant dark` declaration is wired up. The planner must thread `next-themes` through the root layout while aligning its `attribute="class"` toggle with Tailwind 4's CSS-first dark variant — a two-step wiring that is easy to get half-right.

Everything else is lower-risk. `sonner` 2.0.7 (installed) supports `action` as a ReactNode for undo buttons. `motion/react` 12.38.0 (installed) is already used by JARVIS receipts. `recharts` 3.8.1 supports React 19 and is the right pick for the 3-chart `/insights` spec — light, well-maintained, `'use client'` wrapper over a Server Component query. Cmd+K focus-to-TipTap needs a single `useImperativeHandle` on `JarvisInput` + one `useHotkeys` hook at the layout level. `error.tsx` follows Next.js 16.2 conventions: `'use client'`, receives `{ error, unstable_retry }`, digest is available for the structured error report.

**Primary recommendation:** Wire next-themes first (root layout + providers.tsx + @variant dark in CSS), then iterate. Every other work item is incremental on top of functioning light/dark tokens.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** EB Garamond ONLY for body AND headings. Different weight/size for hierarchy. No Louize in v1.0.
- **D-02:** Cmd+K focuses JARVIS Console input only. No command palette overlay.
- **D-03:** No telemetry vendor (no Sentry, PostHog, Highlight). `error.tsx` per route group renders branded fallback + "Copy error report" button (clipboard payload: timestamp, route, error.name, error.message, error.stack, digest, userAgent). Server errors → console.error + Vercel runtime log.
- **D-04:** `/insights` ships exactly 3 charts: action-type distribution (bar), latency p50/p95 (line), error rate (number + sparkline). 7-day window, no filter UI, server-rendered Server Component.
- **D-05:** Dark mode follows system on first load; user toggle persists override.
- **D-06:** Theme toggle in BOTH /settings AND global header.

### Claude's Discretion
- Toast library: sonner (already installed).
- Motion library: motion/react (already installed).
- Empty-state copy voice: Genz-Renaissance per idea_for_polymathy.md.
- error.tsx structure: one per route group.
- /health endpoint shape: `{ supabase, anthropic, google_calendar, checked_at }` — 200 all ok, 503 any down.
- Accent color: one accent (warm ink-red or muted blue — prototype during planning).
- Motion durations: 150-250ms micro, 300-400ms page; respect prefers-reduced-motion.
- Settings page IA: theme + toggles under /settings root, no sub-navigation.
- Responsive breakpoint: md: (768px) Tailwind default.

### Deferred Ideas (OUT OF SCOPE)
- Louize licensing, CMDK command palette, Sentry/PostHog/Highlight, richer /insights dashboard, mobile-native UX (<768px), brand-voice copy review pass.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AES-01 | EB Garamond via next/font/google; hierarchy via weight/size | Section 2 — font already loaded, needs weight expansion + Tailwind token alignment |
| AES-02 | Academic journal × Notion × Warp aesthetic; monochrome + single accent | Section 2 — accent token already in globals.css as --color-accent (amber 38 72% 52%) |
| AES-03 | Page transitions + list reorders via Motion | Section 10 — motion/react 12.38 installed; view transitions API or layout animations |
| AES-04 | Genz-Renaissance brand voice copy throughout | Section 8 — copy patterns, no library needed |
| AES-05 | Cmd+K focuses JARVIS input from anywhere | Section 5 — useHotkeys + useImperativeHandle pattern |
| AES-06 | Light/dark both pass journal-paper feel; toggle in settings + header | Sections 1, 2 — next-themes + .dark CSS vars already stubbed |
| AES-07 | Layout responsive ≥768px; core flows must not break | Section 9 — Tailwind md: breakpoints, no new library |
| SET-03 | User can switch light/dark; preference persists across sessions | Section 1 — next-themes storageKey + optional DB persistence |
| RES-01 | error.tsx per route group with branded fallback + copy-paste error report | Section 3 — Next.js 16.2 error.tsx API |
| RES-02 | Toast for action success/error; undo within 5s for non-destructive | Section 4 — sonner 2.0.7 action prop + existing useUndoCountdown |
| RES-03 | Empty states for every list view with brand-voice copy | Section 8 — copy patterns |
| RES-04 | /health returns Supabase + Anthropic + Google Calendar status | Section 7 — ping patterns, parallel Promise.allSettled |
| RES-06 | /insights: 3 charts over jarvis_events | Section 6 — recharts, Server Component query pattern |
| RES-07 | Error capture (no vendor) | Section 3 — covered by D-03 implementation |
</phase_requirements>

---

## 1. Dark Mode Strategy

**Confidence:** HIGH (verified against Next.js docs + Tailwind 4 docs + codebase)

### What's Already in Place

`globals.css` line 42 already declares `.dark { ... }` overriding all CSS custom properties. `app/layout.tsx` loads EB Garamond + Inter without a theme provider. No `@variant dark` declaration exists yet, and `next-themes` is not installed.

### The Two-Step Wiring

**Step 1: Add `@variant dark` to globals.css (BEFORE the .dark block)**

```css
/* globals.css — add after @import "tailwindcss" */
@variant dark (&:where(.dark, .dark *));
```

This tells Tailwind 4's Oxide engine to generate `dark:` utilities that activate on `.dark` ancestor — matching what next-themes will toggle on `<html>`. The existing `.dark { --color-background: ... }` block then takes over the CSS variable override.

**Step 2: Install next-themes + wire ThemeProvider**

```bash
npm install next-themes@0.4.6
```

Create `app/providers.tsx` (must be `'use client'`):

```tsx
'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="hyperpolymath-theme"
    >
      {children}
    </ThemeProvider>
  )
}
```

Update `app/layout.tsx`:
- Add `suppressHydrationWarning` to `<html>` (prevents hydration mismatch since next-themes mutates the class server-side unknown)
- Wrap `<body>` children with `<Providers>`

```tsx
// app/layout.tsx
<html lang="en" suppressHydrationWarning className={...}>
  <body>
    <Providers>{children}</Providers>
  </body>
</html>
```

### Theme Toggle Component

`useTheme()` from next-themes returns `{ theme, setTheme, resolvedTheme, systemTheme }`. Must be `'use client'`. Mount-guard required: `const [mounted, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])` — server render doesn't know theme, so rendering the button before mount causes hydration mismatch.

```tsx
'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-8 w-8" /> // skeleton placeholder

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
```

This component drops into BOTH the sidebar footer (global header — actually sidebar bottom in current AppShell layout, see PersistentNav) AND the `/settings` page Card.

### Pitfall: `attribute="class"` vs `data-theme`

next-themes defaults to `attribute="data-theme"`. Must explicitly pass `attribute="class"` so that Tailwind 4's `@variant dark (&:where(.dark, .dark *))` fires. Misalignment silently produces no dark styles.

### Persistence Decision

next-themes persists to `localStorage` by default (via `storageKey`). CONTEXT.md D-05 says "persists to the `users` table or browser storage." For MVP, `localStorage` via next-themes is sufficient — it survives browser refresh and is scoped per-device. DB persistence (for cross-device sync) is a deferred enhancement.

---

## 2. Typography — EB Garamond via next/font/google

**Confidence:** HIGH (verified against codebase — font is already loaded)

### Current State

`app/layout.tsx` already loads EB Garamond with weights `['400', '500', '600', '700', '800']` and italic. Variable `--font-eb-garamond` is assigned. `globals.css` maps it to `--font-serif`. `body { font-family: var(--font-serif) }` is set.

### Hierarchy Without Louize

Since D-01 prohibits Louize, hierarchy is expressed entirely through EB Garamond weight and size. Canonical scale for the journal aesthetic:

| Role | Class pattern | Notes |
|------|--------------|-------|
| Page heading (H1) | `text-4xl font-serif font-semibold` (600) | Already used in /settings, /memory pages |
| Section heading (H2) | `text-xl font-serif font-medium` (500) | Card headers |
| Body text | `text-base font-serif` (400) | Default via body rule |
| Body italic/quote | `text-base font-serif italic` | Blockquotes, JARVIS prose |
| Caption / metadata | `text-xs font-mono text-muted-foreground` | Receipt fields, timestamps |

Phase 6 work: audit every list view, error page, and empty state to enforce this scale. No new font loading needed.

### Tailwind 4 Token

`font-serif` is already mapped in globals.css `@theme` block. `font-mono` fallbacks (JetBrains Mono → Fira Code → Menlo) are not loaded from Google — they rely on locally installed fonts. Consider adding `JetBrains Mono` via `next/font/google` if the monospace display quality is inconsistent across devices.

---

## 3. error.tsx + Copy Error Report

**Confidence:** HIGH (verified against Next.js 16.2 official docs, fetched 2026-05-18)

### Next.js 16.2 error.tsx API

```tsx
'use client'
// Props as of Next.js 16.2 (v13.0 had reset, v16.2 introduced unstable_retry)
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) { ... }
```

Key facts:
- Must be `'use client'` (error boundaries are class components under the hood)
- `error.digest` is the server-generated hash linking client error to Vercel log entry — include in clipboard payload
- In **production**, `error.message` for Server Component errors is a GENERIC string — the original message is in the server log only. `error.digest` is the cross-reference key.
- `unstable_retry()` re-fetches and re-renders the segment. The older `reset()` only clears local state without re-fetching — prefer `unstable_retry`.
- `global-error.tsx` in `app/` catches root layout errors and **must** include its own `<html>` and `<body>` tags.

### Route Group Structure

Place error boundaries at these locations to match the existing route groups:

| File | Catches |
|------|---------|
| `app/global-error.tsx` | Root layout errors (full-page replacement, needs `<html><body>`) |
| `app/(app)/error.tsx` | All authenticated app errors (tasks, captures, calendar, JARVIS, settings, insights) |
| `app/(auth)/error.tsx` | Sign-in page errors (if the route group exists) |

A single `app/(app)/error.tsx` covers the vast majority of runtime errors. `global-error.tsx` only fires when the root layout itself throws.

### Copy Error Report Button

```tsx
'use client'
import { usePathname } from 'next/navigation'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const pathname = usePathname()

  function copyReport() {
    const payload = {
      timestamp: new Date().toISOString(),
      route: pathname,
      name: error.name,
      // In production, error.message from SC errors is generic.
      // Include both — digest is the key to find the real message in Vercel logs.
      message: error.message,
      digest: error.digest ?? 'none',
      stack: error.stack ?? 'none',
      userAgent: navigator.userAgent,
    }
    const text = `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
    navigator.clipboard.writeText(text)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24 font-serif">
      <h1 className="text-4xl font-semibold mb-4">Something went wrong.</h1>
      <p className="text-muted-foreground text-sm mb-8 max-w-md text-center">
        An unexpected error occurred. Copy the report below and paste it into a
        GitHub issue — the digest links it to the server log.
      </p>
      {error.digest && (
        <code className="text-xs font-mono mb-6 text-muted-foreground">
          digest: {error.digest}
        </code>
      )}
      <div className="flex gap-3">
        <button onClick={copyReport} className="...">
          Copy error report
        </button>
        <button onClick={unstable_retry} className="...">
          Try again
        </button>
      </div>
    </main>
  )
}
```

**Anti-pattern:** Do not show `error.stack` inline in the UI — it may contain internal file paths. It belongs in the clipboard payload only.

---

## 4. sonner Undo Toast Pattern

**Confidence:** HIGH (verified against sonner 2.0.7 installed, official docs)

### Existing Pattern (JARVIS)

JARVIS receipts use `useUndoCountdown(5, onExpire)` inside `JarvisReceipt.tsx` — the countdown is local to the receipt component, not a toast. This works because JARVIS actions have dedicated receipt UI.

### For Non-JARVIS Actions (CRUD in Tasks, Captures, Areas)

Non-JARVIS mutations (delete task, archive area, etc.) do not have dedicated receipt UI. The pattern is a sonner toast with an `action` prop:

```tsx
import { toast } from 'sonner'

// After a delete Server Action resolves:
function handleDeleteTask(task: Task) {
  // 1. Optimistic remove from local state
  removeOptimistic(task.id)
  // 2. Server Action (non-awaited — fire and forget while countdown runs)
  const deletePromise = deleteTaskAction(task.id)
  // 3. Sonner toast with undo
  toast(`"${task.title}" deleted`, {
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: async () => {
        // Cancel the delete or re-insert
        await restoreTaskAction(task.id)
        // Optimistic re-add
        addOptimistic(task)
      },
    },
  })
}
```

**Important:** The `action` prop in sonner 2.x accepts `{ label: string, onClick: (event) => void }` — NOT a ReactNode in all versions. Verify against the installed 2.0.7 API. If `action` accepts ReactNode, use a JSX Button; if it requires the object form, use `{ label, onClick }`.

Sonner 2.0.7 also supports `duration`, `dismissible`, and `onAutoClose` (fires when the toast auto-dismisses — useful for committing the delete if undo wasn't clicked).

### Success Toasts

For non-destructive actions (create, edit): `toast.success('Task created')` — 4000ms default duration (Toaster already has `duration={4000}` in `(app)/layout.tsx`).

For errors: `toast.error('Could not save: ' + error.message)`.

---

## 5. Cmd+K — Focus Delegation to TipTap

**Confidence:** HIGH (verified against codebase + TipTap focus API + React 19 ref-as-prop)

### The Problem

`JarvisInput` renders the TipTap editor. The Cmd+K listener needs to live higher in the tree (globally) and call `editor.commands.focus('end')` on the JARVIS TipTap instance. The editor object is local to `JarvisInput`; an imperative handle is the correct escape hatch.

### Pattern: useImperativeHandle on JarvisInput

JarvisInput currently does not expose a ref. Add:

```tsx
// JarvisInput.tsx
import { useImperativeHandle, forwardRef } from 'react' // or just ref prop in React 19

export interface JarvisInputHandle {
  focus(): void
}

// React 19: ref is a regular prop, no forwardRef needed
export function JarvisInput({
  ref, // React 19 style
  ...props
}: Props & { ref?: React.Ref<JarvisInputHandle> }) {
  const editor = useEditor({ ... })

  useImperativeHandle(ref, () => ({
    focus() {
      editor?.commands.focus('end')
    },
  }), [editor])

  // ... rest unchanged
}
```

Then in `JarvisConsole.tsx`, create the ref and pass it:

```tsx
const jarvisInputRef = useRef<JarvisInputHandle>(null)
// ...
<JarvisInput ref={jarvisInputRef} ... />
```

### Global Keydown Listener

Use `react-hotkeys-hook` (not yet installed) or a plain `useEffect` window listener in `(app)/layout.tsx` or a new `GlobalHotkeys` client component:

```tsx
// Option A: plain useEffect (no new dependency)
'use client'
import { useEffect } from 'react'

export function CmdKListener({ onCmdK }: { onCmdK: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onCmdK()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCmdK])
  return null
}
```

The challenge: `JarvisConsole` lives inside the main content area; the layout-level listener needs to reach its ref. The cleanest architecture:

1. `JarvisConsole` creates `jarvisInputRef`
2. Passes `onFocusJarvis={() => jarvisInputRef.current?.focus()}` up to a context or down to a listener prop on the shell

OR: use a simple module-level singleton:

```ts
// lib/jarvis-focus.ts
let _focusFn: (() => void) | null = null
export function registerJarvisFocus(fn: () => void) { _focusFn = fn }
export function focusJarvis() { _focusFn?.() }
```

`JarvisConsole` calls `registerJarvisFocus` on mount; the global listener calls `focusJarvis()`. Simple, zero React overhead, works across the component tree. Cleanup on unmount: `registerJarvisFocus(() => {})` or `null`.

**Do not install `react-hotkeys-hook`** just for this one shortcut — the plain `useEffect` pattern is sufficient and avoids a new dependency.

---

## 6. /insights Charts

**Confidence:** HIGH (recharts 3.8.1 confirmed React 19 compatible; Server Component query pattern verified)

### Library Decision: recharts

- Already no conflicts with existing deps
- React 19 peer dep confirmed (`react: '^16.8.0 || ... || ^19.0.0'`)
- 3.8.1 is latest stable; ~150KB minified but all chart components are tree-shakeable
- For 3 small charts, the total bundle delta is modest; recharts is the standard pick
- Not installed yet: `npm install recharts@3.8.1`

Alternatives NOT recommended:
- tremor: built on recharts but adds opinionated styling that fights the journal aesthetic
- visx: too low-level for 3 small charts, requires D3 knowledge
- nivo: heavy, RSC incompatible warnings

### Data Shape (jarvis_events schema)

```
jarvis_events columns for /insights:
  created_at       timestamp — window filter (last 7 days)
  action_types     text[]    — e.g. ['create_task', 'create_event']
  latency_ms       integer   — total turn latency
  first_token_ms   integer   — TTFA
  error            text      — non-null = error turn
```

### Server-Side Aggregation Queries (Drizzle)

```ts
// Compute these in a Server Component — no client round-trip
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

// 1. Action type distribution
const events = await db
  .select({ actionTypes: jarvisEvents.actionTypes, error: jarvisEvents.error, latencyMs: jarvisEvents.latencyMs })
  .from(jarvisEvents)
  .where(and(eq(jarvisEvents.userId, userId), gte(jarvisEvents.createdAt, since)))

// Aggregate client-side (in server component) — unnest action_types array
// e.g. count by tool type, p50/p95 latency via sort, error rate

// 2. Latency p50/p95
const latencies = events.map(e => e.latencyMs).filter(Boolean).sort((a,b) => a-b)
const p50 = latencies[Math.floor(latencies.length * 0.5)]
const p95 = latencies[Math.floor(latencies.length * 0.95)]

// 3. Error rate
const errorRate = events.filter(e => e.error).length / events.length
```

Pass the aggregated data as props to `'use client'` chart components.

### Chart Component Skeleton

```tsx
// app/(app)/insights/page.tsx — Server Component
import { InsightsCharts } from '@/components/insights/InsightsCharts'
export const dynamic = 'force-dynamic'

export default async function InsightsPage() {
  const user = await requireOnboarded()
  const data = await getInsightsData(user.id)
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <h1 className="text-4xl font-serif">Insights</h1>
      <InsightsCharts data={data} />
    </main>
  )
}
```

```tsx
// components/insights/InsightsCharts.tsx — Client Component
'use client'
import { BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

export function InsightsCharts({ data }: { data: InsightsData }) {
  return (
    <>
      {/* Chart 1: Action type distribution */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.actionDist}>
          <Bar dataKey="count" fill="var(--color-accent)" />
          <XAxis dataKey="type" tick={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          <YAxis />
          <Tooltip />
        </BarChart>
      </ResponsiveContainer>

      {/* Chart 2: Latency p50/p95 — if daily bucketing is needed, aggregate by day in server */}
      {/* Chart 3: Error rate number + sparkline */}
    </>
  )
}
```

**Pitfall:** `ResponsiveContainer` requires the parent to have a defined height. Set explicit `height` or wrap in a fixed-height div.

### Navigation Entry

Add `/insights` to `PersistentNav` items array in `components/shell/PersistentNav.tsx`. Use `BarChart2` or `TrendingUp` Lucide icon.

---

## 7. /health Endpoint

**Confidence:** HIGH (standard Next.js App Router API route pattern)

### Pattern

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

async function pingSupabase(): Promise<'ok' | 'down'> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('users').select('id').limit(1)
    return error ? 'down' : 'ok'
  } catch {
    return 'down'
  }
}

async function pingAnthropic(): Promise<'ok' | 'down'> {
  try {
    const client = new Anthropic()
    // cheapest possible call — models.list doesn't consume tokens
    await client.models.list()
    return 'ok'
  } catch {
    return 'down'
  }
}

export async function GET() {
  const timeout = (ms: number) =>
    new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), ms))

  const [supabase, anthropic] = await Promise.allSettled([
    Promise.race([pingSupabase(), timeout(3000)]),
    Promise.race([pingAnthropic(), timeout(5000)]),
  ])

  const result = {
    supabase: supabase.status === 'fulfilled' && supabase.value === 'ok' ? 'ok' : 'down',
    anthropic: anthropic.status === 'fulfilled' && anthropic.value === 'ok' ? 'ok' : 'down',
    google_calendar: 'n/a', // auth-context required; skip for public health check
    checked_at: new Date().toISOString(),
  }

  const allOk = result.supabase === 'ok' && result.anthropic === 'ok'
  return NextResponse.json(result, { status: allOk ? 200 : 503 })
}
```

**Google Calendar:** Pinging GCal requires a valid user OAuth token (per-user, not a service account). A public `/health` endpoint has no user context. Decision: mark `google_calendar: 'n/a'` and note it. Alternatively, test GCal at the settings page load (where user context exists) rather than in `/health`.

**No auth guard on /health:** This is intentional — monitoring tools need to reach it without credentials.

---

## 8. Empty State Copy Patterns

**Confidence:** MEDIUM (pattern analysis; actual copy is Claude's Discretion)

### Voice Principle

Genz-Renaissance: confident, literate, unapologetic. The copy should feel like a friend with a dry wit and high cultural literacy — not a startup marketing page, not a sterile "No items found."

### Per-View Drafts

| View | Empty state heading | Sub-copy |
|------|---------------------|----------|
| Tasks (kanban) | "Nothing needs doing." | "Which either means you've handled everything or haven't started anything. Either way, JARVIS is waiting." |
| Tasks (list) | "An empty list is a luxury." | "Add a task or tell JARVIS — it routes either way." |
| Captures | "The inbox is quiet." | "Type anything. Thoughts, links, fragments. JARVIS will sort it out." |
| Areas | "No areas yet." | "Areas are the chapters. Start with one — Work, School, Life." |
| Projects | "No projects in this area." | "Projects are the books. Add one." |
| Calendar | "Nothing on the calendar." | "Either a very good day or JARVIS hasn't made plans for you yet." |
| /insights (no data) | "Seven days of silence." | "JARVIS hasn't logged any turns yet. Send it a message to populate this." |

Copy is intentionally minimal — one short heading, one optional sentence. No icons in empty states (restraint per AES-02). An optional `motion.div` with `initial={{ opacity: 0 }}` fade-in for the empty state container.

---

## 9. Accessibility Quick Wins

**Confidence:** HIGH (standard patterns)

### Focus Rings

Tailwind 4's `focus-visible:ring-2 focus-visible:ring-accent` on interactive elements. Ensure shadcn components haven't suppressed `outline-none` without replacing it with `focus-visible:ring-*`.

### prefers-reduced-motion

Add to globals.css (consistent with Next.js view transitions guide):

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

For motion/react components, pass `transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}` or use the `useReducedMotion()` hook from `motion/react`.

```tsx
import { useReducedMotion } from 'motion/react'

function AnimatedList() {
  const shouldReduce = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduce ? 0 : 0.2 }}
    />
  )
}
```

### Color Contrast

The existing light mode tokens: background `hsl(42 18% 97%)`, foreground `hsl(30 8% 16%)` — high contrast, WCAG AA. Dark mode tokens: background `hsl(30 8% 10%)`, foreground `hsl(38 15% 92%)` — also high contrast. The accent `hsl(38 72% 52%)` (amber) on dark background: verify with browser DevTools Accessibility → Contrast. Accent on light parchment background should pass AA for large text (3:1 ratio for decorative/large; 4.5:1 for body text — accent is used for borders/rings, not body text, so 3:1 is the relevant threshold).

### Keyboard Navigation

Cmd+K (Section 5) is the primary shortcut. Beyond that: verify that all interactive elements in the sidebar, receipts, settings cards, and kanban board are reachable via Tab. shadcn components (Button, Dialog, Popover) handle this via Radix primitives. Custom elements (AreaCreateDialog trigger, receipt Undo button) need explicit `tabIndex` and role.

### Responsive (AES-07)

Tailwind `md:` (768px) breakpoint. Current AppShell uses `flex h-screen` with `Sidebar` (fixed-width) + `main flex-1`. At 768px, the sidebar must be collapsible or narrowed. Check `Sidebar.tsx` for existing collapse logic (from Phase 2) — it likely already has a collapsed state.

---

## 10. Page Transitions

**Confidence:** HIGH (verified against Next.js 16.2 official guide + existing motion/react usage)

### Option A: React ViewTransition API (Experimental in Next.js 16.2)

Enable in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
}
```

Then import `ViewTransition` from `react` and wrap page content. Route navigations automatically trigger transitions. Still marked `experimental` in Next.js 16.2 (verified 2026-05-18). Broad browser support (~78% as of March 2026) with graceful fallback on unsupported browsers.

### Option B: motion/react layout animations (simpler, already used)

Use `motion.div` with `layout` prop on list items for reorder animations. For page transitions, wrap page content in `template.tsx` (re-renders on every navigation, unlike `layout.tsx` which persists):

```tsx
// app/(app)/template.tsx
'use client'
import { motion } from 'motion/react'

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  )
}
```

### Recommendation

Use **Option B** (motion/react template.tsx) for page transitions — it's simpler, already uses installed libraries, and requires no experimental flags. Reserve ViewTransition for future phases if shared-element morphing (e.g., receipt → task detail) becomes desired.

For list reorders (Tasks kanban, Captures feed), add `<AnimatePresence>` + `motion.div` with `layout` prop on individual items. Already used in JARVIS receipts — same pattern.

Duration target: 150ms fade for page transitions (quick enough to feel snappy, slow enough to be perceptible). 200ms for list item entry (matches existing JARVIS receipt `duration: 0.2`).

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose |
|---------|---------|---------|
| motion | 12.38.0 | Animations — page transitions, list reorders |
| sonner | 2.0.7 | Toast notifications + undo actions |
| next/font/google | (Next 16) | EB Garamond font loading |
| tailwindcss | ^4.1.0 | Styling, dark: variant |

### New Installs Required

| Library | Version | Purpose |
|---------|---------|---------|
| next-themes | 0.4.6 | Dark/light mode toggle + system preference + localStorage |
| recharts | 3.8.1 | /insights charts (bar, line, sparkline) |

**Installation:**
```bash
npm install next-themes@0.4.6 recharts@3.8.1
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| System theme detection + localStorage persistence + SSR flicker prevention | Custom localStorage hooks | next-themes (blocking script in head prevents flicker) |
| Chart rendering with axes, tooltips, responsive containers | SVG charts from scratch | recharts 3.8.1 |
| Toast notifications | Custom toast stack | sonner (already installed) |
| Countdown timer for undo | setInterval pattern | useUndoCountdown already in JarvisReceipt.tsx — extract and reuse |

---

## Common Pitfalls

### Pitfall 1: Dark mode flicker on first load
**What goes wrong:** Theme flashes light before dark on SSR pages.
**Why it happens:** Server doesn't know localStorage; renders without class; client adds `.dark` after hydration.
**How to avoid:** next-themes injects a blocking script in `<head>` before React hydrates. This only works if `suppressHydrationWarning` is on `<html>` AND `ThemeProvider` wraps the app from the root layout.
**Warning signs:** Flash of white on dark-preference browsers in dev mode.

### Pitfall 2: `@variant dark` + `attribute="class"` mismatch
**What goes wrong:** Tailwind `dark:` utilities don't apply even though the `.dark` class is on `<html>`.
**Why it happens:** Tailwind 4 requires an explicit `@variant dark` declaration for class-based dark mode. Without it, Tailwind 4's default dark variant behavior may not activate.
**How to avoid:** Add `@variant dark (&:where(.dark, .dark *));` to globals.css BEFORE the `.dark { }` token block.

### Pitfall 3: error.tsx receives generic message from Server Component errors
**What goes wrong:** Copy-error-report shows "An error occurred in the Server Components render" instead of the real error message.
**Why it happens:** Next.js sanitizes Server Component error messages in production to prevent leaking internals.
**How to avoid:** Always include `error.digest` in the clipboard payload — it maps to the real error in Vercel's function logs.

### Pitfall 4: Recharts ResponsiveContainer with undefined height
**What goes wrong:** Charts render as 0px tall or throw a warning.
**Why it happens:** `ResponsiveContainer width="100%"` requires the parent to have a defined height.
**How to avoid:** Always set explicit `height={200}` on ResponsiveContainer, or wrap in `<div className="h-[200px]">`.

### Pitfall 5: useTheme() rendering before mount causes hydration mismatch
**What goes wrong:** ThemeToggle button shows wrong icon on first render, React hydration warning.
**Why it happens:** Server renders without knowing localStorage theme; client knows it.
**How to avoid:** Mount-guard: `const [mounted, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])`. Render a placeholder (same dimensions) before mount.

### Pitfall 6: Cmd+K intercepted by browser (Chrome: address bar)
**What goes wrong:** Cmd+K in Chrome opens the address bar instead of focusing JARVIS.
**Why it happens:** Chrome uses Cmd+K for focus-address-bar on some platforms, but only when the focus is not in the page. Inside the app, `e.preventDefault()` in the keydown handler should suppress it.
**How to avoid:** Call `e.preventDefault()` in the window keydown handler. Test in Chrome, Firefox, and Safari.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| next-themes | Dark mode (SET-03, AES-06) | ✗ (not installed) | — | None — must install |
| recharts | /insights charts (RES-06) | ✗ (not installed) | — | None — must install |
| motion/react | Page transitions, list reorders (AES-03) | ✓ | 12.38.0 | Already wired |
| sonner | Toasts (RES-02) | ✓ | 2.0.7 | Already wired |

**Missing dependencies with no fallback:**
- `next-themes@0.4.6` — blocks SET-03 and AES-06
- `recharts@3.8.1` — blocks RES-06

---

## Architecture Patterns

### Recommended File Structure for Phase 6

```
app/
├── providers.tsx              # ThemeProvider client wrapper (NEW)
├── global-error.tsx           # Root error boundary (NEW)
├── (app)/
│   ├── error.tsx              # App route group error boundary (NEW)
│   ├── insights/
│   │   └── page.tsx           # Server Component — /insights (NEW)
│   └── template.tsx           # Page transitions (NEW, optional)
├── api/
│   └── health/
│       └── route.ts           # /health endpoint (NEW)
components/
├── shell/
│   ├── ThemeToggle.tsx        # useTheme() toggle button (NEW)
│   └── PersistentNav.tsx      # Add /insights entry (EDIT)
├── insights/
│   └── InsightsCharts.tsx     # 'use client' recharts components (NEW)
└── jarvis/
    └── JarvisInput.tsx        # Add useImperativeHandle + focus() (EDIT)
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| `reset()` in error.tsx | `unstable_retry()` in Next.js 16.2 | `unstable_retry` re-fetches + re-renders; `reset` only clears error state |
| `framer-motion` import | `motion/react` import | Package renamed; already using correct import in JarvisReceipt.tsx |
| `forwardRef()` for ref passing | `ref` as regular prop in React 19 | JarvisInput can accept `ref` directly without `forwardRef` wrapper |
| Tailwind `darkMode: 'class'` in config | `@variant dark` in CSS | Tailwind 4 CSS-first config |

---

## Open Questions

1. **Accent color final value**
   - What we know: `--color-accent: hsl(38 72% 52%)` is already set as a warm amber.
   - What's unclear: Whether this reads well in dark mode. The dark mode stub uses `hsl(38 65% 58%)` — slightly lighter/more saturated. May need real browser testing.
   - Recommendation: Prototype both; lock before AES-02 task.

2. **JetBrains Mono availability**
   - What we know: globals.css specifies `--font-mono: "JetBrains Mono", "Fira Code", Menlo` but these are NOT loaded via next/font — they rely on system/locally installed fonts.
   - What's unclear: Whether the mono rendering is consistent across environments without a web font.
   - Recommendation: Evaluate during Phase 6. If inconsistent, add `JetBrains_Mono` via `next/font/google`.

3. **localStorage vs DB persistence for theme (D-05)**
   - What we know: CONTEXT.md D-05 says "persists to the `users` table or browser storage."
   - What's unclear: The planner should pick one for MVP. localStorage (via next-themes) is simpler; DB persistence gives cross-device sync.
   - Recommendation: localStorage for MVP. The `users` table already has a `theme` column if one was added, or it's a one-column migration.

---

## Sources

### Primary (HIGH confidence)
- Next.js 16.2 official docs (fetched 2026-05-18): `error.tsx` API, `global-error.tsx`, `ViewTransition` guide, view transitions config
- Existing codebase: `globals.css` (dark mode CSS vars stubbed), `app/layout.tsx` (EB Garamond loaded), `package.json` (sonner 2.0.7, motion 12.38.0 confirmed installed), `JarvisReceipt.tsx` (useUndoCountdown + motion/react pattern), `JarvisInput.tsx` (TipTap editor instance + focus command)
- npm registry: recharts 3.8.1 (latest, React 19 peer dep confirmed), next-themes 0.4.6 (latest)

### Secondary (MEDIUM confidence)
- next-themes GitHub README: ThemeProvider API, `attribute="class"`, `suppressHydrationWarning` requirement
- Tailwind CSS dark mode docs: `@variant dark` for class-based strategy in Tailwind 4
- sonner official docs: `action` prop API for toast with action button
- React 19 docs: `useImperativeHandle` + ref-as-prop pattern

### Tertiary (LOW confidence, for awareness)
- WebSearch multiple sources (2026): recharts bundle size estimates (~150KB), tremor being built on recharts, visx being lower-level
- Community pattern for Cmd+K implementation (plain useEffect window listener recommended over react-hotkeys-hook dependency)

---

## Metadata

**Confidence breakdown:**
- Dark mode: HIGH — CSS vars already stubbed, next-themes API is stable and well-documented
- Typography: HIGH — font is already loaded; hierarchy is a CSS/utility decision
- error.tsx: HIGH — fetched directly from Next.js 16.2 official docs (2026-05-18)
- sonner undo: HIGH — already installed and used in the app; API verified
- Cmd+K: HIGH — TipTap focus API is stable; plain window listener is idiomatic
- /insights charts: HIGH — recharts API is stable; RSC pattern is standard
- /health: HIGH — standard Next.js API route pattern
- Empty states: MEDIUM — copy is subjective; patterns are well-established
- Accessibility: HIGH — standard WCAG/Tailwind patterns
- Page transitions: HIGH — verified from official Next.js 16.2 ViewTransition docs

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (30 days — stable libraries)
