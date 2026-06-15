<!-- GSD:project-start source:PROJECT.md -->
## Project

**Hyperpolymath v2**

A personal life-OS web app for one user (Filippo) that unifies areas, projects (incl. classes), tasks, quick captures, and Google Calendar behind a single natural-language agent called **Kiwi**. v2 is a ground-up rebuild of v1 (`polymath-web`) with a tighter MVP scope, a modern Postgres-backed stack, and Claude Sonnet 4.6 powering the agent. The aesthetic is "academic paper meets Notion meets Todoist" — crisp, journal-vibe, EB Garamond / Louize fonts, unapologetically Renaissance.

**Core Value:** **Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time.** If everything else is beautiful but Kiwi misroutes, v2 has failed.

### Constraints

- **Tech stack**: Next.js (App Router) + TypeScript strict + Tailwind + Supabase (Postgres + Auth + Realtime + Storage) + Anthropic Claude Sonnet 4.6 — Modern, batteries-included; matches greenfield-no-migrations preference
- **Hosting**: Vercel (Next.js) + Supabase (managed Postgres) — Standard pairing; minimal ops overhead
- **Testing**: Vitest for critical paths (Kiwi agent JSON contract, NLP parsers) — Skip UI tests for MVP; address v1's "no tests" regret without slowing MVP
- **Realtime**: Supabase Realtime channels on all primary tables (tasks, captures, projects, areas) — Matches v1's onSnapshot feel
- **Calendar**: Events live in Google Calendar exclusively; never persisted in Postgres — gcal is the source of truth for scheduling
- **Single-user architecturally, multi-user readiness**: All rows scoped to `userId` from day one — Future-proofs without adding multi-tenancy now
- **Open source**: Public repo, MIT, secrets in env only — Brand commitment per `core.md`
- **Aesthetic**: EB Garamond / Louize, journal-paper + Warp terminal hybrid — Non-negotiable brand voice
- **Quality bar**: "Be goated. Well." — User's own words. Polish, copy, motion, edge cases all matter.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary
- **Next.js 16.x** (App Router, Turbopack default, `proxy.ts` instead of `middleware.ts`)
- **React 19.2** (matches v1 — no reason to downgrade)
- **Tailwind 4.1** (Oxide engine, CSS-first config)
- **`@supabase/ssr` 0.10.x** + `@supabase/supabase-js` 2.x (cookie auth, `getClaims` over `getUser`)
- **Drizzle ORM** for typed schema + queries; **`supabase-js`** for Realtime, Auth, Storage (use both — they have different jobs)
- **`@anthropic-ai/sdk` 0.94.x** with `claude-sonnet-4-6` model ID, native streaming + Strict Tool Use for Kiwi's JSON contract
- **shadcn/ui** (Tailwind 4 / React 19 ready) on top of Radix primitives
- **Motion (formerly Framer Motion) 12.x** via `motion/react`
- **TanStack Query 5.x** layered with Supabase Realtime (Realtime invalidates queries; Query handles caching/optimism)
- **Vitest 3.x** with `@vitejs/plugin-react`, jsdom for client components, Playwright deferred for e2e
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js** | `16.x` (latest stable) | App framework, App Router, Server Components/Actions, API routes | Stable as of Oct 2025; Turbopack now default (5-10x faster Fast Refresh); Cache Components for explicit caching; `proxy.ts` replaces `middleware.ts`; React 19.2 baked in. Matches v1 generation. |
| **React** | `19.2` | UI runtime | Stable, ships with Next 16's App Router. View Transitions, `useEffectEvent`, `<Activity/>` are all useful for the journal-paper UX. Matches v1. |
| **TypeScript** | `5.6+` (strict) | Type system | Required by Next 16 (5.1+); use latest for best Zod 4 / `satisfies` ergonomics. Strict mode non-negotiable. |
| **Tailwind CSS** | `4.1.x` | Styling | Oxide engine (Rust-based, 5x faster builds, 100x faster incremental). CSS-first config via `@theme` blocks — fits the journal-paper aesthetic where you'll customize tokens heavily. Matches v1. |
| **Supabase** | platform (managed) | Postgres + Auth + Realtime + Storage | One platform → fewer integrations to wire vs. Neon + Clerk + Pusher. Google OAuth built into Auth. Realtime is the v1 `onSnapshot` replacement. |
| **`@supabase/ssr`** | `0.10.x` | SSR-aware Supabase client (cookie-based) | The official replacement for the deprecated `@supabase/auth-helpers-nextjs`. v0.10+ auto-passes cache headers — required for Next.js App Router cookie auth in 2026. |
| **`@supabase/supabase-js`** | `2.x` (latest) | Browser/server Supabase client (Realtime, Storage, query) | Dependency of `@supabase/ssr`. Used directly for Realtime channel subscriptions in client components. |
| **Drizzle ORM** | `0.36.x+` | Typed schema, migrations, server-side queries | TypeScript-first; schema is the source of truth (drives both DB migrations and TS types). Has first-class Supabase support including predefined `anonRole`/`authenticatedRole` for RLS. Use for server-side queries from Server Components/Actions; let `supabase-js` handle Realtime/Auth/Storage. |
| **`@anthropic-ai/sdk`** | `0.94.x+` | Claude API client | Official TypeScript-first SDK. Native streaming, tool use, prompt caching, strict structured outputs (beta header `structured-outputs-2025-11-13`). Direct SDK preferred over Vercel AI SDK for v2 — see "What NOT to use." |
| **Anthropic Model** | `claude-sonnet-4-6` | LLM for Kiwi | Verified current model ID on platform.claude.com docs. 1M token context (beta), $3/$15 per MTok, supports adaptive thinking + extended thinking, prompt caching, strict tool use. Released Feb 17, 2026. |
| **Vercel** | platform | Hosting | Standard pairing with Next.js. Edge functions, automatic preview URLs, gen-1 GitHub integration. Free tier covers single-user app. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **shadcn/ui** | latest CLI | Copy-paste accessible components (Button, Dialog, Command, Popover, etc.) | All primitive UI needs. Install components on demand. Tailwind 4 + React 19 ready. Code lives in your repo (you own it) — perfect for the heavily-customized journal aesthetic. |
| **Radix UI Primitives** | `1.x` (transitive via shadcn) | Unstyled, accessible component primitives | Used under shadcn. Direct install if you need a primitive shadcn doesn't expose (e.g., scroll-area, context-menu). |
| **Motion** | `12.x` (formerly `framer-motion`) | Animations, page transitions, Kiwi streaming UI | Import from `motion/react`. RSC-compatible. Used for the v1 thinking-word indicator, page transitions, list reorder. |
| **TanStack Query** | `5.x` | Client-side server state (caching, optimistic updates, refetch on focus) | Wrap all Supabase reads in `useQuery`. Subscribe to Supabase Realtime in `useEffect` and call `queryClient.invalidateQueries()` on event. This is the **2026 idiomatic pattern** for Supabase + Next.js + Realtime. |
| **`@supabase-cache-helpers/postgrest-react-query`** | `latest` | Auto-wires Supabase queries into TanStack Query with type inference | Reduces boilerplate. Optional but high-leverage. Generates query keys from PostgREST queries. |
| **Zod** | `4.x` | Runtime validation, Anthropic tool schemas, form validation | Use Zod 4 (smaller, tree-shakeable, native `.toJSONSchema()`). Validates Kiwi's structured output before execution. |
| **`googleapis`** | `144.x+` | Google Calendar OAuth + CRUD | Official Google Node client. Standard choice. Handles token refresh. Use for `/api/google-calendar/*` routes. Don't use community wrappers. |
| **Lucide React** | `latest` | Icon set | shadcn's default. Tree-shakeable, MIT, comprehensive. |
| **`date-fns`** | `4.x` | Date formatting, weekday/month math | Tree-shakeable, immutable, TS-first. Use for display formatting and Kiwi's date inference helpers. Defer Temporal API until polyfill cost (~60KB) becomes worthwhile. |
| **`chrono-node`** | `2.x` | Natural language date parsing fallback | If Claude doesn't parse a date well (rare), use as backup. Handles "next Thursday at 8pm", "tomorrow afternoon", etc. |
| **`tailwind-merge` + `clsx`** | `latest` | `cn()` utility (transitive via shadcn) | Standard. Already in shadcn templates. |
| **`react-hook-form`** | `7.x` | Forms (settings page, project edit modals) | De-facto standard. Pair with `@hookform/resolvers/zod` for Zod validation. |
| **`@tanstack/react-table`** | `8.x` | Headless table for All Tasks list view | If you need sortable/filterable tables. Optional — could roll custom for MVP. |
| **`@dnd-kit/core`** | `6.x` | Drag-and-drop for kanban + reorder | If kanban view ships in MVP. Modern Framer Motion-friendly DnD lib. Replaces `react-beautiful-dnd` (deprecated). |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest** | `3.x` | Test runner | Use `@vitejs/plugin-react`, `jsdom` env (or `happy-dom` for speed on Next 16). Configure `vite-tsconfig-paths` for `@/` alias. Async Server Components NOT supported in jsdom — test their output via integration approach or defer to Playwright. |
| **`@testing-library/react`** | `16.x` | Component testing | Standard pairing with Vitest. |
| **Drizzle Kit** | `0.28.x+` | Migration generation, schema diff, studio | `drizzle-kit generate`, `drizzle-kit migrate`, `drizzle-kit studio` for local DB inspection. |
| **Supabase CLI** | `1.x+` | Local Supabase dev (Postgres in Docker), migrations, type gen | Run `supabase start` for local stack. Use `supabase gen types typescript` to generate raw DB types as a sanity check against Drizzle. |
| **Biome** | `1.9.x+` | Linter + formatter | Faster than ESLint+Prettier, single config. `next lint` was removed in Next 16, so you need to pick something. Biome over ESLint for speed; ESLint if you want the full Next plugin ecosystem. |
| **`@next/codemod`** | `latest` | Automated migrations | Use when bumping Next majors. Not needed initially since starting on 16. |
## Installation
# Bootstrap
# Supabase
# Database (Drizzle)
# Anthropic + validation
# Data fetching
# Google Calendar
# Date utilities
# UI: shadcn (initialize, then add per-component)
# Then per component:
# npx shadcn@latest add button dialog command popover input textarea select dropdown-menu
# Animation
# Forms
# Optional (if MVP needs them)
# Testing
# Lint/format
## Critical Patterns
### 1. Supabase Auth (Next.js App Router, cookie-based)
- Use **`supabase.auth.getClaims()`** to validate the user in Server Components and the proxy. It validates the JWT signature against published public keys.
- **Never** trust `supabase.auth.getSession()` in server code — it reads from cookies without revalidation and can be spoofed.
- Use `getUser()` only when you specifically need a fresh server-confirmed user record (slower; round-trips to Auth).
### 2. Database Access — Drizzle for queries, supabase-js for everything else
- **Drizzle** gives you typed Postgres queries, schema-driven migrations, and zero query-builder lock-in. Use from Server Components, Server Actions, and API routes.
- **`supabase-js`** is required anyway (for Auth, Realtime, Storage). Use it for Realtime subscriptions and storage uploads. Don't use it for typed queries — Drizzle is better at that.
### 3. Realtime + State (Supabase Realtime + TanStack Query)
- Use **TanStack Query** for *all* reads. Caches, dedupes, optimistic updates.
- Use **Supabase Realtime channels** purely as an invalidation signal — when a row changes, call `queryClient.invalidateQueries({ queryKey: ['tasks'] })`.
- Don't try to merge Realtime payloads into TanStack Query cache manually — invalidate and refetch is simpler, faster, and avoids consistency bugs.
### 4. Anthropic Claude — Streaming + Strict Tool Use for Kiwi
- Schema is enforced during generation (zero parse errors)
- Multi-tool calls map naturally to Kiwi's "do N actions" pattern (one tool per action type: `create_task`, `create_capture`, `create_event`)
- TypeScript types flow from Zod → JSON schema → tool definition
### 5. Fonts (EB Garamond + Louize)
### 6. Vitest setup for Next 16
- **Anthropic SDK:** Mock `@anthropic-ai/sdk` per-test with `vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn() }))`. For streaming tests, return an async iterable.
- **Supabase:** Mock the `createClient` factory from `lib/supabase/client.ts` and `lib/supabase/server.ts`. Don't mock `@supabase/supabase-js` directly — too granular.
- **Database (Drizzle):** Use the `pglite` in-memory Postgres for integration tests, or mock at the query layer. Don't connect to real Supabase in CI.
- **`next/navigation`:** Mock `useRouter`, `usePathname`, `useSearchParams` (standard Next testing pattern).
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Direct `@anthropic-ai/sdk`** | Vercel AI SDK 5 (`ai` + `@ai-sdk/anthropic`) | If you needed multi-provider abstraction (swap Claude for OpenAI). For single-provider + heavy tool use + custom streaming UX (the v1 thinking-word indicator), the direct SDK gives more control with less indirection. AI SDK is excellent — but it's an extra layer when you don't need it. |
| **Drizzle ORM** | Kysely | If you wanted SQL-first ergonomics with no query builder DSL. Kysely is excellent for engineers who'd rather write `select('id').from('tasks')` than `db.select({ id: tasks.id }).from(tasks)`. Drizzle wins on Supabase integration tutorials and a richer ecosystem of helpers. |
| **Drizzle ORM** | Prisma | If you wanted a more mature schema language with broader tooling. Prisma's edge support and Postgres pooler ergonomics lag Drizzle's, and Drizzle is faster + smaller. Skip Prisma. |
| **Drizzle ORM** | Raw `supabase-js` queries | For tiny scripts or one-off mutations where types-from-DB-codegen is enough. Supabase's `gen types` works, but you lose schema-as-source-of-truth and migration ergonomics. Use Drizzle for anything non-trivial. |
| **TanStack Query + Realtime** | `useState` + Realtime channels | Tempting for a single-user app — but TanStack Query gives you free request dedup, optimistic updates, refetch-on-window-focus, devtools, and a clear mental model. Worth the small learning cost. |
| **TanStack Query + Realtime** | SWR | SWR is fine; TanStack Query has better tool ecosystem (devtools, persistence, mutations) and is the more common 2026 pick. Either works. |
| **shadcn/ui** | Mantine, Chakra, Park UI | shadcn wins for "code lives in your repo" — critical when your aesthetic is bespoke (journal-paper). Component libraries with their own design system fight you when you want full control. |
| **Drizzle** | Supabase client query builder (`.from('tasks').select(...)`) | OK for trivial pages, but no compile-time type errors on column typos and harder to refactor. Use for Realtime subscriptions only. |
| **`@anthropic-ai/sdk` Strict Tool Use** | Native JSON output mode (`output_format`) | If your output were a single record without function-call semantics. Kiwi's "create N actions, each a different shape" maps better to multi-tool calls than a single big union schema. |
| **Vitest** | Jest | Vitest is faster, better TS DX, native ESM. Jest works but is yesterday's tool. |
| **Biome** | ESLint + Prettier | Use ESLint if you depend on `eslint-config-next` rules (Next.js still ships the plugin even though `next lint` was removed). Biome is faster and config-light; pick based on whether you want the Next-specific rules. |
| **`googleapis` (official)** | `react-google-calendar-api`, custom fetch wrapper | Official client handles token refresh, types, retries. Community wrappers fall behind on Calendar API changes. |
| **Motion** (`motion/react`) | React Spring, GSAP | Motion is the dominant React animation lib in 2026 (3.6M weekly downloads). Spring is great but smaller ecosystem. GSAP is heavier, license concerns. Stick with Motion. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@supabase/auth-helpers-nextjs`** | Deprecated. Replaced by `@supabase/ssr`. Mixing both causes auth bugs. | `@supabase/ssr` 0.10.x |
| **`supabase.auth.getSession()` in server code** | Reads from cookies without JWT validation. Spoofable. Documented Supabase footgun. | `supabase.auth.getClaims()` for validation; `getUser()` if you need a fresh round-trip |
| **`middleware.ts`** | Deprecated in Next 16 — file renamed to `proxy.ts`. Still works for Edge runtime, but App Router cookie-auth flows should use `proxy.ts` (Node runtime). | `proxy.ts` exporting `proxy` function |
| **OpenAI `gpt-4o` (v1's choice) or any OpenAI model** | Constraint from PROJECT.md: Claude Sonnet 4.6 has better instruction-following + tool use for the multi-action JSON contract. Don't reintroduce. | `claude-sonnet-4-6` via `@anthropic-ai/sdk` |
| **Raw `fetch` against Anthropic API** | v1 used raw fetch against OpenAI for "no SDK overhead." Don't repeat. The Anthropic SDK gives you typed retries, streaming helpers, prompt caching ergonomics, native tool runner — non-trivial to recreate. | `@anthropic-ai/sdk` with `client.messages.stream()` |
| **Firebase / Firestore** | v1's choice. Greenfield rebuild on Postgres explicitly per PROJECT.md. Don't reach for it out of habit. | Supabase Postgres + Drizzle |
| **Prisma** | Slower, larger, edge-runtime quirks, schema-language-not-TypeScript. No compelling reason over Drizzle for Postgres + Supabase. | Drizzle ORM |
| **`react-beautiful-dnd`** | Deprecated (Atlassian sunset). Doesn't work well with React 19. | `@dnd-kit/core` |
| **`framer-motion` (the old import)** | Renamed to Motion. New imports are `motion/react`. Old package is in maintenance. | `motion` (package) → `import { motion } from 'motion/react'` |
| **`@next/font` (the old standalone package)** | Built into Next.js as `next/font` since Next 13. Standalone package archived. | `next/font/google`, `next/font/local` |
| **Goodreads CSV import, Strava sync, Twilio SMS** | All v1 features explicitly out of scope per PROJECT.md. Don't bring their dependencies. | Skip the libs entirely (`csv-parse`, `twilio`, etc.) |
| **`@radix-ui/themes`** | Different product from Radix Primitives. Themes opinionates the visual design — fights the journal aesthetic. | Radix Primitives (via shadcn) — unstyled |
| **Zustand / Jotai / Redux** | Single-user app + Realtime + TanStack Query covers all server state. Local UI state is `useState`. No global client store needed for v2 MVP. | `useState`, `useReducer`, `useContext` for trivial cross-tree state |
| **NextAuth.js / Auth.js** | Adds a parallel auth system on top of Supabase Auth. Supabase already handles Google OAuth — using both is duplicate plumbing. | Supabase Auth (Google OAuth provider) |
| **`pg` (`node-postgres`) directly** | Drizzle works with `pg`, but `postgres` (porsager/postgres) has better TypeScript ergonomics, smaller, faster, and is Drizzle's recommended driver for Supabase. | `postgres` package (with `prepare: false` for Supabase pooler) |
| **`react-query` v3** | Old package name; renamed to `@tanstack/react-query` v4+. Use latest v5. | `@tanstack/react-query` 5.x |
| **`moment.js`** | Mutable, large, deprecated. Don't use in a 2026 build. | `date-fns` 4.x or Temporal API once polyfill cost drops |
## Stack Patterns by Variant
- Extract Kiwi logic to `packages/kiwi-core/` (matches v1's factoring — load-bearing decision per HANDOFF.md)
- Use Ink 5 + Chalk for the terminal UI (matches v1)
- Auth via long-lived Supabase access token stored in `~/.kiwi/credentials.json`
- Share Drizzle schema and Anthropic tool definitions across web + CLI
- Already future-proofed via `userId`-scoped rows + RLS policies from day one
- Add Stripe billing (use `@supabase/stripe-sync-engine` to mirror Stripe state into Postgres)
- No structural changes needed — just relax single-user UI assumptions
- Add `@upstash/ratelimit` + Upstash Redis (free tier, edge-compatible)
- Add Helicone or Langfuse for LLM call tracing (drop-in proxy header)
- Defer until needed — single-user MVP doesn't need either
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19.x, Tailwind 4.x | Requires Node.js 20.9+, TypeScript 5.1+. Turbopack default. |
| Tailwind 4.x | shadcn/ui (Tailwind v4 branch) | shadcn officially supports Tailwind 4 + React 19. Verify via `ui.shadcn.com/docs/tailwind-v4`. |
| `@supabase/ssr` 0.10.x | `@supabase/supabase-js` 2.x | `ssr` is a thin layer on top of `supabase-js`. Always install both. |
| Drizzle ORM 0.36.x+ | `postgres` 3.x driver | Use `postgres` (not `pg`) for Supabase — Drizzle's recommended driver. |
| Drizzle ORM 0.36.x+ | Supabase Postgres 15+ | All current Supabase projects. Use the connection pooler URL (`pooler.supabase.com:6543`) and set `prepare: false`. |
| `@anthropic-ai/sdk` 0.94.x | Node 18+ | Strict tool use requires beta header `anthropic-beta: structured-outputs-2025-11-13`. Prompt caching enabled by default with `cache_control` blocks. |
| `claude-sonnet-4-6` model | 1M token context (beta) | Use beta header `context-1m-2025-08-07` to access 1M context. Without it, default is 200K. For Kiwi MVP, 200K is plenty. |
| TanStack Query 5.x | React 19 | Full support. SSR helpers (`HydrationBoundary`) work with Next 16 RSC. |
| Motion 12.x | React 19 RSC | Use `'use client'` for components that import from `motion/react`. Static motion-as-CSS works server-side. |
| Vitest 3.x | Next 16 | Async Server Components NOT supported in jsdom. Test their plain output, or use Playwright for those flows. |
| Zod 4.x | `@anthropic-ai/sdk` tool schemas | Use Zod's native `.toJSONSchema()` (Zod 4) instead of `zod-to-json-schema` (Zod 3 era). Older `zod-to-json-schema` doesn't support Zod 4. |
## Confidence Assessment per Recommendation
| Recommendation | Confidence | Source |
|---|---|---|
| Next.js 16.x, React 19.2, Tailwind 4.x | HIGH | Official Next.js 16 blog (Oct 2025), shadcn/ui docs |
| `@supabase/ssr` 0.10.x with `getClaims` | HIGH | Official Supabase SSR + Auth docs (2026) |
| `claude-sonnet-4-6` model ID | HIGH | platform.claude.com/docs (verified May 2026, model card live) |
| `@anthropic-ai/sdk` 0.94.x with stream + tool use | HIGH | npmjs.com/@anthropic-ai/sdk, official SDK README |
| Strict tool use beta header | MEDIUM | Public beta announced Nov 14, 2025; confirmed Sonnet 4.5 + Opus 4.1 — Sonnet 4.6 inherits but verify against latest changelog |
| Prompt caching default TTL = 5min | HIGH | Anthropic changelog (March 6, 2026) |
| Drizzle ORM over Kysely for Supabase + Next.js | MEDIUM-HIGH | Official Supabase tutorial, makerkit, multiple 2026 articles — strong consensus |
| TanStack Query + Realtime invalidation pattern | HIGH | Supabase official blog (React Query + Next.js App Router + cache helpers), multiple 2026 sources |
| shadcn/ui on Tailwind 4 + React 19 | HIGH | Official shadcn docs |
| Motion (formerly Framer Motion) via `motion/react` | HIGH | motion.dev, official rebrand confirmed |
| EB Garamond via `next/font/google` | HIGH | next/font supports it (Google Fonts) |
| Louize requires commercial license + `next/font/local` | HIGH | Louize is Matthieu Cortat's commercial typeface |
| Vitest for Next 16 + jsdom limitations on async RSC | HIGH | Official Next.js testing docs |
| `googleapis` package over wrappers | HIGH | Google's official Node client; widely adopted |
| Zod 4 for Anthropic tool schemas | MEDIUM-HIGH | Zod 4 native `.toJSONSchema()` is the cleanest path; some AI SDKs still catching up but raw Anthropic SDK accepts JSON Schema directly |
## Sources
- [Next.js 16 Release Blog (Oct 2025)](https://nextjs.org/blog/next-16) — Turbopack default, `proxy.ts`, Cache Components, React 19.2
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — Breaking changes, async params/cookies
- [Anthropic Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) — `claude-sonnet-4-6` model ID, capabilities, context window, pricing (verified May 2026)
- [Introducing Claude Sonnet 4.6](https://www.anthropic.com/news/claude-sonnet-4-6) — Feb 2026 release announcement
- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — TTL, `cache_control`, workspace isolation
- [Anthropic Structured Outputs Announcement](https://tessl.io/blog/anthropic-brings-structured-outputs-to-claude-developer-platform-making-api-responses-more-reliable/) — Strict tool use, beta header
- [`@anthropic-ai/sdk` on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — v0.94.0 (May 2026)
- [`@supabase/ssr` on npm](https://www.npmjs.com/package/@supabase/ssr) — v0.10.2
- [Supabase: Creating a Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — Server/browser/middleware patterns
- [Supabase: Migrating from Auth Helpers to SSR](https://supabase.com/docs/guides/troubleshooting/how-to-migrate-from-supabase-auth-helpers-to-ssr-package-5NRunM) — Why `@supabase/ssr` is the only supported path
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) — RLS for Realtime channels
- [Supabase Blog: React Query + Next.js App Router + Cache Helpers](https://supabase.com/blog/react-query-nextjs-app-router-cache-helpers) — Official idiomatic pattern
- [Drizzle ORM with Supabase Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase) — Driver setup, schema patterns
- [Drizzle ORM RLS Docs](https://orm.drizzle.team/docs/rls) — `authenticatedRole`, `authUid`, `pgPolicy` helpers
- [shadcn/ui Tailwind v4 Docs](https://ui.shadcn.com/docs/tailwind-v4) — Compatibility confirmed
- [shadcn/ui Next.js 15 + React 19 Docs](https://ui.shadcn.com/docs/react-19) — Setup
- [Motion Documentation (formerly Framer Motion)](https://motion.dev/docs/react) — `motion/react` import, RSC compatibility
- [Tailwind CSS v4 Release Notes](https://tailwindcss.com/blog/tailwindcss-v4) — Oxide engine, CSS-first config
- [Next.js Vitest Testing Guide](https://nextjs.org/docs/app/guides/testing/vitest) — Setup, async RSC limitations
- [Vercel AI SDK 5 Announcement](https://vercel.com/blog/ai-sdk-5) — For comparison; not selected
- [`googleapis` on npm](https://www.npmjs.com/package/googleapis) — Official Google Node client
- [Zod 4 Documentation](https://zod.dev/) — `.toJSONSchema()`, mini API
- [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts) — `next/font/google`, `next/font/local`
- v1 reference: `/Users/filippofonseca/Developer/Projects/polymath-web` (HANDOFF.md) — Carryover patterns to preserve, mistakes to avoid
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

## Session start: triage open issues

At the start of every session, before diving into any work, load the open GitHub issues and help decide what to tackle next:

1. Run `gh issue list` to pull the open issues (these include the Kiwi-drafted issues filed automatically by the daily captures-to-issues cron, labeled `kiwi-drafted`).
2. Rank the pending issues by what is most tractable and highest-leverage to do next: weigh how self-contained each one is, how much it moves the core "Kiwi routes one sentence to the right place" value, and how cheaply it ships.
3. Briefly present that ranking to Filippo, top pick first, with a one-line rationale for each.
4. Ask whether to start on the top one, or whether Filippo already has his own prompt in mind. Do not start coding until he picks.

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
