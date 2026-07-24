# sesh-task-reminders-notifications

**Prompt:** Mobile deadline notifications + unlimited task reminders (web/mobile) + bulk archive calendar events (overdue/range) + clear incomplete tasks older than N days.

**Scale:** feature  
**Branch:** `cursor/task-reminders-notifications-75d4` (from `main`)  
**Harness:** Cursor Cloud Agent (bgsd conductor scripts not present in this checkout; session recorded manually)

## Units shipped

1. Schema + reminder helpers + `clearStaleIncompleteTasks`
2. Web task reminder UI + overdue clear control
3. Calendar bulk archive (web) + device calendar/tasks APIs
4. Mobile notifications (`expo-notifications`), reminders editor, calendar archive, clear stale
5. Handoff doc for deploy / EAS rebuild

## Migrations

- `apps/web/drizzle/0039_task_reminders.sql`
- `apps/web/supabase/migrations/0055_task_reminders.sql`

Not applied to prod by the agent — hand-apply at deploy (see docs/TASK-REMINDERS-NOTIFICATIONS-HANDOFF.md).
