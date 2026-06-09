<div align="center">

<img src="./.github/assets/logo-readme.png" alt="Hyperpolymath" width="560" />

<br/>
<br/>

> *"You don't have to choose between being a runner or a musician,*
> *a creator or a scholar. The Renaissance had it right."*

<br/>

[![License: MIT](https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square&labelColor=f5f1e8)](./LICENSE)
[![Next.js](https://img.shields.io/badge/next.js-16-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=nextdotjs&logoColor=1a1a1a)](https://nextjs.org)
[![React](https://img.shields.io/badge/react-19.2-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=react&logoColor=1a1a1a)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-strict-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=typescript&logoColor=1a1a1a)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/tailwind-4.1-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=tailwindcss&logoColor=1a1a1a)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/supabase-postgres-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=supabase&logoColor=1a1a1a)](https://supabase.com)
[![Drizzle](https://img.shields.io/badge/drizzle-orm-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=drizzle&logoColor=1a1a1a)](https://orm.drizzle.team)
[![Claude](https://img.shields.io/badge/claude-sonnet%204.6-1a1a1a?style=flat-square&labelColor=f5f1e8&logo=anthropic&logoColor=1a1a1a)](https://anthropic.com)

</div>

---

## Abstract

**Hyperpolymath** is a personal life-OS for people who refuse to specialize. Areas, projects, classes, tasks, habits, captures, and Google Calendar, all unified under a single natural-language agent called **JARVIS**, built on Claude Sonnet 4.6. The whole thing is tied together by a **LifeOS** homepage built around the areas tree.

It runs in three places: the **web app**, a **desktop app** (the primary interaction hub — keyboard-shortcut driven, no always-on mic), and an optional **physical extender** I'm building on the side — a small macropad with an onboard wake-word module that flips JARVIS into voice mode only when the device is awake.

Type one sentence. The right action lands in the right place. Every time.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  $  coffee w/ sam 3pm friday. submit chem pset by 5pm thursday p1    │
  │                                                                      │
  │  ⚜  scheduled  →  gcal · fri 3:00pm · "Coffee with Sam"             │
  │  ⚜  created    →  task · thu 5:00pm · P1 · "Submit chem pset"       │
  └──────────────────────────────────────────────────────────────────────┘
```

This is **v2**. A ground-up rebuild of [`polymath-web`](https://github.com/filippo-fonseca/polymath-web) with a tighter MVP, a Postgres-backed stack, and a stronger agent contract. The aesthetic is *academic paper crossed with Notion crossed with Todoist*: crisp, journal-vibe, EB Garamond / Louize, unapologetically Renaissance.

---

## ⚜  Why Hyperpolymath

Modern productivity tools assume you're one thing. A runner, or a researcher, or a founder. Habits live in one app, training in another, nutrition somewhere else, ideas scattered across three different notebooks. Context-switching kills momentum, and the more domains you operate across, the more friction compounds.

Hyperpolymath rejects the premise. **One system. One inbox. One sentence.** Running discipline informs studying discipline. Music trains pattern recognition. Everything connects, so the tool should too.

---

## ⚜  The Engine: JARVIS

JARVIS is the centerpiece. A streaming, structured-output agent built on Claude Sonnet 4.6 with **Strict Tool Use** for zero-parse-error JSON contracts. One input becomes N actions, each a different shape.

| Input | JARVIS infers |
|---|---|
| `finish anth pset $ANTH 2480 p2` | Task · *Finish anth pset* · P2 · linked to project ANTH 2480 |
| `great energy in the lab group today. so much momentum` | Capture · no tag · personal reflection |
| `#idea polymathy as a competitive advantage` | Capture · tagged `#idea` |
| `coffee with sam 3pm fri` | gcal event · Friday 15:00 |
| `gym tomorrow 7am, then bio pset $BIOL 1010 by 3pm` | gcal event · 07:00 + Task · due 15:00 linked to BIOL 1010 |

**Design principles**

- **Capture-first.** Ambiguous input becomes a capture. JARVIS never asks a clarifying question for non-destructive actions.
- **Inline references.** `$projectname` resolves to project IDs, `#hashtag` to tags. Highlighted in the input bar, normalized before reaching the model.
- **Native date/time.** "tomorrow", "next thursday", "8pm sat", "M/D", time ranges. All parsed.
- **Personality.** British register, formal, concise, dry, never sycophantic.
- **Voice.** "Hey Jarvis" wake-word + ambient follow-up window shipped in Phase 7. On desktop, voice is gated by the physical extender — no extender on, no mic on.
- **Agentic CRUD.** Full update / delete via natural language (Phase 5.1) — JARVIS can edit and remove records, not just create.

---

## ⚜  Architecture

```
                                  ┌──────────────────────────────┐
                                  │   JARVIS  ·  Claude 4.6      │
                                  │   strict tool use · stream   │
                                  └──────────────┬───────────────┘
                                                 │ structured JSON
                                                 ▼
   ┌──────────────────────┐         ┌─────────────────────────────┐         ┌─────────────────────┐
   │   Next.js 16 (RSC)   │ ──────► │   Server Actions / API      │ ──────► │  Drizzle  ·  pg     │
   │   Tailwind 4 · React │ ◄────── │   Zod validation · executor │ ◄────── │  Supabase Postgres  │
   │   shadcn · Motion 12 │         └──────────────┬──────────────┘         └──────────┬──────────┘
   └──────────┬───────────┘                        │                                    │
              │                                    │ Realtime ch                        │ RLS · userId
              │ TanStack Query                     ▼                                    │
              │ invalidate on event ◄──── Supabase Realtime ────────────────────────────┘
              │
              └──────────────────────────────────────► Google Calendar  (source of truth · gcal CRUD)
```

**The load-bearing decisions**

| Decision | Reason |
|---|---|
| **Direct `@anthropic-ai/sdk`** (not Vercel AI SDK) | Single-provider + heavy tool use + custom streaming UX. Less indirection, more control. |
| **Drizzle for queries · `supabase-js` for everything else** | Drizzle = typed schema as source of truth. `supabase-js` handles what it's actually good at (Auth, Realtime, Storage). |
| **`getClaims()` over `getSession()`** | JWT-validated against published public keys. `getSession()` reads cookies without revalidation, which is spoofable. |
| **TanStack Query + Realtime invalidation** | Realtime fires → invalidate query → refetch. Simpler than merging payloads into cache. Free dedup, optimism, devtools. |
| **gcal events are NOT in Postgres** | Google Calendar is the source of truth for scheduling. The app is a CRUD operator over gcal. |
| **`userId` scoping from day one + RLS** | Single-user architecturally, multi-user-ready by construction. |

---

## ⚜  Stack

```
┌─ runtime ───────────────────────────────┐    ┌─ agent ─────────────────────────────────┐
│   Next.js 16 · React 19.2 · Turbopack   │    │   @anthropic-ai/sdk 0.96                │
│   TypeScript 5.6+ (strict)              │    │   claude-sonnet-4-6                     │
│   Tailwind 4.1 (Oxide, CSS-first)       │    │   strict tool use · prompt caching      │
└─────────────────────────────────────────┘    └─────────────────────────────────────────┘

┌─ data ──────────────────────────────────┐    ┌─ ui ────────────────────────────────────┐
│   Supabase (Postgres / Auth / Realtime) │    │   shadcn/ui · Radix Primitives          │
│   Drizzle ORM 0.36 · postgres 3.x       │    │   Motion 12 (motion/react)              │
│   @supabase/ssr 0.10 (cookie auth)      │    │   Lucide · cmdk · sonner · @dnd-kit     │
│   googleapis (Calendar v3)              │    │   EB Garamond · Louize · journal vibe   │
└─────────────────────────────────────────┘    └─────────────────────────────────────────┘

┌─ state ─────────────────────────────────┐    ┌─ quality ───────────────────────────────┐
│   TanStack Query 5                      │    │   Vitest 3 · @testing-library/react     │
│   Supabase Realtime (invalidation only) │    │   Biome 1.9 (lint + format)             │
│   nuqs (URL state) · zod 4 (validation) │    │   Drizzle Kit (migrations · studio)     │
└─────────────────────────────────────────┘    └─────────────────────────────────────────┘
```

---

## ⚜  Surfaces

```
   /                       LifeOS · areas tree + today's widgets (homepage)
   /jarvis                 JARVIS console · streaming agent · history
   /today                  today's tasks + today's gcal
   /tasks                  all tasks (kanban · list · filters)
   /habits                 daily habits primitive
   /captures               quick-capture feed (hashtag-filterable, searchable)
   /projects               area tree → project pages (Notion-style breadcrumb)
   /calendar               gcal operator · full CRUD, never persisted locally
   /settings               profile · graduation year · gcal connection · defaults
```

**LifeOS** is the new homepage and the system's center of gravity. It's built around the areas tree (the spine of everything — every project, task, habit, and capture is scoped to an area) with widgets stacked underneath: recent quick-captures, today's habits, incoming tasks. Notion-style banner on top, document discipline throughout. Areas govern, widgets surface, JARVIS routes.

---

## ⚜  Where You Use It

Three surfaces, one backend. The desktop app is the real daily driver; the web app is for anywhere you're not at your machine; the physical extender is a fun side-project for voice-without-always-on-mic.

```
        ┌───────────────────────────┐
        │   jarvis · physical       │   optional macropad i'm building
        │   ────────────────────    │   • on-device wake-word module
        │   ◉  ◉  ◉  ◉  ◉  ◉        │   • only listens when device is awake
        │   ◉  ◉  ◉  ◉  ◉  ◉        │   • no extender on  →  no wake word, no mic
        └─────────────┬─────────────┘
                      │  BLE / USB (when awake)
                      ▼
   ┌────────────────────────────────┐        ┌──────────────────────────┐
   │   Desktop App   (Tauri · Rust) │        │   Web App   (Next.js 16) │
   │   ────────────────────────────  │        │   ──────────────────────  │
   │   ⌘K · keyboard-first hub       │        │   browser anywhere       │
   │   no ambient mic                │        │   same auth, same data   │
   │   primary interaction surface   │        │   for laptops, phones    │
   └─────────────────┬──────────────┘        └────────────┬─────────────┘
                     │                                     │
                     └─────────────────┬───────────────────┘
                                       ▼
                          ┌──────────────────────────┐
                          │  hyperpolymath backend   │
                          │  Supabase · Drizzle · gc │
                          └──────────────────────────┘
```

**Why the desktop app is the hub.** No browser tab to hunt for, system-level `⌘`-shortcut to summon JARVIS, no microphone permission to live with. Voice mode is opt-in via the physical extender — when it's off, JARVIS is text-only and silent. The web app is the fallback surface, not the primary one.

---

## ⚜  Project Layout

```
hyperpolymath-v2/
├── apps/
│   ├── web/                   Next.js 16 app: UI, API routes, server actions
│   │   ├── app/               App Router (RSC + server actions)
│   │   ├── components/        shadcn primitives + feature components
│   │   ├── drizzle/           SQL migrations (numbered, generated)
│   │   ├── lib/               db · auth · gcal · jarvis · realtime · utils
│   │   └── tests/             Vitest specs (agent contract, parsers, executors)
│   └── desktop/               Tauri shell · keyboard-first JARVIS hub
│       └── src-tauri/         Rust side (global shortcut, window mgmt, IPC)
├── packages/
│   └── jarvis-core/           agent logic, shared by web + desktop + CLI
├── tools/
│   └── jarvis-physical/       physical extender (macropad)
│       └── bridge/            host-side bridge: BLE/USB → desktop app
├── supabase/                  local Supabase config + edge functions
├── .planning/                 GSD workflow artifacts (roadmap, phases, state)
└── resources/                 vision docs (core.md, handoff, idea archive)
```

---

## ⚜  Quickstart

> Requires Node 20.9+, pnpm 9.12+, a Supabase project, and an Anthropic API key.

```bash
# clone + install
git clone https://github.com/filippo-fonseca/hyperpolymath-v2.git
cd hyperpolymath-v2
pnpm install

# env
cp .env.example .env.local        # fill: ANTHROPIC_API_KEY, SUPABASE_*, GOOGLE_*

# database
pnpm db:migrate                   # apply Drizzle migrations to Supabase

# run
pnpm dev                          # → http://localhost:3000
```

**Useful scripts**

```
pnpm dev            next dev --turbopack
pnpm build          production build
pnpm typecheck      tsc --noEmit (strict)
pnpm test           vitest run
pnpm lint           biome check .
pnpm db:generate    diff schema → new migration
pnpm db:migrate     apply pending migrations
```

---

## ⚜  Roadmap

```
  ✓  phase 0   ─ scaffolding · auth · tooling
  ✓  phase 1   ─ areas / projects / tasks / captures · manual CRUD
  ✓  phase 2   ─ project pages · tree sidebar · realtime
  ✓  phase 3   ─ today · captures feed · search
  ✓  phase 4   ─ Google Calendar bi-directional sync
  ✓  phase 5   ─ JARVIS console · streaming · strict tool use
  ✓  phase 5.1 ─ JARVIS agentic refactor · multi-step CRUD
  ✓  phase 6   ─ polish · motion · empty states · onboarding
  ✓  phase 6.1 ─ visual redesign · JARVIS × Notion
  ✓  phase 6.2 ─ Anthropic-discipline rebuild
  ✓  phase 7   ─ JARVIS voice + wake-word ("Hey Jarvis") · ambient mode
  ✓  phase 8   ─ public landing + manifesto
  ✓  phase 9   ─ habits primitive · areas tree · profile · chrome polish
  ▶  phase 10  ─ LifeOS homepage · areas-centered widgets   ← we are here
  ◯  phase 11  ─ desktop app (Tauri) · ⌘-driven JARVIS hub
  ◯  phase 12  ─ jarvis-physical extender · onboard wake-word
  ◯  phase 13  ─ public beta
```

Detailed phase plans live in [`.planning/`](./.planning). Backlog and parked ideas (markdown surfaces, hibernation mode, interrupt control, wake-word scoping, etc.) live under [`.planning/phases/999.*`](./.planning/phases/).

---

## ⚜  Philosophy

> **2.1**  Unified, not fragmented. *One system for everything.*
>
> **2.2**  Daily execution compounds. *Small consistent actions across all domains.*
>
> **2.3**  Skills are networks. *Running builds discipline for studying.*
>
> **2.4**  Capture everything. *Ideas are fleeting; the inbox is frictionless.*
>
> **2.5**  Measure what matters. *What gets measured gets mastered. But only measure what moves the needle.*

---

## ⚜  License & Brand

MIT. See [`LICENSE`](./LICENSE). Open source by commitment, not convenience. Secrets live in env, never in the repo.

Hyperpolymath is built and maintained by [@filippo-fonseca](https://github.com/filippo-fonseca). The name, the wordmark, and the Renaissance trade-dress are part of an evolving personal brand; please don't reuse them for derivative products without asking.

<div align="center">

```
       ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜
```

*be goated. well.*

</div>
