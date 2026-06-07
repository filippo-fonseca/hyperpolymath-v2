---
phase: 260607-fgb-lifeos-tab
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/(app)/lifeos/page.tsx
  - apps/web/components/shell/PersistentNav.tsx
  - apps/web/components/lifeos/LifeOsBanner.tsx
  - apps/web/components/lifeos/LifeOsAreasSection.tsx
  - apps/web/components/lifeos/RecentCapturesWidget.tsx
  - apps/web/components/lifeos/TodayHabitsWidget.tsx
  - apps/web/components/lifeos/UpcomingTasksWidget.tsx
  - apps/web/components/lifeos/LifeOsWidgetGrid.tsx
autonomous: true
requirements:
  - LIFEOS-01  # /lifeos route exists and is reachable from nav
  - LIFEOS-02  # Notion-style banner block at top of page
  - LIFEOS-03  # AreasTree mounted as the centerpiece
  - LIFEOS-04  # Recent Captures widget (last 5 + view-all link)
  - LIFEOS-05  # Today's Habits widget (with check states + link)
  - LIFEOS-06  # Upcoming Tasks widget (next 5 by due date + link)
  - LIFEOS-07  # Responsive widget grid (3-col desktop → stack mobile)
  - LIFEOS-08  # Typography/spacing polish matches /areas vertical rhythm

must_haves:
  truths:
    - "User can navigate to /lifeos from the sidebar nav"
    - "User sees a Notion-style banner (title + emoji) at the top of /lifeos"
    - "User sees the AreasTree (same component as /areas) below the banner"
    - "User sees the last 5 captures with a 'view all' link to /captures"
    - "User sees today's habits with check-state indicators and a link to /habits"
    - "User sees the next 5 upcoming tasks by due date with a link to /tasks"
    - "Widgets render in a 3-column grid on desktop and stack on mobile"
    - "Typography uses EB Garamond serif headings consistent with /areas"
  artifacts:
    - path: "apps/web/app/(app)/lifeos/page.tsx"
      provides: "Server Component shell — orchestrates banner + AreasTree + widget grid"
    - path: "apps/web/components/lifeos/LifeOsBanner.tsx"
      provides: "Notion-style banner block (title, emoji, cover placeholder)"
    - path: "apps/web/components/lifeos/RecentCapturesWidget.tsx"
      provides: "Last 5 captures + view-all link to /captures"
    - path: "apps/web/components/lifeos/TodayHabitsWidget.tsx"
      provides: "Today's habits with check states + link to /habits"
    - path: "apps/web/components/lifeos/UpcomingTasksWidget.tsx"
      provides: "Next 5 tasks by due date + link to /tasks"
    - path: "apps/web/components/lifeos/LifeOsWidgetGrid.tsx"
      provides: "Responsive 3-col grid wrapper for the three widgets"
    - path: "apps/web/components/shell/PersistentNav.tsx"
      provides: "Adds LifeOS link to primary nav items array"
  key_links:
    - from: "apps/web/components/shell/PersistentNav.tsx"
      to: "/lifeos"
      via: "items array entry with href:'/lifeos'"
      pattern: "href:\\s*[\"']/lifeos[\"']"
    - from: "apps/web/app/(app)/lifeos/page.tsx"
      to: "AreasTree"
      via: "import + JSX render, fed by getSidebarTree (mirroring /areas)"
      pattern: "<AreasTree"
    - from: "RecentCapturesWidget"
      to: "/captures"
      via: "Link to /captures + getCapturesForUser with slice(0,5)"
      pattern: "getCapturesForUser"
    - from: "TodayHabitsWidget"
      to: "/habits"
      via: "Link to /habits + getHabitsForCurrentUser + today's completions"
      pattern: "getHabitsForCurrentUser"
    - from: "UpcomingTasksWidget"
      to: "/tasks"
      via: "Link to /tasks + getAllTasksForUser sorted by dueDate, slice(0,5)"
      pattern: "getAllTasksForUser"
---

<objective>
Build a canonical `/lifeos` homepage that channels the spirit of a personal life-OS dashboard: AreasTree as the centerpiece, Notion-style banner at the top, and three at-a-glance widgets (Recent Captures, Today's Habits, Upcoming Tasks) below in a responsive 3-column grid.

**Purpose:** Give the user a single, dense overview page that surfaces the most important slice of every primitive — the journal-paper "what's going on right now" view. Acts as a candidate canonical homepage (the actual root redirect from `/` is deferred to a future plan after user confirmation).

**Output:** A new route `/lifeos` reachable from the sidebar, with the banner + areas tree + three widgets. Reuses existing data-fetching primitives from `/captures`, `/habits`, `/tasks`, and `/areas` — does NOT invent new query infrastructure.

**Commit velocity:** 8 atomic tasks, one commit each. User has explicitly requested high commit density — DO NOT collapse tasks.

**Deferred to a follow-up plan (per user instruction):** Making `/lifeos` the canonical root redirect from `/` for signed-in users. Step 9 from the user's build order is intentionally NOT included here.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@apps/web/app/(app)/areas/page.tsx
@apps/web/components/areas/AreasTree.tsx
@apps/web/app/(app)/today/page.tsx
@apps/web/app/(app)/captures/page.tsx
@apps/web/app/(app)/habits/page.tsx
@apps/web/app/(app)/tasks/page.tsx
@apps/web/components/shell/PersistentNav.tsx
@apps/web/components/shell/Sidebar.tsx

<interfaces>
<!-- Key contracts extracted from the codebase that the executor needs.
     Do NOT re-explore — use these patterns directly. -->

### Data fetching primitives already in repo (REUSE — do NOT invent new):

From `lib/db/queries/sidebar.ts` (used by /areas):
- `getSidebarTree(userId: string, includeArchived: boolean): Promise<SidebarArea[]>`
- Returns areas with nested projects. /areas page filters archived areas client-side.

From `lib/db/queries/captures.ts` (used by /captures):
- `getCapturesForUser(userId: string, opts?: { hashtagId?: string }): Promise<Capture[]>`
- Returns captures ordered by createdAt desc.

From `app/actions/habits.ts` (used by /habits):
- `getHabitsForCurrentUser(): Promise<Habit[]>` — Server Action, reads getClaims internally
- `getHabitCompletionsInRange(startISO: string, endISO: string): Promise<Completion[]>`

From `lib/db/queries/tasks.ts` (used by /tasks):
- `getAllTasksForUser(userId: string): Promise<Task[]>`
- Returns tasks; sort + slice on the page.

From `lib/auth/get-user.ts`:
- `requireOnboarded(): Promise<User>` — getClaims pattern; throws/redirects on unauth
- `getAuthAvatar(): Promise<{ avatarUrl: string | null, initials: string }>`

### AreasTree mount pattern (from /areas page — MIRROR EXACTLY):

```tsx
const user = await requireOnboarded();
const [fullTree, oauthAvatar] = await Promise.all([
  getSidebarTree(user.id, true),
  getAuthAvatar(),
]);
const areas = fullTree.filter((a) => a.archivedAt === null);
const rootAvatarUrl = user.avatarUrl || oauthAvatar.avatarUrl;
const rootLabel = user.displayName?.trim() || user.email;
const rootInitial = (user.displayName?.trim() || user.email || "·").charAt(0).toUpperCase();

<AreasTree
  areas={areas}
  rootAvatarUrl={rootAvatarUrl}
  rootInitial={rootInitial}
  rootLabel={rootLabel}
/>
```

### PersistentNav items array (from PersistentNav.tsx lines 53-64):

```tsx
const items = [
  { href: "/today", label: "JARVIS", icon: KiwiIcon, disabled: false, tooltip: undefined, isAgent: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/habits", label: "Habits", icon: Repeat, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/captures", label: "Captures", icon: MessageSquare, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/calendar", label: "Calendar", icon: Calendar, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/insights", label: "Insights", icon: BarChart2, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/settings", label: "Settings", icon: Settings, disabled: false, tooltip: undefined, isAgent: false },
] as const;
```

LifeOS link should slot in BETWEEN "JARVIS" and "Tasks" — it's the canonical homepage candidate, agent-adjacent but not the agent itself. Icon: `Home` or `LayoutDashboard` from lucide-react (executor chooses; project uses lucide everywhere).

### Design tokens (project conventions):

- `bg-[var(--canvas)]` page background, `text-[var(--ink)]` body
- `border-[var(--edge)]` hairlines, `border-[var(--edge-hud)]` accent edges
- `bg-[var(--surface)]` cards, `bg-[var(--surface-raised)]` raised
- `font-serif` (EB Garamond) for headings/prose, `font-mono` (JetBrains Mono) for chrome labels
- `text-[var(--ink-muted)]` for secondary text
- `cursor-pointer-always` on all clickable elements (CLAUDE.md universal rule)

### Aesthetic guardrails (from feedback memory):
- Notion document discipline + Anthropic interaction polish — NOT neumorphic, NOT HUD-heavy
- Restraint over theatrics. The /areas page is the reference for vertical rhythm.
- Banner block is Notion-style: emoji + title, optional cover affordance as static placeholder for now
- Widget cards are quiet: 1px --edge border, --surface bg, generous padding, no glow effects
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold /lifeos route + wire into PersistentNav</name>
  <files>apps/web/app/(app)/lifeos/page.tsx, apps/web/components/shell/PersistentNav.tsx</files>
  <action>
    Create the route shell and wire it into the sidebar so the user can navigate to it immediately (empty page is fine — subsequent tasks fill it in).

    **Step 1: Create `apps/web/app/(app)/lifeos/page.tsx`** as a Server Component:
    - Mark `export const dynamic = "force-dynamic"` (mirrors /today + /habits convention)
    - Default export async function `LifeOsPage()`
    - Call `const user = await requireOnboarded()` — same auth pattern as every other (app) page
    - Return a minimal shell that matches /areas vertical rhythm:
      ```tsx
      <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
        <div className="mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]">
            LifeOS
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] mt-2">
            Banner + AreasTree + widgets land in subsequent commits.
          </p>
        </div>
      </main>
      ```
    - Imports: `requireOnboarded` from `@/lib/auth/get-user`
    - Use `void user;` after the await if TS strict complains about unused — we'll wire it in Task 3.

    **Step 2: Wire into `apps/web/components/shell/PersistentNav.tsx`** items array:
    - Add lucide icon import: append `LayoutDashboard` to the existing `lucide-react` import (line 7-15 area)
    - Insert a new entry in the `items` array BETWEEN the JARVIS entry (line 54) and the Tasks entry (line 55):
      ```tsx
      { href: "/lifeos", label: "LifeOS", icon: LayoutDashboard, disabled: false, tooltip: undefined, isAgent: false },
      ```
    - DO NOT modify any other items; DO NOT change the JARVIS/Tasks entries.

    **Commit:** `feat(lifeos): scaffold /lifeos route + nav entry`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|lifeos|PersistentNav)" || echo "typecheck clean"</automated>
    Manual: dev server running at localhost:3000, sidebar shows "LifeOS" between JARVIS and Tasks, clicking it lands on `/lifeos` with the placeholder heading visible.
  </verify>
  <done>
    - `apps/web/app/(app)/lifeos/page.tsx` exists, exports default async component, returns minimal shell
    - PersistentNav items array contains an entry with `href: "/lifeos"` and `label: "LifeOS"`
    - `pnpm tsc --noEmit` clean for both files
    - Navigating to `/lifeos` in dev returns a 200 with the placeholder heading
    - Commit made with message `feat(lifeos): scaffold /lifeos route + nav entry`
  </done>
</task>

<task type="auto">
  <name>Task 2: Notion-style banner block</name>
  <files>apps/web/components/lifeos/LifeOsBanner.tsx, apps/web/app/(app)/lifeos/page.tsx</files>
  <action>
    Build a Notion-style banner block (emoji + title, optional cover affordance as a static placeholder) and mount it at the top of /lifeos above where AreasTree will land.

    **Step 1: Create `apps/web/components/lifeos/LifeOsBanner.tsx`** as a presentational Server-safe component (no `"use client"` needed):
    - Props: `{ title: string, emoji: string, subtitle?: string }`
    - Layout structure (Notion-style):
      ```tsx
      <section className="mb-10">
        {/* Cover placeholder — quiet hairline strip evoking Notion's cover area.
            Static for now; future plan can wire image upload. */}
        <div
          aria-hidden="true"
          className="h-24 md:h-32 rounded-lg border border-[var(--edge)] bg-[var(--surface)] mb-6"
          style={{
            background:
              "linear-gradient(135deg, var(--surface) 0%, color-mix(in oklch, var(--hud-cyan) 4%, var(--surface)) 100%)",
          }}
        />
        {/* Emoji + title block — mirrors Notion page header */}
        <div className="space-y-3">
          <div className="text-5xl leading-none select-none" aria-hidden="true">
            {emoji}
          </div>
          <div className="space-y-1">
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </section>
      ```
    - The cover gradient uses --hud-cyan at low alpha — a whisper of the JARVIS atmosphere without becoming HUD chrome. This honors the "JARVIS as MOOD only" guidance.
    - Named export `LifeOsBanner`.

    **Step 2: Mount in `apps/web/app/(app)/lifeos/page.tsx`:**
    - Replace the placeholder `<h1>` from Task 1 with `<LifeOsBanner title="LifeOS" emoji="◈" subtitle="One canvas for areas, captures, habits, and tasks." />`
    - Emoji choice rationale: `◈` (lozenge geometric glyph) — Renaissance/diamond shape, fits journal-paper voice without resorting to standard emojis. If executor prefers, `📓` (notebook) is an acceptable alternative — comment in code explains the choice.
    - Remove the placeholder mono caption from Task 1.
    - Add import: `import { LifeOsBanner } from "@/components/lifeos/LifeOsBanner";`

    **Commit:** `feat(lifeos): notion-style banner block`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|LifeOsBanner|lifeos)" || echo "typecheck clean"</automated>
    Manual: /lifeos shows a thin cover strip with subtle gradient, a large emoji glyph, then a serif H1 "LifeOS" and an italic subtitle.
  </verify>
  <done>
    - `apps/web/components/lifeos/LifeOsBanner.tsx` exists with named export `LifeOsBanner` accepting `{ title, emoji, subtitle? }`
    - page.tsx imports and renders `<LifeOsBanner>` in place of the Task 1 placeholder
    - `pnpm tsc --noEmit` clean
    - Visual: cover strip + emoji + serif title + italic subtitle visible at top of /lifeos
    - Commit: `feat(lifeos): notion-style banner block`
  </done>
</task>

<task type="auto">
  <name>Task 3: Mount AreasTree as the centerpiece</name>
  <files>apps/web/app/(app)/lifeos/page.tsx, apps/web/components/lifeos/LifeOsAreasSection.tsx</files>
  <action>
    Add the AreasTree below the banner — same component, same data source as the /areas page. This is the canonical centerpiece of the LifeOS view.

    **Step 1: Create `apps/web/components/lifeos/LifeOsAreasSection.tsx`** as a thin Server Component wrapper that handles the data fetch + tree mounting (keeps page.tsx clean as more sections land):
    - Imports needed:
      ```tsx
      import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
      import { getSidebarTree } from "@/lib/db/queries/sidebar";
      import { AreasTree } from "@/components/areas/AreasTree";
      ```
    - Default export async function `LifeOsAreasSection()`.
    - Mirror the /areas page data pattern EXACTLY (don't invent variants):
      ```tsx
      const user = await requireOnboarded();
      const [fullTree, oauthAvatar] = await Promise.all([
        getSidebarTree(user.id, true),
        getAuthAvatar(),
      ]);
      const areas = fullTree.filter((a) => a.archivedAt === null);
      const rootAvatarUrl = user.avatarUrl || oauthAvatar.avatarUrl;
      const rootLabel = user.displayName?.trim() || user.email;
      const rootInitial =
        (user.displayName?.trim() || user.email || "·").charAt(0).toUpperCase();
      ```
    - Render structure (wrap with a quiet section header to label the centerpiece):
      ```tsx
      <section className="mb-12">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
            Areas
          </h2>
          <a
            href="/areas"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            Open full view →
          </a>
        </header>
        <AreasTree
          areas={areas}
          rootAvatarUrl={rootAvatarUrl}
          rootInitial={rootInitial}
          rootLabel={rootLabel}
        />
      </section>
      ```

    **Step 2: Mount in `apps/web/app/(app)/lifeos/page.tsx`:**
    - After `<LifeOsBanner />`, add `<LifeOsAreasSection />`.
    - Add import: `import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";`
    - Note: `LifeOsAreasSection` does its own auth + fetch; page.tsx no longer needs to call `requireOnboarded()` itself UNLESS subsequent widget sections also need user data. For now, REMOVE the `requireOnboarded()` call + `void user;` from page.tsx since the section handles its own auth.

    Reasoning: This factors the data-fetch into a self-contained section so page.tsx remains an orchestrator. Other widget sections in Tasks 4-6 follow the same pattern.

    **Commit:** `feat(lifeos): mount areastree centerpiece`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|LifeOsAreasSection|lifeos)" || echo "typecheck clean"</automated>
    Manual: /lifeos shows banner THEN a section header "Areas" with "Open full view →" link THEN the orthogonal AreasTree (same one on /areas). Tree connects to user's avatar at root.
  </verify>
  <done>
    - `apps/web/components/lifeos/LifeOsAreasSection.tsx` exists, default export async Server Component
    - Mirrors /areas data-fetch pattern verbatim — `getSidebarTree(user.id, true)` + filter archived + same root avatar resolution
    - Renders `<AreasTree>` with same prop shape as /areas page
    - page.tsx imports and renders `<LifeOsAreasSection />` below `<LifeOsBanner />`
    - `pnpm tsc --noEmit` clean
    - Visual: AreasTree renders identically to /areas, with "Open full view →" link in the header
    - Commit: `feat(lifeos): mount areastree centerpiece`
  </done>
</task>

<task type="auto">
  <name>Task 4: Recent Captures widget</name>
  <files>apps/web/components/lifeos/RecentCapturesWidget.tsx, apps/web/app/(app)/lifeos/page.tsx</files>
  <action>
    Build a "Recent Captures" widget — last 5 captures with a "view all" link to /captures. Reuse the existing capture query from `/captures` page; do NOT invent a new query function.

    **Step 1: Re-read** `apps/web/app/(app)/captures/page.tsx` and `lib/db/queries/captures.ts` (the source file imports `getCapturesForUser`) to confirm the function signature and return shape.

    **Step 2: Create `apps/web/components/lifeos/RecentCapturesWidget.tsx`** as a Server Component:
    - Imports:
      ```tsx
      import Link from "next/link";
      import { requireOnboarded } from "@/lib/auth/get-user";
      import { getCapturesForUser } from "@/lib/db/queries/captures";
      ```
    - Default export async function `RecentCapturesWidget()`.
    - Fetch:
      ```tsx
      const user = await requireOnboarded();
      const allCaptures = await getCapturesForUser(user.id);
      const recent = allCaptures.slice(0, 5);
      ```
    - Card structure (quiet, journal-paper):
      ```tsx
      <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full">
        <header className="mb-4 flex items-baseline justify-between">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
            Recent captures
          </h3>
          <Link
            href="/captures"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        </header>
        {recent.length === 0 ? (
          <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
            Nothing captured yet. Type into JARVIS to drop a note.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 flex-1">
            {recent.map((c) => (
              <li key={c.id} className="border-b border-[var(--edge)] pb-3 last:border-b-0 last:pb-0">
                <p className="font-serif text-[14px] text-[var(--ink)] line-clamp-2">
                  {/* Capture body. Captures store text in `body` field per existing schema — if the actual field name differs, executor: use whatever the existing /captures page consumes (read CapturesClient.tsx briefly to confirm field name). */}
                  {c.body ?? c.text ?? ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      ```
    - **Field name caveat:** Captures schema likely has a body/text field — if the executor isn't sure, do a quick read of `apps/web/components/captures/CapturesClient.tsx` (or grep `getCapturesForUser` return type) to confirm the exact field name and adjust accordingly. Do NOT guess — read the source.

    **Step 3: Mount in `apps/web/app/(app)/lifeos/page.tsx`:**
    - For this task, mount `<RecentCapturesWidget />` BELOW the AreasSection in a temporary single-column layout. The grid wrapper lands in Task 7.
    - Add import: `import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";`

    **Commit:** `feat(lifeos): recent captures widget`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|RecentCaptures|lifeos)" || echo "typecheck clean"</automated>
    Manual: /lifeos shows a "Recent captures" card with the last 5 captures (or empty-state copy if none), each truncated to 2 lines, with "All →" link routing to /captures.
  </verify>
  <done>
    - `apps/web/components/lifeos/RecentCapturesWidget.tsx` exists, Server Component
    - Calls `getCapturesForUser(user.id)` (the SAME function /captures page uses — not a new query)
    - Renders top 5 with `Link` to `/captures`
    - Empty state handled with journal-paper italic copy
    - Field name for capture body matches whatever the existing /captures surface uses (verified by reading source, not guessed)
    - `pnpm tsc --noEmit` clean
    - Commit: `feat(lifeos): recent captures widget`
  </done>
</task>

<task type="auto">
  <name>Task 5: Today's Habits widget</name>
  <files>apps/web/components/lifeos/TodayHabitsWidget.tsx, apps/web/app/(app)/lifeos/page.tsx</files>
  <action>
    Build a "Today's Habits" widget — list of active habits with check-state indicators for today, plus a link to /habits. Reuse the existing pattern from `/habits` page.

    **Step 1: Re-read** `apps/web/app/(app)/habits/page.tsx` (already in context) and the Server Actions it uses (`getHabitsForCurrentUser`, `getHabitCompletionsInRange`) to confirm exact signatures and return shapes. Briefly read `apps/web/components/habits/HabitsClient.tsx` to understand how today's completion status is derived from the completion rows.

    **Step 2: Create `apps/web/components/lifeos/TodayHabitsWidget.tsx`** as a Server Component:
    - Imports:
      ```tsx
      import Link from "next/link";
      import { Check, Circle } from "lucide-react";
      import {
        getHabitsForCurrentUser,
        getHabitCompletionsInRange,
      } from "@/app/actions/habits";
      ```
    - Default export async function `TodayHabitsWidget()`.
    - Fetch (mirror /habits page convention):
      ```tsx
      const today = new Date();
      const toISODate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const todayISO = toISODate(today);
      const [habits, completions] = await Promise.all([
        getHabitsForCurrentUser(),
        getHabitCompletionsInRange(todayISO, todayISO),
      ]);
      ```
    - Derive today's completion status per habit. If unsure of completion row shape, read `HabitsClient.tsx`'s `today` derivation. Typical pattern: completions have `habitId` + `date`; "completed today" = any completion row with `habitId === h.id` and `date === todayISO`.
    - Card structure:
      ```tsx
      <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full">
        <header className="mb-4 flex items-baseline justify-between">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
            Today's habits
          </h3>
          <Link
            href="/habits"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        </header>
        {habits.length === 0 ? (
          <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
            No habits yet. Set one up over on /habits.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5 flex-1">
            {habits.map((h) => {
              const done = completions.some((c) => c.habitId === h.id && c.date === todayISO);
              return (
                <li key={h.id} className="flex items-center gap-2.5">
                  {done ? (
                    <Check size={14} strokeWidth={2} className="text-[var(--hud-cyan)] shrink-0" />
                  ) : (
                    <Circle size={14} strokeWidth={1.5} className="text-[var(--ink-muted)] shrink-0" />
                  )}
                  <span className={`font-serif text-[14px] ${done ? "text-[var(--ink-muted)] line-through" : "text-[var(--ink)]"}`}>
                    {h.name}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      ```
    - The check is read-only on this widget — user clicks "All →" to go interact. Keeps widget Server Component (no client interactivity needed, no Realtime subscription this surface).

    **Step 3: Mount in `apps/web/app/(app)/lifeos/page.tsx`:**
    - Mount `<TodayHabitsWidget />` below the captures widget (still single-column until Task 7 introduces grid).
    - Add import: `import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";`

    **Commit:** `feat(lifeos): today's habits widget`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|TodayHabits|lifeos)" || echo "typecheck clean"</automated>
    Manual: /lifeos shows a "Today's habits" card listing each active habit with a Check (cyan) or Circle icon to indicate done/pending today, and an "All →" link routing to /habits.
  </verify>
  <done>
    - `apps/web/components/lifeos/TodayHabitsWidget.tsx` exists, Server Component
    - Reuses `getHabitsForCurrentUser` + `getHabitCompletionsInRange` (NOT a new query function)
    - Today's completion derivation matches how /habits derives it (verified by reading HabitsClient)
    - Done state shows Check icon + muted strikethrough; pending shows empty Circle
    - Empty state with journal-paper italic copy
    - `pnpm tsc --noEmit` clean
    - Commit: `feat(lifeos): today's habits widget`
  </done>
</task>

<task type="auto">
  <name>Task 6: Upcoming Tasks widget</name>
  <files>apps/web/components/lifeos/UpcomingTasksWidget.tsx, apps/web/app/(app)/lifeos/page.tsx</files>
  <action>
    Build an "Upcoming Tasks" widget — next 5 tasks sorted by due date with link to /tasks. Reuse `getAllTasksForUser` from `/tasks` page; do NOT invent a new query.

    **Step 1: Re-read** `apps/web/app/(app)/tasks/page.tsx` (in context) and briefly inspect `lib/db/queries/tasks.ts` to confirm `getAllTasksForUser` return shape (specifically the field names for `dueDate` and `status`).

    **Step 2: Create `apps/web/components/lifeos/UpcomingTasksWidget.tsx`** as a Server Component:
    - Imports:
      ```tsx
      import Link from "next/link";
      import { requireOnboarded } from "@/lib/auth/get-user";
      import { getAllTasksForUser } from "@/lib/db/queries/tasks";
      ```
    - Default export async function `UpcomingTasksWidget()`.
    - Fetch + sort:
      ```tsx
      const user = await requireOnboarded();
      const allTasks = await getAllTasksForUser(user.id);

      // Upcoming = not completed (status != 'lesno'), has a due date, sort ascending by due.
      // Field names per existing schema: dueDate (Date | null), status (TaskStatus literal).
      // If exact field names differ, executor: read lib/db/schema.ts task fields and adjust.
      const upcoming = allTasks
        .filter((t) => t.status !== "lesno" && t.dueDate != null)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
        .slice(0, 5);
      ```
    - For displaying due date, use simple inline formatting via `date-fns` (already in stack):
      ```tsx
      import { format } from "date-fns";
      // ... format(new Date(t.dueDate!), "MMM d") for compact display
      ```
    - Card structure:
      ```tsx
      <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full">
        <header className="mb-4 flex items-baseline justify-between">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
            Upcoming tasks
          </h3>
          <Link
            href="/tasks"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        </header>
        {upcoming.length === 0 ? (
          <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
            Nothing due. Breathe.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5 flex-1">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-[14px] text-[var(--ink)] truncate flex-1 min-w-0">
                  {t.title ?? t.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] shrink-0">
                  {format(new Date(t.dueDate!), "MMM d")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      ```
    - **Field name caveat:** Task display name — schema may use `title` or `name`. Confirm from `lib/db/schema.ts` or from how `TasksClient.tsx` reads it; adjust.

    **Step 3: Mount in `apps/web/app/(app)/lifeos/page.tsx`:**
    - Add `<UpcomingTasksWidget />` below the habits widget (still single-column; grid lands in Task 7).
    - Add import: `import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";`

    **Commit:** `feat(lifeos): upcoming tasks widget`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|UpcomingTasks|lifeos)" || echo "typecheck clean"</automated>
    Manual: /lifeos shows an "Upcoming tasks" card listing 5 next-due tasks, each with a compact "MMM d" date on the right, and "All →" link to /tasks. Empty state copy "Nothing due. Breathe." if no upcoming tasks.
  </verify>
  <done>
    - `apps/web/components/lifeos/UpcomingTasksWidget.tsx` exists, Server Component
    - Calls `getAllTasksForUser(user.id)` (SAME function /tasks uses — not a new query)
    - Filters completed tasks (`status !== "lesno"`) and tasks without dueDate, sorts ascending, slices 5
    - Field names match actual schema (verified by reading source)
    - Empty state handled with journal-paper italic copy
    - `pnpm tsc --noEmit` clean
    - Commit: `feat(lifeos): upcoming tasks widget`
  </done>
</task>

<task type="auto">
  <name>Task 7: Widget grid layout (3-col desktop, stacked mobile)</name>
  <files>apps/web/components/lifeos/LifeOsWidgetGrid.tsx, apps/web/app/(app)/lifeos/page.tsx</files>
  <action>
    Wrap the three widgets in a responsive grid wrapper so they sit side-by-side on desktop and stack on mobile.

    **Step 1: Create `apps/web/components/lifeos/LifeOsWidgetGrid.tsx`** as a Server-safe presentational wrapper:
    - Props: `{ children: React.ReactNode }`
    - Layout — Tailwind responsive grid following project's existing breakpoints (max-w-[1280px] page width allows comfortable 3-col at lg+):
      ```tsx
      export function LifeOsWidgetGrid({ children }: { children: React.ReactNode }) {
        return (
          <section className="mb-12">
            <header className="mb-4 flex items-baseline">
              <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
                At a glance
              </h2>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {children}
            </div>
          </section>
        );
      }
      ```
    - The `md:grid-cols-2` breakpoint gives a comfortable 2-up intermediate state on tablets; widgets stack at `<md`.
    - The widgets already have `h-full` on their root `<section>` (added in Tasks 4-6) so equal-height alignment in the grid works out of the box.

    **Step 2: Refactor `apps/web/app/(app)/lifeos/page.tsx`** to wrap the three widgets:
    - Replace the temporary stacked mounts from Tasks 4-6 with:
      ```tsx
      <LifeOsWidgetGrid>
        <RecentCapturesWidget />
        <TodayHabitsWidget />
        <UpcomingTasksWidget />
      </LifeOsWidgetGrid>
      ```
    - Add import: `import { LifeOsWidgetGrid } from "@/components/lifeos/LifeOsWidgetGrid";`
    - Page composition is now: `<LifeOsBanner /> → <LifeOsAreasSection /> → <LifeOsWidgetGrid> ... </LifeOsWidgetGrid>`

    **Commit:** `feat(lifeos): responsive 3-col widget grid`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|LifeOsWidgetGrid|lifeos)" || echo "typecheck clean"</automated>
    Manual: Resize browser at desktop (≥lg breakpoint, typically 1024px): three widgets in a row. Resize to ~768px: 2-col. Resize to mobile (<768px): single column stack. Section header "At a glance" sits above the grid.
  </verify>
  <done>
    - `apps/web/components/lifeos/LifeOsWidgetGrid.tsx` exists, named export wrapping children in responsive grid
    - page.tsx wraps the three widgets in `<LifeOsWidgetGrid>` instead of stacking them
    - `pnpm tsc --noEmit` clean
    - Manual responsive check: 3 cols (lg), 2 cols (md), 1 col (sm)
    - All three widgets render at equal height in the grid (no jagged bottom edges)
    - Commit: `feat(lifeos): responsive 3-col widget grid`
  </done>
</task>

<task type="auto">
  <name>Task 8: Typography and spacing polish</name>
  <files>apps/web/app/(app)/lifeos/page.tsx, apps/web/components/lifeos/LifeOsBanner.tsx, apps/web/components/lifeos/LifeOsAreasSection.tsx, apps/web/components/lifeos/RecentCapturesWidget.tsx, apps/web/components/lifeos/TodayHabitsWidget.tsx, apps/web/components/lifeos/UpcomingTasksWidget.tsx, apps/web/components/lifeos/LifeOsWidgetGrid.tsx</files>
  <action>
    Final polish pass to lock the page into the project's typography/spacing rhythm. The /areas page is the canonical reference for vertical rhythm — match it.

    Open both `/areas` and `/lifeos` side by side in dev and walk through this checklist, adjusting only what's off:

    **Vertical rhythm:**
    - Page wrapper padding should match /areas: `mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12`. Confirm in page.tsx.
    - Section spacing: each major section uses `mb-12` (banner already has `mb-10` which is slightly tighter — keep it that way so the banner→tree transition feels intentional, but verify visually). Areas section: `mb-12`. Widget grid section: `mb-12`. If something looks cramped, bump to `mb-14`; if too airy, drop to `mb-10`. Use /areas as reference for "right".

    **Typography hierarchy:**
    - Banner H1: `font-serif text-4xl font-semibold tracking-tight` (largest, anchors the page)
    - Section H2 (Areas, At a glance): `font-serif text-xl font-semibold tracking-tight` (mid)
    - Widget H3 (Recent captures, Today's habits, Upcoming tasks): `font-serif text-base font-semibold` (smallest serif)
    - Mono labels ("All →", "Open full view →"): `font-mono text-[10px] uppercase tracking-[0.12em]` consistently
    - Body text inside widgets: `font-serif text-[14px]` for primary content, `text-[13px]` for secondary/empty-state italic copy
    - Verify NO mixing of inconsistent font sizes — every serif heading scale should land on 16/20/36/56 grid (text-base/xl/4xl). EB Garamond text-4xl banner is appropriate scale for the page title.

    **Hover affordances:**
    - Every link/button should have `cursor-pointer-always` (CLAUDE.md universal rule). Verify on:
      - `<Link href="/captures">` in RecentCapturesWidget
      - `<Link href="/habits">` in TodayHabitsWidget
      - `<Link href="/tasks">` in UpcomingTasksWidget
      - `<a href="/areas">` in LifeOsAreasSection
    - "All →" / "Open full view →" links: `transition-colors duration-100` for hover-muted→ink.

    **Borders/edges:**
    - Widget cards: `border border-[var(--edge)] bg-[var(--surface)]` — quiet, journal-paper. No double-borders, no nested chrome.
    - Banner cover: `border border-[var(--edge)]` — consistent edge color with widgets.

    **Color discipline:**
    - Cyan (`var(--hud-cyan)`) appears in exactly TWO places on the page:
      1. Banner cover gradient (subtle atmospheric tint)
      2. Today's Habits widget done-state Check icon
    - This is intentional per memory: "JARVIS as MOOD only, not HUD". Verify nothing else accidentally pulled in cyan.

    **Decision Q (executor judgment):**
    - If during the polish pass you notice the widget grid feels too dense in the middle column (Habits) vs the others, it's fine to swap order to `Captures | Tasks | Habits` (visually distinct rhythms — captures = prose, tasks = list with dates, habits = checks). Use your judgment. Default order from Task 7 (`Captures | Habits | Tasks`) is also fine.

    **Commit:** `feat(lifeos): typography + spacing polish to match /areas rhythm`

    **DEFERRED (do NOT do this in this task or plan):**
    Making `/lifeos` the root redirect for signed-in users from `/`. The user explicitly wants confirmation before making that switch. Leave a note in the commit body or a TODO comment in page.tsx if helpful: `// TODO(lifeos-root-redirect): user confirmation pending — see Quick 260607-fgb step 9.`
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "(error|lifeos)" || echo "typecheck clean" && grep -rn "var(--hud-cyan)" apps/web/components/lifeos/ | wc -l</automated>
    Manual side-by-side comparison of /areas and /lifeos:
    1. Page wrapper padding matches
    2. Section header hierarchy reads cleanly (H1 > H2 > H3)
    3. Hover states on all links transition smoothly muted→ink
    4. No visual jank — borders consistent, spacing breathes
    5. Cyan appears in exactly 2 places (banner gradient, today's-habits check icon)
  </verify>
  <done>
    - All seven files reviewed and any spacing/typography drift corrected against /areas reference
    - Every link has `cursor-pointer-always`
    - Typography scale lands on EB Garamond text-base/xl/4xl + JetBrains Mono text-[10px]
    - Cyan usage limited to atmospheric banner + Check icon
    - `pnpm tsc --noEmit` clean
    - Commit: `feat(lifeos): typography + spacing polish to match /areas rhythm`
    - Step 9 (root redirect) explicitly NOT done — user confirmation pending
  </done>
</task>

</tasks>

<verification>
After all 8 tasks complete:

1. **Route reachability:** Navigate to `/lifeos` from sidebar — page loads with 200, no console errors.

2. **Structural completeness:**
   - Banner block at top (cover strip + emoji + serif H1 "LifeOS" + italic subtitle)
   - "Areas" section header with "Open full view →" link
   - AreasTree rendered (orthogonal tree from user avatar through area cards)
   - "At a glance" section header
   - 3 widgets in responsive grid: Recent captures | Today's habits | Upcoming tasks
   - Each widget has a serif H3, "All →" link, content list (or empty-state copy)

3. **Data fidelity:** Each widget shows REAL data from the same queries as its source page:
   - Captures widget items match the top 5 on `/captures`
   - Habits widget done-states match what's shown on `/habits` for today
   - Tasks widget items match the top 5 by due date on `/tasks`

4. **Responsive:** Grid switches from 3-col (lg) → 2-col (md) → 1-col (sm) cleanly.

5. **Typecheck + lint:** `cd apps/web && pnpm tsc --noEmit` clean, `pnpm biome check apps/web/components/lifeos apps/web/app/\(app\)/lifeos` clean.

6. **Commit history:** `git log --oneline -10` shows 8 atomic commits, each scoped to one task, with `feat(lifeos):` prefix.

7. **Aesthetic check:** Page reads as Notion document + Anthropic restraint, NOT neumorphic or HUD-heavy. Cyan appears in exactly 2 places.
</verification>

<success_criteria>
- `/lifeos` route exists, reachable from sidebar nav (entry between JARVIS and Tasks)
- Page composition top-to-bottom: Banner → AreasTree → 3-widget grid
- All three widgets functional with real data, view-all links route correctly
- Responsive: 3-col desktop, 2-col tablet, stacked mobile
- 8 atomic commits, one per task, each compiling cleanly
- Typography matches /areas rhythm; cyan use limited to atmospheric/intentional spots
- Step 9 (root redirect) NOT done — deferred for user confirmation
- `pnpm tsc --noEmit` clean across all touched files
</success_criteria>

<output>
After completion, create `.planning/quick/260607-fgb-build-lifeos-tab-lifeos-route-as-canonic/260607-fgb-SUMMARY.md` capturing:
- Final page composition
- Any field-name caveats hit during widget construction (e.g., if capture body field was `text` vs `body`)
- Any spacing/order tweaks made in Task 8 polish
- Confirmation that step 9 (root redirect) is deferred
- The 8 commit SHAs and messages
</output>
