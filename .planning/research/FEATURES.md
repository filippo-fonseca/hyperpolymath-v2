# Feature Research

**Domain:** Personal life-OS / unified productivity app with NLP agent (single-user)
**Researched:** 2026-05-07
**Confidence:** HIGH (table stakes well-documented; differentiators verified against v1 + competitor landscape; anti-features grounded in product research)

---

## Executive Synthesis

The personal-productivity-with-NLP-capture category in 2026 is mature but bifurcated:

- **Task-first apps** (Todoist, TickTick, Things 3) excel at the create-side natural-language input, kanban/list dual views, and project hierarchy — but treat "freeform thoughts" as an afterthought.
- **Note-first apps** (Mem.ai, Reflect, Apple Notes, Notion) excel at hashtag-driven feeds, semantic backlinks, and AI search — but their task primitives are weak.
- **AI-agent productivity** (Notion AI, Mem Chat, Reflect AI) handles ambiguous input but most use *clarifying questions first*, which breaks the capture-fast feel.

Hyperpolymath v2's product wedge is the **fusion**: one input bar (Kiwi) that routes a sentence to the right primitive (task / capture / event / multi-action) without asking, with capture-first as the safe default. This combination — Todoist-style tokens + Apple-Notes-style hashtag captures + Google Calendar CRUD + multi-action inference + capture-first ambiguity handling — is not currently shipped as a single product. That's the differentiator wedge.

**Key tension:** "Be goated" requires depth in *every* primitive (tasks need drag-reorder, captures need hashtag autocomplete, calendar needs recurrence). The MVP must absolutely ship table-stakes for each surface — partial implementations feel broken. Anti-features (gamification, social, AI content suggestions) must be excluded explicitly to keep the product feeling like a *tool*, not a *toy*.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or incomplete.

#### Tasks (the to-do primitive)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create task with title + due date + priority + project | Universal across Todoist, Things, TickTick | LOW | Already in core.md |
| Mark task complete (with visual satisfaction) | Foundational; checkmark animation matters | LOW | v1 status `lesno` is the "complete" state |
| Edit task inline (no modal for title change) | Friction-free editing is non-negotiable in 2026 | MEDIUM | Spec already lists inline edit on tabs |
| Drag-reorder tasks within a list/column | Standard kanban + list interaction | MEDIUM | Use `dnd-kit` or `@hello-pangea/dnd` per 2026 stack norms |
| Drag task between kanban columns (status change) | Kanban table-stakes | MEDIUM | Same library; status maps to `not started → up next → in progress → almost done → lesno` |
| Filter by priority / status / project / due window | Without filtering, "All Tasks" is useless past 50 items | MEDIUM | v1 had this; carry forward |
| Bulk reschedule / bulk complete / bulk delete | Standard in Todoist, TickTick, Asana | MEDIUM | v1 had bulk reschedule; expand |
| Show overdue tasks distinctly (red, badge, top of list) | Users scan for "what's late" first | LOW | Pure UI |
| Today / Upcoming / All views | Mental model from Things, Todoist; users expect the trio | LOW | Filter shortcuts, not separate data |
| Empty states with CTA | "No tasks here yet — add one with Kiwi" | LOW | Brand voice opportunity |

#### Quick Captures (the freeform note primitive)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Freeform text entry, no required fields | Apple Notes / Twitter / Mem all let you just type | LOW | core.md spec |
| `#hashtag` inline parsing with autocomplete | Apple Notes, Bear, Mem standard | MEDIUM | Autocomplete on `#` + 1+ char; create-on-enter if new |
| Reverse-chronological feed | Twitter-feed mental model | LOW | `ORDER BY createdAt DESC` |
| Filter by hashtag (sidebar or chip strip) | Apple Notes Smart Folders, Mem tag pages | LOW | Already in spec ("hashtag-filterable view") |
| Search across all captures (full-text) | Mem, Reflect, Apple Notes all have this | MEDIUM | Postgres `tsvector` or pg_trgm; not Elasticsearch |
| Edit / delete capture | CRUD parity expected | LOW | Manual via tab; not Kiwi in MVP |
| Optional project link | Spec already calls for this | LOW | many-to-many like tasks |
| Show timestamp (relative: "2h ago") | Standard feed UX | LOW | `date-fns` `formatDistanceToNow` |

#### Calendar (Google Calendar operator)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OAuth connect + show connection status | Standard for any Google integration | MEDIUM | Spec covers this |
| Create event with title + start + end + description | Foundational | LOW | gcal API `events.insert` |
| Edit event (drag to reschedule, edit modal) | Calendar app baseline | MEDIUM | Drag-reschedule = stretch goal; edit modal = MVP |
| Delete event with confirm | Destructive action; must confirm | LOW | Toast + undo is the modern pattern |
| Day / week / month view toggle | Universal calendar UX | MEDIUM-HIGH | Use `react-big-calendar` or `@schedule-x/react` to avoid building from scratch |
| Multi-calendar selection (which calendar to write to?) | Most users have Personal + Work + Class calendars | MEDIUM | v1 had this; Kiwi fuzzy-matches calendar by name |
| Show events from all enabled calendars (with color) | Mental model: "my full day" | LOW | gcal returns `colorId`; map to event color swatch |
| Sync on page load (no stale data) | Spec design choice; users expect freshness | LOW | Re-fetch in window range on mount |
| Recurring event display (read-only is fine for MVP) | Removing recurring events from view = data loss feel | MEDIUM | gcal API expands recurrences via `singleEvents=true` |
| Time-zone correctness (especially for travel) | Universally annoying when broken | MEDIUM | Always store + send `timeZone` field for events; never just offset |

#### Projects & Areas (the hierarchy)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create / rename / archive / delete Areas | Top-level life sectors; CRUD parity | LOW | core.md spec |
| Create / rename / archive / delete Projects within an Area | Things 3 model: Areas → Projects → Tasks | LOW | core.md spec |
| Project detail page (tasks + captures linked) | Notion-style "everything about X in one place" | MEDIUM | core.md spec — breadcrumb format |
| Project icon + banner image | Notion mental model; brand opportunity | MEDIUM | Emoji picker for icon (sufficient); banner can be solid color in MVP |
| Tree-view sidebar (Areas → Projects, expandable) | Hierarchy visualization | MEDIUM | Pull-up sidebar per spec |
| Show task/capture counts per project | Quick scannability | LOW | Aggregate query or denormalized counter |
| Mark project as Class with academic metadata | Differentiator (see below) but expected by *students* | LOW | core.md spec |

#### Kiwi (the NLP agent)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single text input that infers intent | Todoist Quick Add is the gold standard ([Todoist help](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)) | HIGH | Already core to spec |
| Natural date parsing (today, tomorrow, M/D, weekdays, "8pm sat") | Todoist, Fantastical baseline | MEDIUM | Use Claude tool-call output directly + chrono-node as fallback |
| Token shortcuts (`p1`, `$project`, `#hashtag`) | Power-user expectation since Todoist | MEDIUM | core.md spec |
| Streaming response (not "loading…" then dump) | ChatGPT set the bar in 2023; everyone expects it | MEDIUM | SSE; v1 has it |
| Visual feedback during model thinking | "Thinking word" + cursor in v1 — keep it | LOW | Inherited UX |
| Capture-first when ambiguous (no clarifying questions for non-destructive) | This is the *anti-pattern* of most agents — Hyperpolymath inverts it | LOW | Prompt design; v1 has this principle |
| Manual mode toggle (force task / capture / event) | Users want override when auto-infer is wrong | LOW | Already in spec |
| Inline highlighting of `$project` and `#hashtag` tokens (resolved color chips) | Todoist's autocomplete chip pattern | MEDIUM | Custom textarea or contenteditable; hardest UI piece |

#### Cross-cutting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Google OAuth login | Spec; "Google is fine" preference | LOW | Supabase Auth handles |
| Light + dark mode | Universal in 2026; users uninstall without it | LOW | Tailwind `class` strategy |
| Responsive (works on iPad / phone in browser) | Spec is web-only but users will open it on mobile | MEDIUM | Especially Kiwi input + capture feed |
| Keyboard shortcuts (Cmd+K to focus Kiwi, Esc to close, j/k to nav lists) | Power-user expectation; v1 had Cmd+K | MEDIUM | `cmdk` library or native handlers |
| Realtime updates across devices (open in two tabs, see changes) | v1 had `onSnapshot`; spec requires Supabase Realtime parity | MEDIUM | Supabase Realtime channels per table |

---

### Differentiators (Competitive Advantage)

Features that make Hyperpolymath stand apart. Aligned with PROJECT.md Core Value: **"Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time."**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-action inference from one sentence** | "Dinner w/ Anna 8pm sat. Buy flowers fri afternoon." → 1 calendar event + 1 task in one turn. *No competitor does this cleanly.* Todoist parses one task; ChatGPT plugins are clunky; Notion AI is multi-step. | HIGH | Claude Sonnet 4.6 with structured tool-use; the central engineering bet. JSON contract is `actions: KiwiAction[]` (v1 pattern). |
| **Capture-first ambiguity resolution** | When agent isn't sure if "loved Anna's mom" is a task or a thought, it captures rather than asks. Inverts the "AI asks too many questions" complaint. | LOW (prompt) | v1 inherited; codify as system prompt rule + golden-path tests |
| **Unified surface across tasks + notes + calendar** | One input bar instead of three apps. Closest competitor: Notion AI Agent — but Notion's tasks are weak and calendar is bolt-on. | HIGH (already the architecture) | Architectural; the existence proof is shipping it |
| **Journal-paper aesthetic (EB Garamond, Renaissance brand)** | Productivity apps in 2026 all look the same (white card + blue accent + Inter font). The Elsevier/Nature + Notion-zen hybrid is genuinely unique. | MEDIUM | Typography + spacing + restraint; not a feature to "add" but a discipline |
| **Warp-terminal Kiwi interface** | Most LLM chats look like ChatGPT clones. The terminal-styled input + thinking-word indicator + structured action receipts feels distinctive. | MEDIUM | v1 has this; preserve. Action receipts as terminal-style "✓ created task #42" lines |
| **Project-as-Class** with academic metadata + grad-year-derived semester picker | Students do not want a separate gradebook app + task app + calendar app. The integrated "this task → this class → this semester" thread is unique to student-built tools (cf. GradePath, Slate — but those are class-only). | LOW | core.md spec; semester options dynamically computed from `userSettings.graduationYear` |
| **`$project` reference syntax with inline chip rendering** | Todoist uses `#`. Slack uses `@`. Hyperpolymath's `$` for projects + `#` for hashtags = unambiguous + visually distinct. The chip rendering (vs raw text) is the polish bar. | MEDIUM | Contenteditable textarea or custom input; hardest single UI piece |
| **`P∞` and `lesno` as preserved literal status/priority** | Personal voice baked into the data model. Brand-distinctive. Anti-corporate. | LOW | Inherited non-negotiable per PROJECT.md |
| **Google Calendar as source-of-truth (no local cache)** | Most apps double-write and create sync drift. Hyperpolymath treats gcal as the database for events. Simpler, fewer bugs, always-correct. | MEDIUM | Architectural decision; spec covers it |
| **Open-source, single-user, MIT** | Differentiates from every SaaS productivity tool. Aligns with builder identity. | LOW | Posture, not a feature |

---

### Anti-Features (Explicit Exclusions with Rationale)

Features that seem good but conflict with the product's identity or create maintenance/UX debt.

| Anti-Feature | Why People Request It | Why Problematic | What to Do Instead |
|--------------|----------------------|-----------------|--------------------|
| **Gamification (XP, streaks, badges, levels)** | "Make productivity fun" | [Research shows](https://medium.com/@alphahangchen1/the-trap-of-gamified-productivity-d3d4b37725a7) external rewards undermine intrinsic motivation; users game the metric (split tasks, fake completions); Gartner estimates 80% of gamified productivity apps fail business objectives. Conflicts with the "academic paper" tone. | Show progress through visualization (count of completed tasks per project, capture frequency timeline) — observation, not reward |
| **Social sharing / "share this task list"** | "Let me show my friends" | Single-user app per spec; social features create privacy surface area, multi-tenancy complexity, and distract from execution. Anti-aligned with "tool, not toy." | Open-source the *product* publicly; never the *data* |
| **AI-generated content suggestions** ("Write this for me") | Notion AI's killer feature; trendy | Hyperpolymath's AI is a *router*, not a *content generator*. The user owns the words. Generation undermines the "this is my journal" feel. | Kiwi parses, structures, schedules. Never authors prose. |
| **Pomodoro timer / focus mode** | Common request in productivity apps | Adds a stateful timer system, notifications, audio — all complexity for a feature already covered by 14 dedicated apps the user can keep open. | Out of scope; user can use a separate timer |
| **Habit tracking** | v1 had it | Per PROJECT.md "Out of Scope" — v1 spread thin across 9 domains; v2 is deliberately tight. Re-add post-MVP only if validated. | Manual capture: `#habit ran 3mi today` works for now |
| **Twilio SMS ingestion** | v1 had it | Per spec; complexity (webhook, processed-message dedup, parsing edge cases) for low marginal value over web/mobile-web. | Web Kiwi covers it |
| **Persistent chat memory across sessions** | "ChatGPT remembers me" | Adds summarization complexity to the prompt; v1 ran fine without it; risk of stale context misfires. | Session-only memory; per-turn context injection from DB |
| **Update / Delete via Kiwi (in MVP)** | "Why can't Kiwi delete?" | Destructive actions need confirmation flows that lengthen interaction. Get C right first per core.md. | Manual UI in tabs for U and D; revisit post-MVP |
| **Background sync / service worker / cron** | "Auto-update my calendar" | Per spec; sync-on-page-load is sufficient for single-user; reduces ops surface. | Re-fetch on mount |
| **Native mobile app** | "I want to add tasks from my phone" | Web responsive covers it; native is 6-12 months of work; defer until web is solid. | PWA-quality responsive web |
| **Multi-tenant team features (sharing, comments, mentions)** | "Use it with my partner" | Single-user app architecturally; multi-tenancy is a different product. Rows are scoped to `userId` for *future-proofing*, not for activation. | None in MVP |
| **Email/password auth** | "Some users don't want Google" | Adds password-reset flow, validation, UX surface. Spec is Google-only. | Google OAuth only |
| **AI-suggested task scheduling / auto-prioritization** | "Tell me what to work on" | Implies the AI knows the user's life better than they do. Conflicts with "user owns the journal" feel. The agent is a router, not a manager. | User sets priority; Kiwi just parses it |
| **Notifications (push, email reminders)** | "Remind me at 9am" | Web push is fragile; email is noisy; gcal already handles event reminders via Google's stack. | Defer to gcal's own reminder system |
| **Importing from Todoist / Notion / Asana** | "I have history elsewhere" | One-time use; brittle; rarely worth building. | CSV import (or none) post-validation |
| **Quests / Pomodoro / Canvas LMS sync** | Inspiration from `intentionality-app-inspo/` | HANDOFF.md explicitly warns: "do not import from it, do not ship it, do not get features confused" | Stay in core.md scope |
| **Real-time collaborative editing** | "Like Google Docs" | Single-user app; CRDT/OT is enormous engineering for zero MVP value | Realtime is for cross-device single-user UI sync only |

---

## Feature Dependencies

```
Areas (root)
   └──required by──> Projects
                        └──required by──> Tasks (project link)
                        └──required by──> Captures (project link)
                        └──required by──> Kiwi $project resolution
                        └──required by──> Class metadata view

User Settings (graduationYear)
   └──required by──> Class semester picker (range = grad-4 to grad)

Google OAuth
   └──required by──> Calendar tab (any read/write)
   └──required by──> Kiwi event creation

Kiwi context-injection (project list, calendar list, recent tasks)
   └──required by──> $project fuzzy-resolution
   └──required by──> Calendar fuzzy-matching ("orgo" → ORGO calendar)
   └──required by──> Multi-action inference (needs to know what exists)

Hashtag autocomplete
   └──required by──> Capture creation UX (table stakes)
   └──enhanced-by──> Hashtag denormalized count doc (for sidebar list)

Kanban view
   └──required by──> Status enum (the columns)
   └──required by──> Drag-and-drop library (dnd-kit)
   └──conflicts-with──> "everything is a list" purist UX (we ship both)

Realtime channels
   └──required by──> Multi-tab consistency
   └──required by──> Cross-device single-user UX
   └──conflicts-with──> Aggressive client caching (must invalidate on event)
```

### Dependency Notes

- **Areas → Projects → Tasks/Captures**: Phase 1 work must be Areas + Projects before tasks/captures are useful. Without a project to attach to, `$project` syntax has nothing to resolve.
- **User Settings before Class metadata**: Semester picker depends on `graduationYear`; ship settings page early or hardcode dev-default.
- **Kiwi depends on every primitive existing**: Kiwi is a router — it can't route to a primitive that doesn't exist. Build primitives' CRUD before wiring Kiwi to write to them. (This is why core.md says "Kiwi C only in MVP" — even C requires primitives ready.)
- **Calendar depends on OAuth being solid**: Token refresh edge cases (expired, revoked, missing scope) must be handled before Calendar tab is shippable.
- **Hashtag autocomplete needs a tag query**: Even MVP autocomplete needs a fast "give me tags starting with X" query — denormalize tag counts into a `hashtags` table per v1's pattern.
- **Realtime conflicts with naïve caching**: If you add React Query later, configure invalidation on Realtime events; otherwise stale-then-realtime fights itself.

---

## Edge Cases & Behavior Nuances (the "spec hasn't pinned this down" list)

These are edge cases the spec doesn't fully specify. Flag for the build phase, not for the research phase to resolve, but call them out so they don't surprise.

### Natural-language parsing edge cases

1. **"Friday" with no qualifier**: Is it the upcoming Friday or "this Friday" (which could be today if today is Friday)? Convention to adopt: **always forward** (use chrono-node `forwardDate: true` or equivalent prompt rule). Matches Todoist + Fantastical defaults. Today-itself is "today", not "Friday".
2. **"Next Friday" off-by-7**: Some users mean "the very next Friday" (= "this Friday" forward); others mean "Friday of next calendar week". v1 uses "+7d from this Friday" — **document this convention in the Kiwi prompt and in user-facing help text**.
3. **AM/PM ambiguity** ("dinner at 6"): Bare hour with no AM/PM in evening-context words (dinner, drink, meeting after work) → PM. v1 prompt handles this. Codify as a prompt rule with examples.
4. **Time without date** ("8pm"): Defaults to today if before 8pm now, tomorrow if past. Or always today and let user catch it. **Recommend: always today; show the resolved datetime in the action receipt so user catches errors.**
5. **Time-zone for events**: Always store and send `timeZone: "America/New_York"` (or user's setting), not UTC offsets. [Google Calendar API requires explicit timeZone for recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents) — most timezone bugs surface here.
6. **Recurring task creation**: core.md doesn't mention recurring tasks. **Decision needed: defer recurring tasks to post-MVP, or support `every monday` via Kiwi?** Recommend: defer; one-off tasks only in MVP. (Recurring events via gcal are fine because gcal handles them; recurring *tasks* require an in-app recurrence engine which is significant work.)
7. **Date-only vs date-time tasks**: A task due "Friday" has no time. Tasks due "Friday 5pm" have one. Spec uses `dueDate: string | null` (YYYY-MM-DD) per v1 — implies date-only. **Confirm: Tasks have date-only due dates; events have date+time. If a user says "task due fri 5pm", treat as date-only task (drop the time) OR convert to event with reminder. Recommend: drop the time silently and surface in action receipt.**

### Hashtag UX nuances

1. **Hashtag normalization**: `#Idea` vs `#idea` vs `#IDEA` — same tag? **Recommend: lowercase normalize on store; preserve display casing per first use.**
2. **Hashtag with spaces**: `#big idea` doesn't work. Apple Notes uses underscore (`#big_idea`) or camelCase (`#bigIdea`). **Recommend: lowercase + treat first non-word-char as terminator; document in placeholder text.**
3. **Multi-line capture with hashtag**: Hashtag must be parseable anywhere in the body, not just at the start (Apple Notes pattern).
4. **Deleting last reference to a hashtag**: Does the tag disappear from the sidebar? **Recommend: orphan tags hidden but not deleted (so re-typing brings them back); periodic cleanup task.**

### Calendar UX nuances

1. **Default calendar selection**: Which calendar does Kiwi write to when user just says "dinner sat 8pm"? **Recommend: user-settable default in settings (defaults to primary); Kiwi can override with explicit calendar fuzzy-match.**
2. **Event with attendees**: core.md doesn't mention attendees. **Recommend: defer attendees to post-MVP; events created via Kiwi are solo events. (Adding attendees triggers email invitations, which is a new permission scope and UX surface.)**
3. **Event color**: gcal supports 11 event colors. **Recommend: don't expose color picker in MVP; let events inherit calendar color.**
4. **Cross-day events / multi-day events**: Birthdays, vacations. **Recommend: support all-day events (no time, just date range) in MVP since it's trivial via gcal API; events spanning multiple days but with times = post-MVP.**

### Multi-action inference nuances

1. **Two events vs event + task**: "Dinner sat 8pm. Reservation thursday." Could be 2 events. Or 1 event + 1 task. **Recommend: prompt rule — verbs like "reserve", "book", "remember to", "remind me" → task. Concrete time + activity → event.**
2. **Conflict detection**: Should Kiwi warn if a new event overlaps an existing one? **Recommend: post-MVP. Adds context-injection complexity; not a v1 differentiator.**
3. **Action ordering**: If 1 sentence creates 1 event + 1 task, in what order do they appear in the receipt? **Recommend: source-text order. (User said event first, show event first.)**
4. **Atomicity**: If creating the event succeeds but creating the task fails, rollback or partial success? **Recommend: partial success with clear error per action. Each action is independent.**

### Capture-first edge cases

The spec says "default to capture when ambiguous, never ask for non-destructive". Edge cases:

1. **"Remember to call mom"**: Task or capture? "Remember to" is a strong task signal. **Recommend: prompt rule — "remember to / need to / have to / should / must" → task with default priority.**
2. **"Call mom tomorrow"**: Has a date — task. **Yes, create task.**
3. **"called mom today, she sounds tired"**: Past tense narrative — capture. **Recommend: prompt rule — past-tense narrative → capture.**
4. **"3pm meeting cancelled"**: Update vs capture vs new event? **Recommend: in MVP (Kiwi C only), this becomes a capture. Post-MVP, becomes update_event.**
5. **Profanity / personal content**: User journals personal things. **Just store it. No filtering, no flagging. Privacy is the product.**

---

## MVP Definition

### Launch With (v1 — exactly the core.md scope)

Minimum viable product — what's needed to validate the concept.

**Foundation**
- [ ] Google OAuth via Supabase
- [ ] User settings page (graduation year minimum)
- [ ] Areas CRUD (with archive)
- [ ] Projects CRUD (with archive, Area link, optional dates)
- [ ] Project-as-Class metadata (when `isClass: true`)
- [ ] Tree-view sidebar (Areas → active Projects)
- [ ] Project detail page (breadcrumb, metadata, linked tasks + captures)

**Tasks**
- [ ] Tasks CRUD with priority (P∞/P1/P2/P3) + status + due date + project links
- [ ] All Tasks tab with kanban view
- [ ] All Tasks tab with list view
- [ ] Filter by status / priority / project / due window
- [ ] Drag to reorder; drag to change column (kanban)
- [ ] Inline edit title

**Captures**
- [ ] Captures CRUD with text + project links + hashtags
- [ ] Hashtag autocomplete in input
- [ ] Captures feed (reverse-chronological)
- [ ] Hashtag-filterable view (sidebar of tags)
- [ ] Search captures (full-text)

**Calendar**
- [ ] Google Calendar OAuth + connect/disconnect UI
- [ ] List user's calendars; toggle which to display
- [ ] Calendar tab with day + week views (month optional for MVP)
- [ ] Create / edit / delete events (full CRUD)
- [ ] Sync on page load (no background polling)
- [ ] Show events from gcal with calendar colors

**Kiwi**
- [ ] Homescreen Kiwi terminal-style chat surface
- [ ] Streaming Claude response with thinking-word indicator
- [ ] Multi-action inference (1 sentence → 1+ actions)
- [ ] `$project` syntax with inline chip + autocomplete
- [ ] `#hashtag` syntax with inline chip + autocomplete
- [ ] Natural date parsing (today/tomorrow/weekday/M-D/time formats)
- [ ] Priority token parsing (`p1`/`p0`/`ptop`)
- [ ] Manual mode toggle (force task / capture / event)
- [ ] Capture-first default for ambiguous input
- [ ] Session-only conversation memory
- [ ] Action receipts (terminal-style "✓ created task #42")

**Aesthetic**
- [ ] EB Garamond / Louize typography
- [ ] Light + dark theme
- [ ] Journal-paper visual style (whitespace, restraint, serifs)
- [ ] Warp-terminal Kiwi interface
- [ ] Genz-Renaissance copy throughout (per `idea_for_polymathy.md`)

**Cross-cutting**
- [ ] Realtime updates via Supabase Realtime channels
- [ ] Responsive layout (works on iPad-width)
- [ ] Cmd+K keyboard shortcut to focus Kiwi
- [ ] Toast notifications (success / error)
- [ ] Empty states with brand voice
- [ ] All rows scoped to `userId` (architectural)

### Add After Validation (v1.x)

Features to add once core is working and the user (Filippo) has used it for ≥2 weeks.

- [ ] Update / Delete via Kiwi (with confirm flow) — completes CRUD
- [ ] Recurring tasks
- [ ] Bulk task operations (multi-select + reschedule/complete/delete)
- [ ] Drag-reschedule events on calendar grid
- [ ] Month view on calendar
- [ ] Project archive view (separate from active list)
- [ ] Capture pinning / starring
- [ ] Hashtag merge / rename
- [ ] Quick filters in capture feed (date range, has-project, has-link)
- [ ] Settings: default calendar, default priority, default project
- [ ] Export (Markdown export of captures, JSON export of all data)
- [ ] PWA install prompt + offline read

### Future Consideration (v2+)

Features to defer until product-market fit (or personal "I miss this") is established.

- [ ] CLI client (`kiwi-core` already factored for it per spec)
- [ ] Persistent chat memory with summarization
- [ ] Mobile native app (or PWA push notifications)
- [ ] Habit tracking (re-add v1 domain if validated)
- [ ] Goals (long-horizon objectives tied to areas)
- [ ] Library / book tracking (re-add v1 domain)
- [ ] Fueling / training (re-add v1 domains)
- [ ] Multi-user (open the system to others under `userId` model)
- [ ] Twilio SMS re-add (only if mobile experience is insufficient)
- [ ] Strava / Goodreads / external integrations
- [ ] Voice input to Kiwi (Whisper API or browser SpeechRecognition)
- [ ] Smart scheduling assist (Kiwi suggests time slots from gcal availability)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Kiwi multi-action inference | HIGH | HIGH | P1 (the product) |
| Tasks CRUD + kanban + list | HIGH | MEDIUM | P1 |
| Captures CRUD + hashtag autocomplete + feed | HIGH | MEDIUM | P1 |
| Areas + Projects hierarchy + sidebar | HIGH | MEDIUM | P1 |
| Google Calendar full CRUD | HIGH | MEDIUM-HIGH | P1 |
| Project detail page (Notion-style) | HIGH | MEDIUM | P1 |
| Class metadata + semester picker | MEDIUM (high for student) | LOW | P1 |
| `$project` / `#hashtag` chip rendering | MEDIUM | HIGH (custom input) | P1 (it's the brand) |
| Streaming Kiwi response + thinking word | MEDIUM | LOW (inherited) | P1 |
| Aesthetic discipline (typography, spacing, copy) | HIGH (defines product) | MEDIUM (ongoing) | P1 |
| Realtime via Supabase channels | MEDIUM | LOW-MEDIUM | P1 |
| Drag reorder / drag column | MEDIUM | MEDIUM | P1 |
| Search captures (full-text) | MEDIUM | LOW (Postgres) | P1 |
| Update/Delete via Kiwi | MEDIUM | MEDIUM (confirm flow) | P2 |
| Recurring tasks | MEDIUM | HIGH (recurrence engine) | P2 |
| Bulk task operations | LOW-MEDIUM | LOW | P2 |
| Calendar drag-reschedule | MEDIUM | MEDIUM | P2 |
| Persistent chat memory | LOW | HIGH (summarization) | P3 |
| CLI | LOW (single user) | MEDIUM | P3 |
| Habits / Goals / Library re-add | LOW (deferred deliberately) | HIGH | P3 |
| Mobile native | LOW (web responsive sufficient) | HIGH | P3 |

**Priority key:**
- P1: Must have for MVP launch (matches core.md "Active" requirements)
- P2: Should have, add immediately post-validation
- P3: Defer until clear demand / pain

---

## Competitor Feature Analysis

| Feature | Todoist | Things 3 | TickTick | Notion | Mem.ai | Apple Notes | **Hyperpolymath v2** |
|---------|---------|----------|----------|--------|--------|-------------|----------------------|
| NL task creation | Best-in-class (`#proj @label p1`) | Good (autocomplete pickers) | Good | Weak | N/A | N/A | **Best-in-class via Kiwi + multi-action** |
| Hierarchy depth | Project → Section → Task | Area → Project → Heading → Task | List → Folder → Task | Infinite (DBs) | Flat | Folder + Tags | **Area → Project → Task/Capture (intentionally shallow)** |
| Hashtag captures feed | No | No | No | No (manual DB) | Semantic links, not hashtags | Yes (#tag inline) | **Yes + project links + searchable** |
| Google Calendar | Read-only sync | Sync via 3rd party | 2-way sync | Limited | No | No | **Full CRUD, gcal as source-of-truth** |
| Kanban view | Premium | No | Yes | Yes (DB view) | No | No | **Yes + List view toggle** |
| Class/academic metadata | No | No | No | DIY in DB | No | No | **First-class via `isClass`** |
| AI agent for input | Recent (workflows) | No | Limited | Yes (Notion AI) | Yes (Mem Chat) | No | **Yes (Kiwi) — multi-action capture-first** |
| Capture-first ambiguity | Asks/clarifies | N/A | N/A | Asks | Auto-organizes | No | **Defaults to capture, never asks for C** |
| Open source | No | No | No | No | No | No | **Yes (MIT)** |
| Single-user-tuned | No (multi-tenant) | Yes (per device) | No | No | No | Yes | **Yes (architectural)** |
| Aesthetic distinctiveness | Generic SaaS | Mac-native polish | Generic SaaS | Notion zen | Modern minimal | Apple-native | **Journal paper + Warp terminal** |

---

## Critical Behavior Decisions to Lock Before Building

These are decisions the spec is silent on. They should be locked in `PROJECT.md` "Key Decisions" before phase planning:

1. **Date-only tasks vs date-time tasks** — Recommend: date-only (matches v1 `dueDate: string | null` YYYY-MM-DD). If user says "task fri 5pm", convert to event or drop time?
2. **Recurring tasks in MVP?** — Recommend: defer to post-MVP. Recurring events via gcal are fine.
3. **"Next Friday" semantics** — Recommend: `next` = +7d from forward-Friday (matches v1).
4. **Hashtag normalization** — Recommend: lowercase store, preserve first-seen casing for display.
5. **Default calendar for Kiwi-created events** — Recommend: user-settable in settings; default to gcal primary.
6. **Attendees on events?** — Recommend: defer to post-MVP. Solo events only in v1.
7. **What happens when Kiwi can't resolve a `$project`?** — Recommend: capture-first principle applies — file as capture with the literal text, surface in receipt.
8. **Toast vs modal for action confirmation** — Recommend: toast with undo (5s window) for non-destructive; modal confirm for delete.
9. **Empty Kiwi input + Enter** — Recommend: no-op (no flash error).
10. **Long Kiwi response (truncation)** — Recommend: stream complete, no client-side truncation.

---

## Sources

**Todoist NL syntax (table stakes for input):**
- [Use Task Quick Add in Todoist](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)
- [Introduction to dates and time in Todoist](https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO)
- [Using Natural Language with Todoist (The Sweet Setup)](https://thesweetsetup.com/using-natural-language-with-todoist/)
- [Complete guide to Todoist Natural Language Input (Calmevo)](https://calmevo.com/todoist-natural-language-input-guide/)
- [Todoist Due Dates & Times: Natural Language Syntax (Leighton Price)](https://www.leightonprice.com/todoist/dates.html)

**Project hierarchy comparison:**
- [Todoist vs Things 3 vs TickTick (Rivva)](https://blog.rivva.app/p/todoist-vs-things-vs-ticktick)
- [Todoist vs Things 3 vs TickTick (Finly Insights)](https://finlyinsights.com/todoist-vs-things-3-vs-ticktick/)
- [Things 3 vs Todoist (Medium 2026)](https://medium.com/@alltech/things-3-vs-todoist-picking-the-right-task-manager-for-how-you-actually-work-27e05239533a)
- [The 10 Best Notion PARA Method Templates of 2026](https://super.so/blog/notion-para-method-templates)

**Note-app hashtag/backlinks UX:**
- [Apple Notes — Use Tags and Smart Folders](https://support.apple.com/en-us/102288)
- [Mem.ai Review & Guide 2026 (Productivity Stack)](https://productivitystack.io/guides/mem-ai-guide/)
- [Reflect: Automatically add backlinks using AI](https://reflect.app/blog/automatically-add-backlinks-using-ai)
- [Mem vs Reflect Notes: AI Tool Comparison 2026](https://pointofai.com/compare-ai-tools/mem-vs-reflect-notes)

**Google Calendar API:**
- [Google Calendar API: Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- [Google Calendar API: Calendars & events](https://developers.google.com/workspace/calendar/api/concepts/events-calendars)
- [Google Calendar API: Events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [The Deceptively Complex World of Calendar Events and RRULEs (Nylas)](https://www.nylas.com/blog/calendar-events-rrules/)
- [ICS Timezone Wrong in Google Calendar (Synara)](https://synara.events/articles/ics-timezone-wrong-in-google-calendar-why-events-shift-and-how-to-fix-it)

**Kanban + drag-and-drop UX:**
- [Build a Kanban Board With Drag-and-Drop in React with Shadcn (Marmelab, 2026)](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html)
- [10 best Kanban tools (Monday, 2026)](https://monday.com/blog/rnd/kanban-tools/)
- [Drag and drop UI examples and UX tips (Eleken)](https://www.eleken.co/blog-posts/drag-and-drop-ui)

**Academic / class tracking:**
- [GradePath](https://www.gradepath.app/)
- [Gradebook](https://www.gradebook.app/)
- [Slate (App Store)](https://apps.apple.com/us/app/grade-tracker-planner-slate/id6760373420)
- [Top 7 Apps for Tracking Grades and GPA](https://studyguides.com/articles/top-apps-for-tracking-grades-and-gpa)

**Conversational AI agent UX patterns:**
- [Designing for Agentic AI: Practical UX Patterns (Smashing, Feb 2026)](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [Conversational AI Design Patterns (AI Agents+)](https://www.ai-agentsplus.com/blog/conversational-ai-design-patterns-2026)
- [Agent UX Patterns (Hatchworks)](https://hatchworks.com/blog/ai-agents/agent-ux-patterns/)
- [Notion's GPT-5 rebuild unlocks autonomous AI workflows (OpenAI)](https://openai.com/index/notion/)

**Anti-features research:**
- [The Trap of Gamified Productivity (Medium)](https://medium.com/@alphahangchen1/the-trap-of-gamified-productivity-d3d4b37725a7)
- [Productivity App Gamification That Doesn't Backfire (Trophy)](https://trophy.so/blog/productivity-app-gamification-doesnt-backfire)
- [I Built a 'Second Brain' in Notion and Obsidian: It Was a Productivity Trap](https://maketecheasier.com/second-brain-productivity-trap/)
- [Pros and Cons of Gamification (Bonusly)](https://bonusly.com/post/gamification)

**chrono-node date parsing (for Kiwi reference / fallback):**
- [chrono-node on npm](https://www.npmjs.com/package/chrono-node)
- [GitHub: wanasit/chrono](https://github.com/wanasit/chrono)
- [Building a Smart Datetime Picker (Dub)](https://dub.co/blog/smart-datetime-picker)

**Project context (read at start):**
- /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.planning/PROJECT.md
- /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/resources/core.md
- /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/resources/idea_for_polymathy.md
- /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/resources/HYPERPOLYMATH_V2_HANDOFF.md

---
*Feature research for: Hyperpolymath v2 personal life-OS with NLP agent (Kiwi)*
*Researched: 2026-05-07*
