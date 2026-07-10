# Conductor seed plan — daily-pages-rail (read with UNIT-BRIEF.md, binding)

Wave-2 facts you inherit (verified on your base):
- `PagesListClient.tsx` is now 280 LOC: header + a clearly marked daily-pages placeholder
  + `<WikiExplorer/>`. Your rail replaces ONLY that placeholder section.
- Use wave-1 `PagePreviewThumb` (components/wiki/preview/) for card previews; glass
  register (`.glass-tile`) + EB Garamond dates per SPEC Doctrine-3 — the rail is the
  editorial "reading room", in deliberate contrast to the flat Explorer below it.
- Explorer already excludes daily pages — VERIFY the filter, don't duplicate it.

Suggested slice order (one commit each):
1. `useEnsureTodayDailyPage` hook (client localtime, guarded insert, no navigation,
   invalidate ["daily-pages", userId]); vitest for the date/guard logic where pure.
2. JournalRail presentational: today card (large, Garamond date, thumb, cyan tick),
   ~7-day trail, calendar popover reusing JournalCalendar.
3. Collapse control persisted in localStorage["wiki:journal-rail"] + first-mount
   180ms staggered fade.
4. Wire into PagesListClient placeholder; keep TopTabBar/quick-create/DailyAutoOpen
   contracts untouched (query keys stable).
5. Typecheck + build + vitest green; REPORT.md.

Do NOT touch: ProjectPagesSection, PageDetailClient (sibling owns), WikiExplorer guts.
