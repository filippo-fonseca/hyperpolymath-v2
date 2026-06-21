# Phase 30 — Page of the Day / Daily Pages (SUMMARY)

Final phase of milestone v1.2 ("Wiki + In-Document JARVIS"). Shipped a Daily
Pages surface on top of the existing Wiki + Phase 31 in-document JARVIS engine.
Supersedes the old Morning Dump (no Morning Dump code remains; this is the
replacement).

## What shipped (by requirement)

- **WIKI-DAILY-01** — A collapsible "Daily Pages" section in the Wiki home
  (`PagesListClient`) renders a calendar (the generalized `JournalCalendar`) with
  dotted days for existing Daily Pages and a "Today" button.
- **WIKI-DAILY-02** — `openDailyPage(date)` opens-or-creates exactly one Daily
  Page per user per day. Idempotent + race-safe: SELECT-first fast path, then a
  guarded `INSERT ... ON CONFLICT DO NOTHING` against a partial unique index, then
  a re-SELECT. Title via the pure `dailyPageTitle` helper.
- **WIKI-DAILY-03** — A Daily Page (daily_date IS NOT NULL) renders a "Daily Page"
  pill under its title in `PageDetailClient`.
- **WIKI-DAILY-04** — A Daily Page shows a "process this page" button that runs the
  WHOLE page through the shared in-document engine via `invokeInDocumentJarvis`
  with the new `scopeOverride: "page"`. The turn persists server-side and surfaces
  in the JARVIS tab; results are summarized in a sonner toast.

## Files

Created:
- `apps/web/supabase/migrations/0035_pages_daily_date.sql` — column + partial unique index
- `apps/web/lib/pages/daily-page.ts` — `dailyPageTitle`, `isValidDailyDate`
- `apps/web/tests/daily-page-helpers.test.ts`
- `apps/web/tests/get-daily-pages.test.ts`
- `apps/web/tests/open-daily-page.test.ts`
- `apps/web/tests/invoke-in-document-scope-override.test.ts`
- `.planning/phases/30-page-of-the-day-daily-pages/30-01-PLAN.md` + this SUMMARY

Changed:
- `apps/web/lib/db/schema.ts` — `dailyDate` column + `pages_user_daily_date_uniq` partial unique index
- `apps/web/lib/db/queries/pages.ts` — `dailyDate` on PAGE_COLS/PageRow/PageWithProjects; `getDailyPagesForUser`
- `apps/web/app/actions/pages.ts` — `openDailyPage`, `getDailyPagesForCurrentUser`
- `apps/web/components/journaling/JournalCalendar.tsx` — generalized: optional `entries`, `markedDates`, `ariaLabel`
- `apps/web/components/pages/PagesListClient.tsx` — Daily Pages calendar section
- `apps/web/components/pages/PageBlockEditor.tsx` — `onEditorReady` prop
- `apps/web/components/pages/PageDetailClient.tsx` — pill, process button, editor capture
- `apps/web/lib/jarvis/invoke-in-document.ts` — `scopeOverride`

## Verification

- New unit tests (13) pass. Full suite: 706 passing; 5 pre-existing failures in
  `voice-adversarial` / `jarvis-core-cache-ttl` / `jarvis-prompt-stability` that
  assert on `buildToolDefinitions` tool counts + cache TTLs — untouched by this
  phase (none of the 15 changed files touch tool-definition/cache/voice code).
- TypeScript strict build passes (pre-existing `api-jarvis-tts.test.ts`
  NextRequest type noise aside, which the build does not gate on).

## Notes / human follow-ups

- The 0035 migration is NOT applied to prod — a human applies prod migrations.
- Browser UX a human should eyeball: calendar look in the Wiki home, day-open
  routing, the pill render, and the "process this page" toast against a real
  JARVIS turn.
